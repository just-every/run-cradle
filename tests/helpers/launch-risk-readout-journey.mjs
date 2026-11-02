import assert from 'node:assert/strict'
import {value,campaign,waitFor,expected} from './launch-installed.mjs'
const {LAUNCH_APP_ID:appId,launchEntities}=await import('../../src/apps/launch/contracts.ts')
const day=offset=>new Date(Date.UTC(2027,0,1+offset)).toISOString().slice(0,10)
const rank={High:0,Medium:1}
// The authored order: severity, dated before undated, due date, campaign code, then record id.
const authoredOrder=(a,b)=>rank[a.severity]-rank[b.severity]||(a.dueDate===null)-(b.dueDate===null)||(a.dueDate??'').localeCompare(b.dueDate??'')||a.code.localeCompare(b.code)||a.id.localeCompare(b.id)
const refs=(entity,rows)=>rows.map(row=>({ref:{appId,entityId:entity,recordId:row.id},version:row.version}))

/** Publicly authors Risk lenses and risks around the 200-risk readout boundary, then reads both readouts back through the provider edge. */
export async function riskReadoutBoundaryJourney(h,providerCalls){
 const owner=(await h.db.prepare('SELECT human_id FROM authority_principals WHERE id=?').bind(h.owner.owner).first()).human_id
 const a=await campaign(h,'AI2A'),b=await campaign(h,'AI2B'),archived=await campaign(h,'AI2C'),codes=new Map([[a.id,'AI2A'],[b.id,'AI2B']])
 const create=async(campaignRecord,fields)=>{const record=value(await h.command('launch.risk.create',{fields:{campaignId:campaignRecord.id,ownerId:owner,title:'Risk '+fields.signal,dueDate:null,mitigation:'Mitigation',...fields}}));return{...record,code:codes.get(campaignRecord.id)}}
 const matching=[],controls=[],small=[]
 for(let i=0;i<230;i++)matching.push(await create(i%2?b:a,{severity:i<120?'Medium':'High',dueDate:i%7===0?null:day(i*3%40),signal:'ai2-big '+i}))
 for(let i=0;i<6;i++)controls.push(await create(a,{severity:'Low',dueDate:day(0),signal:'ai2-big control '+i}))
 for(let i=0;i<8;i++)controls.push(await create(b,{severity:'High',dueDate:day(0),signal:'ai2-other '+i}))
 const hidden=await create(archived,{severity:'High',dueDate:day(0),signal:'ai2-big archived'});controls.push(hidden)
 await h.command('launch.campaign.archive',{id:archived.id},expected(launchEntities.campaign,archived))
 for(let i=0;i<3;i++)small.push(await create(i?b:a,{severity:i===2?'High':'Medium',dueDate:day(i),signal:'ai2-small '+i}))
 // Two retained revisions inside the first 200 and one overflow record edited twice.
 const sorted=[...matching].sort(authoredOrder),edit=async(risk,times)=>{for(let n=0;n<times;n++){const done=await h.command('launch.risk.patch',{id:risk.id,changes:{mitigation:'Edited '+n}},expected(launchEntities.risk,risk));risk.version=value(done).version}}
 await edit(sorted[0],1);await edit(sorted[150],2);await edit(sorted[215],2)
 const lens=async(name,signal,severities)=>value(await h.command('launch.lens.save',{definition:{name,description:'',recordType:'Risk',conditions:[{field:'signal',operator:'contains',value:signal},{field:'severity',operator:'one of',value:severities}],sort:{field:'severity',direction:'desc'},fields:['title','severity'],display:'Cards'}}))
 const big=await lens('AI2 big readout','ai2-big',['Medium','High']),little=await lens('AI2 small readout','ai2-small',['Medium','High'])
 const settings=(await h.read('/api/v1/settings')).data;await h.command('settings.update',{version:settings.version,changes:{aiEnabled:true,aiDailyCeiling:10}})
 const snapshot=async()=>JSON.stringify([(await h.db.prepare('SELECT * FROM risks ORDER BY id').all()).results,(await h.db.prepare('SELECT * FROM lenses ORDER BY id').all()).results])
 const before=await snapshot()
 const readout=async chosen=>{const start=providerCalls.length,accepted=value(await h.command('launch.analysis.request',{feature:'risk-readout',lensId:chosen.id}));await h.tick()
  const done=(await waitFor(()=>h.read('/api/v1/launch/analysis-requests/'+accepted.requestId),x=>['Complete','Failed'].includes(x.data.state))).data;assert.equal(done.state,'Complete',JSON.stringify(done));assert.equal(providerCalls.length,start+1)
  const text=providerCalls[start].input[0].content[0].text;assert.doesNotMatch(text,/customFields|comments/);return{sent:JSON.parse(text),analysis:done.analysis}}
 const checkAgainst=(result,chosen,expectedRisks)=>{
  assert.equal(result.sent.feature,'risk-readout');assert.deepEqual({id:result.sent.lens.id,version:result.sent.lens.version,name:result.sent.lens.name},{id:chosen.id,version:chosen.version,name:chosen.name})
  assert.deepEqual(result.sent.risks.map(risk=>[risk.id,risk.version]),expectedRisks.map(risk=>[risk.id,risk.version]))
  assert.deepEqual(result.analysis.inputVersions,[{ref:{appId,entityId:launchEntities.lens,recordId:chosen.id},version:chosen.version},...refs(launchEntities.risk,expectedRisks)])
  assert.equal(result.analysis.lensId,chosen.id)}
 const bigResult=await readout(big),expectedFirst=sorted.slice(0,200)
 assert.equal(bigResult.sent.risks.length,200);checkAgainst(bigResult,big,expectedFirst)
 const sentIds=new Set(bigResult.sent.risks.map(risk=>risk.id))
 for(const risk of [...sorted.slice(200),...controls,...small])assert.ok(!sentIds.has(risk.id),'Overflow or out-of-lens risk sent: '+risk.signal)
 const smallResult=await readout(little),expectedSmall=[...small].sort(authoredOrder);checkAgainst(smallResult,little,expectedSmall)
 const bigIds=new Set(matching.map(risk=>risk.id));assert.ok(smallResult.sent.risks.every(risk=>!bigIds.has(risk.id)))
 assert.equal(await snapshot(),before)
}

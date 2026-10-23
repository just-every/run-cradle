import {baseHttpSession} from './base-http-session.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
export async function automationControlJourney(h,receiverCalls,setReceiver){
 const base={appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[]},eq=(fieldId,value)=>({kind:'condition',fieldId,op:'eq',value}),contains=value=>({kind:'condition',fieldId:h.nameId,op:'contains',value}),update=value=>({kind:'update',fieldId:h.statusId,value})
 const save=async(steps,name='synthetic-cradle-101 control')=>(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{...base,name,steps}}})).data.result.value
 const disable=saved=>h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
 const runs=saved=>h.request(`/api/user-automations/${saved.id}/runs`).then(reply=>reply.data.runs)
 const tick=async()=>{const worker=await h.runtime.getWorker();await worker.scheduled({scheduledTime:Date.parse('2026-10-23T12:17:00Z'),cron:'* * * * *'})}
 const wait=async(saved,recordId)=>{let run;for(let attempt=0;attempt<100;attempt++){await tick();run=(await runs(saved)).find(run=>run.recordId===recordId&&!['Suppressed'].includes(run.state));if(run&&!['Queued','Running','Held'].includes(run.state))return run}assert.fail('The control run did not finish within its finite work budget')}
 const read=async id=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${id}`)).data.record
 const steps=[{kind:'condition',when:eq(h.nameId,'synthetic-cradle-102 A'),actions:[update('conditional')]},{kind:'branch',paths:[{when:eq(h.statusId,'conditional'),actions:[{kind:'update',fieldId:h.nameId,value:'synthetic-cradle-103 approved'}]},{when:contains('102 A'),actions:[update('wrong second path')]},{when:contains('102 B'),actions:[update('branch B')]}],otherwise:[update('otherwise')]},{kind:'action',action:{...update('must stay skipped'),when:eq(h.nameId,'never')}}]
 const branching=await save(steps)
 const a=await h.create('synthetic-cradle-102 A'),b=await h.create('synthetic-cradle-102 B'),c=await h.create('synthetic-cradle-102 C')
 for(const record of [a,b,c]){const run=await wait(branching,record.record.id);assert.equal(run.state,'Complete',JSON.stringify(run))}
 assert.equal((await read(a.record.id)).fields[h.nameId].value,'synthetic-cradle-103 approved');assert.equal((await read(a.record.id)).fields[h.statusId].value,'conditional','Only the first matching path runs, using current values after the condition step')
 assert.equal((await read(b.record.id)).fields[h.statusId].value,'branch B');assert.equal((await read(c.record.id)).fields[h.statusId].value,'otherwise')
 assert.ok((await runs(branching)).every(run=>run.actions.some(action=>action.state==='Skipped')))
 const path=steps[1].paths[0]
 await h.request('/api/user-automations',{method:'POST',status:400,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{...base,name:'synthetic-cradle-104 over paths',steps:[{kind:'branch',paths:Array.from({length:11},()=>path)}]}}})
 await disable(branching)
 const ten=await save([{kind:'branch',paths:Array.from({length:10},(_,index)=>({when:contains('ten'),actions:[update(`path ${index}`)]}))}],'synthetic-cradle-104 ten paths')
 const tenRecord=await h.create('synthetic-cradle-104 ten');await wait(ten,tenRecord.record.id);assert.equal((await read(tenRecord.record.id)).fields[h.statusId].value,'path 0')
 await disable(ten)
 const items=[];for(const letter of ['A','B','C'])items.push((await h.create(`synthetic-cradle-105 repeat-item ${letter}`)).record)
 const destination=(await h.request('/api/user-automations/destinations',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,kind:'webhook',url:'https://receiver.example.com/control-items'}})).data
 setReceiver(wire=>JSON.parse(wire.body).record.recordId===items[1].id?400:200)
 const repeating=await save([{kind:'repeat',find:contains('105 repeat-item'),actions:[{kind:'webhook',destinationId:destination.id},update('item complete')]}],'synthetic-cradle-106 continue items')
 const trigger=await h.create('synthetic-cradle-106 start'),partial=await wait(repeating,trigger.record.id)
 const partialNotices=(await h.request('/api/v1/notifications')).data.items.filter(item=>item.title==='Record automation failed'&&item.body.includes('Some repeat items failed.'))
 assert.equal(partialNotices.length,1);assert.ok((await h.mailMessages()).some(message=>message.subject==='Record automation failed'&&message.text.includes('Some repeat items failed.')))
 assert.equal(partial.state,'Partial');assert.deepEqual(partial.items.map(item=>item.recordId).sort(),items.map(item=>item.id).sort());assert.deepEqual(partial.items.map(item=>item.state).sort(),['Complete','Complete','Failed'])
 assert.equal((await read(items[0].id)).fields[h.statusId].value,'item complete');assert.equal((await read(items[1].id)).fields[h.statusId].value,null);assert.equal((await read(items[2].id)).fields[h.statusId].value,'item complete')
 const before=receiverCalls.length;await h.restart();await tick();assert.equal(receiverCalls.length,before,'Restart and repeated ticks preserve completed item effects')
 await disable(repeating)
 const versions=await Promise.all(items.map(item=>read(item.id).then(row=>row.version)))
 const resumed=await save([{kind:'repeat',find:contains('105 repeat-item'),actions:Array.from({length:10},(_,index)=>update(`resumed step ${index}`))}],'synthetic-cradle-106 resume items')
 const resumedTrigger=await h.create('synthetic-cradle-106 resume');await h.tick(resumedTrigger.commandId)
 const inFlight=(await runs(resumed)).find(run=>run.recordId===resumedTrigger.record.id);assert.equal(inFlight.state,'Running');assert.ok(inFlight.actions.some(action=>action.state==='Complete')&&inFlight.actions.some(action=>action.state==='Pending'),'Restart occurs after partial progress')
 await h.restart();const resumedRun=await wait(resumed,resumedTrigger.record.id);assert.equal(resumedRun.state,'Complete')
 for(const [index,item]of items.entries())assert.equal((await read(item.id)).version,versions[index]+10,'A resumed repeat does not execute its completed items again')
 await disable(resumed)
 const ordered=items.toSorted((a,b)=>a.id.localeCompare(b.id));setReceiver(wire=>JSON.parse(wire.body).record.recordId===ordered[1].id?503:200)
 const uncertain=await save([{kind:'repeat',find:contains('105 repeat-item'),actions:[{kind:'webhook',destinationId:destination.id}]}],'synthetic-cradle-107 uncertain item')
 const unknownTrigger=await h.create('synthetic-cradle-107 start'),unknown=await wait(uncertain,unknownTrigger.record.id)
 assert.equal(unknown.state,'Unknown');assert.deepEqual(unknown.items.map(item=>item.state),['Complete','Unknown','Pending']);const noResend=receiverCalls.length;await tick();assert.equal(receiverCalls.length,noResend)
 await disable(uncertain);setReceiver(200)
 await h.restart({MAIL_PROVIDER:'sendgrid',MAIL_PROVIDER_API_KEY:'test-only-sendgrid-mail-edge'})
 const editor=await baseHttpSession(h.origin,'synthetic-cradle-61@example.test')
 await h.restart({MAIL_PROVIDER:'rer',MAIL_PROVIDER_API_KEY:undefined})
 // A current row rule is installed as fixture policy before the new approval.
 const ownerPolicy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email=?))').bind(h.appId,'import-owner@example.test').first()
 const rules=JSON.parse(ownerPolicy.rules_json).map(rule=>rule.entityId===h.entityId?{...rule,rows:{kind:'condition',fieldId:h.statusId,op:'ne',value:'hidden'}}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),ownerPolicy.id).run()
 try{
  const narrowItems=[];for(const letter of ['A','B','C'])narrowItems.push((await h.create(`synthetic-cradle-108 narrow-item ${letter}`)).record)
  let narrowed=false
  setReceiver(async()=>{if(!narrowed){narrowed=true;const response=await fetch(h.origin+'/api/v1/commands/record.patch',{method:'POST',headers:{cookie:editor.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':editor.csrfToken},body:JSON.stringify({commandId:createUlid(),expected:[{ref:narrowItems[1].ref,version:narrowItems[1].version}],input:{ref:narrowItems[1].ref,changes:{[h.statusId]:'hidden'}}})});assert.equal(response.status,200,await response.text())}return 200})
  const narrow=await save([{kind:'repeat',find:contains('108 narrow-item'),actions:[{kind:'webhook',destinationId:destination.id}]}],'synthetic-cradle-109 current authority')
  const narrowTrigger=await h.create('synthetic-cradle-109 start'),narrowRun=await wait(narrow,narrowTrigger.record.id)
  assert.equal(narrowRun.state,'Complete');assert.equal(narrowRun.items.length,3);assert.equal(narrowRun.items.filter(item=>item.state==='Skipped'&&item.recordId===null).length,1,'A no-longer-readable item is skipped and its ID concealed')
  assert.ok(!receiverCalls.slice(noResend).some(wire=>JSON.parse(wire.body).record.recordId===narrowItems[1].id))
  await disable(narrow)
 }finally{setReceiver(200);await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(ownerPolicy.rules_json,ownerPolicy.id).run()}
 // Public creates populate the over-limit find; no application or writer is mocked.
 for(let index=0;index<1001;index++)await h.create(`synthetic-cradle-110 limit-item ${index}`)
 const limited=await save([{kind:'action',action:update('must not write')},{kind:'repeat',find:contains('110 limit-item'),actions:[update('over limit')]}],'synthetic-cradle-111 repeat limit')
 const limitTrigger=await h.create('synthetic-cradle-111 start'),limitRun=await wait(limited,limitTrigger.record.id)
 assert.equal(limitRun.state,'Failed');assert.ok(limitRun.cause.includes('1001'));assert.equal((await read(limitTrigger.record.id)).fields[h.statusId].value,null,'An oversized repeat refuses before even the preceding action writes')
 const found=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/query`,{method:'POST',body:{filter:{kind:'all',conditions:[contains('110 limit-item'),eq(h.statusId,'over limit')]},limit:1}})).data
 assert.equal(found.total.value,0);await disable(limited)
 const thousand=await save([{kind:'repeat',find:{kind:'all',conditions:[contains('110 limit-item'),{kind:'condition',fieldId:h.nameId,op:'ne',value:'synthetic-cradle-110 limit-item 1000'}]},actions:[{...update('must stay skipped'),when:eq(h.nameId,'never')}]}],'synthetic-cradle-112 exact limit')
 const thousandTrigger=await h.create('synthetic-cradle-112 start'),thousandRun=await wait(thousand,thousandTrigger.record.id)
 assert.equal(thousandRun.state,'Complete');assert.equal(thousandRun.items.length,1000);assert.equal(new Set(thousandRun.items.map(item=>item.recordId)).size,1000);assert.ok(thousandRun.items.every(item=>item.state==='Skipped'))
 await disable(thousand)
 return {branching,repeating,partial,unknown}
}

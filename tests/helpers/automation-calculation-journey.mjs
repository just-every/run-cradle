import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

/** Native authoring, writes, reads and emitted control execution share no value cache. */
export async function automationCalculationJourney(h){
 const amount=createUlid(),divisor=createUlid(),links=createUlid(),formula=createUlid(),rollup=createUlid(),ratio=createUlid()
 const field=(id,label,type,extra={})=>({id,label,type,required:false,unique:false,...extra})
 const read=async id=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${id}`)).data.record
 const edit=async()=> (await h.request(`/api/v1/records/bases/${h.appId}`)).data
 const preview=draft=>h.request('/api/v1/records/schema-preview',{method:'POST',body:draft}).then(reply=>reply.data)
 async function adopt(prepared){
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:prepared.id}}})
  Object.assign(h.entity,(await h.request(`/api/v1/apps/${h.appId}/entities`)).data.items.find(item=>item.id===h.entityId))
 }
 let draft=await edit()
 draft.tables.find(table=>table.id===h.entityId).fields.push(field(amount,'Calculation amount','number'),field(divisor,'Calculation divisor','number'),field(links,'Calculation inputs','relation',{relation:{ownerAppId:h.appId,entityId:h.entityId,cardinality:'many',onDelete:'restrict'}}))
 await adopt(await preview(draft))
 const linked=(await h.create('synthetic-cradle-5201',undefined,undefined,{[amount]:'3',[divisor]:'1'})).record
 const subject=(await h.create('synthetic-cradle-5202',undefined,undefined,{[amount]:'2',[divisor]:'1',[links]:[linked.ref]})).record
 draft=await edit()
 draft.tables.find(table=>table.id===h.entityId).fields.push(field(formula,'Calculation double','computed',{readOnly:true,resultType:'number'}),field(ratio,'Calculation ratio','computed',{readOnly:true,resultType:'number'}),field(rollup,'Calculation sum','computed',{readOnly:true,resultType:'number',expression:{kind:'rollup',relationFieldId:links,valueFieldId:formula,aggregate:'sum'}}))
 draft.formulaSources={[formula]:'{Calculation amount} * 2',[ratio]:'{Calculation amount} / {Calculation divisor}'}
 const prepared=await preview(draft),sample=id=>prepared.calculations.find(item=>item.fieldId===id).samples.find(item=>item.recordId===subject.id).after
 assert.deepEqual(sample(formula),{state:'value',value:'4'})
 assert.deepEqual(sample(rollup),{state:'value',value:'6'})
 await adopt(prepared)
 assert.deepEqual((await read(subject.id)).fields[formula],{state:'value',value:'4'})
 assert.deepEqual((await read(subject.id)).fields[rollup],{state:'value',value:'6'})
 const eq=(fieldId,value)=>({kind:'condition',fieldId,op:'eq',value}),condition=(when,value)=>({kind:'condition',when,actions:[{kind:'update',fieldId:h.statusId,value}]}),only=when=>({kind:'all',conditions:[eq(h.nameId,'synthetic-cradle-5202'),when]})
 const save=async steps=>(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-5203',appId:h.appId,entityId:h.entityId,event:'updated',enabled:true,actions:[],steps}}})).data.result.value
 const disable=saved=>h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
 const run=async(saved,commandId)=>{await h.tick(commandId);const found=(await h.request(`/api/user-automations/${saved.id}/runs`)).data.runs.filter(item=>item.recordId===subject.id&&item.state!=='Suppressed');assert.equal(found.length,1);return found[0]}
 const current=await save([condition(only(eq(formula,'10')),'synthetic-cradle-5204'),condition(only(eq(rollup,'14')),'synthetic-cradle-5205'),condition(only(eq(formula,'4')),'must not write')])
 const input=await h.patch(await read(subject.id),{[amount]:'5'})
 await h.patch(await read(linked.id),{[amount]:'7'})
 const fresh=await read(subject.id)
 assert.deepEqual(fresh.fields[formula],{state:'value',value:'10'})
 assert.deepEqual(fresh.fields[rollup],{state:'value',value:'14'})
 let outcome=await run(current,input.data.commandId)
 assert.equal(outcome.state,'Complete');assert.deepEqual(outcome.actions.map(action=>action.state),['Complete','Complete','Skipped'])
 assert.equal((await read(subject.id)).fields[h.statusId].value,'synthetic-cradle-5205')
 await h.tick(input.data.commandId)
 assert.equal((await read(subject.id)).version,fresh.version+2,'Retained condition effects are not repeated on capture replay')
 await disable(current)
 const chained=await save([{kind:'action',action:{kind:'update',fieldId:amount,value:'8'}},condition(eq(formula,'16'),'synthetic-cradle-5206')])
 const changed=await h.patch(await read(subject.id),{[h.statusId]:'synthetic-cradle-5207'})
 outcome=await run(chained,changed.data.commandId)
 assert.equal(outcome.state,'Complete');assert.deepEqual(outcome.actions.map(action=>action.state),['Complete','Complete'])
 const afterAction=await read(subject.id)
 assert.deepEqual(afterAction.fields[formula],{state:'value',value:'16'})
 assert.equal(afterAction.fields[h.statusId].value,'synthetic-cradle-5206','The next condition observes the earlier committed input action')
 await disable(chained)
 const unavailable=await save([condition(only(eq(ratio,'8')),'must not write')])
 const broken=await h.patch(await read(subject.id),{[divisor]:'0'}),beforeUnavailable=await read(subject.id)
 assert.equal(beforeUnavailable.fields[ratio].state,'unavailable')
 outcome=await run(unavailable,broken.data.commandId)
 assert.equal(outcome.state,'Failed');assert.ok(outcome.actions.every(action=>action.state!=='Complete'))
 assert.deepEqual(await read(subject.id),beforeUnavailable,'An unavailable dependency produces no conditional effect')
 await disable(unavailable)
 // Current source policy is narrowed before approval; no authority is broadened for a calculation.
 const owner=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id JOIN cradle_base_operators b ON b.principal_id=m.principal_id JOIN oa_operators o ON o.id=b.base_id WHERE m.app_id=? AND o.role=\'owner\'').bind(h.appId).first()
 const rules=JSON.parse(owner.rules_json).map(rule=>rule.entityId===h.entityId?{...rule,readableFields:rule.readableFields.filter(id=>id!==amount)}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),owner.id).run()
 try{
  const hidden=await save([condition(only(eq(rollup,'14')),'must not write')]),beforeHidden=await read(subject.id)
  assert.equal(beforeHidden.fields[rollup].state,'redacted')
  const trigger=await h.patch(beforeHidden,{[h.statusId]:'synthetic-cradle-5208'}),expected=await read(subject.id)
  outcome=await run(hidden,trigger.data.commandId)
  assert.equal(outcome.state,'Failed');assert.ok(outcome.actions.every(action=>action.state!=='Complete'))
  assert.deepEqual(await read(subject.id),expected,'A policy-hidden linked dependency produces no conditional effect')
  await disable(hidden)
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(owner.rules_json,owner.id).run()}
}

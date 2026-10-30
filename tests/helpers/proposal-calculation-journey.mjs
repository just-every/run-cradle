import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {proposalDoor,effectCounts} from './proposal-door.mjs'

/** The owner compares a complete retained calculation report with real record reads. */
export async function proposalCalculationJourney(h){
 const [appId,entityId]=[createUlid(),createUlid()],name=newField('Name'),amount=newField('Amount','number'),double=newField('Double','computed'),threshold=newField('Threshold','computed')
 for(const field of [double,threshold])Object.assign(field,{readOnly:true,resultType:'number'})
 const draft={appId,name:'Calculation impact review',tables:[{id:entityId,label:'Measures',primaryFieldId:name.id,fields:[name,amount,double,threshold]}],formulaSources:{[double.id]:'{Amount} * 2',[threshold.id]:'IF({Amount} > 10, {Amount}, 0)'}}
 const command=input=>({commandId:createUlid(),expected:[],input}),adopt=proposalId=>command({kind:'agent_proposal',proposalId})
 async function ownerSchema(input){const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:input})).data;return (await h.request('/api/v1/commands/release.adopt',{method:'POST',body:command({kind:'manual_schema',previewId:preview.id})})).data}
 await ownerSchema(draft)
 const schema=(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data
 // Amount, old Double, proposed Double, old Threshold, proposed Threshold.
 // These expectations are authored separately from the expressions under review.
 const expected=[
  ['0','0','0','0','0'],['1','2','3','0','0'],['2','4','6','0','0'],['0','0','0','0','0'],
  ['-2','-4','-6','0','0'],['5','10','15','0','0'],['0','0','0','0','0'],['10','20','30','0','0'],
  ['11','22','33','11','12'],['12','24','36','12','13'],['0','0','0','0','0'],['20','40','60','20','21'],
  ['-5','-10','-15','0','0'],['8','16','24','0','0'],['13','26','39','13','14'],
  ['-137.125','-274.25','-411.375','0','0'],['1024.125','2048.25','3072.375','1024.125','1025.125'],
  ['21','42','63','21','22'],['22','44','66','22','23'],['23','46','69','23','24'],['24','48','72','24','25'],
  ['25','50','75','25','26'],['26','52','78','26','27'],['27','54','81','27','28'],['28','56','84','28','29'],
  ['29','58','87','29','30'],['30','60','90','30','31'],['31','62','93','31','32'],['32','64','96','32','33'],
  ['33','66','99','33','34'],['34','68','102','34','35'],
 ]
 const rows=[]
 for(const [index,values]of expected.entries()){
  const label=`synthetic-cradle-${index}`,result=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values:{[name.id]:label,[amount.id]:values[0]}}}})).data
  assert.equal(result.state,'committed');rows.push({...result.value,label,values})
 }
 const cell=value=>({state:'value',value}),query=async()=>(await h.request(`/api/v1/apps/${appId}/entities/${entityId}/query`,{method:'POST',body:{limit:200}})).data.items
 function assertReadback(actual,stage){
  assert.equal(actual.length,rows.length)
  for(const row of rows){const found=actual.find(record=>record.id===row.id);assert.ok(found,row.label);assert.deepEqual(found.fields[name.id],cell(row.label));assert.deepEqual(found.fields[amount.id],cell(row.values[0]));assert.deepEqual(found.fields[double.id],cell(row.values[stage==='before'?1:2]),row.label);assert.deepEqual(found.fields[threshold.id],cell(row.values[stage==='before'?3:4]),row.label)}
 }
 const before=await query();assertReadback(before,'before')
 const key=(await h.request('/api/proposer-keys',{method:'POST',status:201,body:{commandId:createUlid(),name:'Calculation design agent',appId,expiresAt:new Date(Date.now()+7*86400000).toISOString()}})).data.key
 const expectedChanges=field=>rows.filter(row=>row.values[field===double.id?1:3]!==row.values[field===double.id?2:4]).map(row=>({recordId:row.id,recordLabel:row.label,before:cell(row.values[field===double.id?1:3]),after:cell(row.values[field===double.id?2:4])})).sort((a,b)=>a.recordId.localeCompare(b.recordId))
 const reports=[]
 for(const face of ['rest','mcp']){
  const agent=proposalDoor(h.origin,key.secret,face),current=await agent.schema(),input={schema:{appId,name:draft.name,tables:current.tables,formulaSources:{[double.id]:'{Amount} * 3',[threshold.id]:'IF({Amount} > 10, {Amount} + 1, 0)'}}}
  const submitted=await agent.propose(input)
  for(const seen of [submitted,await agent.read(submitted.id),...(await agent.list()).filter(item=>item.id===submitted.id)]){
   assert.ok(!('calculations'in seen),`${face}: calculation values are owner-only`)
   const serialized=JSON.stringify(seen)
   for(const row of rows){assert.ok(!serialized.includes(row.id),`${face}: no record identity`);assert.ok(!serialized.includes(row.label),`${face}: no record label`)}
   for(const value of ['-137.125','-274.25','-411.375','1024.125','2048.25','3072.375'])assert.ok(!serialized.includes(value),`${face}: no record or calculation value`)
  }
  const report=(await h.request(`/api/v1/records/proposals/${submitted.id}`)).data
  assert.deepEqual(report.calculations.map(item=>item.fieldId).sort(),[double.id,threshold.id].sort())
  for(const field of [double.id,threshold.id]){
   const calculation=report.calculations.find(item=>item.fieldId===field)
   assert.equal(calculation.totalRecords,rows.length)
   assert.deepEqual([...calculation.changes].sort((a,b)=>a.recordId.localeCompare(b.recordId)),expectedChanges(field),`${face}: exactly the changed cells, including the tail`)
   for(const change of calculation.changes)assert.deepEqual(change.before,before.find(record=>record.id===change.recordId).fields[field])
  }
  assert.ok(report.calculations.find(item=>item.fieldId===double.id).changes.length>20)
  assert.deepEqual(await query(),before,'A retained report leaves records unchanged')
  reports.push({proposalId:submitted.id,report})
  if(face==='mcp')await agent.withdraw(submitted.id)
 }
 // A process restart retains the same report. Adopting it gives the independently
 // specified after values, including cells after the old ten-record sample.
 await h.restart()
 const retained=(await h.request(`/api/v1/records/proposals/${reports[0].proposalId}`)).data
 assert.deepEqual(retained.calculations,reports[0].report.calculations)
 assert.equal((await h.request('/api/v1/commands/release.adopt',{method:'POST',body:adopt(retained.id)})).data.state,'committed')
 const after=await query();assertReadback(after,'after')
 for(const calculation of retained.calculations)for(const change of calculation.changes)assert.deepEqual(change.after,after.find(record=>record.id===change.recordId).fields[calculation.fieldId])
 const agent=proposalDoor(h.origin,key.secret,'rest')
 for(const cause of ['data','schema','authority']){
  const current=await agent.schema(),proposal=await agent.propose({schema:{appId,name:draft.name,tables:current.tables,formulaSources:{[double.id]:'{Amount} * 4',[threshold.id]:'IF({Amount} > 10, {Amount} + 2, 0)'}}})
  const review=(await h.request(`/api/v1/records/proposals/${proposal.id}`)).data
  assert.ok(review.calculations.find(item=>item.fieldId===double.id).changes.length>20)
  if(cause==='data'){
   const record=(await query())[0]
   await h.request('/api/v1/commands/record.patch',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,changes:{[amount.id]:'7'}}}})
  }
  if(cause==='schema')await ownerSchema({appId,name:draft.name,tables:current.tables.map(table=>({...table,label:'Measures renamed'}))})
  if(cause==='authority')await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE app_id=?').bind(appId).run()
  assert.equal((await agent.read(proposal.id)).state,'stale')
  const snapshot={records:await query(),schema:(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data,effects:await effectCounts(h.db),base:await h.db.prepare('SELECT version,release_id FROM manual_record_bases WHERE id=?').bind(appId).first(),releases:(await h.db.prepare('SELECT COUNT(*) n FROM manual_record_releases WHERE app_id=?').bind(appId).first()).n}
  const refused=await h.request('/api/v1/commands/release.adopt',{method:'POST',status:409,body:adopt(proposal.id)})
  assert.match(refused.error.message,/stale/)
  assert.deepEqual(await query(),snapshot.records,`${cause}: refusal changes no records`)
  assert.deepEqual((await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data,snapshot.schema,`${cause}: refusal changes no schema`)
  assert.deepEqual(await effectCounts(h.db),snapshot.effects,`${cause}: refusal adds no effects`)
  assert.deepEqual(await h.db.prepare('SELECT version,release_id FROM manual_record_bases WHERE id=?').bind(appId).first(),snapshot.base)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM manual_record_releases WHERE app_id=?').bind(appId).first()).n,snapshot.releases)
 }
 // A retained owner report must stop exposing cells when current read authority
 // narrows, even though the owner originally had enough access to request it.
 const current=await agent.schema(),privateProposal=await agent.propose({schema:{appId,name:draft.name,tables:current.tables,formulaSources:{[double.id]:'{Amount} * 5'}}})
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules)if(rule.entityId===entityId)rule.readableFields=rule.readableFields.filter(field=>field!==amount.id)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
 await h.request(`/api/v1/records/proposals/${privateProposal.id}`,{status:403})
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
}

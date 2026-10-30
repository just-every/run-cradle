import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {proposalDoor,effectCounts} from './proposal-door.mjs'

/** The owner compares a complete retained calculation report with real record reads. */
export async function proposalCalculationJourney(h){
 const [appId,entityId,groupId]=[createUlid(),createUlid(),createUlid()],name=newField('Name'),amount=newField('Amount','number'),double=newField('Double','computed'),threshold=newField('Threshold','computed'),transitive=newField('Transitive','computed'),stable=newField('Stable','computed'),recovered=newField('Recovered','computed')
 const groupName=newField('Group'),links=newField('Measures','relation'),lookup=newField('Linked doubles','computed'),sum=newField('Total doubles','computed')
 for(const field of [double,threshold,transitive,stable,recovered,sum])Object.assign(field,{readOnly:true,resultType:'number'})
 links.relation={ownerAppId:appId,entityId,cardinality:'many',onDelete:'restrict'}
 Object.assign(lookup,{readOnly:true,resultType:'array',resultElementType:'number',expression:{kind:'rollup',aggregate:'lookup',relationFieldId:links.id,valueFieldId:double.id}})
 sum.expression={kind:'rollup',aggregate:'sum',relationFieldId:links.id,valueFieldId:double.id}
 const retainedRule={id:createUlid(),name:'Extreme adjustment',message:'Extreme adjustments require approval.',when:{kind:'condition',fieldId:amount.id,op:'lt',value:'-200'},require:{kind:'condition',fieldId:name.id,op:'eq',value:'Approved'}}
 const draft={appId,name:'Calculation impact review',tables:[{id:entityId,label:'Measures',primaryFieldId:name.id,validationRules:[retainedRule],fields:[name,amount,double,threshold,transitive,stable,recovered]},{id:groupId,label:'Groups',primaryFieldId:groupName.id,fields:[groupName,links,lookup,sum]}],formulaSources:{[double.id]:'{Amount} * 2',[threshold.id]:'IF({Amount} > 10, {Amount}, 0)',[transitive.id]:'{Double} + 5',[stable.id]:'{Amount}',[recovered.id]:'IF({Amount} = 0, 1 / 0, {Amount})'}}
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
 // Independent transitive results; the unchanged Stable formula is a control.
 const transitiveValues=[['5','5'],['7','8'],['9','11'],['5','5'],['1','-1'],['15','20'],['5','5'],['25','35'],['27','38'],['29','41'],['5','5'],['45','65'],['-5','-10'],['21','29'],['31','44'],['-269.25','-406.375'],['2053.25','3077.375'],['47','68'],['49','71'],['51','74'],['53','77'],['55','80'],['57','83'],['59','86'],['61','89'],['63','92'],['65','95'],['67','98'],['69','101'],['71','104'],['73','107']]
 const rows=[]
 for(const [index,values]of expected.entries()){
  const label=`synthetic-cradle-${index}`,result=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}],input:{appId,entityId,values:{[name.id]:label,[amount.id]:values[0]}}}})).data
  assert.equal(result.state,'committed');rows.push({...result.value,label,values})
 }
 const groupSchema=(await h.request(`/api/v1/apps/${appId}/entities/${groupId}`)).data,groups=[]
 // Fourteen linked records include changes beyond row ten, zero controls, a
 // multi-link total and an empty linked set. Expected values precede readback.
 const groupValues=[[[0],['0'],['0'],'0','0'],[[1],['2'],['3'],'2','3'],[[2],['4'],['6'],'4','6'],[[3],['0'],['0'],'0','0'],[[4],['-4'],['-6'],'-4','-6'],[[5],['10'],['15'],'10','15'],[[6],['0'],['0'],'0','0'],[[7],['20'],['30'],'20','30'],[[8],['22'],['33'],'22','33'],[[9],['24'],['36'],'24','36'],[[10],['0'],['0'],'0','0'],[[11],['40'],['60'],'40','60'],[[1,4],['2','-4'],['3','-6'],'-2','-3'],[[],[],[],null,null]]
 for(const [index,values]of groupValues.entries()){
  const label=`synthetic-cradle-group-${index}`,result=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId,entityId:'00000000000000000000000001',recordId:groupId},version:groupSchema.version}],input:{appId,entityId:groupId,values:{[groupName.id]:label,[links.id]:values[0].map(index=>rows[index].ref)}}}})).data
  assert.equal(result.state,'committed');groups.push({...result.value,label,values})
 }
 const cell=value=>({state:'value',value}),unavailable={state:'unavailable',code:'invalid_source',fieldIds:[],message:'Division by zero'},query=async(tableId=entityId)=>(await h.request(`/api/v1/apps/${appId}/entities/${tableId}/query`,{method:'POST',body:{limit:200}})).data.items
 function assertReadback(actual,stage){
  assert.equal(actual.length,rows.length)
  for(const [index,row]of rows.entries()){const found=actual.find(record=>record.id===row.id);assert.ok(found,row.label);assert.deepEqual(found.fields[name.id],cell(row.label));assert.deepEqual(found.fields[amount.id],cell(row.values[0]));assert.deepEqual(found.fields[double.id],cell(row.values[stage==='before'?1:2]),row.label);assert.deepEqual(found.fields[threshold.id],cell(row.values[stage==='before'?3:4]),row.label);assert.deepEqual(found.fields[transitive.id],cell(transitiveValues[index][stage==='before'?0:1]),row.label);assert.deepEqual(found.fields[stable.id],cell(row.values[0]),row.label);assert.deepEqual(found.fields[recovered.id],stage==='before'&&row.values[0]==='0'?unavailable:cell(row.values[0]),row.label)}
 }
 function assertGroups(actual,stage){
  assert.equal(actual.length,groups.length)
  for(const row of groups){const found=actual.find(record=>record.id===row.id);assert.ok(found,row.label);assert.deepEqual(found.fields[groupName.id],cell(row.label));assert.deepEqual(found.fields[lookup.id],cell(row.values[stage==='before'?1:2]),row.label);assert.deepEqual(found.fields[sum.id],cell(row.values[stage==='before'?3:4]),row.label)}
 }
 const before=await query(),groupsBefore=await query(groupId);assertReadback(before,'before');assertGroups(groupsBefore,'before')
 const key=(await h.request('/api/proposer-keys',{method:'POST',status:201,body:{commandId:createUlid(),name:'Calculation design agent',appId,expiresAt:new Date(Date.now()+7*86400000).toISOString()}})).data.key
 const expectedChanges=field=>rows.filter(row=>row.values[field===double.id?1:3]!==row.values[field===double.id?2:4]).map(row=>({recordId:row.id,recordLabel:row.label,before:cell(row.values[field===double.id?1:3]),after:cell(row.values[field===double.id?2:4])})).sort((a,b)=>a.recordId.localeCompare(b.recordId))
 const calculationFields=[double.id,threshold.id,transitive.id,recovered.id,lookup.id,sum.id]
 function changes(field){
  if(field===recovered.id)return rows.filter(row=>row.values[0]==='0').map(row=>({recordId:row.id,recordLabel:row.label,before:unavailable,after:cell('0')})).sort((a,b)=>a.recordId.localeCompare(b.recordId))
  if(field===double.id||field===threshold.id)return expectedChanges(field)
  const source=field===transitive.id?rows:groups,values=field===transitive.id?transitiveValues:groups.map(row=>field===lookup.id?[row.values[1],row.values[2]]:[row.values[3],row.values[4]])
  return source.flatMap((row,index)=>JSON.stringify(values[index][0])===JSON.stringify(values[index][1])?[]:[{recordId:row.id,recordLabel:row.label,before:cell(values[index][0]),after:cell(values[index][1])}]).sort((a,b)=>a.recordId.localeCompare(b.recordId))
 }
 const reports=[]
 for(const face of ['rest','mcp']){
  const agent=proposalDoor(h.origin,key.secret,face),current=await agent.schema(),input={schema:{appId,name:draft.name,tables:current.tables,formulaSources:{[double.id]:'{Amount} * 3',[threshold.id]:'IF({Amount} > 10, {Amount} + 1, 0)',[recovered.id]:'{Amount}'}}}
  assert.deepEqual(current.tables.find(table=>table.id===entityId).validationRules,[retainedRule],`${face}: formula editing retains the current validation rules`)
  const submitted=await agent.propose(input)
  for(const seen of [submitted,await agent.read(submitted.id),...(await agent.list()).filter(item=>item.id===submitted.id)]){
   assert.ok(!('calculations'in seen),`${face}: calculation values are owner-only`)
   const serialized=JSON.stringify(seen)
   for(const row of [...rows,...groups]){assert.ok(!serialized.includes(row.id),`${face}: no record identity`);assert.ok(!serialized.includes(row.label),`${face}: no record label`)}
   for(const value of ['-137.125','-274.25','-411.375','1024.125','2048.25','3072.375'])assert.ok(!serialized.includes(value),`${face}: no record or calculation value`)
  }
  const report=(await h.request(`/api/v1/records/proposals/${submitted.id}`)).data
  assert.deepEqual(report.calculations.map(item=>item.fieldId).sort(),[...calculationFields].sort(),'Unedited transitive and linked definitions are included when their cells change; the stable formula is omitted')
  for(const field of calculationFields){
   const calculation=report.calculations.find(item=>item.fieldId===field)
   assert.equal(calculation.totalRecords,[lookup.id,sum.id].includes(field)?groups.length:rows.length)
   assert.deepEqual([...calculation.changes].sort((a,b)=>a.recordId.localeCompare(b.recordId)),changes(field),`${face}: exactly the changed cells, including the tail`)
   for(const change of calculation.changes)assert.deepEqual(change.before,[...before,...groupsBefore].find(record=>record.id===change.recordId).fields[field])
  }
  assert.ok(report.calculations.find(item=>item.fieldId===double.id).changes.length>20)
  assert.deepEqual(await query(),before,'A retained report leaves records unchanged');assert.deepEqual(await query(groupId),groupsBefore,'A retained report leaves linked records unchanged')
  reports.push({proposalId:submitted.id,report})
  if(face==='mcp')await agent.withdraw(submitted.id)
 }
 // A process restart retains the same report. Adopting it gives the independently
 // specified after values, including cells after the old ten-record sample.
 await h.restart()
 const retained=(await h.request(`/api/v1/records/proposals/${reports[0].proposalId}`)).data
 assert.deepEqual(retained.calculations,reports[0].report.calculations)
 assert.equal((await h.request('/api/v1/commands/release.adopt',{method:'POST',body:adopt(retained.id)})).data.state,'committed')
 const after=await query(),groupsAfter=await query(groupId);assertReadback(after,'after');assertGroups(groupsAfter,'after')
 assert.deepEqual((await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data.validationRules,[retainedRule])
 const guarded=after.find(record=>record.id===rows[1].id)
 const invalid=await h.request('/api/v1/commands/record.patch',{method:'POST',status:400,body:{commandId:createUlid(),expected:[{ref:guarded.ref,version:guarded.version}],input:{ref:guarded.ref,changes:{[amount.id]:'-201'}}}})
 assert.match(invalid.error.message,/Extreme adjustment/)
 assert.deepEqual(await query(),after,'Adopting a formula proposal preserves rule enforcement')

 for(const calculation of retained.calculations)for(const change of calculation.changes)assert.deepEqual(change.after,[...after,...groupsAfter].find(record=>record.id===change.recordId).fields[calculation.fieldId])
 const agent=proposalDoor(h.origin,key.secret,'rest')
 for(const cause of ['data','linked data','schema','authority']){
  const current=await agent.schema(),proposal=await agent.propose({schema:{appId,name:draft.name,tables:current.tables,formulaSources:{[double.id]:'{Amount} * 4',[threshold.id]:'IF({Amount} > 10, {Amount} + 2, 0)'}}})
  const review=(await h.request(`/api/v1/records/proposals/${proposal.id}`)).data
  assert.ok(review.calculations.find(item=>item.fieldId===double.id).changes.length>20)
  if(cause==='data'){
   const record=(await query())[0]
   await h.request('/api/v1/commands/record.patch',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,changes:{[amount.id]:'7'}}}})
  }
  if(cause==='linked data'){
   const record=(await query(groupId))[0]
   await h.request('/api/v1/commands/record.patch',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,changes:{[links.id]:[rows[3].ref]}}}})
  }
  if(cause==='schema')await ownerSchema({appId,name:draft.name,tables:current.tables.map(table=>table.id===groupId?{...table,label:'Groups renamed'}:table)})
  if(cause==='authority')await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE app_id=?').bind(appId).run()
  assert.equal((await agent.read(proposal.id)).state,'stale')
  const snapshot={records:await query(),groups:await query(groupId),schema:(await h.request(`/api/v1/apps/${appId}/entities/${entityId}`)).data,effects:await effectCounts(h.db),base:await h.db.prepare('SELECT version,release_id FROM manual_record_bases WHERE id=?').bind(appId).first(),releases:(await h.db.prepare('SELECT COUNT(*) n FROM manual_record_releases WHERE app_id=?').bind(appId).first()).n}
  const refused=await h.request('/api/v1/commands/release.adopt',{method:'POST',status:409,body:adopt(proposal.id)})
  assert.match(refused.error.message,/stale/)
  assert.deepEqual(await query(),snapshot.records,`${cause}: refusal changes no records`)
  assert.deepEqual(await query(groupId),snapshot.groups,`${cause}: refusal changes no linked records`)
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
 // Removing a source calculation together with its dependent table is valid;
 // retained unrelated formulas must not evaluate the removed table's old graph.
 const latest=await agent.schema(),reduced={appId,name:draft.name,tables:latest.tables.filter(table=>table.id!==groupId).map(table=>({...table,fields:table.fields.filter(field=>![double.id,transitive.id].includes(field.id))}))}
 const deletion=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:reduced})).data
 assert.equal(deletion.impacts.find(impact=>impact.entityId===groupId).deletedTable,true)
 assert.deepEqual(deletion.impacts.flatMap(impact=>impact.refusals??[]),[])
 assert.deepEqual(deletion.calculations,[],'Unrelated retained calculations do not change when their removed dependents leave the candidate')
}

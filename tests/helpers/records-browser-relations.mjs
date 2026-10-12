import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {compileSchema} from '../../src/domains/records/descriptors.server.ts'
import {ownerRules} from '../../src/domains/records/manual/authority.server.ts'
import {detailReview} from './records-browser-review.mjs'

// Synthetic persisted data uses the real schema compiler and policy reader. No browser/API response substitution.
export async function relationFixture(h){
 const appId=createUlid(),childId=createUlid(),parentId=createUlid(),nameId=createUlid(),titleId=createUlid(),linkId=createUlid(),recordId=createUlid(),hiddenRecordId=createUlid(),policyId=createUlid(),owner='00000000000000000000000981',now=new Date().toISOString()
 const base={appId,version:1,createdAt:now,updatedAt:now,physicalRevision:'relation-browser-proof',lifecycle:{states:['active'],initial:'active',transitions:[]}}
 const child=compileSchema({...base,id:childId,label:'Linked items',fields:[{id:nameId,label:'Name',type:'text',required:true,unique:false}]},()=>undefined)
 const parent=compileSchema({...base,id:parentId,label:'Collections',fields:[{id:titleId,label:'Title',type:'text',required:true,unique:false},{id:linkId,label:'Collection links',type:'relation',required:false,unique:false,relation:{ownerAppId:appId,entityId:childId,cardinality:'one',onDelete:'restrict'}}]},()=>child.descriptor)
 for(const item of [child,parent]){
  for(const sql of item.sql)await h.db.prepare(sql).run()
  await h.db.prepare('INSERT INTO record_schemas VALUES(?,?,?,?,?,?,?)').bind(item.descriptor.schema.id,appId,1,base.physicalRevision,JSON.stringify(item.descriptor.schema),now,now).run()
 }
 const refs=Array.from({length:2},(_,index)=>({appId,entityId:childId,recordId:createUlid(),name:index===1?'Policy hidden link':`Linked item ${String(index).padStart(3,'0')}`}))
 await h.db.batch(refs.map(ref=>h.db.prepare(`INSERT INTO "${child.descriptor.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,"${child.descriptor.fields.get(nameId).column}") VALUES(?,1,?,?,'active',1,?)`).bind(ref.recordId,now,now,ref.name)))
 const relationColumn=parent.descriptor.fields.get(linkId).column
 await h.db.batch([recordId,hiddenRecordId].map((id,index)=>h.db.prepare(`INSERT INTO "${parent.descriptor.table.tableId}"(id,version,created_at,updated_at,lifecycle,schema_version,"${parent.descriptor.fields.get(titleId).column}","${relationColumn}") VALUES(?,1,?,?,'active',1,?,?)`).bind(id,now,now,index?'Policy filtered collection':'All authorised links',refs[index].recordId)))
 const rules=ownerRules(owner,[child.descriptor.schema,parent.descriptor.schema])
 rules.find(rule=>rule.entityId===childId).rows={kind:'condition',fieldId:nameId,op:'ne',value:'Policy hidden link'}
 await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,'Relation browser proof',JSON.stringify(rules),Date.now(),Date.now()).run()
 await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,0,'active',1)").bind(owner,appId,policyId).run()
 return {appId,parentId,recordId,hiddenRecordId,linkId,titleId,policyId,rules,refs}
}

export async function relationReview(page,j,h,fixture){
 const {appId,parentId,recordId,hiddenRecordId,linkId,policyId,rules,refs}=fixture,path=`/api/v1/apps/${appId}/entities/${parentId}/records/${recordId}`
 const response=await page.request.get(h.origin+path);assert.equal(response.status(),200);const detail=(await response.json()).data
 assert.equal(detail.relations[0].page.items.length,1);assert.deepEqual(detail.record.fields[linkId].value,{appId,entityId:refs[0].entityId,recordId:refs[0].recordId})
 await page.goto(`${h.origin}/app/records/${appId}/${parentId}/${recordId}`);await page.getByRole('heading',{name:'All authorised links',exact:true}).waitFor()
 const section=page.locator('section.cr-section').filter({has:page.getByRole('heading',{name:'Collection links',exact:true})})
 await section.getByRole('link',{name:'Linked item 000',exact:true}).waitFor();assert.equal(await section.getByRole('link').count(),1)
 assert.equal(await page.getByRole('heading',{name:'Collection links',exact:true}).count(),1);assert.equal(await page.locator('dl dt').filter({hasText:'Collection links'}).count(),0)
 await detailReview(page);await j.capture('relation-single-heading')
 await j.action(section.getByRole('link',{name:'Linked item 000',exact:true}));await page.getByRole('heading',{name:'Linked item 000',level:1,exact:true}).waitFor();await j.capture('relation-link-reachable')
 const filtered=await page.request.get(`${h.origin}/api/v1/apps/${appId}/entities/${parentId}/records/${hiddenRecordId}`);assert.equal(filtered.status(),200);const hiddenDetail=(await filtered.json()).data;assert.equal(hiddenDetail.record.fields[linkId].value,null);assert.equal(hiddenDetail.relations.length,0)
 await page.goto(`${h.origin}/app/records/${appId}/${parentId}/${hiddenRecordId}`);await page.getByRole('heading',{name:'Policy filtered collection',exact:true}).waitFor();assert.doesNotMatch(await page.locator('main').innerText(),/Policy hidden link/);assert.equal(await page.locator('dl dd').getByRole('link').count(),0);await j.capture('relation-row-policy-filtered')
 const restricted=structuredClone(rules);restricted.find(rule=>rule.entityId===parentId).readableFields=restricted.find(rule=>rule.entityId===parentId).readableFields.filter(id=>id!==linkId)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted),policyId).run()
 try{
  await page.goto(`${h.origin}/app/records/${appId}/${parentId}/${recordId}`);await page.getByRole('heading',{name:'All authorised links',exact:true}).waitFor()
  const field=page.locator('dl .cr-field').filter({has:page.locator('dt').filter({hasText:'Collection links'})});assert.equal(await field.count(),1);assert.equal(await field.locator('dd').innerText(),'Restricted');assert.equal(await field.getByRole('link').count(),0);assert.equal(await page.getByRole('heading',{name:'Collection links',exact:true}).count(),0)
  await j.capture('relation-field-restricted')
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policyId).run()}
 return {authorisedLinks:1,policyHiddenLinks:1,linkedRecordReached:true,singleHeading:true,restrictedField:true}
}

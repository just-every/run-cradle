import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {harness,add} from './helpers/records-manual-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {newField} from '../src/ui/records/schema/templates.ts'
import {RECORD_SCHEMA_ENTITY_ID} from '../src/domains/records/contracts.ts'
import {identifier} from '../src/domains/admission/sql.server.ts'

async function fixture(){
 const h=await harness(),appId=createUlid(),parentId=createUlid(),childId=createUlid(),vendorId=createUlid(),title=newField('Order'),secret=newField('Internal'),supplier=newField('Supplier'),vendor=newField('Supplier link','relation'),item=newField('Item'),link=newField('Order link','relation')
 title.required=true;item.required=true
 vendor.relation={ownerAppId:appId,entityId:vendorId,cardinality:'one',onDelete:'restrict'}
 link.relation={ownerAppId:appId,entityId:parentId,cardinality:'one',onDelete:'restrict'}
 const {r}=await h.create({appId,name:'synthetic-cradle-1',tables:[{id:vendorId,label:'Suppliers',fields:[supplier]},{id:parentId,label:'Orders',fields:[title,secret,vendor]},{id:childId,label:'Lines',fields:[item,link]}]})
 const parent=r.registry.get(appId,parentId).schema,child=r.registry.get(appId,childId).schema,vendorSchema=r.registry.get(appId,vendorId).schema,vendorRow=await add(h,r,vendorSchema,{[supplier.id]:'synthetic-cradle-2'}),source=await add(h,r,parent,{[title.id]:'synthetic-cradle-3',[secret.id]:'synthetic-cradle-4',[vendor.id]:vendorRow.ref}),line=await add(h,r,child,{[item.id]:'synthetic-cradle-5',[link.id]:source.ref})
 const expected=[{ref:source.ref,version:source.version},{ref:{appId,entityId:RECORD_SCHEMA_ENTITY_ID,recordId:parentId},version:parent.version}],command=(input,versions=expected)=>({commandId:createUlid(),expected:versions,input}),execute=async(action,envelope,live=r)=>(await live.commands.get(action).execute(h.ctx,envelope))
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(appId).first(),rules=JSON.parse(policy.rules_json)
 const changePolicy=async modify=>{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(modify(structuredClone(rules))),policy.id).run()}
 return {...h,r,appId,parentId,childId,parent,child,title,secret,item,link,vendor,vendorRow,source,line,expected,command,execute,changePolicy,rules}
}

test('RECORDS-009 duplicate retains chosen links, omits unwritable fields and rechecks create authority and validation',async()=>{
 const h=await fixture()
 try{
  await h.changePolicy(rules=>rules.map(rule=>rule.entityId===h.parentId?{...rule,writableFields:rule.writableFields.filter(id=>id!==h.secret.id)}:rule))
  let r=await h.runtime(),copies=[]
  for(const includeLinks of [false,true]){
   const input=h.command({ref:h.source.ref,includeLinks,includeAttachments:false}),receipt=await h.execute('record.duplicate',input,r),copy=receipt.result.value;copies.push(copy)
   assert.equal(copy.fields[h.title.id].value,'synthetic-cradle-3');assert.equal(copy.fields[h.secret.id].value,null)
   assert.deepEqual(copy.fields[h.vendor.id].value,includeLinks?h.vendorRow.ref:null)
   const replay=await h.execute('record.duplicate',input,r);assert.equal(replay.replay,true);assert.equal(replay.result.value.id,copy.id)
  }
  await h.changePolicy(rules=>rules.map(rule=>({...rule,actions:rule.actions.filter(action=>action!=='record.create')})));r=await h.runtime()
  await assert.rejects(h.execute('record.duplicate',h.command({ref:h.source.ref,includeLinks:false,includeAttachments:false}),r),{code:'forbidden'})
  await h.changePolicy(rules=>rules)
  // Change the row through the normal public door, proving duplicate uses the
  // current source version rather than a stale captured payload.
  r=await h.runtime();const patched=await h.execute('record.patch',h.command({ref:h.source.ref,changes:{[h.title.id]:'synthetic-cradle-6'}},[{ref:h.source.ref,version:1}]),r)
  await assert.rejects(h.execute('record.duplicate',h.command({ref:h.source.ref,includeLinks:false,includeAttachments:false}),r),{code:'version_conflict'})
  assert.equal(patched.result.value.version,2)
  const count=await h.db.prepare(`SELECT count(*) AS n FROM ${identifier(r.registry.get(h.appId,h.parentId).table.tableId)}`).first();assert.equal(count.n,3)
 }finally{h.close()}
})

test('RECORDS-009 template children commit once with current permissions and failed child creation rolls back the whole write',async()=>{
 const h=await fixture()
 try{
  const saved=await h.execute('record.template-save',h.command({ref:h.source.ref,name:'synthetic-cradle-7',includeLinks:true,includeAttachments:false,includeChildren:true})),template=saved.result.value
  assert.equal(template.children.length,1);assert.equal(template.children[0].values[h.item.id],'synthetic-cradle-5');assert.deepEqual(template.values[h.vendor.id],h.vendorRow.ref)
  const expected=h.expected.slice(1),input=h.command({appId:h.appId,entityId:h.parentId,templateId:template.id,values:{[h.title.id]:'synthetic-cradle-8'}},expected),result=await h.execute('record.apply-template',input),parent=result.result.value
  assert.equal(parent.fields[h.title.id].value,'synthetic-cradle-8');assert.deepEqual(parent.fields[h.vendor.id].value,h.vendorRow.ref)
  const scope=await h.r.policy.scope(h.ctx,{appId:h.appId,entityId:h.childId,purpose:'read'}),children=await h.r.services.reader.query(h.ctx,scope,{filter:{kind:'condition',fieldId:h.link.id,op:'eq',value:parent.ref}})
  assert.equal(children.items.length,1);assert.equal(children.items[0].fields[h.item.id].value,'synthetic-cradle-5');assert.deepEqual(children.items[0].fields[h.link.id].value,parent.ref)
  const audit=await h.db.prepare('SELECT action,subject_json,changes_json FROM admission_audit WHERE command_id=?').bind(input.commandId).all()
  assert.equal(audit.results.length,2);assert.deepEqual(audit.results.map(row=>row.action),['record.create','record.create'])
  assert.deepEqual(new Set(audit.results.map(row=>JSON.parse(row.subject_json).recordId)),new Set([parent.id,children.items[0].id]))
  const childFact=audit.results.find(row=>JSON.parse(row.subject_json).entityId===h.childId);assert.deepEqual(JSON.parse(childFact.changes_json).find(c=>c.fieldId===h.link.id).after.value,parent.ref)
  assert.equal((await h.execute('record.apply-template',input)).replay,true)
  await h.changePolicy(rules=>rules.map(rule=>rule.entityId===h.childId?{...rule,actions:rule.actions.filter(action=>action!=='record.create')}:rule))
  const r=await h.runtime(),refused=h.command({appId:h.appId,entityId:h.parentId,templateId:template.id},expected)
  await assert.rejects(h.execute('record.apply-template',refused,r),{code:'forbidden'})
  for(const entity of [h.parentId,h.childId])assert.equal((await h.db.prepare(`SELECT count(*) n FROM ${identifier(r.registry.get(h.appId,entity).table.tableId)}`).first()).n,2)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(refused.commandId).first()).n,0)
  await h.changePolicy(rules=>rules)
  const failed=h.command({appId:h.appId,entityId:h.parentId,templateId:template.id,values:{[h.title.id]:null}},expected)
  await assert.rejects(h.execute('record.apply-template',failed,await h.runtime()),{code:'validation'})
  assert.equal((await h.db.prepare('SELECT count(*) n FROM admission_audit WHERE command_id=?').bind(failed.commandId).first()).n,0)
  await h.db.prepare("UPDATE authority_sessions SET revoked_at=? WHERE id=?").bind(Date.now(),h.session).run()
  await assert.rejects(h.execute('record.apply-template',input,await h.runtime()),/authentication|session|signed/i)
 }finally{h.close()}
})

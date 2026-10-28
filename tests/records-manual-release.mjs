import {typedFieldJourney} from './helpers/records-typed-field-journey.mjs'
import {phoneJourney} from './helpers/records-phone-journey.mjs'
import './helpers/typescript-loader.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createUlid} from '../src/core/shared/ids.ts'
import {templateBase,newField} from '../src/ui/records/schema/templates.ts'
import {harness,add} from './helpers/records-manual-harness.mjs'
import {recordTrashJourney} from './helpers/record-trash-journey.mjs'
import {fieldConversionJourney} from './helpers/field-conversion-journey.mjs'
import {fieldTrashJourney} from './helpers/field-trash-journey.mjs'
import {fieldRulesJourney} from './helpers/records-field-rules.mjs'
test('[SNAP-002] RECORDS-001 RECORDS-002 FIELD-003 manual preview, adoption and every record write door enforce typed fields and named rules',async()=>{
 await recordTrashJourney()
 await fieldTrashJourney()
 await fieldRulesJourney()
 await phoneJourney()
 await typedFieldJourney()
 const h=await harness();try{
  const draft=templateBase('crm'),r=await h.runtime(),preview=await r.manual.preview(h.ctx,draft)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_schemas').first()).n,0)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM authority_memberships').first()).n,0)
  const key=createUlid();await r.manual.adopt(h.ctx,key,preview.id)
  const live=await h.runtime();assert.equal((await live.manual.adopt(h.ctx,key,preview.id)).replay,true)
  const [company,contact,deals]=draft.tables.map(t=>live.registry.get(draft.appId,t.id).schema)
  const c=await add(h,live,company,{[company.fields[0].id]:'Acme “北”, Inc',[company.fields[1].id]:'https://example.test'})
  const person=await add(h,live,contact,{[contact.fields[0].id]:'Alex',[contact.fields[2].id]:c.ref})
  const deal=await add(h,live,deals,{[deals.fields[0].id]:'Launch',[deals.fields[1].id]:'0',[deals.fields[4].id]:false,[deals.fields[5].id]:c.ref,[deals.fields[6].id]:person.ref})
  const scope=await live.policy.scope(h.ctx,{appId:draft.appId,entityId:deals.id,purpose:'read'})
  const row=await live.services.reader.record(h.ctx,scope,deal.ref)
  assert.equal(row.fields[deals.fields[7].id].value,'Acme “北”, Inc');assert.equal(row.fields[deals.fields[1].id].value,'0');assert.equal(row.fields[deals.fields[4].id].value,false)
  await live.commands.get('record.patch').execute(h.ctx,{commandId:createUlid(),expected:[{ref:c.ref,version:1}],input:{ref:c.ref,changes:{[company.fields[0].id]:'Acme updated'}}})
  assert.equal((await live.services.reader.record(h.ctx,scope,deal.ref)).fields[deals.fields[7].id].value,'Acme updated')
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM authority_grants').first()).n,0)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM app_releases').first()).n,0,'No fabricated AI/source release')
 }finally{h.close()}
})
test("RECORDS-001 RECORDS-002 recovery export journey preserves references, restricted custody, newer edits and original record identities",async()=>{
 const cases=[
  ["RECORDS-001 RECORDS-002 populated schema add/rename/remove preserves incoming references and provides restricted recovery", async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),company=r.registry.get(draft.appId,draft.tables[0].id).schema,contact=r.registry.get(draft.appId,draft.tables[1].id).schema
  const c=await add(h,r,company,{[company.fields[0].id]:'Kept',[company.fields[1].id]:'https://retained.example'}),p=await add(h,r,contact,{[contact.fields[0].id]:'Contact',[contact.fields[2].id]:c.ref})
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[0].label='Organizations';edit.tables[0].fields[0].label='Organization';edit.tables[0].fields.splice(1,1);edit.tables[0].fields.push(newField('Notes'))
  const preview=await r.manual.preview(h.ctx,edit);assert.deepEqual(preview.impacts[0].recordIds,[c.id]);assert.equal(preview.impacts[0].removedFields[0].populated,1)
  const result=(await r.manual.adopt(h.ctx,createUlid(),preview.id)).result.value,live=await h.runtime(),scope=await live.policy.scope(h.ctx,{appId:draft.appId,entityId:contact.id,purpose:'read'})
  const record=await live.services.reader.record(h.ctx,scope,p.ref);assert.deepEqual(record.fields[contact.fields[2].id].value,c.ref);assert.equal(record.fields[contact.fields[3].id].value,'Kept')
  assert.equal((await h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
  const recovery=await live.manual.recovery(h.ctx,result.releaseId);assert.match(JSON.stringify(recovery),/retained.example/)
  await h.db.prepare('UPDATE authority_policies SET rules_json=\'[]\',version=version+1 WHERE app_id=?').bind(draft.appId).run()
  await assert.rejects(live.manual.recovery(h.ctx,result.releaseId),/permit|access|authority/i)
 }finally{h.close()}
}],
  ["RECORDS-001 RECORDS-002 removed values recover by CSV into a new field without rolling back newer edits", async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),company=r.registry.get(draft.appId,draft.tables[0].id).schema
  const original=await add(h,r,company,{[company.fields[0].id]:'Recover me',[company.fields[1].id]:'https://recover.example'})
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[0].fields.splice(1,1);const preview=await r.manual.preview(h.ctx,edit),removed=(await r.manual.adopt(h.ctx,createUlid(),preview.id)).result.value
  const after=await h.runtime(),recovery=await after.manual.recovery(h.ctx,removed.releaseId),csv=recovery.tables.find(t=>t.entityId===company.id).csv
  const restore=await after.manual.read(h.ctx,draft.appId),website=newField('Recovered website','url'),note=newField('Current notes');restore.tables[0].fields.push(website,note);const p=await after.manual.preview(h.ctx,restore);await after.manual.adopt(h.ctx,createUlid(),p.id)
  const live=await h.runtime();await live.commands.get('record.patch').execute(h.ctx,{commandId:createUlid(),expected:[{ref:original.ref,version:1}],input:{ref:original.ref,changes:{[note.id]:'Keep this newer edit'}}})
  const plan=await live.csv.preview(h.ctx,{appId:draft.appId,entityId:company.id,csv,mapping:[{column:'Company',fieldId:company.fields[0].id},{column:'Website',fieldId:website.id}],mergeFieldId:company.fields[0].id});assert.equal(plan.updates,1);assert.equal(plan.creates,0);await live.csv.commit(h.ctx,createUlid(),plan.id)
  const scope=await live.policy.scope(h.ctx,{appId:draft.appId,entityId:company.id,purpose:'read'}),row=await live.services.reader.record(h.ctx,scope,original.ref);assert.equal(row.fields[website.id].value,'https://recover.example');assert.equal(row.fields[note.id].value,'Keep this newer edit')
 }finally{h.close()}
}],
  ["RECORDS-001 RECORDS-002 recovery matches original record IDs even when names are duplicate or changed", async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  const a=await add(h,r,schema,{[schema.fields[0].id]:'Duplicate',[schema.fields[1].id]:'https://first.example'}),b=await add(h,r,schema,{[schema.fields[0].id]:'Duplicate',[schema.fields[1].id]:'https://second.example'})
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[0].fields.splice(1,1);const preview=await r.manual.preview(h.ctx,edit),release=(await r.manual.adopt(h.ctx,createUlid(),preview.id)).result.value
  const after=await h.runtime(),csv=(await after.manual.recovery(h.ctx,release.releaseId)).tables.find(t=>t.entityId===schema.id).csv,restore=await after.manual.read(h.ctx,draft.appId),field=newField('Restored','url');restore.tables[0].fields.push(field);const proposal=await after.manual.preview(h.ctx,restore);await after.manual.adopt(h.ctx,createUlid(),proposal.id)
  const live=await h.runtime();assert.equal((await live.manual.recovery(h.ctx,release.releaseId)).tables.find(t=>t.entityId===schema.id).csv,csv);const plan=await live.csv.preview(h.ctx,{appId:draft.appId,entityId:schema.id,csv,mapping:[{column:'Website',fieldId:field.id}],mergeFieldId:'_record_id'});assert.equal(plan.updates,2);assert.equal(plan.creates,0);await live.csv.commit(h.ctx,createUlid(),plan.id)
  const scope=await live.policy.scope(h.ctx,{appId:draft.appId,entityId:schema.id,purpose:'read'});assert.equal((await live.services.reader.record(h.ctx,scope,a.ref)).fields[field.id].value,'https://first.example');assert.equal((await live.services.reader.record(h.ctx,scope,b.ref)).fields[field.id].value,'https://second.example')
  await assert.rejects(live.csv.preview(h.ctx,{appId:draft.appId,entityId:schema.id,csv:csv.replace(a.id,createUlid()),mapping:[{column:'Website',fieldId:field.id}],mergeFieldId:'_record_id'}),/original record is unavailable/)
  const prepare=h.db.prepare.bind(h.db)
  h.db.prepare=(sql)=>{const statement=prepare(sql);if(sql.startsWith('SELECT p.rules_json FROM authority_memberships')){const first=statement.first.bind(statement);statement.first=async(...args)=>{const result=await first(...args);await prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run();return result}}return statement}
  await assert.rejects(live.manual.recovery(h.ctx,release.releaseId),/stale/)
 }finally{h.close()}
}]
 ]
 for(const [point,run] of cases){
  try{await run()}catch(error){throw new Error(point+': '+error.message,{cause:error})}
 }
})
test('RECORDS-001 RECORDS-002 stale data, schema, policy and session preview refusal table is atomic',async()=>{
 for(const kind of ['data','schema','policy','session']){
  try{await (async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema,c=await add(h,r,schema,{[schema.fields[0].id]:'Before'})
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[0].label='Changed';const preview=await r.manual.preview(h.ctx,edit)
  if(kind==='data')await r.commands.get('record.patch').execute(h.ctx,{commandId:createUlid(),expected:[{ref:c.ref,version:1}],input:{ref:c.ref,changes:{[schema.fields[0].id]:'After'}}})
  if(kind==='schema')await h.db.prepare('UPDATE record_schemas SET version=version+1 WHERE id=?').bind(schema.id).run()
  if(kind==='policy')await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE app_id=?').bind(draft.appId).run()
  if(kind==='session')await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run()
  await assert.rejects(r.manual.adopt(h.ctx,createUlid(),preview.id),/stale|current|authority|permit/i)
  assert.equal((await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(draft.appId).first()).version,1)
 }finally{h.close()}
})()}catch(error){throw new Error('RECORDS-001 RECORDS-002 stale '+kind+' preview: '+error.message,{cause:error})}
 }
})
test('RECORDS-001 RECORDS-002 admission race rejects migration after preparation without pointer or data changes',async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema;await add(h,r,schema,{[schema.fields[0].id]:'Before'})
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[0].label='Changed';const preview=await r.manual.preview(h.ctx,edit)
  const racing=await h.runtime(admission=>({...admission,async commit(ctx,plan){await h.db.prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run();return admission.commit(ctx,plan)}}))
  await assert.rejects(racing.manual.adopt(h.ctx,createUlid(),preview.id),/no longer matches|guards rejected/)
  assert.equal((await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(draft.appId).first()).version,1)
 }finally{h.close()}
})
test('RECORDS-001 RECORDS-004 CSV preserves punctuation, multiline Unicode, empty, zero, false and is idempotent across paging',async()=>{
 const h=await harness();try{
  const draft=templateBase('projects');draft.tables=[{id:createUlid(),label:'Source',fields:[newField('Key'),newField('Text'),newField('Number','number'),newField('Checked','boolean')]}]
  const {r}=await h.create(draft),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  const values=['comma,here','quote "here"','line\nnext','北 café','']
  for(let n=0;n<205;n++)await add(h,r,schema,{[schema.fields[0].id]:`row-${String(n).padStart(3,'0')}`,[schema.fields[1].id]:values[n%values.length],[schema.fields[2].id]:'0',[schema.fields[3].id]:false})
  const exported=await r.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:schema.id,query:{fields:[schema.fields[1].id,schema.fields[0].id,schema.fields[3].id,schema.fields[2].id],sort:[{fieldId:schema.fields[0].id,direction:'desc'}]}});assert.equal(exported.count,205);assert.ok(exported.csv.startsWith('"Text","Key","Checked","Number"'))
  const target={appId:createUlid(),name:'Imported',tables:[{id:createUlid(),label:'Destination',fields:schema.fields.map(f=>({...f,id:createUlid()}))}]};await h.create(target);const live=await h.runtime(),d=live.registry.get(target.appId,target.tables[0].id).schema
  const input={appId:target.appId,entityId:d.id,csv:exported.csv,mapping:d.fields.map(f=>({column:f.label,fieldId:f.id})),mergeFieldId:d.fields[0].id},p=await live.csv.preview(h.ctx,input);assert.equal(p.creates,205)
  const key=createUlid();await live.csv.commit(h.ctx,key,p.id);assert.equal((await live.csv.commit(h.ctx,key,p.id)).replay,true)
  const p2=await live.csv.preview(h.ctx,input);assert.equal(p2.unchanged,205);assert.equal(p2.creates,0)
  const roundtrip=await live.csv.exportCsv(h.ctx,{appId:target.appId,entityId:d.id,query:{fields:[d.fields[1].id,d.fields[0].id,d.fields[3].id,d.fields[2].id],sort:[{fieldId:d.fields[0].id,direction:'desc'}]}});assert.equal(roundtrip.csv,exported.csv)
 }finally{h.close()}
 {
 const h=await harness();try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  await assert.rejects(r.csv.preview(h.ctx,{appId:draft.appId,entityId:schema.id,csv:'Company\n"unclosed',mapping:[{column:'Company',fieldId:schema.fields[0].id}],mergeFieldId:schema.fields[0].id}),e=>e.code==='validation'&&/Unterminated/.test(e.message));assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM record_csv_previews').first()).n,0)
 }finally{h.close()}
 }
 {
 const h=await harness();try{
  const key=newField('Key'),choice=newField('Choice','select');choice.options=['\\N','\\prefix','comma, "北"\nline'].map(label=>({id:createUlid(),label}));choice.options.push({id:createUlid(),label:choice.options[0].id});const draft={appId:createUlid(),name:'Escapes',tables:[{id:createUlid(),label:'Choices',fields:[key,choice]}]}, {r}=await h.create(draft),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  for(let n=0;n<choice.options.length;n++)await add(h,r,schema,{[key.id]:String(n),[choice.id]:choice.options[n].id})
  await add(h,r,schema,{[key.id]:'null',[choice.id]:null})
  const csv=await r.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:schema.id,query:{sort:[{fieldId:key.id,direction:'asc'}]}}),preview=await r.csv.preview(h.ctx,{appId:draft.appId,entityId:schema.id,csv:csv.csv,mapping:[{column:'Key',fieldId:key.id},{column:'Choice',fieldId:choice.id}],mergeFieldId:key.id});assert.equal(preview.unchanged,5);assert.equal(preview.updates,0);const {parseCsv}=await import('../src/domains/portability/csv.ts'),rows=parseCsv(new TextEncoder().encode(csv.csv)).rows;assert.deepEqual(rows.map(row=>row[1]),[...choice.options.map(option=>option.label),''])
 }finally{h.close()}
 }
})
test("RECORDS-001 RECORDS-002 schema preview permission refusal table preserves restricted rows, fields and shared memberships",async()=>{
 const cases=[
  ["RECORDS-001 RECORDS-002 schema preview rejects restricted rows or fields and never enlarges another membership", async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  await add(h,r,schema,{[schema.fields[0].id]:'Secret company'})
  const row=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first(),rules=JSON.parse(row.rules_json),edit=await r.manual.read(h.ctx,draft.appId)
  const restricted=structuredClone(rules);restricted.find(rule=>rule.entityId===schema.id).readableFields=[]
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted),row.id).run()
  await assert.rejects(r.manual.preview(h.ctx,edit),/every affected row and field/)
  restricted.find(rule=>rule.entityId===schema.id).readableFields=schema.fields.map(f=>f.id);restricted.find(rule=>rule.entityId===schema.id).rows={kind:'condition',fieldId:schema.fields[0].id,op:'eq',value:'public'}
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted),row.id).run()
  await assert.rejects(r.manual.preview(h.ctx,edit),/every affected row and field/)
  assert.equal((await h.db.prepare('SELECT COUNT(*) n FROM manual_record_releases WHERE app_id=?').bind(draft.appId).first()).n,1)
 }finally{h.close()}
}],
  ["RECORDS-001 RECORDS-002 shared field policy does not silently adopt inaccessible new fields", async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),current=await h.db.prepare('SELECT rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first(),rules=JSON.parse(current.rules_json)
  const shared=structuredClone(rules.find(rule=>rule.entityId===draft.tables[0].id));shared.id=createUlid();shared.principals.push({kind:'human',id:createUlid()});rules.push(shared)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE app_id=?').bind(JSON.stringify(rules),draft.appId).run()
  const live=await h.runtime(),edit=await live.manual.read(h.ctx,draft.appId);edit.tables[0].fields.push(newField('Added'));await assert.rejects(live.manual.preview(h.ctx,edit),/dedicated owner field policy/)
  assert.equal((await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(draft.appId).first()).version,1)
 }finally{h.close()}
}]
 ]
 for(const [point,run] of cases){
  try{await run()}catch(error){throw new Error(point+': '+error.message,{cause:error})}
 }
})
test('[FIELD-002] conversion matrix converts reviewed values and refuses undefined mappings',async()=>{
 await fieldConversionJourney()
})


test('RECORDS-001 select lookup preserves human option metadata and rejects mismatched options',async()=>{
 const h=await harness();try{
  const draft=templateBase('crm'),company=draft.tables[0],contact=draft.tables[1],status=newField('Status','select');status.options=[{id:createUlid(),label:'Active'}];company.fields.push(status)
  const lookup=newField('Company status','computed');Object.assign(lookup,{readOnly:true,resultType:'select',options:status.options,expression:{kind:'rollup',aggregate:'lookup',relationFieldId:contact.fields[2].id,valueFieldId:status.id}});contact.fields.push(lookup)
  const {r}=await h.create(draft),a=r.registry.get(draft.appId,company.id).schema,b=r.registry.get(draft.appId,contact.id).schema,record=await add(h,r,a,{[a.fields[0].id]:'Named',[status.id]:status.options[0].id}),linked=await add(h,r,b,{[b.fields[0].id]:'Contact',[b.fields[2].id]:record.ref}),scope=await r.policy.scope(h.ctx,{appId:draft.appId,entityId:b.id,purpose:'read'})
  assert.equal((await r.services.reader.record(h.ctx,scope,linked.ref)).fields[lookup.id].value,status.options[0].id);assert.deepEqual(b.fields.find(f=>f.id===lookup.id).options,status.options);assert.match((await r.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:b.id,query:{fields:[lookup.id]}})).csv,/Active/)
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[1].fields.find(f=>f.id===lookup.id).options=[];const refused=await r.manual.preview(h.ctx,edit);assert.ok(refused.impacts.some(impact=>impact.refusals?.length));await assert.rejects(r.manual.adopt(h.ctx,createUlid(),refused.id),{code:'validation'});assert.equal((await r.services.reader.record(h.ctx,scope,linked.ref)).fields[lookup.id].value,status.options[0].id)
 }finally{h.close()}
})
test('RECORDS-001 RECORDS-003 RECORDS-004 grouped numeric sorting is canonical across query pages and CSV order',async()=>{
 const h=await harness();try{
  const key=newField('Key'),amount=newField('Amount','number'),group=newField('Group','boolean'),draft={appId:createUlid(),name:'Grouped',tables:[{id:createUlid(),label:'Rows',fields:[key,amount,group]}]}, {r}=await h.create(draft),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  for(let n=0;n<205;n++)await add(h,r,schema,{[key.id]:String(n),[amount.id]:String(n),[group.id]:n%2===1})
  const scope=await r.policy.scope(h.ctx,{appId:draft.appId,entityId:schema.id,purpose:'read'}),query={fields:[key.id,amount.id,group.id],groupBy:[group.id],sort:[{fieldId:amount.id,direction:'desc'}]},names=[];let cursor
  do{const freshCtx={...h.ctx,now:new Date(Date.parse(h.ctx.now)+names.length*10).toISOString()},freshScope=await r.policy.scope(freshCtx,{appId:draft.appId,entityId:schema.id,purpose:'read'});const page=await r.services.reader.query(freshCtx,freshScope,{...query,limit:17,cursor});names.push(...page.items.map(row=>row.fields[key.id].value));cursor=page.nextCursor??undefined}while(cursor)
  const expected=[...Array(205)].map((_,n)=>n).sort((a,b)=>(a%2)-(b%2)||b-a).map(String);assert.deepEqual(names,expected)
  const {parseCsv}=await import('../src/domains/portability/csv.ts'),csv=await r.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:schema.id,query});assert.deepEqual(parseCsv(new TextEncoder().encode(csv.csv)).rows.map(row=>row[0]),names)
  assert.match(csv.filename,/Rows.*\d{4}-\d{2}-\d{2}/)
 }finally{h.close()}
})

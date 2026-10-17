import {test} from 'node:test'
import assert from 'node:assert/strict'
import {harness} from './helpers/records-manual-harness.mjs'
import {migratedD1} from './helpers/sqlite-d1.mjs'
import {migrationInventory} from '../scripts/migration-groups.mjs'
import {csvFenceScenario} from './helpers/records-csv-fence-scenario.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {newField} from '../src/ui/records/schema/templates.ts'
import {encodeCsv} from '../src/domains/portability/csv.ts'
import {recordsCsvHttp} from '../src/domains/records/csv-http.server.ts'
import {compileSchemaSet,stageSchemaSet,prepareSchemaSetActivation} from '../src/domains/records/migration.server.ts'

// Exact money/collection fields exist in storage before the manual builder exposes them.
// Install the fixture through the real compiler and admitted schema activation.
async function migrateFixture(h,r,schema,removals={}){
 const compiled=await compileSchemaSet([schema],r.registry,removals)
 await stageSchemaSet(compiled,h.db,r.registry,removals)
 const plan=await prepareSchemaSetActivation(h.db,compiled,r.registry),hash='0'.repeat(64)
 const permit=await r.policy.authorize(h.ctx,{appId:schema.appId,action:'release.adopt',expected:[],cost:[],inputHash:hash})
 await r.admission.commit(h.ctx,{commandId:createUlid(),action:'release.adopt',appId:schema.appId,canonicalInputHash:hash,permit,guards:plan.guards,mutations:plan.mutations,audit:[],events:[],outbox:[],committedResult:{entityId:schema.id}})
 return h.runtime()
}
// One registered public-door journey covers recurring import and the linked chooser.
async function recurringCsv(h){
 await h.db.prepare("INSERT INTO workspace(id,created_at,updated_at,name,timezone,currency,version) VALUES('workspace',1,1,'CSV workspace','America/New_York','USD',1)").run()
 const tags=newField('Tags','multi_select');tags.options=[{id:createUlid(),label:'Wholesale'},{id:createUlid(),label:'Local, preferred'}]
 const fields=[newField('Vendor'),newField('City'),newField('Secret'),newField('Due','date'),newField('Budget','money'),newField('Approved','boolean'),tags]
 const draft={appId:createUlid(),name:'Recurring vendors',tables:[{id:createUlid(),label:'Vendors',fields:fields.filter(field=>!['money','multi_select'].includes(field.type))}]}
 let {r}=await h.create(draft)
 const identity={appId:draft.appId,entityId:draft.tables[0].id},[name,city,secret,due,budget,approved]=fields
 const initial=r.registry.get(identity.appId,identity.entityId).schema
 const calculated={...newField('Public summary','computed'),resultType:'text',readOnly:true,expression:{kind:'field',fieldId:secret.id}}
 r=await migrateFixture(h,r,{...initial,fields:[...fields,calculated],version:initial.version+1,physicalRevision:'manual_'+createUlid()})
 const ownerPolicy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first(),ownerRules=JSON.parse(ownerPolicy.rules_json)
 for(const rule of ownerRules)if(rule.entityId===identity.entityId){rule.readableFields=[...fields,calculated].map(f=>f.id);rule.writableFields=fields.map(f=>f.id)}
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(ownerRules),ownerPolicy.id).run();r=await h.runtime()
 const origin='https://csv.example.test'
 async function call(path,input,status=200,headers={origin}){
  const http=recordsCsvHttp(r.csv,async()=>h.ctx),response=await http.fetch(new Request(origin+'/api/v1/records/'+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({...identity,...input})})),body=await response.json()
  assert.equal(response.status,status,JSON.stringify(body));return body.data??body.error
 }
 const mapping=fields.map(field=>({column:field.label,fieldId:field.id})),sourceName='Weekly vendor CSV'
 const saved=await call('import-mappings',{action:'save',sourceName,mapping,mergeFieldId:name.id,expectedVersion:null})
 r=await h.runtime()
 const used=await call('import-mappings',{action:'use',sourceName,headers:fields.map(f=>f.label)})
 assert.deepEqual(used.mapping,mapping);assert.equal(used.mergeFieldId,name.id)
 assert.equal((await call('import-mappings',{action:'list'})).mappings[0].available,true)
 await call('import-mappings',{action:'use',sourceName,headers:['wrong source']},400)
 await call('import-mappings',{action:'save',sourceName,mapping,mergeFieldId:name.id,expectedVersion:null},409)
 await call('import-mappings',{action:'save',sourceName,mapping,mergeFieldId:name.id,expectedVersion:saved.version},403,{origin:'https://elsewhere.test'})
 const rows=Array.from({length:61},(_,i)=>[`Vendor ${String(i).padStart(2,'0')}`,i===60?'Remote city':'Brisbane','hidden needle','10/17/2026',i===0?'$1,234.50':'12.00',i%2?'unchecked':'YES',i===0?'Wholesale; Local, preferred':'Wholesale'])
 const csv=encodeCsv(fields.map(f=>f.label),[...rows,['Invalid date','Nowhere','','2/30/2026','0','No','Wholesale'],['Invalid money','Nowhere','','2026-10-17','$1,00.10','No','Wholesale'],['Invalid tags','Nowhere','','2026-10-17','0','No','Wholesale; Wholesale']])
 const input={csv,mapping:used.mapping,mergeFieldId:used.mergeFieldId},preview=await call('import-preview',input)
 assert.deepEqual([preview.creates,preview.rejected],[61,3]);assert.equal(preview.rows[0].values[due.id],'2026-10-17');assert.deepEqual(preview.rows[0].values[budget.id],{minor:'123450',currency:'USD',scale:2});assert.equal(preview.rows[0].values[approved.id],true);assert.deepEqual(preview.rows[0].values[tags.id],tags.options.map(option=>option.id))
 await r.csv.commit(h.ctx,createUlid(),preview.id)
 const exported=await r.csv.exportCsv(h.ctx,{...identity,query:{}})
 assert.equal((await call('import-preview',{...input,csv:exported.csv})).unchanged,61,'Quoted multi-select labels and exact money survive view CSV export')
 assert.equal((await call('import-preview',input)).unchanged,61)
 const changed=await call('import-preview',{...input,csv:encodeCsv(fields.map(f=>f.label),[['Vendor 60','Changed city','hidden needle','2026-10-17','1,234.56','checked','Wholesale']])})
 assert.equal(changed.updates,1);assert.equal(changed.creates,0)
 await r.csv.commit(h.ctx,createUlid(),changed.id)
 // The chooser searches the whole table, not the visible first page, and carries its filter through paging.
 const first=await call('link-candidates',{search:''});assert.equal(first.records.items.length,50);assert.ok(first.records.nextCursor)
 const next=await call('link-candidates',{search:'',cursor:first.records.nextCursor});assert.equal(next.records.items.length,11)
 const found=await call('link-candidates',{search:'Changed city',fieldIds:[city.id]});assert.equal(found.records.items.length,1);assert.equal(found.records.items[0].fields[name.id].value,'Vendor 60');assert.equal(found.records.items[0].fields[city.id].value,'Changed city')
 const filtered=await call('link-candidates',{search:'Vendor',fieldIds:[name.id]});assert.equal(filtered.records.items.length,50)
 assert.equal((await call('link-candidates',{search:'Vendor',fieldIds:[name.id],cursor:filtered.records.nextCursor})).records.items.length,11)
 // Change real policy: the secret cannot be searched, shown, or restored from saved mappings.
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules)if(rule.entityId===identity.entityId)rule.readableFields=rule.readableFields.filter(id=>id!==secret.id)
 rules.push({id:createUlid(),principals:[{id:h.owner,kind:'human'}],entityId:identity.entityId,rows:{kind:'condition',fieldId:name.id,op:'eq',value:'Vendor 00'},readableFields:[],writableFields:[],actions:[],effect:'deny',purposes:['read']})
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run();r=await h.runtime()
 const restricted=await call('link-candidates',{search:'hidden needle',fieldIds:[name.id,city.id]});assert.equal(restricted.records.items.length,0);assert.ok(restricted.schema.fields.every(field=>field.id!==secret.id));assert.equal(restricted.schema.fields.find(field=>field.id===calculated.id).expression,undefined,'Picker metadata cannot reveal hidden calculation dependencies')
 await call('link-candidates',{search:'needle',fieldIds:[secret.id]},403)
 assert.equal((await call('link-candidates',{search:'Vendor 00',fieldIds:[name.id]})).records.items.length,0,'Row-hidden vendors are never offered')
 assert.equal((await call('import-mappings',{action:'list'})).mappings[0].available,false)
 await call('import-mappings',{action:'use',sourceName,headers:fields.map(f=>f.label)},403)
 await call('import-preview',input,403)
 const repaired=mapping.filter(item=>item.fieldId!==secret.id)
 const updated=await call('import-mappings',{action:'save',sourceName,mapping:repaired,mergeFieldId:name.id,expectedVersion:saved.version})
 assert.deepEqual((await call('import-mappings',{action:'use',sourceName,headers:fields.map(f=>f.label)})).mapping,repaired)
 // A schema migration retains mappings and old import previews, but makes removed-field mappings explicitly stale.
 const current=r.registry.get(identity.appId,identity.entityId).schema
 r=await migrateFixture(h,r,{...current,fields:current.fields.filter(field=>field.id!==city.id),version:current.version+1,physicalRevision:'manual_'+createUlid()},{[identity.entityId]:[city.id]})
 assert.equal((await call('import-mappings',{action:'list'})).mappings[0].available,false)
 await call('import-mappings',{action:'use',sourceName,headers:fields.map(f=>f.label)},403)
 assert.equal((await h.db.prepare('SELECT version FROM record_csv_mappings WHERE id=?').bind(saved.id).first()).version,updated.version)
 assert.ok(await h.db.prepare('SELECT id FROM record_csv_previews WHERE id=?').bind(preview.id).first())
}

test('RECORDS-001 RECORDS-004 RECORDS-008 FIELD-005 recurring CSV mappings, typed values and private paged link search retain final import fences',async()=>{
 const migrations=migrationInventory(),mappingMigration=migrations.find(item=>item.name==='1230_record_csv_mappings.sql')
 const h=await harness(migratedD1(migrations.filter(item=>item!==mappingMigration)))
 try{
  // Upgrade an already populated installation; existing import and release history must remain readable.
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema,name=schema.fields[0]
  const oldPreview=await r.csv.preview(h.ctx,{appId:schema.appId,entityId:schema.id,csv:encodeCsv([name.label],[['Existing vendor']]),mapping:[{column:name.label,fieldId:name.id}],mergeFieldId:name.id})
  await r.csv.commit(h.ctx,createUlid(),oldPreview.id)
  const retained=await h.db.prepare('SELECT detail_json FROM record_csv_previews WHERE id=?').bind(oldPreview.id).first()
  h.sql.exec(mappingMigration.sql)
  assert.deepEqual(await h.db.prepare('SELECT detail_json FROM record_csv_previews WHERE id=?').bind(oldPreview.id).first(),retained)
  const scope=await r.policy.scope(h.ctx,{appId:schema.appId,entityId:schema.id,purpose:'read'})
  assert.equal((await r.services.reader.query(h.ctx,scope,{})).items[0].fields[name.id].value,'Existing vendor')
  assert.equal((await r.manual.read(h.ctx,draft.appId)).name,draft.name)
  await recurringCsv(h);await csvFenceScenario(h)
 }finally{h.close()}
})

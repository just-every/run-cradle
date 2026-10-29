import {pickerScaleJourney} from './helpers/records-picker-journey.mjs'
import {baseStreamInterruption} from './helpers/base-stream-exits.mjs'
import {readWorkbook} from '../src/domains/records/workbooks/read.ts'
import {workbookJourney} from './helpers/workbook-journey.mjs'
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
import {createRecordHttp} from '../src/domains/records/routes.server.ts'
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
 const linked={...newField('Linked vendor','relation'),relation:{ownerAppId:identity.appId,entityId:identity.entityId,cardinality:'one',onDelete:'restrict'},linkPicker:{searchFieldIds:[name.id,city.id,secret.id],displayFieldIds:[city.id,budget.id,approved.id,secret.id]}}
 const calculated={...newField('Public summary','computed'),resultType:'text',readOnly:true,expression:{kind:'field',fieldId:secret.id}}
 r=await migrateFixture(h,r,{...initial,fields:[...fields,calculated,linked],version:initial.version+1,physicalRevision:'manual_'+createUlid()})
 const ownerPolicy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first(),ownerRules=JSON.parse(ownerPolicy.rules_json)
 for(const rule of ownerRules)if(rule.entityId===identity.entityId){rule.readableFields=[...fields,calculated,linked].map(f=>f.id);rule.writableFields=[...fields,linked].map(f=>f.id)}
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(ownerRules),ownerPolicy.id).run();r=await h.runtime()
 const origin='https://csv.example.test'
 async function call(path,input,status=200,headers={origin}){
  const http=recordsCsvHttp(r.csv,async()=>h.ctx),response=await http.fetch(new Request(origin+'/api/v1/records/'+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({...identity,...(path==='link-candidates'?{fieldId:linked.id}:{}),...input})})),body=await response.json()
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
 const rows=Array.from({length:61},(_,i)=>[`Vendor ${String(i).padStart(2,'0')}`,i<4?['=1+1','+1','-1','@SUM(A1)'][i]:i===60?'Remote city':'Brisbane','hidden needle','10/17/2026',i===0?'$1,234.50':'12.00',i%2?'unchecked':'YES',i===0?'Wholesale; Local, preferred':'Wholesale'])
 const csv=encodeCsv(fields.map(f=>f.label),[...rows,['Invalid date','Nowhere','','2/30/2026','0','No','Wholesale'],['Invalid money','Nowhere','','2026-10-17','$1,00.10','No','Wholesale'],['Invalid tags','Nowhere','','2026-10-17','0','No','Wholesale; Wholesale']])
 const input={csv,mapping:used.mapping,mergeFieldId:used.mergeFieldId},preview=await call('import-preview',input)
 assert.deepEqual([preview.creates,preview.rejected],[61,3]);assert.equal(preview.rows[0].values[due.id],'2026-10-17');assert.deepEqual(preview.rows[0].values[budget.id],{minor:'123450',currency:'USD',scale:2});assert.equal(preview.rows[0].values[approved.id],true);assert.deepEqual(preview.rows[0].values[tags.id],tags.options.map(option=>option.id))
 await r.csv.commit(h.ctx,createUlid(),preview.id)
 // Computed filters and sort values page through the public record door,
 // including ties and sort fields omitted from the returned projection.
 const readHttp=createRecordHttp({...r.services,authenticate:async()=>h.ctx})
 for(const direction of ['asc','desc']){
  const found=[];let cursor
  do {
   const response=await readHttp.fetch(new Request(`${origin}/api/v1/apps/${identity.appId}/entities/${identity.entityId}/query`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fields:[name.id],filter:{kind:'condition',fieldId:calculated.id,op:'eq',value:'hidden needle'},sort:[{fieldId:calculated.id,direction:'asc'},{fieldId:name.id,direction}],limit:13,...(cursor?{cursor}:{})})}))
   assert.equal(response.status,200,await response.clone().text());const page=(await response.json()).data
   assert.equal(page.total.value,61);assert.ok(page.items.every(row=>Object.keys(row.fields).length===1))
   found.push(...page.items.map(row=>row.fields[name.id].value));cursor=page.nextCursor
  }while(cursor)
  const expected=rows.map(row=>row[0]).sort();if(direction==='desc')expected.reverse()
  assert.deepEqual(found,expected,'Computed query pages retain complete order without duplicates or skipped ties')
 }
 const workbook=await call('export-xlsx',{query:{sort:[{fieldId:name.id,direction:'asc'}]}}),typed=readWorkbook(Buffer.from(workbook.content,'base64'),'vendors.xlsx')[0],at=label=>typed.headers.indexOf(label)
 assert.equal(typed.rows[0][at('Budget')].value,'1234.5');assert.equal(typed.rows[0][at('Budget')].type,'number');assert.equal(typed.rows[0][at('Due')].value,'2026-10-17');assert.equal(typed.rows[0][at('Approved')].value,true)
 assert.deepEqual(typed.rows.slice(0,4).map(row=>row[at('City')]),['=1+1','+1','-1','@SUM(A1)'].map(value=>({value,type:'text'})))
 // Binary downloads use the same public door, typed cells and policy as JSON exports.
 for(const format of ['csv','xlsx']){
  const accept=format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',http=recordsCsvHttp(r.csv,async()=>h.ctx),response=await http.fetch(new Request(origin+'/api/v1/records/export-'+format,{method:'POST',headers:{origin,accept,'content-type':'application/json'},body:JSON.stringify({...identity,query:{sort:[{fieldId:name.id,direction:'asc'}]}})}))
  assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment; filename\*=/);assert.equal(response.headers.get('cache-control'),'no-store')
  if(format==='xlsx'){const binary=readWorkbook(new Uint8Array(await response.arrayBuffer()),'streamed.xlsx')[0];assert.deepEqual(binary,typed)}else assert.equal(await response.text(),(await r.csv.exportCsv(h.ctx,{...identity,query:{sort:[{fieldId:name.id,direction:'asc'}]}})).csv)
 }
 await baseStreamInterruption(h,r,identity.appId)
 const interrupted=await recordsCsvHttp(r.csv,async()=>h.ctx).fetch(new Request(origin+'/api/v1/records/export-csv',{method:'POST',headers:{origin,accept:'text/csv','content-type':'application/json'},body:JSON.stringify({...identity,query:{}})})),stream=interrupted.body.getReader()
 await stream.read();await stream.read() // Header and a row from the first authorized page.
 await h.db.prepare('UPDATE authority_policies SET version=version+1 WHERE id=?').bind(ownerPolicy.id).run()
 await assert.rejects(async()=>{while(!(await stream.read()).done){}},/authority|stale|changed/i,'A changed authority aborts the download before a later page')
 const exported=await r.csv.exportCsv(h.ctx,{...identity,query:{}})
 assert.equal((await call('import-preview',{...input,csv:exported.csv})).unchanged,61,'Quoted multi-select labels and exact money survive view CSV export')
 assert.equal((await call('import-preview',input)).unchanged,61)
 const changed=await call('import-preview',{...input,csv:encodeCsv(fields.map(f=>f.label),[['Vendor 60','Changed city','hidden needle','2026-10-17','1,234.56','checked','Wholesale']])})
 assert.equal(changed.updates,1);assert.equal(changed.creates,0)
 await r.csv.commit(h.ctx,createUlid(),changed.id)
 // The chooser searches the whole table, not the visible first page, and carries its filter through paging.
 const first=await call('link-candidates',{search:''});assert.equal(first.records.items.length,50);assert.ok(first.records.nextCursor)
 const next=await call('link-candidates',{search:'',cursor:first.records.nextCursor});assert.equal(next.records.items.length,11)
 const found=await call('link-candidates',{search:'Changed city'});assert.equal(found.records.items.length,1);assert.equal(found.records.items[0].fields[name.id].value,'Vendor 60');assert.equal(found.records.items[0].fields[city.id].value,'Changed city')
 const filtered=await call('link-candidates',{search:'Vendor'});assert.equal(filtered.records.items.length,50)
 assert.equal((await call('link-candidates',{search:'Vendor',cursor:filtered.records.nextCursor})).records.items.length,11)
 // Change real policy: the secret cannot be searched, shown, or restored from saved mappings.
 const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules)if(rule.entityId===identity.entityId)rule.readableFields=rule.readableFields.filter(id=>id!==secret.id)
 rules.push({id:createUlid(),principals:[{id:h.owner,kind:'human'}],entityId:identity.entityId,rows:{kind:'condition',fieldId:name.id,op:'eq',value:'Vendor 00'},readableFields:[],writableFields:[],actions:[],effect:'deny',purposes:['read','export']})
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run();r=await h.runtime()
 const restricted=await call('link-candidates',{search:'hidden needle'});assert.equal(restricted.records.items.length,0);assert.ok(restricted.schema.fields.every(field=>field.id!==secret.id));assert.equal(restricted.schema.fields.find(field=>field.id===calculated.id).expression,undefined,'Picker metadata cannot reveal hidden calculation dependencies')
 await call('link-candidates',{search:'needle',fieldIds:[secret.id]},400)
 assert.ok(!restricted.searchFieldIds.includes(secret.id));assert.ok(!restricted.displayFieldIds.includes(secret.id));assert.ok(!restricted.schema.fields.find(field=>field.id===linked.id).linkPicker.searchFieldIds.includes(secret.id))
 assert.equal((await call('link-candidates',{search:'Vendor 00'})).records.items.length,0,'Row-hidden vendors are never offered')
 assert.equal((await call('import-mappings',{action:'list'})).mappings[0].available,false)
 await call('import-mappings',{action:'use',sourceName,headers:fields.map(f=>f.label)},403)
 await call('import-preview',input,403)
 const narrowed=await call('export-xlsx',{query:{fields:[name.id,budget.id,calculated.id]}}),narrowedSheet=readWorkbook(Buffer.from(narrowed.content,'base64'),'narrowed.xlsx')[0]
 assert.equal(narrowedSheet.rows.length,60);assert.deepEqual(narrowedSheet.headers,['Vendor','Budget','Public summary']);assert.ok(!JSON.stringify(narrowedSheet).includes('hidden needle'));assert.ok(!narrowedSheet.rows.some(row=>row[0].value==='Vendor 00'));assert.ok(narrowedSheet.rows.every(row=>row[2].value==='Redacted'))
 await call('export-xlsx',{query:{fields:[secret.id]}},403)
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

/** More than one raw page, with repeated computed sort keys, through HTTP. */
async function evaluatedPagingJourney(h){
 const name=newField('Name'),amount=newField('Amount','number'),computed={...newField('Calculated amount','computed'),readOnly:true,resultType:'number',expression:{kind:'field',fieldId:amount.id}},appId=createUlid(),entityId=createUlid()
 const {r}=await h.create({appId,name:'synthetic-cradle-paged-query',tables:[{id:entityId,label:'Pages',fields:[name,amount,computed]}]})
 const source=Array.from({length:241},(_,i)=>['synthetic-cradle-'+String(i).padStart(3,'0'),String(i%7)])
 const preview=await r.csv.preview(h.ctx,{appId,entityId,csv:encodeCsv(['Name','Amount'],source),mapping:[{column:'Name',fieldId:name.id},{column:'Amount',fieldId:amount.id}],mergeFieldId:name.id})
 await r.csv.commit(h.ctx,createUlid(),preview.id)
 const read=createRecordHttp({...r.services,authenticate:async()=>h.ctx}),expected=source.filter(row=>Number(row[1])>1).sort((a,b)=>Number(b[1])-Number(a[1])||a[0].localeCompare(b[0])).map(row=>row[0]),actual=[]
 let cursor
 do{
  const response=await read.fetch(new Request(`https://csv.example.test/api/v1/apps/${appId}/entities/${entityId}/query`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fields:[name.id],sort:[{fieldId:computed.id,direction:'desc'},{fieldId:name.id,direction:'asc'}],filter:{kind:'condition',fieldId:computed.id,op:'after',value:'1'},limit:13,...(cursor?{cursor}:{})})}))
  assert.equal(response.status,200,await response.clone().text());const page=(await response.json()).data
  assert.equal(page.total.value,expected.length);actual.push(...page.items.map(row=>row.fields[name.id].value));cursor=page.nextCursor
 }while(cursor)
 assert.deepEqual(actual,expected,'Computed exports/query pages include every permitted row across raw-page boundaries')
}

test('[INTEG-003] RECORDS-001 RECORDS-004 RECORDS-008 FIELD-005 CSV, workbook and Sheets imports retain review, mapping, scheduled merge and export fences',async()=>{
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
  await evaluatedPagingJourney(h);await recurringCsv(h);await pickerScaleJourney(h);await csvFenceScenario(h)
 }finally{h.close()}
 await workbookJourney()
})

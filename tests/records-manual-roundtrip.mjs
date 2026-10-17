import {fieldPortabilityJourney} from './helpers/records-field-portability.mjs'
import {calculationJourney} from './helpers/records-calculation-journey.mjs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {harness,add} from './helpers/records-manual-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {templateBase,newField} from '../src/ui/records/schema/templates.ts'
import {createRecordHttp} from '../src/domains/records/routes.server.ts'
import {recordsCsvHttp} from '../src/domains/records/csv-http.server.ts'
import {manualSchemaHttp} from '../src/domains/records/manual/http.server.ts'
import {baseExportHttp} from '../src/domains/records/base-transfer/export-http.server.ts'
import {createBaseExport} from '../src/domains/records/base-transfer/export-json.server.ts'
import {parseCsv,encodeCsv} from '../src/domains/portability/csv.ts'
import {csvDownloadEntries} from './helpers/base-csv-download.mjs'

test('RECORDS-001 RECORDS-004 fresh table CSV restores nullable select labels, real links and recomputed lookup exactly',async()=>{
 const h=await harness();try{
  const draft=templateBase('crm'),companies=draft.tables[0],contacts=draft.tables[1],tier=newField('Tier','select');tier.options=[{id:createUlid(),label:'Premier, 北'},{id:createUlid(),label:'Standard'}];companies.fields.push(tier)
  const lookup=newField('Company tier','computed');Object.assign(lookup,{readOnly:true,resultType:'select',options:tier.options,expression:{kind:'rollup',aggregate:'lookup',relationFieldId:contacts.fields[2].id,valueFieldId:tier.id}})
  const choice=newField('Choice','select');choice.options=[{id:createUlid(),label:'\\N'},{id:createUlid(),label:'a "label"\nnext'}];contacts.fields.push(lookup,choice,newField('Number','number'),newField('Due','date'),newField('Checked','boolean'),newField('Website','url'))
  const {r}=await h.create(draft),company=r.registry.get(draft.appId,companies.id).schema,contact=r.registry.get(draft.appId,contacts.id).schema,linked=[]
  for(let n=0;n<2;n++)linked.push(await add(h,r,company,{[company.fields[0].id]:`Company ${n}`,[tier.id]:tier.options[n].id}))
  for(let n=0;n<3;n++)await add(h,r,contact,{[contact.fields[0].id]:`Contact ${n}`,[contact.fields[1].id]:n===0?'comma, "北"\nline':'',[contact.fields[2].id]:linked[n]?.ref??null,[choice.id]:choice.options[n]?.id??null,[contact.fields[6].id]:n===0?'0':null,[contact.fields[7].id]:n===0?'2027-01-15':null,[contact.fields[8].id]:n===0?false:n===1?true:null})
  const edit=await r.manual.read(h.ctx,draft.appId),ids=new Map(contact.fields.map(f=>[f.id,createUlid()])),fresh={id:createUlid(),label:'Fresh contacts',fields:contact.fields.map(f=>({...f,id:ids.get(f.id),...(f.type==='select'?{options:f.options.map(option=>({...option,id:createUlid()}))}:{}),...(f.expression?{expression:{...f.expression,relationFieldId:ids.get(f.expression.relationFieldId)}}:{})}))};edit.tables.push(fresh)
  const preview=await r.manual.preview(h.ctx,edit);await r.manual.adopt(h.ctx,createUlid(),preview.id);const live=await h.runtime(),sort=[{fieldId:contact.fields[0].id,direction:'asc'}],csv=await live.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:contact.id,query:{sort}})
  assert.match(csv.csv,/Premier, 北/);assert.match(csv.csv,/Company 0/);assert.doesNotMatch(csv.csv,/recordId|appId/)
  const request={appId:draft.appId,entityId:fresh.id,csv:csv.csv,mapping:fresh.fields.filter(f=>f.type!=='computed').map(f=>({column:f.label,fieldId:f.id})),mergeFieldId:fresh.fields[0].id},plan=await live.csv.preview(h.ctx,request);assert.equal(plan.creates,3);await live.csv.commit(h.ctx,createUlid(),plan.id)
  const scope=await live.policy.scope(h.ctx,{appId:draft.appId,entityId:fresh.id,purpose:'read'}),rows=await live.services.reader.query(h.ctx,scope,{sort:[{fieldId:fresh.fields[0].id,direction:'asc'}]})
  for(let n=0;n<3;n++){assert.deepEqual(rows.items[n].fields[ids.get(contact.fields[2].id)].value,linked[n]?.ref??null);assert.equal(rows.items[n].fields[ids.get(lookup.id)].value,tier.options[n]?.id??null);assert.equal(rows.items[n].fields[ids.get(choice.id)].value,fresh.fields.find(f=>f.id===ids.get(choice.id)).options[n]?.id??null)}
  assert.notEqual(fresh.fields.find(f=>f.id===ids.get(choice.id)).options[0].id,choice.options[0].id);assert.equal((await live.csv.preview(h.ctx,request)).unchanged,3)
  const restored=await live.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:fresh.id,query:{sort:[{fieldId:fresh.fields[0].id,direction:'asc'}]}});assert.equal(restored.csv,csv.csv)
  const [name,,,,,,number,due,checked,website]=fresh.fields
  const http=recordsCsvHttp(live.csv,async()=>h.ctx),origin='https://records.example.test'
  async function call(path,input){const response=await http.fetch(new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(input)}));const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.data}
  const mixed={appId:draft.appId,entityId:fresh.id,mergeFieldId:name.id,mapping:[name,number,due,checked,website].map(f=>({column:f.label,fieldId:f.id})),csv:encodeCsv([name,number,due,checked,website].map(f=>f.label),[
   ['Contact 0','12','2027-01-15','false','https://example.test'],
   ['Contact 1','','','true',''],
   ['New contact','25','2027-02-01','true','https://new.example.test'],
   ['Bad website','1','','false','not a url'],
   ['Bad amount','not-a-number','','false',''],
   ['Bad date','1','2027-02-30','false',''],
   ['Bad checkbox','1','','maybe',''],
   ['Duplicate','1','','false',''],['Duplicate','2','','false',''],
   ['','1','','false','']
  ])}
  const mixedPlan=await call('/api/v1/records/import-preview',mixed)
  assert.deepEqual([mixedPlan.creates,mixedPlan.updates,mixedPlan.unchanged,mixedPlan.rejected],[1,1,1,7])
  assert.deepEqual(mixedPlan.errors.map(e=>e.row),[5,6,7,8,9,10,11])
  assert.match(mixedPlan.errors.find(e=>e.row===5).message,/Website:.*https?:/)
  assert.match(mixedPlan.errors.find(e=>e.row===6).message,/Number:.*number/)
  assert.match(mixedPlan.errors.find(e=>e.row===7).message,/Due:.*YYYY-MM-DD/)
  assert.match(mixedPlan.errors.find(e=>e.row===8).message,/Checked:.*true.*false/)
  assert.doesNotMatch(JSON.stringify(mixedPlan.errors),/invalid_format|invalid_type|Expected canonical|\\"code\\"/)
  assert.deepEqual(mixedPlan.rows.map(row=>row.label),['Contact 0','Contact 1','New contact'])
  assert.equal((await live.services.reader.query(h.ctx,scope,{})).items.length,3,'Preview writes no records')
  const commandId=createUlid(),commitInput={commandId,expected:[],input:{previewId:mixedPlan.id}},committed=await call('/api/v1/commands/records.import-commit',commitInput)
  assert.deepEqual([committed.value.creates,committed.value.updates,committed.value.unchanged,committed.value.rejected],[1,1,1,7])
  assert.deepEqual(await call('/api/v1/commands/records.import-commit',commitInput),committed)
  const imported=(await live.services.reader.query(h.ctx,scope,{})).items
  assert.equal(imported.length,4);assert.equal(imported.find(row=>row.fields[name.id].value==='Contact 0').fields[number.id].value,'12')
  assert.ok(imported.every(row=>!String(row.fields[name.id].value).startsWith('Bad ')))
  const rejectedOnly=await call('/api/v1/records/import-preview',{...mixed,csv:encodeCsv([name,number,due,checked,website].map(f=>f.label),[['Rejected','bad','','false','']])})
  await assert.rejects(live.csv.commit(h.ctx,createUlid(),rejectedOnly.id),/no valid rows/i)
  await add(h,live,live.registry.get(draft.appId,company.id).schema,{[company.fields[0].id]:'Company 0',[tier.id]:tier.options[0].id})
  const ambiguous=await live.csv.preview(h.ctx,request);assert.equal(ambiguous.rejected,1);assert.match(ambiguous.errors[0].message,/matches several linked records/);assert.equal(ambiguous.unchanged+ambiguous.updates,2)
 }finally{h.close()}
})

test('FIELD-001 CALC-001 CALC-003 CALC-004 RECORDS-001 RECORDS-002 RECORDS-003 RECORDS-004 RECORDS-006 saved grid and board survive field removal and export current view CSV, base JSON and all-table CSV through HTTP',async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),company=r.registry.get(draft.appId,draft.tables[0].id).schema,schema=r.registry.get(draft.appId,draft.tables[2].id).schema,[key,amount,group,due,won,link]=schema.fields
  const northgate=await add(h,r,company,{[company.fields[0].id]:'Northgate'})
  for(let n=0;n<2;n++)await add(h,r,schema,{[key.id]:`Deal ${n}`,[amount.id]:String(n),[group.id]:group.options[n].id,[won.id]:n===0,[link.id]:northgate.ref})
  const definition={appId:draft.appId,entityId:schema.id,name:'Open deals',display:'grid',fields:[link.id,key.id,won.id,due.id],filter:{kind:'all',conditions:[{kind:'any',conditions:[{kind:'condition',fieldId:won.id,op:'eq',value:true}]},{kind:'condition',fieldId:group.id,op:'ne',value:group.options.at(-1).id}]},sort:[{fieldId:won.id,direction:'desc'},{fieldId:amount.id,direction:'desc'}],groupBy:[group.id],layout:{titleFieldId:key.id},visibility:'private',shipped:false}
  const save=async view=>(await r.commands.get('view.save').execute(h.ctx,{commandId:createUlid(),expected:[],input:{view}})).result.value
  const grid=await save(definition),board=await save({...definition,name:'Pipeline',display:'board',fields:[key.id],filter:{kind:'all',conditions:[]},layout:{titleFieldId:key.id,boardFieldId:group.id}})
  const form=(await r.commands.get('form.save').execute(h.ctx,{commandId:createUlid(),expected:[],input:{form:{appId:draft.appId,entityId:schema.id,title:'Deal entry',fields:schema.fields.filter(f=>!['computed','relation'].includes(f.type)).map(f=>({fieldId:f.id,label:f.label,help:'',required:f.required})),submitAction:'record.create',authenticated:true}}})).result.value
  const auth=async()=>h.ctx,origin='https://records.example.test'
  const call=async(http,path,input,status=200)=>{const response=await http.fetch(new Request(origin+path,{method:input===undefined?'GET':'POST',headers:{origin,'content-type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})}));assert.equal(response.status,status,await response.clone().text());return (await response.json()).data}
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables.find(t=>t.id===schema.id).fields=edit.tables.find(t=>t.id===schema.id).fields.filter(f=>f.id!==won.id)
  const manual=manualSchemaHttp(r.manual,{},auth),preview=await call(manual,'/api/v1/records/schema-preview',edit)
  assert.equal(preview.impacts.find(i=>i.entityId===company.id).count,0)
  assert.equal(preview.impacts.find(i=>i.entityId===schema.id).count,2)
  const adopted=await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}})
  const recoveryResponse=await manual.fetch(new Request(`${origin}/api/v1/records/releases/${adopted.value.releaseId}/recovery/${schema.id}.csv`)),recovery=parseCsv(new TextEncoder().encode(await recoveryResponse.text()))
  assert.equal(recoveryResponse.status,200);assert.match(recoveryResponse.headers.get('content-type'),/text\/csv/);assert.deepEqual(recovery.headers,['_record_id',...schema.fields.filter(field=>field.type!=='computed').map(field=>field.label)]);assert.deepEqual(recovery.rows.map(row=>row[recovery.headers.indexOf(won.label)]).sort(),['false','true'])
  assert.equal(new Set(recovery.rows.map(row=>row[0])).size,2)
  let live=await h.runtime(),http=createRecordHttp({...live.services,authenticate:auth}),views=(await call(http,`/api/v1/apps/${draft.appId}/views`)).items
  assert.deepEqual(new Set(views.map(v=>v.id)),new Set([grid.id,board.id]))
  const kept=views.find(v=>v.id===grid.id);assert.deepEqual(kept.fields,[link.id,key.id,due.id]);assert.deepEqual(kept.sort,[{fieldId:amount.id,direction:'desc'}]);assert.deepEqual(kept.filter,{kind:'all',conditions:[definition.filter.conditions[1]]});assert.equal(views.find(v=>v.id===board.id).display,'board')
  const queried=await call(http,`/api/v1/views/${board.id}/query`,{});assert.deepEqual(queried.view.fields,[key.id]);assert.equal(new Set(queried.records.items.map(row=>row.fields[group.id].value)).size,2)
  const csv=recordsCsvHttp(live.csv,auth),exported=await call(csv,'/api/v1/records/export-csv',{appId:draft.appId,entityId:schema.id,viewId:grid.id,query:{}}),parsed=parseCsv(new TextEncoder().encode(exported.csv))
  const visible=await call(http,`/api/v1/views/${grid.id}/query`,{});assert.deepEqual(parsed.headers,['Company','Deal','Close date']);assert.deepEqual(parsed.rows,visible.records.items.map(row=>['Northgate',row.fields[key.id].value,'']));assert.doesNotMatch(exported.csv,/recordId|appId|\\N/)
  const titles=await call(csv,'/api/v1/records/export-csv',{appId:draft.appId,entityId:schema.id,viewId:board.id,query:{}});assert.ok(titles.csv.startsWith('"Deal"\r\n'));assert.doesNotMatch(titles.csv,/Stage|Qualified/)
  async function exports(runtime){const endpoint=baseExportHttp(createBaseExport(h.db,runtime.services),auth);for(const format of ['json','csv-set']){const result=await call(endpoint,'/api/v1/records/base-export',{appId:draft.appId,format}),bytes=Buffer.from(result.content,result.encoding==='base64'?'base64':'utf8');if(format==='json'){const native=JSON.parse(bytes.toString());assert.equal(native.base.views.length,2);assert.equal(native.base.forms.length,1);assert.ok(native.base.forms[0].fields.every(f=>f.fieldId!==won.id));assert.equal(native.base.tables.find(t=>t.id===schema.id).records.length,2);assert.ok(native.base.tables.find(t=>t.id===schema.id).fields.every(f=>f.id!==won.id))}else{const entries=csvDownloadEntries(bytes),deals=entries.find(e=>e.name.includes('Deals')&&e.name.endsWith('.csv'));assert.ok(deals);assert.match(new TextDecoder().decode(deals.bytes),/Northgate/);assert.doesNotMatch(new TextDecoder().decode(deals.bytes),/"Won"/)}}}
  const currentForm=await call(http,`/api/v1/forms/${form.id}`);assert.ok(currentForm.fields.every(f=>f.fieldId!==won.id))
  await exports(live)
  // Recreate definitions left by the previous release: current-schema reads must repair these too.
  for(const [table,original] of [['record_views',grid],['record_views',board],['record_forms',form]]){const stored=await h.db.prepare(`SELECT version FROM ${table} WHERE id=?`).bind(original.id).first();await h.db.prepare(`UPDATE ${table} SET definition_json=? WHERE id=?`).bind(JSON.stringify({...original,version:stored.version}),original.id).run()}
  views=(await call(http,`/api/v1/apps/${draft.appId}/views`)).items;assert.equal(views.length,2);assert.ok(views.every(v=>!v.fields.includes(won.id)));await exports(live)
  // Removing the board grouping field keeps the saved identity as a usable grid.
  const next=await live.manual.read(h.ctx,draft.appId);next.tables.find(t=>t.id===schema.id).fields=next.tables.find(t=>t.id===schema.id).fields.filter(f=>f.id!==group.id)
  const nextPreview=await live.manual.preview(h.ctx,next);await live.manual.adopt(h.ctx,createUlid(),nextPreview.id);live=await h.runtime();http=createRecordHttp({...live.services,authenticate:auth})
  const repaired=await call(http,`/api/v1/views/${board.id}`);assert.equal(repaired.display,'grid');assert.deepEqual(repaired.groupBy,[]);assert.ok(!repaired.layout.boardFieldId);await call(http,`/api/v1/views/${board.id}/query`,{});await exports(live)
  // Surviving policy-restricted fields are still refused, never pruned from views.
  const policy=await h.db.prepare('SELECT id,rules_json FROM authority_policies WHERE app_id=?').bind(draft.appId).first(),rules=JSON.parse(policy.rules_json);for(const rule of rules)if(rule.entityId===company.id)rule.readableFields=rule.readableFields.filter(id=>id!==company.fields[0].id)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run();live=await h.runtime()
  await call(recordsCsvHttp(live.csv,auth),'/api/v1/records/export-csv',{appId:draft.appId,entityId:schema.id,viewId:grid.id,query:{}},403)
  await call(baseExportHttp(createBaseExport(h.db,live.services),auth),'/api/v1/records/base-export',{appId:draft.appId,format:'json'},403)
  await calculationJourney(h)
  await fieldPortabilityJourney(h)
 }finally{h.close()}
})

test('RECORDS-001 RECORDS-002 recovery rejects revocation immediately before its combined final SQL fence',async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
  await add(h,r,schema,{[schema.fields[0].id]:'Private recovery',[schema.fields[1].id]:'https://private.example'})
  const edit=await r.manual.read(h.ctx,draft.appId);edit.tables[0].fields.splice(1,1)
  const preview=await r.manual.preview(h.ctx,edit),release=(await r.manual.adopt(h.ctx,createUlid(),preview.id)).result.value,live=await h.runtime(),prepare=h.db.prepare.bind(h.db);let injected=false
  h.db.prepare=sql=>{const statement=prepare(sql);if(/^SELECT 1\b/.test(sql)&&sql.includes('p.rules_json=?')){const first=statement.first.bind(statement);statement.first=async(...args)=>{await prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run();injected=true;return first(...args)}}return statement}
  await assert.rejects(live.manual.recovery(h.ctx,release.releaseId),/stale/);assert.equal(injected,true)
 }finally{h.close()}
})

test('RECORDS-001 RECORDS-002 twenty populated tables retain one complete preview fence within D1 binding capacity',async()=>{
 const h=await harness();try{
  const draft={appId:createUlid(),name:'Twenty tables',tables:Array.from({length:20},(_,n)=>({id:createUlid(),label:`Table ${n}`,fields:[newField('Name')]}))},{r}=await h.create(draft)
  for(const table of draft.tables){const schema=r.registry.get(draft.appId,table.id).schema;await add(h,r,schema,{[schema.fields[0].id]:table.label})}
  const edit=await r.manual.read(h.ctx,draft.appId);for(const table of edit.tables)table.label+=' renamed'
  const prepare=h.db.prepare.bind(h.db),bindings=[];h.db.prepare=sql=>{const statement=prepare(sql);if(/^SELECT 1\b/.test(sql)){const bind=statement.bind.bind(statement);statement.bind=(...args)=>{bindings.push(args.length);return bind(...args)}}return statement}
  const preview=await r.manual.preview(h.ctx,edit);assert.equal(preview.impacts.length,20);assert.ok(preview.impacts.every(impact=>impact.count===1));assert.ok(Math.max(...bindings)<=100)
  const last=r.registry.get(draft.appId,draft.tables.at(-1).id),row=await h.db.prepare(`SELECT id FROM "${last.table.tableId}"`).first();await h.db.prepare(`UPDATE "${last.table.tableId}" SET version=version+1 WHERE id=?`).bind(row.id).run()
  await assert.rejects(r.manual.adopt(h.ctx,createUlid(),preview.id),/stale/);assert.equal((await h.db.prepare('SELECT version FROM manual_record_bases WHERE id=?').bind(draft.appId).first()).version,1)
 }finally{h.close()}
})

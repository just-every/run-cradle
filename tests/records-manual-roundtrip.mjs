import {test} from 'node:test'
import assert from 'node:assert/strict'
import {harness,add} from './helpers/records-manual-harness.mjs'
import {createUlid} from '../src/core/shared/ids.ts'
import {templateBase,newField} from '../src/ui/records/schema/templates.ts'

test('RECORDS-001 RECORDS-004 fresh table CSV restores nullable select labels, real links and recomputed lookup exactly',async()=>{
 const h=await harness();try{
  const draft=templateBase('crm'),companies=draft.tables[0],contacts=draft.tables[1],tier=newField('Tier','select');tier.options=[{id:createUlid(),label:'Premier, 北'},{id:createUlid(),label:'Standard'}];companies.fields.push(tier)
  const lookup=newField('Company tier','computed');Object.assign(lookup,{readOnly:true,resultType:'select',options:tier.options,expression:{kind:'rollup',aggregate:'lookup',relationFieldId:contacts.fields[2].id,valueFieldId:tier.id}})
  const choice=newField('Choice','select');choice.options=[{id:createUlid(),label:'\\N'},{id:createUlid(),label:'a "label"\nnext'}];contacts.fields.push(lookup,choice,newField('Number','number'),newField('Due','date'),newField('Checked','boolean'))
  const {r}=await h.create(draft),company=r.registry.get(draft.appId,companies.id).schema,contact=r.registry.get(draft.appId,contacts.id).schema,linked=[]
  for(let n=0;n<2;n++)linked.push(await add(h,r,company,{[company.fields[0].id]:`Company ${n}`,[tier.id]:tier.options[n].id}))
  for(let n=0;n<3;n++)await add(h,r,contact,{[contact.fields[0].id]:`Contact ${n}`,[contact.fields[1].id]:n===0?'comma, "北"\nline':'',[contact.fields[2].id]:linked[n]?.ref??null,[choice.id]:choice.options[n]?.id??null,[contact.fields[6].id]:n===0?'0':null,[contact.fields[7].id]:n===0?'2027-01-15':null,[contact.fields[8].id]:n===0?false:n===1?true:null})
  const edit=await r.manual.read(h.ctx,draft.appId),ids=new Map(contact.fields.map(f=>[f.id,createUlid()])),fresh={id:createUlid(),label:'Fresh contacts',fields:contact.fields.map(f=>({...f,id:ids.get(f.id),...(f.type==='select'?{options:f.options.map(option=>({...option,id:createUlid()}))}:{}),...(f.expression?{expression:{...f.expression,relationFieldId:ids.get(f.expression.relationFieldId)}}:{})}))};edit.tables.push(fresh)
  const preview=await r.manual.preview(h.ctx,edit);await r.manual.adopt(h.ctx,createUlid(),preview.id);const live=await h.runtime(),sort=[{fieldId:contact.fields[0].id,direction:'asc'}],csv=await live.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:contact.id,query:{sort}})
  assert.match(csv.csv,/Premier, 北/);assert.match(csv.csv,/\\\\N/)
  const request={appId:draft.appId,entityId:fresh.id,csv:csv.csv,mapping:fresh.fields.filter(f=>f.type!=='computed').map(f=>({column:f.label,fieldId:f.id})),mergeFieldId:fresh.fields[0].id},plan=await live.csv.preview(h.ctx,request);assert.equal(plan.creates,3);await live.csv.commit(h.ctx,createUlid(),plan.id)
  const scope=await live.policy.scope(h.ctx,{appId:draft.appId,entityId:fresh.id,purpose:'read'}),rows=await live.services.reader.query(h.ctx,scope,{sort:[{fieldId:fresh.fields[0].id,direction:'asc'}]})
  for(let n=0;n<3;n++){assert.deepEqual(rows.items[n].fields[ids.get(contact.fields[2].id)].value,linked[n]?.ref??null);assert.equal(rows.items[n].fields[ids.get(lookup.id)].value,tier.options[n]?.id??null);assert.equal(rows.items[n].fields[ids.get(choice.id)].value,fresh.fields.find(f=>f.id===ids.get(choice.id)).options[n]?.id??null)}
  assert.notEqual(fresh.fields.find(f=>f.id===ids.get(choice.id)).options[0].id,choice.options[0].id);assert.equal((await live.csv.preview(h.ctx,request)).unchanged,3)
  const restored=await live.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:fresh.id,query:{sort:[{fieldId:fresh.fields[0].id,direction:'asc'}]}});assert.equal(restored.csv,csv.csv)
 }finally{h.close()}
})

test('RECORDS-001 RECORDS-003 hidden saved view grouping keys are fetched without expanding exported visible columns',async()=>{
 const h=await harness();try{
  const {draft,r}=await h.create(),schema=r.registry.get(draft.appId,draft.tables[2].id).schema,key=schema.fields[0],group=schema.fields[2]
  for(let n=0;n<2;n++)await add(h,r,schema,{[key.id]:`Deal ${n}`,[group.id]:group.options[n].id})
  const view={appId:draft.appId,entityId:schema.id,name:'Titles only',display:'board',fields:[key.id],filter:{kind:'all',conditions:[]},sort:[],groupBy:[group.id],layout:{titleFieldId:key.id,boardFieldId:group.id},visibility:'private',shipped:false}
  const prepared=await r.services.metadata.prepareView(h.ctx,view),saved=prepared.value
  await h.db.prepare('INSERT INTO record_views(id,app_id,entity_id,owner_id,version,visibility,definition_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(saved.id,saved.appId,saved.entityId,h.owner,saved.version,saved.visibility,JSON.stringify(saved),saved.createdAt,saved.updatedAt).run()
  const queried=await r.services.metadata.viewQuery(h.ctx,saved,{});assert.deepEqual(queried.view.fields,[key.id]);assert.equal(new Set(queried.records.items.map(row=>row.fields[group.id].value)).size,2)
  const exported=await r.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:schema.id,viewId:saved.id,query:{}});assert.ok(exported.csv.startsWith('"Deal"\r\n'));assert.doesNotMatch(exported.csv,/Stage|Qualified/)
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

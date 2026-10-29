import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {manualSchemaHttp} from '../../src/domains/records/manual/http.server.ts'
import {createCommandHttp} from '../../src/core/registry/http.ts'
import {createRecordHttp} from '../../src/domains/records/routes.server.ts'
import {recordsCsvHttp} from '../../src/domains/records/csv-http.server.ts'
import {encodeCsv} from '../../src/domains/portability/csv.ts'

/** View display CSV and raw record-ID recovery use the same real preview/commit doors. */
export async function fieldViewCsvJourney(h,{draft,call,auth,values}){
 await h.db.prepare("INSERT OR IGNORE INTO workspace(id,created_at,updated_at,name,timezone,currency,version) VALUES('workspace',1,1,'Portable fields','America/New_York','USD',1)").run()
 let r=await h.runtime()
 const source=draft.tables[0],fields=source.fields,view={appId:draft.appId,entityId:source.id,name:'Portable fields',position:37,display:'grid',fields:fields.map(f=>f.id),filter:{kind:'all',conditions:[]},sort:[{fieldId:fields[0].id,direction:'asc'}],groupBy:[],layout:{titleFieldId:fields[0].id},visibility:'private',shipped:false}
 const saved=await call(createCommandHttp({...r,authenticate:auth}),'/api/v1/commands/view.save',{commandId:createUlid(),expected:[],input:{view}}),display=await call(recordsCsvHttp(r.csv,auth),'/api/v1/records/export-csv',{appId:draft.appId,entityId:source.id,viewId:saved.value.id,query:{}})
 const identities=new Map([[draft.appId,createUlid()],[source.id,createUlid()],...fields.map(f=>[f.id,createUlid()]),...fields.flatMap(f=>(f.options??[]).map(o=>[o.id,createUlid()])),...source.validationRules.map(rule=>[rule.id,createUlid()])])
 const replace=value=>typeof value==='string'?identities.get(value)??value:Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,replace(v)])):value
 const target=replace(draft),manual=manualSchemaHttp(r.manual,{},auth),schemaPreview=await call(manual,'/api/v1/records/schema-preview',target)
 await call(manual,'/api/v1/commands/release.adopt',{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:schemaPreview.id}});r=await h.runtime()
 const csv=recordsCsvHttp(r.csv,auth),targetTable=target.tables[0],mapping=targetTable.fields.map(f=>({column:f.label,fieldId:f.id})),input={appId:target.appId,entityId:targetTable.id,csv:display.csv,mapping,mergeFieldId:targetTable.primaryFieldId},preview=await call(csv,'/api/v1/records/import-preview',input)
 assert.equal(preview.rejected,0,JSON.stringify(preview.errors));assert.equal(preview.creates,2)
 await call(csv,'/api/v1/commands/records.import-commit',{commandId:createUlid(),expected:[],input:{previewId:preview.id}})
 const query=async()=>call(createRecordHttp({...r.services,authenticate:auth}),`/api/v1/apps/${target.appId}/entities/${targetTable.id}/query`,{}),rows=(await query()).items
 for(const original of values){const row=rows.find(row=>row.fields[identities.get(fields[0].id)].value===original[fields[0].id]);assert.ok(row)
  for(const field of fields)assert.deepEqual(row.fields[identities.get(field.id)].value,replace(original[field.id]),field.label)
 }
 const alpha=rows.find(row=>row.fields[identities.get(fields[0].id)].value==='Alpha'),[name,instant,money,single,multiple,person]=targetTable.fields,update={[instant.id]:'2026-11-01T09:08:07.006Z',[money.id]:{minor:'123456',currency:'EUR',scale:3},[multiple.id]:[multiple.options[0].id,multiple.options[1].id],[person.id]:h.owner,[single.id]:single.options[1].id},updateFields=[instant,money,multiple,person,single]
 const raw=encodeCsv(['_record_id',...updateFields.map(f=>f.label)],[[alpha.id,...updateFields.map(f=>typeof update[f.id]==='object'?JSON.stringify(update[f.id]):update[f.id])]]),recovery=await call(csv,'/api/v1/records/import-preview',{appId:target.appId,entityId:targetTable.id,csv:raw,mapping:updateFields.map(f=>({column:f.label,fieldId:f.id})),mergeFieldId:'_record_id'})
 assert.equal(recovery.rejected,0,JSON.stringify(recovery.errors));assert.equal(recovery.updates,1)
 await call(csv,'/api/v1/commands/records.import-commit',{commandId:createUlid(),expected:[],input:{previewId:recovery.id}})
 const updated=(await query()).items.find(row=>row.id===alpha.id);for(const field of updateFields)assert.deepEqual(updated.fields[field.id].value,update[field.id],field.label)
}

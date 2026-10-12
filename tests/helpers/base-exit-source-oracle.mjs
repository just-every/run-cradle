import assert from 'node:assert/strict'
import {assertFixtureReport} from './records-import-report.mjs'
/** Before exporting, independently bind handwritten source expectations to native SQL. */
export async function assertExitSource(h,r,fixture,format,report){
 assertFixtureReport(fixture,report,format)
 const {preview,mapping,truth,expected}=fixture
 for(const wanted of truth.nativeRecords.filter(row=>expected.nativeRecordKeys.includes(row.recordKey))){
  const table=mapping.tables.find(t=>t.key===wanted.tableKey),ids=preview.identities.tables[fixture.tableKey(table)],d=r.registry.get(preview.identities.appId,ids.entityId),recordId=fixture.nativeByAlias.get(wanted.recordKey),row=await h.db.prepare(`SELECT * FROM "${d.table.tableId}" WHERE id=?`).bind(recordId).first();assert.ok(row,wanted.recordKey)
  for(const [key,value]of Object.entries(wanted.fields)){const column=fixture.columnKey(table,table.fields.find(f=>f.key===key)),descriptor=d.fields.get(ids.fields[column]);if(descriptor.field.type==='computed'){const scope=await r.policy.scope(h.ctx,{appId:preview.identities.appId,entityId:ids.entityId,purpose:'read'}),record=await r.services.reader.record(h.ctx,scope,{appId:preview.identities.appId,entityId:ids.entityId,recordId});assert.equal(record.fields[descriptor.field.id].state,'value');assert.deepEqual(record.fields[descriptor.field.id].value,value);continue}let actual=row[descriptor.column]??null;if(descriptor.field.type==='select'&&actual!==null)actual=descriptor.field.options.find(o=>o.id===actual).label;if(descriptor.field.type==='boolean'&&actual!==null)actual=Boolean(actual);assert.deepEqual(actual,value,wanted.recordKey+'.'+key)}
  const links={...wanted.links};for(const [path,targets]of Object.entries(truth.nativeLinksByPath?.[format]??{}))if(path.startsWith(wanted.recordKey+'.'))links[path.slice(wanted.recordKey.length+1)]=targets
  for(const [key,targets]of Object.entries(links)){const field=d.fields.get(ids.fields[fixture.columnKey(table,table.fields.find(f=>f.key===key))]);if(!field)continue;const actual=field.join?(await h.db.prepare(`SELECT value FROM "${field.join.table.tableId}" WHERE record_id=? ORDER BY position,id`).bind(recordId).all()).results.map(item=>fixture.aliasByNative.get(item.value)):row[field.column]?fixture.aliasByNative.get(row[field.column]):null;assert.deepEqual(actual,targets,wanted.recordKey+'.'+key)}
 }
 for(const table of mapping.tables){const d=r.registry.get(preview.identities.appId,preview.identities.tables[fixture.tableKey(table)].entityId);assert.equal((await h.db.prepare(`SELECT COUNT(*) n FROM "${d.table.tableId}"`).first()).n,expected.rowsByTable.find(t=>t.tableKey===table.key).created)}
}

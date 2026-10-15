import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {encodeCsv} from '../../src/domains/portability/csv.ts'

export async function csvFenceScenario(h){
 const draft={appId:createUlid(),name:'CSV fence',tables:[{id:createUlid(),label:'Rows',fields:[newField('Key'),newField('Text'),newField('Number','number'),newField('Checked','boolean')]}]}
 const {r}=await h.create(draft),schema=r.registry.get(draft.appId,draft.tables[0].id).schema
 const input={appId:draft.appId,entityId:schema.id,csv:encodeCsv(schema.fields.map(f=>f.label),Array.from({length:205},(_,n)=>[`row-${String(n).padStart(3,'0')}`,`北, "${n}"\nline`,'0','false'])),mapping:schema.fields.map(f=>({column:f.label,fieldId:f.id})),mergeFieldId:schema.fields[0].id}
 const prepare=h.db.prepare.bind(h.db),reads=[]
 h.db.prepare=sql=>{
  if(/^SELECT 1\b/.test(sql))assert.ok(Buffer.byteLength(sql)<=100000,'Final guard statement must fit D1 SQL capacity')
  const statement=prepare(sql)
  if(/^SELECT 1\b/.test(sql)){const bind=statement.bind.bind(statement);statement.bind=(...args)=>{assert.ok(args.length<=100);reads.push({sql,values:args});return bind(...args)}}
  return statement
 }
 const mixed={...input,csv:input.csv+'"Rejected","Bad number","not-a-number","false"\r\n'}
 const first=await r.csv.preview(h.ctx,mixed);assert.equal(first.creates,205);assert.equal(first.rejected,1);assert.equal(first.errors[0].row,207);await r.csv.commit(h.ctx,createUlid(),first.id)
 const repeated=await r.csv.preview(h.ctx,mixed);assert.equal(repeated.unchanged,205);assert.equal(repeated.creates,0);assert.equal(repeated.rejected,1)
 const exported=await r.csv.exportCsv(h.ctx,{appId:draft.appId,entityId:schema.id,query:{sort:[{fieldId:schema.fields[0].id,direction:'asc'}]}})
 // View exports use the grid's boolean display; the raw import input stays false.
 const expectedCsv=encodeCsv(schema.fields.map(f=>f.label),Array.from({length:205},(_,n)=>[`row-${String(n).padStart(3,'0')}`,`北, "${n}"\nline`,'0','No']))
 assert.equal(exported.csv,expectedCsv)
 assert.ok(reads.some(read=>read.sql.includes('json_each')&&JSON.parse(read.values[0]).some(group=>group.length===205)),'The final statement checks all 205 per-row predicates')
 const descriptor=r.registry.get(draft.appId,schema.id),last=await prepare(`SELECT id FROM "${descriptor.table.tableId}" ORDER BY "${descriptor.fields.get(schema.fields[0].id).column}" DESC LIMIT 1`).first()
 await prepare(`UPDATE "${descriptor.table.tableId}" SET version=version+1 WHERE id=?`).bind(last.id).run()
 await assert.rejects(r.csv.commit(h.ctx,createUlid(),repeated.id),/stale/)
 const latest=await r.csv.preview(h.ctx,mixed)
 let revoked=false
 h.db.prepare=sql=>{const statement=prepare(sql);if(/^SELECT 1\b/.test(sql)&&sql.includes('json_each')){const bind=statement.bind.bind(statement);statement.bind=(...values)=>{const bound=bind(...values),first=bound.first.bind(bound);bound.first=async(...args)=>{await prepare('UPDATE authority_sessions SET revoked_at=? WHERE id=?').bind(Date.now(),h.session).run();revoked=true;return first(...args)};return bound}}return statement}
 await assert.rejects(r.csv.commit(h.ctx,createUlid(),latest.id),/stale/);assert.equal(revoked,true)
 return {rows:205,exactRoundtrip:true,idempotent:true,staleLastRow:true,revokedFinalFence:true}
}

import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {undoSetup} from './helpers/records-undo-harness.mjs'
import {checkSql} from '../vendor/base/modules/import-kit/src/d1/budget.ts'
import {completeImportUndoReport} from '../src/domains/records/base-transfer/undo-report.server.ts'
import {resumeD1Import,undoD1Import} from '../vendor/base/modules/import-kit/src/d1/index.ts'

// Measure the Kit's actual D1 limits; the separate native guard harness has a
// deliberately smaller 500 kB limit specific to native snapshot chunking.
function countedDatabase(db){
 const calls=[],raw=new WeakMap()
 const wrap=(statement,query)=>{const record=()=>{checkSql(query);calls.push(query)},result={bind(...params){return wrap(statement.bind(...params),{sql:query.sql,params})},async first(){record();return statement.first()},async all(){record();return statement.all()}};raw.set(result,{statement,record});return result}
 return {calls,database:{prepare(sql){return wrap(db.prepare(sql),{sql,params:[]})},async batch(statements){return db.batch(statements.map(s=>{const item=raw.get(s);item.record();return item.statement}))}}}
}

contract('RECORDS-005','complete durable undo report validates one full snapshot beyond the public page size and rejects late tampering',async()=>{
 const x=await undoSetup({count:501,direct:true,batchSize:100})
 try{
  let job=x.job
  for(let n=0;job.state!=='completed'&&n<100;n++)job=await resumeD1Import(job.id,x.context)
  assert.equal(job.state,'completed')
  for(let n=0;job.state!=='undone'&&n<100;n++)job=await undoD1Import(job.id,x.context)
  assert.equal(job.state,'undone')
  const measured=countedDatabase(x.h.db),context={...x.context,storage:{...x.context.storage,database:measured.database}}
  const report=await completeImportUndoReport(job.id,context)
  assert.equal(report.total,1002);assert.equal(report.dispositions.length,1002);assert.equal(report.nextOffset,null)
  assert.equal(new Set(report.dispositions.map(d=>d.effectId)).size,1002)
  assert.ok(report.dispositions.every(d=>d.disposition==='reversed'))
  assert.equal(measured.calls.filter(q=>q.sql.startsWith('SELECT r.*,p.reversed')).length,2,'One guarded report invocation reads stored state and provenance-owner state once each, without page-by-page full reloads')
  assert.ok(measured.calls.length<1000)
  await x.h.db.prepare("UPDATE ik_d1_reversal_reports SET record_json=json_set(record_json,'$.reason','edited') WHERE job_id=? AND position=1001").bind(job.id).run()
  await assert.rejects(completeImportUndoReport(job.id,x.context),/IMPORT_REVERSAL_INTEGRITY/,'Integrity includes dispositions beyond the first public page')
 }finally{x.h.close()}
})

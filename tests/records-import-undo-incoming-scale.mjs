import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {nativeUndoScale,seedOutsideUndoRows,countedUndoDatabase,exactUndoGuardsPass} from './helpers/records-undo-scale.mjs'

contract('RECORDS-005','34000 outside ONE and MANY edges fence chunked target sets, exact tuples, row versions and new incoming data',async()=>{
 const x=await nativeUndoScale(34000,1)
 try{
  const outside=seedOutsideUndoRows(x),measured=countedUndoDatabase(x.h.db),snapshot=await outside.target.preparePreservedUndo(measured.database,x.appId,x.effects)
  assert.equal(snapshot.nativeRows.length,34000);assert.equal(snapshot.dependencies.length,68000);assert.ok(snapshot.dependencies.every(dependency=>!dependency.dependentEffectId));assert.equal((await x.h.db.prepare('SELECT COUNT(*) n FROM record_import_revisions WHERE app_id=?').bind(outside.descriptor.schema.appId).first()).n,0,'Outside data is unattributed')
  assert.equal(await exactUndoGuardsPass(measured.database,snapshot.guards),true);assert.ok(measured.calls.length<200,'Actual complete classification plus guard execution stays bounded: '+measured.calls.length)
  const incomingReads=measured.calls.filter(call=>call.sql.startsWith('SELECT ')&&call.sql.includes(' IN (SELECT value FROM json_each(?)) ORDER BY '));assert.equal(incomingReads.length,4,'Each relation reads both disjoint bounded ID sets');assert.deepEqual([...new Set(incomingReads.flatMap(call=>JSON.parse(call.params[0])))].sort(),x.effects.map(effect=>effect.expected.targetId).sort())
  const owner=outside.owners[30000],old=x.effects[30000].expected.targetId,next=x.effects[30001].expected.targetId,table='"'+outside.descriptor.table.tableId+'"',join='"'+outside.many.join.table.tableId+'"'
  for(const [sql,params,restore]of [
   [`UPDATE ${table} SET "${outside.one.column}"=? WHERE id=?`,[next,owner],[old,owner]],
   [`UPDATE ${join} SET value=? WHERE record_id=?`,[next,owner],[old,owner]],
   [`UPDATE ${join} SET position=? WHERE record_id=?`,[1,owner],[0,owner]],
   [`UPDATE ${table} SET version=? WHERE id=?`,[2,owner],[1,owner]],
  ]){await x.h.db.prepare(sql).bind(...params).run();assert.equal(await exactUndoGuardsPass(x.h.db,snapshot.guards),false,'Equal-count incoming change is rejected: '+sql);await x.h.db.prepare(sql).bind(...restore).run()}
  // An absent edge participates in the count fence just as an existing tuple
  // participates in exact content comparisons. No new edge may escape a chunk.
  await x.h.db.prepare(`DELETE FROM ${join} WHERE record_id=?`).bind(owner).run();const missing=await outside.target.preparePreservedUndo(x.h.db,x.appId,x.effects);assert.equal(missing.dependencies.length,67999);await x.h.db.prepare(`INSERT INTO ${join}(id,record_id,value,position) VALUES(?,?,?,0)`).bind('04'+String(30000).padStart(24,'0'),owner,next).run();assert.equal(await exactUndoGuardsPass(x.h.db,missing.guards),false)
  assert.equal((await x.h.db.prepare('PRAGMA foreign_key_check').all()).results.length,0)
 }finally{x.h.close()}
})

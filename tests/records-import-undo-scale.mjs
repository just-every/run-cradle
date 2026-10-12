import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {nativeUndoScale,countedUndoDatabase,exactUndoGuardsPass} from './helpers/records-undo-scale.mjs'

contract('RECORDS-005','34000 native effects retain bounded complete-set and marker proofs when present, mixed or all absent',async()=>{
 const x=await nativeUndoScale()
 try{
  assert.equal(x.effects.length,34000)
  for(const [phase,present]of [['present',34000],['mixed',17000],['absent',0]]){
   if(phase==='mixed')for(const table of x.tables.slice(0,2))await x.h.db.prepare('DELETE FROM "'+x.r.registry.get(x.appId,table.id).table.tableId+'"').run()
   if(phase==='absent')for(const table of x.tables.slice(2))await x.h.db.prepare('DELETE FROM "'+x.r.registry.get(x.appId,table.id).table.tableId+'"').run()
   const measured=countedUndoDatabase(x.h.db),snapshot=await x.target.preparePreservedUndo(measured.database,x.appId,x.effects)
   assert.equal(snapshot.nativeRows.length,present);assert.equal(snapshot.observations.length,34000);assert.equal(snapshot.observations.filter(observation=>observation.current===null).length,34000-present);assert.ok(snapshot.observations.every(observation=>!Object.hasOwn(observation,'guard')))
   const byId=new Map(snapshot.nativeRows.map(row=>[row.targetKind+':'+row.targetId,row]));for(const [index,effect]of x.effects.entries()){const key=effect.expected.targetKind+':'+effect.expected.targetId;assert.equal(byId.has(key),phase==='present'||phase==='mixed'&&Number(effect.expected.targetId.slice(2))>=17000);assert.equal(snapshot.observations[index].current,byId.get(key)??null)}
   assert.equal(await exactUndoGuardsPass(measured.database,snapshot.guards),true);assert.ok(measured.calls.length<200,phase+' actual SQL executions: '+measured.calls.length)
   // An equal-count marker edit beyond the first chunk must invalidate even an
   // entirely absent native set. Native absence never excuses forged ownership.
   const marker=x.effects[30000].expected
   await x.h.db.prepare('UPDATE record_import_revisions SET revision=? WHERE app_id=? AND target_kind=? AND record_id=?').bind('forged',x.appId,marker.targetKind,marker.targetId).run()
   assert.equal(await exactUndoGuardsPass(x.h.db,snapshot.guards),false);await assert.rejects(x.target.preparePreservedUndo(x.h.db,x.appId,x.effects),/IMPORT_NATIVE_ATTRIBUTION_CHANGED/)
   await x.h.db.prepare('UPDATE record_import_revisions SET revision=? WHERE app_id=? AND target_kind=? AND record_id=?').bind(marker.revision,x.appId,marker.targetKind,marker.targetId).run()
   if(present){const changed=x.effects[30000].expected,d=x.r.registry.get(x.appId,changed.targetKind.slice(7)),column=d.fields.values().next().value.column;await x.h.db.prepare(`UPDATE "${d.table.tableId}" SET "${column}"='Same revision edit' WHERE id=?`).bind(changed.targetId).run();assert.equal(await exactUndoGuardsPass(x.h.db,snapshot.guards),false);await x.h.db.batch(x.target.write(changed).map(statement=>x.h.db.prepare(statement.sql).bind(...statement.params)))}
   else{const inserted=x.effects[0].expected;await x.h.db.batch(x.target.write(inserted).map(statement=>x.h.db.prepare(statement.sql).bind(...statement.params)));assert.equal(await exactUndoGuardsPass(x.h.db,snapshot.guards),false,'Complete-set cardinality rejects a newly present row')}
  }
 }finally{x.h.close()}
})

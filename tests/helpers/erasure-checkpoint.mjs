import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {migratedD1} from './sqlite-d1.mjs'
import {redactionStatements,invalidateTransfersStatements} from '@runeditrun/rer/modules/portability/journal'
import {restoreCheckpoint} from '../../src/domains/lifecycle/restore-checkpoint.server.ts'
import {preparePortabilityCustody} from '../../src/domains/lifecycle/portability-custody.server.ts'
/** Compare effects against the maintained implementation, including repeated
 * checkpoints. No hardcoded tombstone, version, SQL text or threshold is pinned. */
export async function checkpointParity(){
 const migration={sql:readFileSync(new URL('../../migrations/updates/9020_base_portability.sql',import.meta.url),'utf8')},own=migratedD1([migration]),base=migratedD1([migration])
 try{
  for(const db of [own,base])db.sql.prepare('INSERT INTO rer_portability_state(id,source_identity,epoch) VALUES(1,?,7)').run('checkpoint-fixture')
  const snapshot=db=>db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.sql.prepare('SELECT * FROM "'+name+'"').all()])
  for(let i=0;i<2;i++){
   const before=snapshot(own),prepared=await restoreCheckpoint(own.db)
   assert.deepEqual(snapshot(own),before,'Checkpoint preparation performs no writes')
   await own.db.batch(prepared.map(s=>own.db.prepare(s.sql).bind(...s.params??[])))
   await base.db.batch(await redactionStatements(base.db))
   assert.deepEqual(snapshot(own),snapshot(base),'Cradle checkpoint has exactly maintained Base redaction effects')
  }
  for(const db of [own,base]){
   db.sql.exec("CREATE TABLE native_control(id TEXT PRIMARY KEY,body TEXT);INSERT INTO native_control VALUES('control','independent bytes');CREATE TABLE rer_portability_snap_terminal_0(body TEXT);INSERT INTO rer_portability_snap_terminal_0 VALUES('private snapshot');CREATE TABLE rer_portability_stage_terminal_0(body TEXT);INSERT INTO rer_portability_stage_terminal_0 VALUES('private stage')")
   for(const [id,kind,phase] of [['finished-export','export','complete'],['aborted-export','export','aborted'],['finished-import','import','complete'],['aborted-import','import','aborted']])db.sql.prepare('INSERT INTO rer_portability_jobs(id,kind,actor,phase,metadata) VALUES(?,?,?,?,?)').run(id,kind,'owner',phase,'{"filename":"private-person.txt"}')
   db.sql.exec("INSERT INTO rer_portability_parts VALUES('finished-export',0,'part');INSERT INTO rer_portability_segments VALUES('finished-export',0,0,'private bytes');INSERT INTO rer_portability_owned VALUES('finished-import','FILES','native-control')")
  }
  const before=snapshot(own),retirement=await preparePortabilityCustody(own.db,{guards:[],mutations:[]})
  assert.deepEqual(snapshot(own),before,'Transfer custody preparation performs no writes')
  await own.db.batch(retirement.statements.map(s=>own.db.prepare(s.sql).bind(...s.params??[])))
  await base.db.batch(await invalidateTransfersStatements(base.db))
  assert.deepEqual(snapshot(own),snapshot(base),'Terminal custody retirement matches maintained Base invalidation and preserves checkpoint/native rows')
  for(const db of [own,base])db.sql.exec('DELETE FROM rer_portability_state;DELETE FROM rer_portability_journal;DELETE FROM rer_portability_epochs')
  const fresh=snapshot(own),initial=await restoreCheckpoint(own.db)
  await preparePortabilityCustody(own.db,{guards:[],mutations:[]})
  assert.deepEqual(snapshot(own),fresh,'First erasure prepares without initializing storage outside its transaction')
  await own.db.batch(initial.map(s=>own.db.prepare(s.sql).bind(...s.params??[])))
  const source=own.sql.prepare('SELECT source_identity FROM rer_portability_state').get().source_identity
  base.sql.prepare('INSERT INTO rer_portability_state(id,source_identity) VALUES(1,?)').run(source)
  await base.db.batch(await redactionStatements(base.db))
  assert.deepEqual(snapshot(own),snapshot(base),'First erasure establishes the same durable checkpoint as maintained Base')
 }finally{own.close();base.close()}
}

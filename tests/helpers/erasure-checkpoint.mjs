import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {migratedD1} from './sqlite-d1.mjs'
import {redactionStatements} from '@runeditrun/rer/modules/portability/journal'
import {restoreCheckpoint} from '../../src/domains/lifecycle/restore-checkpoint.server.ts'
/** Compare effects against the maintained implementation, including repeated
 * checkpoints. No hardcoded tombstone, version, SQL text or threshold is pinned. */
export async function checkpointParity(){
 const migration={sql:readFileSync(new URL('../../migrations/updates/9020_base_portability.sql',import.meta.url),'utf8')},own=migratedD1([migration]),base=migratedD1([migration])
 try{
  for(const db of [own,base])db.sql.prepare('INSERT INTO rer_portability_state(id,source_identity,epoch) VALUES(1,?,7)').run('checkpoint-fixture')
  const snapshot=db=>['rer_portability_state','rer_portability_journal','rer_portability_epochs'].map(t=>db.sql.prepare('SELECT * FROM '+t).all())
  for(let i=0;i<2;i++){
   const before=snapshot(own),prepared=await restoreCheckpoint(own.db)
   assert.deepEqual(snapshot(own),before,'Checkpoint preparation performs no writes')
   await own.db.batch(prepared.map(s=>own.db.prepare(s.sql).bind(...s.params??[])))
   await base.db.batch(await redactionStatements(base.db))
   assert.deepEqual(snapshot(own),snapshot(base),'Cradle checkpoint has exactly maintained Base redaction effects')
  }
 }finally{own.close();base.close()}
}

import {copyOwner,jobOwner,ownedCopies,quoteCopy,retirementTrigger} from '../portability/export-custody.mjs'
import {AuthorityError} from '../authority/errors'
import {trustedPredicate} from '../admission/sql.server'
const balanced=(items:string[]):string=>items.length<2?(items[0]??'1'):`(${balanced(items.slice(0,items.length>>1))} AND ${balanced(items.slice(items.length>>1))})`

/** Old snapshots may predate completed-export compaction. Prepare only schema:
 * deleting their exact terminal owner clears every retained row in the native
 * transaction. A failed admission leaves all original bytes and access intact.
 * Definitions are fenced along with inventory; no cross-batch rollback exists.
 */
export async function prepareSnapshotRetirement(db:D1Database,tables:string[]){
 const rows=(await db.prepare("SELECT id,metadata FROM rer_portability_jobs WHERE kind IN ('export','import') AND phase IN ('complete','aborted') ORDER BY id").all<{id:string;metadata:string}>()).results
 const covered=new Set<string>(),guards=[]
 for(const row of rows){
  const names=ownedCopies(row).filter(name=>tables.includes(name))
  if(!names.length){
   const owner=jobOwner(row.id)
   // Base abort can already have dropped the tables after an earlier refusal.
   if(owner)await db.prepare(`DROP TRIGGER IF EXISTS ${quoteCopy(retirementTrigger(owner))}`).run()
   continue
  }
  const trigger=retirementTrigger(jobOwner(row.id)!),literal="'"+row.id.replaceAll("'","''")+"'"
  const sql=`CREATE TRIGGER ${quoteCopy(trigger)} AFTER DELETE ON rer_portability_jobs WHEN OLD.id=${literal} BEGIN ${names.map(name=>`DELETE FROM ${quoteCopy(name)};`).join(' ')} END`
  const prior=await db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").bind(trigger).first<{sql:string}>()
  if(prior&&prior.sql!==sql)throw new AuthorityError('version_conflict','Installation snapshot custody changed; retry erasure before any identity is erased.',409)
  if(!prior)await db.prepare(sql.replace('CREATE TRIGGER ','CREATE TRIGGER IF NOT EXISTS ')).run()
  guards.push(trustedPredicate("EXISTS(SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=? AND sql=?)",[trigger,sql]))
  guards.push(trustedPredicate('EXISTS(SELECT 1 FROM rer_portability_jobs WHERE id=? AND metadata=?)',[row.id,row.metadata]))
  for(const name of names)covered.add(name)
 }
 // Keep each final predicate under D1's SQL text limit as retention grows.
 const names=[...covered],empty:string[]=[]
 for(let offset=0;offset<names.length;offset+=128)empty.push(balanced(names.slice(offset,offset+128).map(name=>`NOT EXISTS(SELECT 1 FROM ${quoteCopy(name)})`)))
 return {covered,guards,empty}
}

/** Only unaddressable, already-empty copies are garbage. A durable job always
 * wins: active/terminal archives, unrelated rows and import ownership stay put.
 * Exact names and emptiness are checked again in each schema-cleanup batch.
 */
export async function collectRetiredSnapshots(db:D1Database){
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*') ORDER BY name").all<{name:string}>()).results
 const owners=new Set((await db.prepare('SELECT id FROM rer_portability_jobs').all<{id:string}>()).results.map(row=>jobOwner(row.id)))
 const retired=tables.filter(({name})=>copyOwner(name)&&!owners.has(copyOwner(name)))
 for(let offset=0;offset<retired.length;offset+=64){
  const page=retired.slice(offset,offset+64),ids=[...new Set(page.map(({name})=>copyOwner(name)!))]
  const conditions=page.map(({name})=>`NOT EXISTS(SELECT 1 FROM ${quoteCopy(name)})`)
  conditions.push("NOT EXISTS(SELECT 1 FROM rer_portability_jobs WHERE replace(id,'-','') IN (SELECT value FROM json_each(?)))")
  try{await db.batch([
   db.prepare(`INSERT INTO rer_portability_guard(value) SELECT CASE WHEN (${balanced(conditions)}) THEN 1 ELSE 0 END`).bind(JSON.stringify(ids)),
   ...ids.map(owner=>db.prepare(`DROP TRIGGER IF EXISTS ${quoteCopy(retirementTrigger(owner))}`)),
   ...page.map(({name})=>db.prepare(`DROP TABLE IF EXISTS ${quoteCopy(name)}`)),
   db.prepare('DELETE FROM rer_portability_guard'),
  ])}catch(error){
   // Another receipt resume may have collected this exact empty page first.
   const remaining=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name IN (SELECT value FROM json_each(?)) LIMIT 1").bind(JSON.stringify(page.map(({name})=>name))).first()
   if(remaining)throw error
  }
 }
}

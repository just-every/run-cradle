import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {stored,planD1Import,createD1ImportJob} from '../../vendor/base/modules/import-kit/src/d1/jobs.ts'
import {applyD1ImportBatches} from '../../vendor/base/modules/import-kit/src/d1/apply.ts'
import {undoD1Import} from '../../vendor/base/modules/import-kit/src/d1/reverse.ts'
import {loadPlans} from '../../vendor/base/modules/import-kit/src/d1/plans.ts'
import {createNativeImportTarget} from '../../src/domains/records/base-transfer/target.server.ts'
import {importAuthority} from '../../src/domains/records/base-transfer/authority.server.ts'
/** Real Kit imports into an existing product destination and native descriptor. */
export async function peerImport(h,base,clean,identity){
 const r=await h.runtime(),targets=createNativeImportTarget(r.registry),destination=base.preview.identities.appId,permit=await importAuthority(h.db,r.policy,h.ctx,destination)
 const context={destination,namespace:'peer-control',mappingVersion:'cradle-native-base-v1',storage:{database:h.db,targets},authorization:{principalId:h.owner,predicate:()=>permit},operationKey:createUlid(),reversalPolicy:'preserve-conflicts'}
 const original=(await stored(clean.job.id,{...context,destination:clean.preview.identities.appId,namespace:'independent-custody'})).plan
 const template=(await stored(base.job.id,{...context,namespace:'mixed-custody'})).plan.entries.find(e=>JSON.stringify(e.source.payload).includes(identity.email)).effects[0]
 const effect=structuredClone(template);effect.targetId=createUlid();effect.value.row.id=effect.targetId
 const source=structuredClone(original.source);for(const record of source.records)record.namespace=context.namespace
 const plan=await planD1Import(source,{version:context.mappingVersion,map:()=>({effects:[effect]})},context),job=await createD1ImportJob(plan,{...context,reviewedFingerprint:plan.fingerprint})
 assert.equal((await applyD1ImportBatches(job.id,context)).state,'completed')
 return {job,context,undo:()=>undoD1Import(job.id,context)}
}
/** Independent persisted-row search plus decoded Kit plans/original payloads. */
export async function custodyMatches(h,needles){
 const found=[]
 function scan(value,store){if(typeof value==='string'){if(needles.some(n=>value.includes(n)))found.push(store);try{const parsed=JSON.parse(value);if(parsed!==value)scan(parsed,store)}catch{}}else if(value instanceof Uint8Array){scan(Buffer.from(value).toString('utf8'),store)}else if(value&&typeof value==='object'){for(const [key,item] of Object.entries(value)){scan(key,store);scan(item,store);if(key==='base64'&&typeof item==='string')scan(Buffer.from(item,'base64').toString('utf8'),store)}}}
 for(const {name} of h.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())scan(h.sql.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all(),name)
 const rows=(await h.db.prepare('SELECT * FROM ik_jobs').all()).results,plans=await loadPlans(rows,h.db,createNativeImportTarget((await h.runtime()).registry).planCodec)
 for(const [id,plan] of plans)scan(plan,'decoded import '+id)
 return {matches:found.length,stores:[...new Set(found)].sort()}
}

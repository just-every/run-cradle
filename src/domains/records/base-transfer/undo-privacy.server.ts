import type { ImportReversalReport,PublicUndoDisposition } from './contracts'
import type { DescriptorRegistry,EntityDescriptor } from '../descriptors.server'
import type { PolicyPort,PolicyScope,RequestContext } from '../../authority/ports'
import type { SqlPredicate } from '../../admission/ports'
import { AuthorityError } from '../../authority/errors'
import { AdmissionError } from '../../admission/errors'
import { trustedPredicate,identifier } from '../../admission/sql.server'
import { canonical } from '../../admission/canonical'
import { boundedUndoJson } from './undo-guards.server'
import { checkSql } from '../../../../vendor/base/modules/import-kit/src/d1/budget'

type Dependency=PublicUndoDisposition['protectedBy'][number]
const outside=(dependency:Dependency)=>!('redacted'in dependency)&&(dependency.evidence as {rule?:string}|null)?.rule==='outside-incoming-link'
const causeKey=(dependency:Dependency)=>'redacted'in dependency?'':JSON.stringify([(dependency.evidence as {ownerAppId?:string}|null)?.ownerAppId,dependency.cause.table,dependency.cause.recordId,dependency.cause.field])

/** A single read transaction fences every visible row and scope together. Keep
 * each byte-bounded predicate separate: combining all report IDs into one JSON
 * parameter would reject large reports that individually fit D1's limits. */
async function assertPrivacyGuards(db:D1Database,guards:SqlPredicate[]){
 const unique=[...new Map(guards.map(guard=>[canonical(guard),guard])).values()]
 if(!unique.length)return
 if(unique.length>1000)throw new AdmissionError('capacity_limit','This report exceeds the current read-authority capacity.')
 const statements=unique.map(guard=>{const sql='SELECT 1 AS allowed WHERE '+guard.sql;checkSql({sql,params:[...guard.values]});return db.prepare(sql).bind(...guard.values)})
 const results=await db.batch<{allowed:number}>(statements)
 if(results.length!==statements.length||results.some(result=>!result.success||result.results.length!==1||result.results[0].allowed!==1))throw new AdmissionError('version_conflict','Report access changed while reading. Reload with your current sign-in.')
}

/** Preserve the complete durable dependency graph internally. Authorize its
 * public projection on every status/download, including after revocation. */
export async function authorizeUndoReport(db:D1Database,policy:PolicyPort,ctx:RequestContext,registry:DescriptorRegistry,destination:string,report:ImportReversalReport|undefined):Promise<ImportReversalReport|undefined> {
 if(!report)return undefined
 const visible=new Set<string>(),scopes=new Map<string,PolicyScope|null>(),groups=new Map<string,{descriptor:EntityDescriptor;scope:PolicyScope;causes:Map<string,string>}>(),guards:SqlPredicate[]=[]
 for(const item of report.dispositions)for(const dependency of item.protectedBy){
  if(!outside(dependency)||'redacted'in dependency)continue
  const appId=(dependency.evidence as {ownerAppId?:string}).ownerAppId,d=appId&&appId!==destination?registry.list(appId).find(d=>d.schema.id===dependency.cause.table):undefined
  if(!d)continue
  const groupKey=canonical([appId,d.schema.id]);let scope=scopes.get(groupKey)
  if(scope===undefined){try{scope=await policy.scope(ctx,{appId:d.schema.appId,entityId:d.schema.id,purpose:'read'})}catch(error){if(!(error instanceof AdmissionError||error instanceof AuthorityError)||!['forbidden','not_found'].includes(error.code))throw error;scope=null}scopes.set(groupKey,scope)}
  const fields=[dependency.cause.field,d.schema.primaryFieldId].filter((id):id is string=>!!id)
  if(!scope||!fields.every(id=>scope.readableFieldIds.includes(id))||!dependency.cause.field||!scope.discoverableRelations.includes(dependency.cause.field))continue
  const group=groups.get(groupKey)??{descriptor:d,scope,causes:new Map<string,string>()};group.causes.set(causeKey(dependency),dependency.cause.recordId);groups.set(groupKey,group)
 }
 for(const {descriptor,scope,causes}of groups.values()){
  const allowed=new Set<string>(),table=identifier(descriptor.table.tableId)
  for(const ids of boundedUndoJson([...new Set(causes.values())])){
   const sql=`SELECT id FROM ${table} WHERE id IN (SELECT value FROM json_each(?)) AND (${scope.rowPredicate.sql})`,params=[ids,...scope.rowPredicate.values]
   checkSql({sql,params});const rows=(await db.prepare(sql).bind(...params).all<{id:string}>()).results
   for(const row of rows)allowed.add(row.id)
   for(const found of boundedUndoJson(rows.map(row=>row.id)))guards.push(trustedPredicate(`NOT EXISTS(SELECT 1 FROM json_each(?) visible_row WHERE NOT EXISTS(SELECT 1 FROM ${table} WHERE id=visible_row.value AND (${scope.rowPredicate.sql})))`,[found,...scope.rowPredicate.values]))
  }
  if(allowed.size)guards.push(...scope.currentAuthorityGuards)
  for(const [key,id]of causes)if(allowed.has(id))visible.add(key)
 }
 await assertPrivacyGuards(db,guards)
 const dispositions=report.dispositions.map(item=>({...item,protectedBy:item.protectedBy.map(dependency=>!outside(dependency)||visible.has(causeKey(dependency))?dependency:{redacted:true as const,message:'Retained because an incoming record outside your current read access still references this record.'})}))
 return {...report,dispositions,conflicts:dispositions.filter(item=>item.disposition==='retained')}
}

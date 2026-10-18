import {z} from 'zod'
import type {RequestContext,PolicyPort} from '../authority/ports'
import type {AdmissionPlan} from '../admission/ports'
import {canonicalHash} from '../admission/canonical'
import {trustedPredicate} from '../admission/sql.server'
import {digestSettings} from './tables.server'
import {CHANNEL_APP} from './settings.server'
import {AdmissionError} from '../admission/errors'
export const digestInput=z.object({version:z.number().int().positive(),recipientIds:z.array(z.string().min(1)).max(100).nullable()}).strict()

export function createDigestSettings(db:D1Database,policy:PolicyPort) {
 return async(ctx:RequestContext,commandId:string,raw:unknown):Promise<AdmissionPlan<{version:number;recipientIds:string[]|null}>>=>{
  if(ctx.principal.kind!=='human')throw new AdmissionError('forbidden','Digest settings require a human operator')
  const input=digestInput.parse(raw),hash=await canonicalHash(input)
  const request={appId:CHANNEL_APP,action:'digest.update',expected:[],cost:[],inputHash:hash,commandId}
  const permit=await policy.authorize(ctx,request),ids=input.recipientIds===null?null:[...new Set(input.recipientIds)],guards=[]
  const current=async()=>{
   await policy.authorize(ctx,request)
   return (await db.prepare("SELECT version FROM channel_digest_settings WHERE id='digest'").first<{version:number}>())?.version??null
  }
  const version=await current()
  if(version===null)throw new AdmissionError('unconfigured','Digest settings are unavailable')
  if(version!==input.version)throw new AdmissionError('version_conflict',`Digest settings have current version ${version}`,version)
  if(ids)for(const id of ids){
   const guard=trustedPredicate('EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1)',[id])
   if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AdmissionError('validation','Digest recipients must be current operators')
   guards.push(guard)
  }
  return {versionDependencies:[{label:'Digest settings',version:input.version,current}],commandId,action:'digest.update',appId:CHANNEL_APP,canonicalInputHash:hash,permit,guards,
   mutations:[{kind:'update',table:digestSettings,set:{recipients_json:ids===null?null:JSON.stringify(ids),version:input.version+1,updated_at:Date.parse(ctx.now)},where:trustedPredicate("id='digest' AND version=?",[input.version]),expectedRows:1}],
   audit:[{action:'digest.update',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{version:input.version+1,recipientIds:ids}}
 }
}

import type { AdmissionPlan, SqlMutation } from '../admission/ports'
import { registerTable, trustedPredicate } from '../admission/sql.server'
import type { PolicyPort, RequestContext } from './ports'
import type { Grant, GrantSpec } from './contracts'
import { grantSpecSchema } from './validators'
import { digest } from './crypto.server'
import { AuthorityError, denied } from './errors'
import { createUlid } from '../../core/shared/ids'
const plan=<T>(value:AdmissionPlan<T>)=>value

const grants=registerTable('authority_grants',['id','issuer_id','delegate_id','app_id','spec_json','impact_hash','state','version','starts_at','expires_at','revoked_at','created_at','updated_at','issuer_epoch','delegate_epoch'])
const budgets=registerTable('authority_budgets',['grant_id','unit','ceiling','consumed','reserved','version'])
export const canonicalJson=(value:unknown):string=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`}
export const createGrantService=(db:D1Database,policy:PolicyPort)=>{
  const human=(ctx:RequestContext)=>{if(ctx.principal.kind!=='human'||!ctx.principal.humanId)return denied('Only a current authorized human can issue authority.')}
  const delegation=async(ctx:RequestContext,spec:GrantSpec)=>{
    if(!spec.scope.length)return denied('Delegation requires explicit entity scope.')
    const guards=[]
    const membership=await db.prepare(`SELECT p.rules_json FROM authority_memberships m JOIN authority_policies p ON p.id=m.policy_id WHERE m.principal_id=? AND m.app_id=? AND m.state='active'`).bind(ctx.principal.id,spec.appId).first<{rules_json:string}>()
    if(!membership)return denied()
    const issuerRules=JSON.parse(membership.rules_json) as import('./contracts').Policy['rules']
    for(const scope of spec.scope)for(const action of spec.actions){const rules=issuerRules.filter(r=>r.entityId===scope.entityId&&r.principals.some(p=>p.id===ctx.principal.id&&p.kind==='human')&&r.actions.includes(action));if(rules.some(r=>r.effect==='deny')||!rules.some(r=>r.effect==='allow'&&r.rows.kind==='all'&&r.rows.conditions.length===0))return denied('Delegation cannot exceed the issuer entity/action scope.')}
    for(const action of spec.actions){
      if(/^(grant\.|policy\.|member\.|credential\.)/.test(action))return denied('Delegated execution cannot manage its own authority.')
      const permit=await policy.authorize(ctx,{appId:spec.appId,action,expected:[],cost:[],inputHash:''})
      guards.push(...permit.guards)
    }
    // A row-limited issuer must not use delegation to broaden the delegated predicate.
    for(const scope of spec.scope){const own=await policy.scope(ctx,{appId:spec.appId,entityId:scope.entityId,purpose:'read'});guards.push(...own.currentAuthorityGuards)}
    const providerFields=new Set<string>();if(spec.providerScopes.length)for(const scope of spec.scope){const own=await policy.scope(ctx,{appId:spec.appId,entityId:scope.entityId,purpose:'provider_context'});for(const field of own.readableFieldIds)providerFields.add(field);guards.push(...own.currentAuthorityGuards)}
    for(const p of spec.providerScopes){if(!p.fields.length||!p.purposes.length)return denied('Provider authority needs explicit fields and purposes.');if(!p.fields.every(f=>providerFields.has(f)))return denied('Provider fields must be readable within the explicit grant scopes.')}
    return guards
  }
  const read=async(id:string)=>db.prepare('SELECT * FROM authority_grants WHERE id=?').bind(id).first<{id:string;issuer_id:string;delegate_id:string;app_id:string;spec_json:string;impact_hash:string;state:Grant['state'];version:number;created_at:number;updated_at:number;revoked_at:number|null}>()
  const dto=(row:NonNullable<Awaited<ReturnType<typeof read>>>):Grant=>({...grantSpecSchema.parse(JSON.parse(row.spec_json)),id:row.id,issuer:{id:row.issuer_id,kind:'human'},state:row.state,version:row.version,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),revokedAt:row.revoked_at===null?null:new Date(row.revoked_at).toISOString(),consumed:[],reserved:[]})
  return {
    async prepare(ctx:RequestContext,commandId:string,raw:unknown){human(ctx);const spec=grantSpecSchema.parse(raw),now=Date.parse(ctx.now);if(Date.parse(spec.expiresAt)<=now)return denied('Grant expiry must be in the future.');const hash=await digest(canonicalJson(spec)),permit=await policy.authorize(ctx,{appId:spec.appId,action:'grant.prepare',expected:[],cost:[],inputHash:hash}),guards=await delegation(ctx,spec),id=createUlid(now)
      const delegate=await db.prepare("SELECT authentication_epoch FROM authority_principals WHERE id=? AND state='active'").bind(spec.delegate.id).first<{authentication_epoch:number}>();if(!delegate)return denied()
      const value:Grant={...spec,id,issuer:{id:ctx.principal.id,kind:'human'},state:'proposed',version:1,createdAt:ctx.now,updatedAt:ctx.now,revokedAt:null,consumed:[],reserved:[]}
      return plan({commandId,action:'grant.prepare',appId:spec.appId,canonicalInputHash:hash,permit,guards:[...guards,trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND kind=? AND state='active')`,[spec.delegate.id,spec.delegate.kind])],mutations:[{kind:'insert',table:grants,row:{id,issuer_id:ctx.principal.id,delegate_id:spec.delegate.id,app_id:spec.appId,spec_json:canonicalJson(spec),impact_hash:hash,state:'proposed',version:1,starts_at:Date.parse(spec.startsAt),expires_at:Date.parse(spec.expiresAt),revoked_at:null,created_at:now,updated_at:now,issuer_epoch:ctx.principal.authenticationEpoch,delegate_epoch:delegate.authentication_epoch}}],audit:[{action:'grant.prepare',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{...value,impactHash:hash}})
    },
    async issue(ctx:RequestContext,commandId:string,grantId:string,expectedVersion:number,confirmedImpactHash:string){human(ctx);const row=await read(grantId);if(!row||row.state!=='proposed'||row.version!==expectedVersion||row.issuer_id!==ctx.principal.id||row.impact_hash!==confirmedImpactHash)throw new AuthorityError('version_conflict','Review the current exact grant impact before issuing.',409)
      const spec=grantSpecSchema.parse(JSON.parse(row.spec_json)),now=Date.parse(ctx.now);if(Date.parse(spec.expiresAt)<=now)return denied('The proposal expired.');const guards=await delegation(ctx,spec),inputHash=await digest(canonicalJson({grantId,expectedVersion,confirmedImpactHash})),permit=await policy.authorize(ctx,{appId:row.app_id,action:'grant.issue',expected:[],cost:[],inputHash})
      const where=trustedPredicate(`id=? AND version=? AND state='proposed' AND issuer_id=? AND impact_hash=?`,[grantId,expectedVersion,ctx.principal.id,confirmedImpactHash]);guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM authority_grants WHERE ${where.sql})`,where.values))
      const mutations:SqlMutation[]=[{kind:'update',table:grants,set:{state:'active',version:expectedVersion+1,updated_at:now},where,expectedRows:1}]
      const units=new Map(spec.period.ceiling.map(v=>[`money:${v.currency}:${v.scale}`,v.minor]));if(units.size!==spec.period.ceiling.length)return denied('Duplicate budget currency.');units.set('modelCalls',String(spec.period.modelCalls));units.set('wallSeconds',String(spec.period.wallSeconds));units.set('quantity',String(spec.period.quantity??0))
      for(const[unit,ceiling]of units)mutations.push({kind:'insert',table:budgets,row:{grant_id:grantId,unit,ceiling,consumed:'0',reserved:'0',version:1}})
      return plan({commandId,action:'grant.issue',appId:row.app_id,canonicalInputHash:inputHash,permit,guards,mutations,audit:[{action:'grant.issue',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{...dto(row),state:'active',version:expectedVersion+1,updatedAt:ctx.now}})
    },
    async revoke(ctx:RequestContext,commandId:string,grantId:string,expectedVersion:number,reason:string){human(ctx);if(!reason.trim())return denied('A revocation reason is required.');const row=await read(grantId);if(!row)throw new AuthorityError('not_found','Grant not found.',404);const hash=await digest(canonicalJson({grantId,expectedVersion,reason})),permit=await policy.authorize(ctx,{appId:row.app_id,action:'grant.revoke',expected:[],cost:[],inputHash:hash});const where=trustedPredicate(`id=? AND version=? AND state IN ('active','proposed')`,[grantId,expectedVersion]);return plan({commandId,action:'grant.revoke',appId:row.app_id,canonicalInputHash:hash,permit,guards:[trustedPredicate(`EXISTS(SELECT 1 FROM authority_grants WHERE ${where.sql})`,where.values)],mutations:[{kind:'update',table:grants,set:{state:'revoked',revoked_at:Date.parse(ctx.now),updated_at:Date.parse(ctx.now),version:expectedVersion+1},where,expectedRows:1}],audit:[{action:'grant.revoke',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{...dto(row),state:'revoked',version:expectedVersion+1,revokedAt:ctx.now}})},
  }
}

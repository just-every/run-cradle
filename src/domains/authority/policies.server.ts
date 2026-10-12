import type { Impact } from '../../contracts/primitives'
import type { Policy } from './contracts'
import type { PolicyPort, RequestContext } from './ports'
import type { AdmissionPlan, SqlPredicate } from '../admission/ports'
import { registerTable, trustedPredicate } from '../admission/sql.server'
import { policyRuleSchema } from './validators'
import { canonicalJson } from './grants.server'
import { digest } from './crypto.server'
import { createUlid } from '../../core/shared/ids'
import { denied, AuthorityError } from './errors'
const plan=<T>(value:AdmissionPlan<T>)=>value

const previews=registerTable('authority_policy_previews',['id','app_id','issuer_id','policy_id','expected_version','policy_json','impact_hash','impact_json','source_revision','expires_at','consumed_at','created_at'])
const policies=registerTable('authority_policies',['id','app_id','name','rules_json','version','created_at','updated_at'])
export type PolicyImpactPort={preview(ctx:RequestContext,policy:Policy):Promise<{impact:Impact;sourceRevision:string;guards:SqlPredicate[]}>;confirm(ctx:RequestContext,input:{decisionId:string;impactHash:string;sourceRevision:string;policy:Policy}):Promise<{guards:SqlPredicate[]}>}
export const createPolicyManagement=(db:D1Database,policy:PolicyPort,impact:PolicyImpactPort)=>({
 async preview(ctx:RequestContext,commandId:string,value:Policy){if(ctx.principal.kind!=='human')return denied();policyRuleSchema.array().parse(value.rules);const permit=await policy.authorize(ctx,{appId:value.appId,action:'policy.preview',expected:[],cost:[],inputHash:''}),evaluated=await impact.preview(ctx,value),hash=await digest(canonicalJson({policy:value,impact:evaluated.impact,revision:evaluated.sourceRevision})),id=createUlid(),expiresAt=Date.parse(ctx.now)+900000
 return plan({commandId,action:'policy.preview',appId:value.appId,canonicalInputHash:hash,permit,guards:evaluated.guards,mutations:[{kind:'insert',table:previews,row:{id,app_id:value.appId,issuer_id:ctx.principal.id,policy_id:value.id,expected_version:value.version,policy_json:canonicalJson(value),impact_hash:hash,impact_json:canonicalJson(evaluated.impact),source_revision:evaluated.sourceRevision,expires_at:expiresAt,consumed_at:null,created_at:Date.parse(ctx.now)}}],audit:[],events:[],outbox:[],committedResult:{id,policy:value,impact:evaluated.impact,impactHash:hash,expiresAt:new Date(expiresAt).toISOString()}})
 },
 async adopt(ctx:RequestContext,commandId:string,previewId:string,decisionId:string){if(ctx.principal.kind!=='human')return denied();const p=await db.prepare('SELECT * FROM authority_policy_previews WHERE id=?').bind(previewId).first<{app_id:string;issuer_id:string;policy_id:string;expected_version:number;policy_json:string;impact_hash:string;source_revision:string;expires_at:number;consumed_at:number|null}>();if(!p||p.issuer_id!==ctx.principal.id||p.consumed_at!==null||p.expires_at<=Date.parse(ctx.now))throw new AuthorityError('stale_evidence','The policy preview is stale.',409)
 const value=JSON.parse(p.policy_json) as Policy,hash=await digest(canonicalJson({previewId,decisionId})),permit=await policy.authorize(ctx,{appId:p.app_id,action:'policy.adopt',expected:[],cost:[],inputHash:hash}),confirmation=await impact.confirm(ctx,{decisionId,impactHash:p.impact_hash,sourceRevision:p.source_revision,policy:value}),where=trustedPredicate('id=? AND app_id=? AND version=?',[p.policy_id,p.app_id,p.expected_version])
 return plan({commandId,action:'policy.adopt',appId:p.app_id,canonicalInputHash:hash,permit,guards:[...confirmation.guards,trustedPredicate(`EXISTS(SELECT 1 FROM authority_policy_previews WHERE id=? AND consumed_at IS NULL AND expires_at>?)`,[previewId,Date.parse(ctx.now)])],mutations:[{kind:'update',table:policies,set:{name:value.name,rules_json:canonicalJson(value.rules),version:p.expected_version+1,updated_at:Date.parse(ctx.now)},where,expectedRows:1},{kind:'update',table:previews,set:{consumed_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND consumed_at IS NULL',[previewId]),expectedRows:1}],audit:[{action:'policy.adopt',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{...value,version:p.expected_version+1,updatedAt:ctx.now}})
 },
})

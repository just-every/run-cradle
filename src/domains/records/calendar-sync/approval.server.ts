import {createUlid} from '../../../core/shared/ids'
import {digest,randomSecret} from '../../authority/crypto.server'
import type {Principal,RequestContext} from '../../authority/ports'
import {principalGuards} from '../../authority/guards.server'
import {registerTable,trustedPredicate} from '../../admission/sql.server'
import type {SqlMutation} from '../../admission/ports'
import {AdmissionError} from '../../admission/errors'
import type {Definition} from './storage.server'
const credentials=registerTable('authority_credentials',['id','principal_id','token_hash','audience','scopes_json','created_at','expires_at','revoked_at','version','authentication_epoch'])
const audience=(id:string,version:number)=>`cradle.calendar-definition:${id}:${version}`
/** An internal approval credential has no recoverable bearer secret and cannot manage the base. */
export async function calendarApproval(ctx:RequestContext,id:string,version:number,appId:string,old:Definition|null,requestedExpiry?:string){
 const now=Date.parse(ctx.now),expires=Date.parse(requestedExpiry??new Date(now+30*86400000).toISOString())
 if(!Number.isFinite(expires)||expires<=now||expires>now+30*86400000)throw new AdmissionError('validation','Calendar approval must expire within 30 days.')
 const credentialId=createUlid(),principal:Principal={id:ctx.principal.id,kind:'human',humanId:ctx.principal.humanId,sessionId:null,credentialId,issuedAt:ctx.now,expiresAt:new Date(expires).toISOString(),authenticationEpoch:ctx.principal.authenticationEpoch}
 const mutations:SqlMutation[]=[{kind:'insert',table:credentials,row:{id:credentialId,principal_id:principal.id,token_hash:await digest(randomSecret()),audience:audience(id,version),scopes_json:JSON.stringify([{appId,actions:['record.calendar.sync'],purposes:['read','export']}]),created_at:now,expires_at:expires,revoked_at:null,version:1,authentication_epoch:principal.authenticationEpoch}}]
 const previous=old?JSON.parse(old.actor_json) as Partial<Principal>:null
 if(previous?.credentialId)mutations.push({kind:'update',table:credentials,set:{revoked_at:now,version:2},where:trustedPredicate('id=? AND principal_id=? AND audience=?',[previous.credentialId,ctx.principal.id,audience(old!.id,old!.version)]),expectedRows:1})
 return {principal,mutations}
}
export async function calendarAuthorContext(db:D1Database,d:Definition,requestId:string,ingress:RequestContext['ingress']='schedule'):Promise<RequestContext>{
 const principal=JSON.parse(d.actor_json) as Principal
 // Pre-approval-version definitions retain their existing conservative session fence until saved again.
 if(principal.credentialId){const approval=await db.prepare('SELECT 1 FROM authority_credentials WHERE id=? AND principal_id=? AND audience=?').bind(principal.credentialId,d.owner_id,audience(d.id,d.version)).first();if(!approval)throw new AdmissionError('forbidden','Calendar approval must be renewed by its author.')}
 if(principal.id!==d.owner_id||principal.kind!=='human')throw new AdmissionError('forbidden','Calendar approval must be renewed by its author.')
 return {principal,requestId,now:new Date().toISOString(),ingress}
}
/** Session-independent approval still checks the author's current role, epoch, policy and native account. */
export function calendarAuthorGuards(ctx:RequestContext,d:Definition){return [...principalGuards(ctx),trustedPredicate(`EXISTS(SELECT 1 FROM manual_record_bases b JOIN authority_memberships m ON m.app_id=b.id AND m.principal_id=? AND m.state='active' LEFT JOIN manual_base_roles role ON role.app_id=m.app_id AND role.principal_id=m.principal_id AND role.policy_id=m.policy_id JOIN authority_principals p ON p.id=m.principal_id JOIN operators legacy ON legacy.id=p.human_id JOIN cradle_base_operators projection ON projection.principal_id=p.id JOIN oa_operators native ON native.id=projection.base_id WHERE b.id=? AND (b.owner_id=p.id OR role.role IN ('owner','creator')) AND p.state='active' AND legacy.active=1 AND native.status='active')`,[d.owner_id,d.app_id])]}

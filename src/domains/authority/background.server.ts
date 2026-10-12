import type { RequestContext, Principal } from './ports'
import { AuthorityError } from './errors'
import { delegatedPrincipal } from './delegation.server'
/** The run-to-credential mapping is supplied by X's durable, server-authored run row. */
export const resolveBackgroundContext=async(db:D1Database,input:{credentialId:string;principalId:string;requestId:string;audience:string;ingress:'queue'|'schedule'}):Promise<RequestContext>=>{
 const now=Date.now(),p=await db.prepare(`SELECT p.id,p.kind,p.human_id,p.authentication_epoch,c.created_at,c.expires_at FROM authority_principals p JOIN authority_credentials c ON c.principal_id=p.id WHERE p.id=? AND c.id=? AND c.audience=? AND p.state='active' AND c.revoked_at IS NULL AND c.expires_at>? AND c.authentication_epoch=p.authentication_epoch`).bind(input.principalId,input.credentialId,input.audience,now).first<{id:string;kind:Principal['kind'];human_id:string|null;authentication_epoch:number;created_at:number;expires_at:number}>()
 if(!p)throw new AuthorityError('grant_revoked','Background authentication is no longer active.')
 const principal=await delegatedPrincipal(db,{id:p.id,kind:p.kind,humanId:p.human_id,sessionId:null,credentialId:input.credentialId,issuedAt:new Date(p.created_at).toISOString(),expiresAt:new Date(p.expires_at).toISOString(),authenticationEpoch:p.authentication_epoch})
 return {principal,requestId:input.requestId,now:new Date(now).toISOString(),ingress:input.ingress}
}

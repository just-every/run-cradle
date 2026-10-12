import type { AuthConfiguration, Principal, RequestContext } from '../../authority/ports'
import { AuthorityError } from '../../authority/errors'
import { digest } from '../../authority/crypto.server'
import { principalGuards } from '../../authority/guards.server'
import { assertGuards } from '../fence.server'
/** Read-only Base authentication for pure previews. Base verifies its real cookie;
 * an already-issued Cradle projection is required. Nothing refreshes or repairs it. */
export function createImportPreviewAuthentication(db:D1Database,config:AuthConfiguration){
 return async(request:Request,_ingress:RequestContext['ingress'],requestId:string):Promise<RequestContext>=>{
  if(!config.base)throw new AuthorityError('unconfigured','Base operator authentication is required for base import.',503)
  if(new URL(request.url).origin!==config.appOrigin||request.headers.get('origin')!==config.appOrigin||request.headers.get('sec-fetch-site')==='cross-site')throw new AuthorityError('forbidden','A same-origin request is required.')
  const session=await config.base.getSession(request)
  if(!session)throw new AuthorityError('signed_out','Sign in to continue.',401)
  const now=Date.now(),row=await db.prepare(`SELECT p.id,p.human_id,p.authentication_epoch,s.id AS session_id,s.created_at,s.expires_at,s.csrf_hash
   FROM cradle_base_operators o JOIN authority_principals p ON p.id=o.principal_id JOIN operators h ON h.id=p.human_id
   JOIN cradle_base_sessions m ON m.base_id=? JOIN authority_sessions s ON s.id=m.session_id AND s.principal_id=p.id
   WHERE o.base_id=? AND p.kind='human' AND p.initial_owner=1 AND p.state='active' AND h.active=1
   AND s.authentication_epoch=p.authentication_epoch AND s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen_at>?`).bind(session.id,session.operatorId,now,now-2592000000).first<{id:string;human_id:string;authentication_epoch:number;session_id:string;created_at:number;expires_at:number;csrf_hash:string}>()
  if(!row)throw new AuthorityError('signed_out','Open the signed-in workspace to establish a current owner session before importing.',401)
  const csrf=request.headers.get('x-csrf-token');if(!csrf||await digest(csrf)!==row.csrf_hash)throw new AuthorityError('forbidden','A current CSRF token is required.')
  const principal:Principal={id:row.id,kind:'human',humanId:row.human_id,sessionId:row.session_id,baseSessionId:session.id,credentialId:null,authenticationEpoch:row.authentication_epoch,issuedAt:new Date(row.created_at).toISOString(),expiresAt:new Date(Math.min(row.expires_at,session.expiresAt)).toISOString()},ctx:RequestContext={principal,requestId,now:new Date(now).toISOString(),ingress:'http'}
  await assertGuards(db,principalGuards(ctx));return ctx
 }
}

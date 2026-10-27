import type {RequestContext} from '../authority/ports'
import {trustedPredicate} from '../admission/sql.server'

// The installation's retained internal transport principal has no memberships
// or grants (0102_native_auth_mail.sql). Restore retains it and rotates its epoch.
// In-app facts use this identity; channel_mail_authority governs email only.
export const IN_APP_NOTIFICATION_PRINCIPAL='00000000000000000000000001'
export const notificationPrincipalGuard=(epoch:number)=>trustedPredicate(
 "EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND kind='system' AND human_id IS NULL AND state='active' AND authentication_epoch=?)",
 [IN_APP_NOTIFICATION_PRINCIPAL,epoch],
)
export async function notificationContext(db:D1Database,eventId:string,ingress:RequestContext['ingress'],now=Date.now()):Promise<RequestContext>{
 const authority=await db.prepare("SELECT authentication_epoch FROM authority_principals WHERE id=? AND kind='system' AND human_id IS NULL AND state='active'").bind(IN_APP_NOTIFICATION_PRINCIPAL).first<{authentication_epoch:number}>()
 if(!authority)throw new Error('System notification principal is unavailable')
 return {requestId:eventId,now:new Date(now).toISOString(),ingress,principal:{id:IN_APP_NOTIFICATION_PRINCIPAL,kind:'system',humanId:null,sessionId:null,credentialId:eventId,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),authenticationEpoch:authority.authentication_epoch}}
}

import type { RequestContext } from '../../authority/ports'
import { AdmissionError } from '../../admission/errors'
import { principalGuards } from '../../authority/guards.server'
import { trustedPredicate } from '../../admission/sql.server'
import { assertGuards } from '../fence.server'
import type { BaseAccess, BaseRole } from './base-role'
export async function baseAccess(db:D1Database,ctx:RequestContext,appId:string){
 if(ctx.principal.kind!=='human'||!ctx.principal.sessionId||ctx.principal.credentialId)throw new AdmissionError('forbidden','A current operator session is required.')
 const base=await db.prepare('SELECT owner_id FROM manual_record_bases WHERE id=?').bind(appId).first<{owner_id:string}>()
 if(!base)return null
 const member=await db.prepare("SELECT m.version,m.policy_id,r.role,r.destructive,r.version AS role_version FROM authority_memberships m LEFT JOIN manual_base_roles r ON r.app_id=m.app_id AND r.principal_id=m.principal_id AND r.policy_id=m.policy_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active'").bind(appId,ctx.principal.id).first<{version:number;policy_id:string;role:BaseRole|null;destructive:number|null;role_version:number|null}>()
 if(!member)throw new AdmissionError('forbidden','Current base membership is required.')
 const role=ctx.principal.id===base.owner_id?'owner':member.role
 const guards=[...principalGuards(ctx),trustedPredicate("EXISTS(SELECT 1 FROM manual_record_bases b JOIN authority_memberships m ON m.app_id=b.id WHERE b.id=? AND b.owner_id=? AND m.principal_id=? AND m.state='active' AND m.version=? AND m.policy_id=?)",[appId,base.owner_id,ctx.principal.id,member.version,member.policy_id])]
 if(member.role)guards.push(trustedPredicate('EXISTS(SELECT 1 FROM manual_base_roles WHERE app_id=? AND principal_id=? AND policy_id=? AND version=?)',[appId,ctx.principal.id,member.policy_id,member.role_version!]))
 else guards.push(trustedPredicate('NOT EXISTS(SELECT 1 FROM manual_base_roles WHERE app_id=? AND principal_id=? AND policy_id=?)',[appId,ctx.principal.id,member.policy_id]))
 await assertGuards(db,guards)
 const access:BaseAccess={role,canManage:role==='owner',canAdopt:role==='owner'||role==='creator',canDestruct:role==='owner'||role==='creator'&&member.destructive===1}
 return {...access,guards,ownerId:base.owner_id}
}
export async function requireBaseAuthor(db:D1Database,ctx:RequestContext,appId:string){
 const access=await baseAccess(db,ctx,appId)
 if(access&&!access.canAdopt)throw new AdmissionError('forbidden','Only a base owner or creator can change schema or author forms.')
 return access
}

import type { PolicyPort,RequestContext } from './ports';
import type { EntityRegistry } from './scope.server';
import { compileFilter } from './scope.server';
import type { Policy } from './contracts';
import { policyRuleSchema } from './validators';
import { and,or,identifier,trustedPredicate } from '../admission/sql.server';
import { denied } from './errors';
import { liveRecord } from '../records/trash/authority.server';
import type { StoreOperation } from './personal-stores.server';
/** Sharing is a specific thumbnail permission, never a borrowed session or a content/download grant. */
export async function sharedPreviewGuards(db:D1Database,policy:PolicyPort,registry:EntityRegistry,ctx:RequestContext,appId:string,connectionId:string,operation:StoreOperation){
 const {entityId,fieldId,recordId,itemId}=operation,entity=registry.get(appId,entityId);
 if(!entity||!recordId||!itemId)return denied();
 const scope=await policy.scope(ctx,{appId,entityId,purpose:'read'});
 if(!scope.readableFieldIds.includes(fieldId))return denied();
 const binding=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table+'_f_'+fieldId.toLowerCase())} WHERE record_id=? AND json_valid(value) AND json_extract(CASE WHEN json_valid(value) THEN value ELSE '{}' END,'$.connectionId')=? AND json_extract(CASE WHEN json_valid(value) THEN value ELSE '{}' END,'$.itemId')=? AND json_extract(CASE WHEN json_valid(value) THEN value ELSE '{}' END,'$.attachedBy')=(SELECT owner_id FROM provider_connections WHERE id=?))`,[recordId,connectionId,itemId,connectionId]);
 const viewer=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${scope.rowPredicate.sql}))`,[recordId,...scope.rowPredicate.values]);
 const row=await db.prepare("SELECT c.owner_id,c.version,p.id,p.version AS policy_version,p.rules_json,m.version AS membership_version FROM provider_connections c JOIN authority_principals a ON a.id=c.owner_id AND a.state='active' JOIN authority_memberships m ON m.principal_id=c.owner_id AND m.app_id=c.app_id AND m.state='active' JOIN authority_policies p ON p.id=m.policy_id AND p.app_id=m.app_id WHERE c.id=? AND c.app_id=? AND c.share_previews=1 AND c.state='connected' AND c.revoked_at IS NULL").bind(connectionId,appId).first<{owner_id:string;version:number;id:string;policy_version:number;rules_json:string;membership_version:number}>();
 if(!row)return denied('Preview sharing is unavailable.');
 const rules=policyRuleSchema.array().parse(JSON.parse(row.rules_json)) as Policy['rules'];
 const relevant=rules.filter(r=>r.entityId===entityId&&r.principals.some(p=>p.id===row.owner_id&&p.kind==='human')&&(r.purposes??['read']).includes('read'));
 const allows=relevant.filter(r=>r.effect==='allow'),denies=relevant.filter(r=>r.effect==='deny');
 if(!allows.length||allows.some(r=>!r.readableFields.includes(fieldId))||denies.some(r=>r.readableFields.includes(fieldId)))return denied('The attacher can no longer read this field.');
 const rows=and(or(...allows.map(r=>compileFilter(r.rows,entity,ctx.now))),trustedPredicate(`NOT (${or(...denies.map(r=>compileFilter(r.rows,entity,ctx.now))).sql})`,or(...denies.map(r=>compileFilter(r.rows,entity,ctx.now))).values),liveRecord(ctx,appId,entityId,entity.table,entity.idColumn));
 const attacher=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${rows.sql}))`,[recordId,...rows.values]);
 const current=trustedPredicate("EXISTS(SELECT 1 FROM provider_connections c JOIN authority_principals a ON a.id=c.owner_id AND a.state='active' JOIN authority_memberships m ON m.principal_id=c.owner_id AND m.app_id=c.app_id AND m.state='active' JOIN authority_policies p ON p.id=m.policy_id WHERE c.id=? AND c.owner_id=? AND c.share_previews=1 AND c.version=? AND c.state='connected' AND c.revoked_at IS NULL AND m.version=? AND p.id=? AND p.version=?)",[connectionId,row.owner_id,row.version,row.membership_version,row.id,row.policy_version]);
 const guards=[...scope.currentAuthorityGuards,binding,viewer,attacher,current];
 for(const guard of guards)if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())return denied();
 return guards;
}

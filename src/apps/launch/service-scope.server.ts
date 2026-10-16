import type { RequestContext, PolicyScope } from '../../domains/authority/ports'
import type { Policy } from '../../domains/authority/contracts'
import { compileFilter, type PolicyEntity } from '../../domains/authority/scope.server'
import { and, or, trustedPredicate } from '../../domains/admission/sql.server'
import { AdmissionError } from '../../domains/admission/errors'
import { LAUNCH_APP_ID } from './contracts'
import { launchDescriptors } from './descriptors.server'
/** The shipped brief's read capability is intersected with its campaign owner's current policy. */
export async function campaignOwnerScope(db:D1Database,ctx:RequestContext,campaignId:string,entityId:string,purpose:'read'|'export'|'provider_context'):Promise<PolicyScope>{
 const owner=await db.prepare(`SELECT p.id,p.kind,m.version AS membership_version,q.id AS policy_id,q.version,q.rules_json,c.owner_id,c.version AS campaign_version
 FROM campaigns c JOIN operators o ON o.id=c.owner_id AND o.active=1
 JOIN authority_principals p ON p.human_id=o.id AND p.kind='human' AND p.state='active'
 JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=? AND m.state='active'
 JOIN authority_policies q ON q.id=m.policy_id
 JOIN cradle_base_operators mapping ON mapping.principal_id=p.id JOIN oa_operators b ON b.id=mapping.base_id AND b.status='active'
 WHERE c.id=? AND c.archived_at IS NULL`).bind(LAUNCH_APP_ID,campaignId).first<{id:string;version:number;policy_id:string;rules_json:string;membership_version:number;owner_id:string;campaign_version:number}>()
 if(!owner)throw new AdmissionError('forbidden','Campaign owner no longer has current launch access')
 const descriptor=launchDescriptors.find(d=>d.schema.id===entityId)
 if(!descriptor)throw new AdmissionError('forbidden','Unknown launch context entity')
 const entity:PolicyEntity={id:entityId,table:descriptor.table.tableId,idColumn:'id',fields:descriptor.schema.fields.map(f=>({id:f.id,column:descriptor.fields.get(f.id)!.column,type:f.type==='number'?'number':f.type==='date'?'date':f.type==='boolean'?'boolean':'text',nullable:true}))}
 const rules=(JSON.parse(owner.rules_json) as Policy['rules']).filter(r=>r.entityId===entityId&&r.principals.some(p=>p.id===owner.id&&p.kind==='human')&&(r.purposes??['read']).includes(purpose)),allow=rules.filter(r=>r.effect==='allow'),deny=rules.filter(r=>r.effect==='deny')
 if(!allow.length)throw new AdmissionError('forbidden','Campaign owner cannot disclose this analysis context')
 const rejected=or(...deny.map(r=>compileFilter(r.rows,entity,ctx.now)))
 const guards=[trustedPredicate(`EXISTS(SELECT 1 FROM campaigns c JOIN operators o ON o.id=c.owner_id JOIN authority_principals p ON p.human_id=o.id JOIN authority_memberships m ON m.principal_id=p.id JOIN authority_policies q ON q.id=m.policy_id JOIN cradle_base_operators mapping ON mapping.principal_id=p.id JOIN oa_operators b ON b.id=mapping.base_id WHERE c.id=? AND c.version=? AND c.owner_id=? AND c.archived_at IS NULL AND o.active=1 AND p.id=? AND p.state='active' AND m.app_id=? AND m.state='active' AND m.version=? AND q.id=? AND q.version=? AND b.status='active')`,[campaignId,owner.campaign_version,owner.owner_id,owner.id,LAUNCH_APP_ID,owner.membership_version,owner.policy_id,owner.version])]
 const rowPredicate=and(or(...allow.map(r=>compileFilter(r.rows,entity,ctx.now))),trustedPredicate(`NOT (${rejected.sql})`,rejected.values),...guards)
 return{principal:ctx.principal,appId:LAUNCH_APP_ID,entityId,policyVersion:owner.version,rowPredicate,readableFieldIds:allow[0]!.readableFields.filter(f=>allow.every(r=>r.readableFields.includes(f))&&!deny.some(r=>r.readableFields.includes(f))),writableFieldIds:[],discoverableRelations:[],validUntil:ctx.principal.expiresAt,currentAuthorityGuards:guards}
}

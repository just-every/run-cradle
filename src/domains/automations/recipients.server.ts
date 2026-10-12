import type { RequestContext } from '../authority/ports'
import { policyRuleSchema } from '../authority/validators'
import { compileFilter, type EntityRegistry } from '../authority/scope.server'
import { and,or,identifier,trustedPredicate } from '../admission/sql.server'
import { AuthorityError } from '../authority/errors'

/** A recipient's own current membership and row rules decide disclosure. */
export async function automationRecipient(db:D1Database,entities:EntityRegistry,ctx:RequestContext,
 input:{operatorId:string;appId:string;entityId:string;recordId:string}) {
 const row=await db.prepare(`SELECT o.id,o.email,o.version,p.id AS principal_id,p.authentication_epoch,
  m.version AS membership_version,policy.id AS policy_id,policy.version AS policy_version,policy.rules_json,
  base.id AS base_id,base.version AS base_version
  FROM operators o JOIN authority_principals p ON p.human_id=o.id AND p.kind='human' AND p.state='active'
  JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=? AND m.state='active'
  JOIN authority_policies policy ON policy.id=m.policy_id AND policy.app_id=m.app_id
  JOIN cradle_base_operators mapping ON mapping.principal_id=p.id
  JOIN oa_operators base ON base.id=mapping.base_id AND base.status='active'
  WHERE o.id=? AND o.active=1`).bind(input.appId,input.operatorId)
  .first<{id:string;email:string;version:number;principal_id:string;authentication_epoch:number;
   membership_version:number;policy_id:string;policy_version:number;rules_json:string;base_id:string;base_version:number}>()
 const entity=entities.get(input.appId,input.entityId)
 if(!row||!entity)throw new AuthorityError('forbidden','Recipient cannot read the triggering record.')
 const rules=policyRuleSchema.array().parse(JSON.parse(row.rules_json)).filter(rule=>rule.entityId===input.entityId
  &&(rule.purposes??['read']).includes('read')&&rule.principals.some(p=>p.id===row.principal_id&&p.kind==='human'))
 const allowed=rules.filter(rule=>rule.effect==='allow'),denied=rules.filter(rule=>rule.effect==='deny')
 if(!allowed.length)throw new AuthorityError('forbidden','Recipient cannot read the triggering record.')
 const denyRows=or(...denied.map(rule=>compileFilter(rule.rows,entity,ctx.now)))
 const selection=and(or(...allowed.map(rule=>compileFilter(rule.rows,entity,ctx.now))),
  trustedPredicate(`NOT (${denyRows.sql})`,denyRows.values),
  ...(entity.appColumn?[trustedPredicate(`${identifier(entity.table)}.${identifier(entity.appColumn)}=?`,[input.appId])]:[]))
 const guard=and(
  trustedPredicate(`EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1 AND version=?)`,[row.id,row.version]),
  trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals p JOIN authority_memberships m ON m.principal_id=p.id
   JOIN authority_policies policy ON policy.id=m.policy_id JOIN cradle_base_operators mapping ON mapping.principal_id=p.id
   JOIN oa_operators base ON base.id=mapping.base_id WHERE p.id=? AND p.state='active' AND p.authentication_epoch=?
   AND m.app_id=? AND m.state='active' AND m.version=? AND policy.id=? AND policy.version=?
   AND base.id=? AND base.status='active' AND base.version=?)`,[row.principal_id,row.authentication_epoch,
    input.appId,row.membership_version,row.policy_id,row.policy_version,row.base_id,row.base_version]),
  trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=?
   AND (${selection.sql}))`,[input.recordId,...selection.values]),
 )
 if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())
  throw new AuthorityError('forbidden','Recipient cannot read the triggering record.')
 return {operatorId:row.id,email:row.email,guard}
}

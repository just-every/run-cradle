import type {RequestContext} from '../../authority/ports';
import type {EntityRegistry} from '../../authority/scope.server';
import type {SqlScalar} from '../../admission/ports';
import {policyRuleSchema} from '../../authority/validators';
import {compileFilter} from '../../authority/scope.server';
import {and,or,identifier,trustedPredicate} from '../../admission/sql.server';
import {AuthorityError} from '../../authority/errors';
import {canonical} from '../../admission/canonical';
import type {Ref} from '../../../contracts/primitives';

/** Read authority belongs to the recipient, including when the row is being created. */
export async function watchRecipient(db:D1Database,entities:EntityRegistry,ctx:RequestContext,input:Ref&{operatorId:string;proposedRow?:Record<string,SqlScalar>}){
 const member=await db.prepare(`SELECT p.id AS principal_id,p.authentication_epoch,m.version AS membership_version,
  policy.id AS policy_id,policy.version AS policy_version,policy.rules_json,o.version AS operator_version,
  b.id AS base_id,b.version AS base_version FROM operators o
  JOIN authority_principals p ON p.human_id=o.id AND p.kind='human' AND p.state='active'
  JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=? AND m.state='active'
  JOIN authority_policies policy ON policy.id=m.policy_id AND policy.app_id=m.app_id
  JOIN cradle_base_operators mapping ON mapping.principal_id=p.id
  JOIN oa_operators b ON b.id=mapping.base_id AND b.status='active'
  WHERE o.id=? AND o.active=1`).bind(input.appId,input.operatorId).first<{principal_id:string;authentication_epoch:number;membership_version:number;policy_id:string;policy_version:number;rules_json:string;operator_version:number;base_id:string;base_version:number}>();
 const entity=entities.get(input.appId,input.entityId);
 if(!member||!entity)throw new AuthorityError('forbidden','Recipient cannot read this record.');
 const rules=policyRuleSchema.array().parse(JSON.parse(member.rules_json)).filter(r=>r.entityId===input.entityId&&(r.purposes??['read']).includes('read')&&r.principals.some(p=>p.id===member.principal_id&&p.kind==='human'));
 const allow=rules.filter(r=>r.effect==='allow'),deny=rules.filter(r=>r.effect==='deny');
 if(!allow.length)throw new AuthorityError('forbidden','Recipient cannot read this record.');
 const denied=or(...deny.map(r=>compileFilter(r.rows,entity,ctx.now)));
 const selection=and(or(...allow.map(r=>compileFilter(r.rows,entity,ctx.now))),trustedPredicate(`NOT (${denied.sql})`,denied.values),...(entity.table.startsWith('r_')?[trustedPredicate(`${identifier(entity.table)}.lifecycle NOT IN ('deleted','archived','erased')`)]:[]));
 const columns=input.proposedRow?Object.keys(input.proposedRow).map(key=>`json_extract(payload,'$.${key}') AS ${identifier(key)}`).join(','):null;
 const row=columns?trustedPredicate(`EXISTS(SELECT 1 FROM (SELECT ${columns} FROM (SELECT ? AS payload)) AS ${identifier(entity.table)} WHERE ${selection.sql})`,[canonical(input.proposedRow!),...selection.values]):trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${selection.sql}))`,[input.recordId,...selection.values]);
 const guard=and(trustedPredicate(`EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1 AND version=?)`,[input.operatorId,member.operator_version]),
  trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals p JOIN authority_memberships m ON m.principal_id=p.id JOIN authority_policies policy ON policy.id=m.policy_id JOIN cradle_base_operators mapping ON mapping.principal_id=p.id JOIN oa_operators b ON b.id=mapping.base_id WHERE p.id=? AND p.state='active' AND p.authentication_epoch=? AND m.app_id=? AND m.state='active' AND m.version=? AND policy.id=? AND policy.version=? AND b.id=? AND b.status='active' AND b.version=?)`,[member.principal_id,member.authentication_epoch,input.appId,member.membership_version,member.policy_id,member.policy_version,member.base_id,member.base_version]),row);
 if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AuthorityError('forbidden','Recipient cannot read this record.');
 const readableFields=allow[0]!.readableFields.filter(id=>allow.every(r=>r.readableFields.includes(id))&&!deny.some(r=>r.readableFields.includes(id)));
 return {guard,principalId:member.principal_id,readableFields};
}

import { z } from 'zod'
import type { AdmissionPort } from '../../admission/ports'
import type { PolicyPort, RequestContext } from '../../authority/ports'
import type { DescriptorRegistry } from '../descriptors.server'
import { canonical, canonicalHash } from '../../admission/canonical'
import { registerTable, trustedPredicate } from '../../admission/sql.server'
import { AdmissionError } from '../../admission/errors'
import { assertGuards } from '../fence.server'
import { idSchema } from '../validators'
import { createUlid } from '../../../core/shared/ids'
import { baseAccess } from './base-access.server'
import { baseRoles, type BaseCollaborator } from './base-role'
import { roleRules } from './role-policy'
import { policies, memberships } from './authority.server'
export const roleTable=registerTable('manual_base_roles',['app_id','principal_id','role','destructive','policy_id','version','created_at','updated_at'])
const roleInput=z.object({commandId:idSchema,principalId:idSchema,role:z.enum(baseRoles),destructive:z.boolean().default(false),version:z.number().int().nonnegative()}).strict()
export function createBaseCollaborators(db:D1Database,policy:PolicyPort,admission:AdmissionPort,registry:DescriptorRegistry){
 async function access(ctx:RequestContext,appId:string){const result=await baseAccess(db,ctx,appId);if(!result)throw new AdmissionError('not_found','Manual base not found.');const {guards,ownerId,...safe}=result;return safe}
 async function list(ctx:RequestContext,appId:string){
  const auth=await baseAccess(db,ctx,appId);if(!auth?.canManage)throw new AdmissionError('forbidden','Only a base owner can manage base collaborators.')
  const rows=await db.prepare("SELECT p.id,o.name,o.email,m.version AS membership_version,m.policy_id,r.role,r.destructive,r.version FROM authority_principals p JOIN operators o ON o.id=p.human_id LEFT JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=? AND m.state='active' LEFT JOIN manual_base_roles r ON r.principal_id=m.principal_id AND r.app_id=m.app_id AND r.policy_id=m.policy_id WHERE p.kind='human' AND p.state='active' AND o.active=1 ORDER BY o.name,p.id").bind(appId).all<{id:string;name:string;email:string|null;membership_version:number|null;policy_id:string|null;role:BaseCollaborator['role'];destructive:number|null;version:number|null}>()
  await assertGuards(db,auth.guards)
  return {items:rows.results.map(row=>({id:row.id,name:row.name,email:row.email,role:row.id===auth.ownerId?'owner':row.role,destructive:row.id===auth.ownerId||row.destructive===1,version:row.version??0,originalOwner:row.id===auth.ownerId}))}
 }
 async function save(ctx:RequestContext,appId:string,unknown:unknown){
  const input=roleInput.parse(unknown),auth=await baseAccess(db,ctx,appId)
  if(!auth?.canManage)throw new AdmissionError('forbidden','Only a base owner can assign base roles.')
  if(input.principalId===auth.ownerId)throw new AdmissionError('forbidden','The original base owner remains an owner.')
  const hash=await canonicalHash({appId,...input}),replay=await admission.replay(ctx,input.commandId,'base.role',appId,hash);if(replay)return replay.result
  const target=await db.prepare("SELECT p.id FROM authority_principals p JOIN operators o ON o.id=p.human_id WHERE p.id=? AND p.kind='human' AND p.state='active' AND o.active=1").bind(input.principalId).first()
  if(!target)throw new AdmissionError('not_found','Active operator not found.')
  const previous=await db.prepare('SELECT version,policy_id FROM manual_base_roles WHERE app_id=? AND principal_id=?').bind(appId,input.principalId).first<{version:number;policy_id:string}>()
  if((previous?.version??0)!==input.version)throw new AdmissionError('version_conflict','Base role changed. Refresh collaborators.')
  const membership=await db.prepare('SELECT version FROM authority_memberships WHERE app_id=? AND principal_id=?').bind(appId,input.principalId).first<{version:number}>()
  const policyId=createUlid(),now=Date.parse(ctx.now),schemas=registry.list(appId).filter(d=>d.schema.physicalRevision.startsWith('manual_')).map(d=>d.schema)
  const row={app_id:appId,principal_id:input.principalId,role:input.role,destructive:input.role==='creator'&&input.destructive?1:0,policy_id:policyId,version:input.version+1,updated_at:ctx.now}
  const scopeGuards=[] as import('../../admission/ports').SqlPredicate[]
  for(const schema of schemas){const scope=await policy.scope(ctx,{appId,entityId:schema.id,purpose:'read'});if(!scope.unrestrictedRows||schema.fields.some(field=>!scope.readableFieldIds.includes(field.id)||['owner','creator','editor'].includes(input.role)&&field.type!=='computed'&&!scope.writableFieldIds.includes(field.id)))throw new AdmissionError('forbidden','Assigning this role requires current full table and field authority.');scopeGuards.push(...scope.currentAuthorityGuards)}
  const guards=[...auth.guards,...scopeGuards,trustedPredicate("EXISTS(SELECT 1 FROM authority_principals p JOIN operators o ON o.id=p.human_id WHERE p.id=? AND p.state='active' AND o.active=1)",[input.principalId]),trustedPredicate('(SELECT COUNT(*) FROM record_schemas WHERE app_id=?)=?',[appId,schemas.length]),...schemas.map(schema=>trustedPredicate('EXISTS(SELECT 1 FROM record_schemas WHERE app_id=? AND id=? AND version=?)',[appId,schema.id,schema.version]))]
  await assertGuards(db,guards)
  const permit=await policy.authorize(ctx,{appId,action:'release.adopt',expected:[],cost:[],inputHash:hash})
  const result=await admission.commit(ctx,{commandId:input.commandId,action:'base.role',appId,canonicalInputHash:hash,permit:{...permit,action:'base.role'},guards,mutations:[{kind:'insert',table:policies,row:{id:policyId,app_id:appId,name:`Base ${input.role}`,rules_json:canonical(roleRules(input.principalId,input.role,schemas)),version:1,created_at:now,updated_at:now}},membership?{kind:'update',table:memberships,set:{policy_id:policyId,state:'active',version:membership.version+1},where:trustedPredicate('app_id=? AND principal_id=? AND version=?',[appId,input.principalId,membership.version]),expectedRows:1}:{kind:'insert',table:memberships,row:{app_id:appId,principal_id:input.principalId,policy_id:policyId,state:'active',legacy:0,version:1}},previous?{kind:'update',table:roleTable,set:row,where:trustedPredicate('app_id=? AND principal_id=? AND version=?',[appId,input.principalId,input.version]),expectedRows:1}:{kind:'insert',table:roleTable,row:{...row,created_at:ctx.now}}],audit:[{action:'base.role',subject:null,changes:[],sourceIds:[],personalContentRefs:[input.principalId]}],events:[],outbox:[],committedResult:{role:input.role,version:row.version}})
  return result.result
 }
 return {access,list,save}
}

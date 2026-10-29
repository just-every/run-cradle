import {trustedPredicate} from '../../admission/sql.server'
import type {SqlPredicate} from '../../admission/ports'
import type {EntitySchema} from '../contracts'
import type {Policy} from '../../authority/contracts'
import type {RecordAutomationAction} from '../../automations/contracts'

type Automation={id:string;name:string;appId:string;entityId:string;actions:string}
type InterfaceSnapshot={id:string;appId:string;definition:string;history:import('../interfaces/contracts').InterfaceInput[]}
type ApiKey={id:string;name:string;principalId:string;appId:string;rules:string;scopes:string}

/** Guard the exact safe projections, including absence: adding a dependent after
 * preview invalidates adoption just as editing a previously named one does. */
export async function dependencySnapshots(db:D1Database,appIds:string[]){
 const guards:SqlPredicate[]=[]
 async function snapshot<T>(query:string,values:string[]=[]):Promise<T[]>{
  const expression=`(SELECT COALESCE(json_group_array(json(payload)),'[]') FROM (${query}))`
  const row=await db.prepare(`SELECT ${expression} AS snapshot`).bind(...values).first<{snapshot:string}>()
  if(!row)throw new Error('Schema dependent snapshot is unavailable')
  guards.push(trustedPredicate(`${expression}=?`,[...values,row.snapshot]))
  return JSON.parse(row.snapshot) as T[]
 }
 const apps=JSON.stringify([...new Set(appIds)].sort())
 const [schemas,automations,keys,interfaces]=await Promise.all([
  snapshot<{schema:string}>(`SELECT json_object('id',id,'appId',app_id,'version',version,'schema',schema_json) payload FROM record_schemas ORDER BY app_id,id`),
  snapshot<Automation>(`SELECT json_object('id',a.id,'name',a.name,'appId',b.app_id,'entityId',b.entity_id,'actions',a.actions_json,'trigger',a.trigger_config_json,'enabled',a.enabled,'version',a.version,'definitionVersion',a.definition_version,'definition',v.definition_json,'ownerId',b.owner_id) payload FROM automations a JOIN record_automation_bindings b ON b.automation_id=a.id LEFT JOIN record_automation_versions v ON v.automation_id=a.id AND v.definition_version=a.definition_version WHERE b.app_id IN (SELECT value FROM json_each(?)) ORDER BY b.app_id,a.id`,[apps]),
  snapshot<ApiKey>(`SELECT json_object('id',c.id,'name',d.label,'principalId',c.principal_id,'appId',m.app_id,'rules',p.rules_json,'scopes',c.scopes_json,'credentialVersion',c.version,'credentialRevoked',c.revoked_at,'expiresAt',c.expires_at,'delegationRevoked',d.revoked_at,'membershipState',m.state,'membershipVersion',m.version,'policyId',p.id,'policyVersion',p.version,'principalState',n.state,'principalVersion',n.version) payload FROM authority_credentials c JOIN authority_delegations d ON d.principal_id=c.principal_id AND d.kind='api-key' JOIN authority_principals n ON n.id=c.principal_id JOIN authority_memberships m ON m.principal_id=c.principal_id JOIN authority_policies p ON p.id=m.policy_id AND p.app_id=m.app_id WHERE m.app_id IN (SELECT value FROM json_each(?)) ORDER BY m.app_id,c.id,p.id`,[apps]),
  snapshot<InterfaceSnapshot>(`SELECT json_object('id',i.id,'appId',i.app_id,'definition',i.definition_json,'version',i.version,'history',json((SELECT COALESCE(json_group_array(json(definition_json)),'[]') FROM (SELECT definition_json FROM record_interface_versions WHERE interface_id=i.id ORDER BY version)))) payload FROM record_interfaces i WHERE i.app_id IN (SELECT value FROM json_each(?)) AND i.deleted_at IS NULL ORDER BY i.id`,[apps]),
 ])
 return {guards,interfaces,schemas:schemas.map(row=>JSON.parse(row.schema) as EntitySchema),automations:automations.map(row=>({...row,actions:JSON.parse(row.actions) as RecordAutomationAction[]})),keys:keys.map(row=>({...row,rules:JSON.parse(row.rules) as Policy['rules'],scopes:JSON.parse(row.scopes) as {appId:string;actions:string[]}[]}))}
}

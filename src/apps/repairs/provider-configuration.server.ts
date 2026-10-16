import { z } from 'zod'
import type { CommandRegistry } from '../../core/registry/commands'
import { commandSchema, idSchema } from '../../core/registry/validation'
import { canonicalHash } from '../../domains/admission/canonical'
import { registerTable, trustedPredicate } from '../../domains/admission/sql.server'
import { ownerDelegationSnapshot } from '../../domains/authority/delegation.server'
import type { RequestContext } from '../../domains/authority/ports'
import type { RevisionRef } from '../../contracts/primitives'
import type { RepairProviderConfiguration } from '../../domains/execution/repair-bridge.server'
import type { createProvidersComposition } from '../../core/app/composition/providers.server'
import { AdmissionError } from '../../domains/admission/errors'
import type { RepairDependencies } from './ports'
import { createRepairRepository, str } from './repository.server'
import { REPAIRS_APP_ID } from './model'
const mappingSchema=z.object({connectionId:idSchema,expectedVersion:z.number().int().nonnegative(),contacts:z.record(z.string().min(1).max(200),z.string().min(1).max(200)),allowedAccountCodes:z.array(z.string().min(1).max(100)).min(1).max(100),allowedTaxTypes:z.array(z.string().min(1).max(100)).min(1).max(100)}).strict()
const table=registerTable('repair_accounting_mappings',['connection_id','version','mapping_json','actor_id','created_at','updated_at'])
export function registerRepairAccountingMapping(registry:CommandRegistry,d:RepairDependencies){
 registry.register({action:'repair.configure-accounting',description:'Owner records exact accountant contact, account and tax mappings.',inputSchema:z.toJSONSchema(mappingSchema) as never,input:commandSchema(mappingSchema),visible:async ctx=>{try{await ownerDelegationSnapshot(d.db,ctx,REPAIRS_APP_ID);return true}catch{return false}},replayIdentity:async(_ctx,c)=>({appId:REPAIRS_APP_ID,canonicalInputHash:await canonicalHash(c)}),prepare:async(ctx,c)=>{
  const owner=await ownerDelegationSnapshot(d.db,ctx,REPAIRS_APP_ID),input=c.input
  if(!Object.keys(input.contacts).length)throw new AdmissionError('validation','At least one explicit accountant payee mapping is required')
  const connection=await d.db.prepare("SELECT version FROM provider_connections WHERE id=? AND app_id=? AND adapter_id='xero' AND revoked_at IS NULL").bind(input.connectionId,REPAIRS_APP_ID).first<{version:number}>()
  if(!connection)throw new AdmissionError('unconfigured','An accessible Xero repair connection is required')
  const current=await d.db.prepare('SELECT version FROM repair_accounting_mappings WHERE connection_id=?').bind(input.connectionId).first<{version:number}>()
  if((current?.version??0)!==input.expectedVersion)throw new AdmissionError('version_conflict','Reload the accountant mapping before changing it')
  const hash=await canonicalHash(c),permit=await d.policy.authorize(ctx,{appId:REPAIRS_APP_ID,action:'connection.configure',expected:[],cost:[],inputHash:hash,commandId:c.commandId})
  const version=input.expectedVersion+1,values={version,mapping_json:JSON.stringify({contacts:input.contacts,allowedAccountCodes:input.allowedAccountCodes,allowedTaxTypes:input.allowedTaxTypes}),actor_id:ctx.principal.id,updated_at:ctx.now}
  return {commandId:c.commandId,action:'repair.configure-accounting',appId:REPAIRS_APP_ID,canonicalInputHash:hash,permit:{...permit,action:'repair.configure-accounting'},guards:[owner.guard,trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND app_id=? AND version=? AND adapter_id='xero' AND revoked_at IS NULL)",[input.connectionId,REPAIRS_APP_ID,connection.version])],mutations:current?[{kind:'update' as const,table,set:values,where:trustedPredicate('connection_id=? AND version=?',[input.connectionId,input.expectedVersion]),expectedRows:1}]:[{kind:'insert' as const,table,row:{connection_id:input.connectionId,...values,created_at:ctx.now}}],audit:[{action:'repair.configure-accounting',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{connectionId:input.connectionId,version}}
 }})
}
export function createRepairProviderConfiguration(d:RepairDependencies,providers:ReturnType<typeof createProvidersComposition>){
 const repo=createRepairRepository(d)
 async function configuration(ctx:RequestContext,effect:{connectionId:string;subject:RevisionRef}):Promise<RepairProviderConfiguration>{
  const connection=await providers.connections(ctx).read(ctx,effect.connectionId)
  if(connection.state!=='connected'||connection.capability.state!=='ready')throw new AdmissionError('unconfigured','Connect and check the selected provider before this repair action')
  const row=await d.db.prepare('SELECT app_id,account_id FROM provider_connections WHERE id=? AND version=? AND revoked_at IS NULL').bind(connection.id,connection.version).first<{app_id:string;account_id:string}>()
  if(row?.app_id!==REPAIRS_APP_ID)throw new AdmissionError('forbidden','The connection must belong to Repairs')
  const work=await repo.load(ctx,'workOrders',effect.subject.ref.recordId),config=await repo.configuration(),schema=await d.db.prepare('SELECT version FROM record_schemas WHERE id=?').bind(effect.subject.ref.entityId).first<{version:number}>()
  if(!['resend','google-calendar','xero'].includes(connection.adapterId)||!schema)throw new AdmissionError('unconfigured','Repair provider or schema is not configured')
  const mapping=connection.adapterId==='xero'?await d.db.prepare('SELECT version,mapping_json FROM repair_accounting_mappings WHERE connection_id=?').bind(connection.id).first<{version:number;mapping_json:string}>():null
  if(connection.adapterId==='xero'&&!mapping)throw new AdmissionError('unconfigured','The owner must record accountant contact, account and tax mappings')
  return {connectionVersion:connection.version,provider:connection.adapterId as RepairProviderConfiguration['provider'],accountId:row.account_id,releaseId:config.release_id,schemaVersion:schema.version,custodianId:String((await d.cases.get(ctx,str(work,'case_id'))).accountableId),caseId:str(work,'case_id'),...(mapping?{mappingVersion:mapping.version,...JSON.parse(mapping.mapping_json)}:{})}
 }
 async function accountingCapability(ctx:RequestContext):Promise<'ready'|'unconfigured'|'unavailable'>{
  const rows=await d.db.prepare("SELECT c.id FROM provider_connections c JOIN repair_accounting_mappings m ON m.connection_id=c.id WHERE c.app_id=? AND c.adapter_id='xero' AND c.revoked_at IS NULL").bind(REPAIRS_APP_ID).all<{id:string}>()
  for(const row of rows.results){try{const c=await providers.connections(ctx).read(ctx,row.id);if(c.capability.state==='ready')return 'ready';if(c.state==='unavailable')return 'unavailable'}catch(error){if(!(error instanceof Error)||!('code'in error)||!['forbidden','not_found'].includes(String(error.code)))throw error}}
  return 'unconfigured'
 }
 return {configuration,accountingCapability}
}

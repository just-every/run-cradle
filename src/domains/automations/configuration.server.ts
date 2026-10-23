import {validateAutomationTrigger,automationTriggerConfig} from './trigger-configuration.server'
import {automationDefinitionActions} from './control-contracts'
import {filterFields} from '../records/filter.server'
import type { PolicyPort,RequestContext } from '../authority/ports'
import type { AdmissionPort,SqlMutation } from '../admission/ports'
import type { DescriptorRegistry } from '../records/descriptors.server'
import { eq,trustedPredicate } from '../admission/sql.server'
import { canonicalJson } from '../authority/grants.server'
import { digest } from '../authority/crypto.server'
import { userDelegationPolicy,delegationCommandId } from '../authority/user-delegation.server'
import { issueUserCredential } from '../authority/user-credential.server'
import { validateCell } from '../records/validators'
import { AuthorityError } from '../authority/errors'
import { ensureRecordAutomationTriggers } from './capture.server'
import { recordAutomationDefinition,type RecordAutomationDefinition } from './contracts'
import * as tables from './storage.server'

export function createRecordAutomationConfiguration(db:D1Database,policy:PolicyPort,admission:AdmissionPort,descriptors:DescriptorRegistry,appOrigin:string) {
 return {
  async save(ctx:RequestContext,input:{commandId:string;id?:string;version?:number;expiresAt:string;definition:RecordAutomationDefinition}) {
   const definition=recordAutomationDefinition.parse(input.definition),{appId,entityId}=definition
   const allActions=automationDefinitionActions(definition),descriptor=descriptors.get(appId,entityId),permissions=allActions.some(a=>a.kind==='update')?'write' as const:'read' as const
   const own=await userDelegationPolicy(db,policy,ctx,{appId,entityId,name:definition.name,permissions,expiresAt:input.expiresAt})
   await validateAutomationTrigger(db,definition,descriptor,own.scope,ctx.now)
   const guards=[...own.guards]
   const filters=[...allActions.flatMap(action=>action.when?[action.when]:[]),...(definition.steps??[]).flatMap(step=>step.kind==='condition'?[step.when]:step.kind==='branch'?step.paths.map(path=>path.when):step.kind==='repeat'?[step.find]:[])]
   if(filters.flatMap(filter=>filterFields(filter)).some(field=>!own.scope.readableFieldIds.includes(field)))throw new AuthorityError('forbidden','Conditions and finds require readable fields.')
   for(const action of allActions){
    if(action.kind==='update'){
     const field=descriptor.schema.fields.find(f=>f.id===action.fieldId)
     if(!field||field.readOnly||field.type==='computed'||!own.scope.writableFieldIds.includes(field.id))throw new AuthorityError('forbidden','Select a writable field in your current scope.')
     validateCell(field,action.value)
    }
    if(action.kind==='webhook'||action.kind==='slack'){
     const destination=await db.prepare('SELECT 1 FROM record_automation_destinations WHERE id=? AND app_id=? AND owner_id=? AND kind=? AND revoked_at IS NULL')
      .bind(action.destinationId,appId,ctx.principal.id,action.kind).first()
     if(!destination)throw new AuthorityError('not_found','Destination is unavailable.',404)
     guards.push(trustedPredicate('EXISTS(SELECT 1 FROM record_automation_destinations WHERE id=? AND app_id=? AND revoked_at IS NULL)',[action.destinationId,appId]))
    }
    if(['email','webhook','slack'].includes(action.kind)){
     const exported=await policy.scope(ctx,{appId,entityId,purpose:'export'});guards.push(...exported.currentAuthorityGuards)
    }
   }
   const id=input.id??await delegationCommandId(input.commandId,'automation'),commandId=await delegationCommandId(input.commandId,'configuration')
   const hash=await digest(canonicalJson(input)),prior=await admission.replay(ctx,commandId,'automation.save',appId,hash)
   if(prior)return prior
   const old=await db.prepare(`SELECT a.version,a.definition_version,a.created_at,b.app_id,b.entity_id,b.owner_id
    FROM automations a JOIN record_automation_bindings b ON b.automation_id=a.id WHERE a.id=?`).bind(id)
    .first<{version:number;definition_version:number;created_at:number;app_id:string;entity_id:string;owner_id:string}>()
   if(input.id&&(!old||old.owner_id!==ctx.principal.id||old.app_id!==appId||old.entity_id!==entityId))throw new AuthorityError('not_found','Automation is unavailable.',404)
   if(old&&old.version!==input.version)throw new AuthorityError('version_conflict','Refresh the automation before saving.',409)
   if(old)guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND version=?)',[id,old.version]))
   const credential=await issueUserCredential(db,policy,admission,appOrigin,ctx,input.commandId,
    {appId,entityId,name:definition.name,permissions,expiresAt:input.expiresAt},'automation')
   // Capture is installed before this definition can become enabled.
   await ensureRecordAutomationTriggers(db,descriptors,[{app_id:appId,entity_id:entityId}])
   const now=Date.parse(ctx.now),version=(old?.version??0)+1,definitionVersion=(old?.definition_version??0)+1
   const row={id,created_at:old?.created_at??now,updated_at:now,version,name:definition.name,trigger_type:'record',
    trigger_config_json:JSON.stringify(automationTriggerConfig(definition)),actions_json:JSON.stringify(definition.actions),
    enabled:Number(definition.enabled),definition_version:definitionVersion,shipped_key:null}
   const mutations:SqlMutation[]=[old?{kind:'update',table:tables.automations,set:row,where:eq(tables.automations,'id',id),expectedRows:1}:{kind:'insert',table:tables.automations,row}]
   if(!old)mutations.push({kind:'insert',table:tables.bindings,row:{automation_id:id,app_id:appId,entity_id:entityId,owner_id:ctx.principal.id}})
   mutations.push({kind:'insert',table:tables.versions,row:{automation_id:id,definition_version:definitionVersion,
    definition_json:JSON.stringify(definition),principal_id:credential.principalId,credential_id:credential.id,created_at:now}},
    {kind:'update',table:tables.delegationBindings,set:{automation_id:id},where:trustedPredicate('principal_id=? AND automation_id IS NULL',[credential.principalId]),expectedRows:1})
   return admission.commit(ctx,{commandId,action:'automation.save',appId,canonicalInputHash:hash,permit:own.permit('automation.save'),guards,mutations,
    audit:[{action:'automation.save',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,version,definitionVersion,enabled:definition.enabled}})
  },
  async disable(ctx:RequestContext,input:{commandId:string;id:string;version:number}) {
   const old=await db.prepare(`SELECT a.version,b.app_id,b.entity_id,b.owner_id FROM automations a JOIN record_automation_bindings b ON b.automation_id=a.id WHERE a.id=?`)
    .bind(input.id).first<{version:number;app_id:string;entity_id:string;owner_id:string}>()
   if(!old||old.owner_id!==ctx.principal.id)throw new AuthorityError('not_found','Automation is unavailable.',404)
   const own=await userDelegationPolicy(db,policy,ctx,{appId:old.app_id,entityId:old.entity_id,name:'Disable automation',permissions:'read',expiresAt:ctx.principal.expiresAt})
   const queued=await db.prepare("SELECT id,version FROM automation_runs WHERE automation_id=? AND state='Queued'").bind(input.id).all<{id:string;version:number}>()
   const now=Date.parse(ctx.now),guards=[...own.guards,trustedPredicate("(SELECT count(*) FROM automation_runs WHERE automation_id=? AND state='Queued')=?",[input.id,queued.results.length])]
   const mutations:SqlMutation[]=[{kind:'update',table:tables.automations,set:{enabled:0,version:input.version+1,updated_at:now},where:trustedPredicate('id=? AND version=?',[input.id,input.version]),expectedRows:1},
    ...queued.results.map(run=>({kind:'update' as const,table:tables.runTable,set:{state:'Cancelled',finished_at:now,updated_at:now,version:run.version+1},where:eq(tables.runTable,'id',run.id),expectedRows:1}))]
   return admission.commit(ctx,{commandId:input.commandId,action:'automation.disable',appId:old.app_id,canonicalInputHash:await digest(canonicalJson(input)),permit:own.permit('automation.disable'),guards,mutations,
    audit:[{action:'automation.disable',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id:input.id,enabled:false,version:input.version+1}})
  },
 }
}

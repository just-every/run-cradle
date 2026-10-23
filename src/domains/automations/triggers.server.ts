import type {PlatformBindings} from '../../core/platform/bindings'
import type {ServerFoundation} from '../../core/app/foundation.server'
import type {createRecordReader} from '../records/query.server'
import type {RequestContext,PolicyScope} from '../authority/ports'
import type {RecordRow} from '../records/contracts'
import {recordAutomationDefinition} from './contracts'
import {resolveBackgroundContext} from '../authority/background.server'
import {delegationCommandId} from '../authority/user-delegation.server'
import {and,identifier,registerTable,trustedPredicate} from '../admission/sql.server'
import {canonicalHash} from '../admission/canonical'
import {AuthorityError} from '../authority/errors'
import {AdmissionError} from '../admission/errors'
import {localParts} from '../channels/clock'
import {scheduleSlot,offsetCalendarDate} from './schedule-clock'
import {automations} from './storage.server'
const events=registerTable('record_automation_events',['id','command_id','app_id','entity_id','record_id','event','record_version','definitions_json','cause_run_ids_json','created_at','state'])
type DefinitionRow={id:string;definition_version:number;definition_json:string;trigger_config_json:string;principal_id:string;credential_id:string;app_id:string;entity_id:string}
export function createAutomationTriggers(env:PlatformBindings,foundation:ServerFoundation,reader:ReturnType<typeof createRecordReader>,origin:string,clock:()=>Date){
 const db=env.DB
 async function capture(ctx:RequestContext,scope:PolicyScope,row:DefinitionRow,record:RecordRow,key:string,event:string,settings:{id:string;version:number},config?:Record<string,unknown>){
  if(await db.prepare('SELECT 1 FROM record_automation_events WHERE id=?').bind(key).first())return false
  const id=await delegationCommandId(key,'trigger'),d=foundation.descriptors.get(row.app_id,row.entity_id)
  const guard=and(...scope.currentAuthorityGuards,trustedPredicate('EXISTS(SELECT 1 FROM workspace_settings WHERE id=? AND version=?)',[settings.id,settings.version]),trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND enabled=1 AND definition_version=? AND trigger_config_json=?)',[row.id,row.definition_version,row.trigger_config_json]),trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=? AND ${identifier(d.versionColumn)}=? AND ${identifier(d.lifecycleColumn)} NOT IN ('archived','deleted') AND (${scope.rowPredicate.sql}))`,[record.id,record.version,...scope.rowPredicate.values]))
  const action='automation.trigger',mutations:import('../admission/ports').SqlMutation[]=[{kind:'insert',table:events,row:{id:key,command_id:id,app_id:row.app_id,entity_id:row.entity_id,record_id:record.id,event,record_version:record.version,definitions_json:JSON.stringify([{id:row.id,version:row.definition_version}]),cause_run_ids_json:'[]',created_at:clock().getTime(),state:'pending'}}]
  if(config)mutations.push({kind:'update',table:automations,set:{trigger_config_json:JSON.stringify(config)},where:trustedPredicate('id=? AND definition_version=? AND trigger_config_json=?',[row.id,row.definition_version,row.trigger_config_json]),expectedRows:1})
  const receipt=await foundation.admission.commit(ctx,{commandId:id,action,appId:row.app_id,canonicalInputHash:await canonicalHash({key,version:row.definition_version}),permit:{actor:{id:ctx.principal.id,kind:ctx.principal.kind},action,appId:row.app_id,grantId:null,grantVersion:null,policyVersion:scope.policyVersion,validUntil:ctx.principal.expiresAt,guards:[guard],reservationMutations:[],reservationIds:[]},guards:[guard],mutations,audit:[{action,subject:record.ref,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{eventId:key}})
  return !receipt.replay&&receipt.result.state==='committed'
 }
 return {async tick(){
  const now=clock().getTime(),settings=await db.prepare('SELECT id,version,timezone FROM workspace_settings ORDER BY id LIMIT 1').first<{id:string;version:number;timezone:string}>()
  if(!settings)throw new Error('Workspace timezone is required for user automation triggers')
  const rows=await db.prepare(`SELECT a.id,a.definition_version,a.trigger_config_json,v.definition_json,v.principal_id,v.credential_id,b.app_id,b.entity_id FROM automations a JOIN record_automation_bindings b ON b.automation_id=a.id JOIN record_automation_versions v ON v.automation_id=a.id AND v.definition_version=a.definition_version WHERE a.enabled=1 AND json_extract(a.trigger_config_json,'$.kind') IN ('schedule','date_offset') ORDER BY a.id LIMIT 100`).all<DefinitionRow>()
  let started=0
  for(const row of rows.results){if(started>=20)break
   try{
    const definition=recordAutomationDefinition.parse(JSON.parse(row.definition_json)),trigger=definition.trigger
    if(!trigger||trigger.kind==='fields_updated')continue
    const config=JSON.parse(row.trigger_config_json) as Record<string,unknown>
    let slot:number|null=null
    if(trigger.kind==='schedule'){
     slot=scheduleSlot(now,settings.timezone,trigger.startsAt,trigger.schedule)
     if(slot===null||config.lastZone===settings.timezone&&typeof config.lastOrdinal==='number'&&slot<=config.lastOrdinal)continue
    }
    const ctx=await resolveBackgroundContext(db,{credentialId:row.credential_id,principalId:row.principal_id,requestId:row.id,audience:`${origin}/api/v1`,ingress:'schedule'})
    const scope=await foundation.policy.scope(ctx,{appId:row.app_id,entityId:row.entity_id,purpose:'read'})
    if(trigger.kind==='schedule'){
     const record=await reader.record(ctx,scope,{appId:row.app_id,entityId:row.entity_id,recordId:trigger.recordId}),key=`${row.id}:schedule:${settings.timezone}:${slot}:${record.id}`
     if(await capture(ctx,scope,row,record,key,'scheduled',settings,{...config,lastOrdinal:slot,lastZone:settings.timezone}))started++
    }else{
     if(!scope.readableFieldIds.includes(trigger.fieldId)||foundation.descriptors.get(row.app_id,row.entity_id).fields.get(trigger.fieldId)?.field.type!=='date')continue
     const day=localParts(now,settings.timezone).date,target=offsetCalendarDate(day,-trigger.offsetDays)
     let cursor:string|undefined
     do{
      const page=await reader.query(ctx,scope,{filter:{kind:'condition',fieldId:trigger.fieldId,op:'eq',value:target},limit:100,...(cursor?{cursor}:{})})
      for(const record of page.items){if(started>=20)break
       if(await capture(ctx,scope,row,record,`${row.id}:date:${trigger.fieldId}:${trigger.offsetDays}:${day}:${record.id}`,'date_offset',settings))started++
      }
      cursor=page.nextCursor??undefined
     }while(cursor&&started<20)
    }
   }catch(error){if(!(error instanceof AuthorityError||error instanceof AdmissionError)||!['forbidden','not_found','grant_revoked','grant_expired','credential_expired','version_conflict','stale_cursor'].includes(error.code))throw error}
  }
 }}
}

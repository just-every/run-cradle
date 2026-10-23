import {createUlid} from '../../../core/shared/ids'
import type {PolicyPort,RequestContext} from '../../authority/ports'
import type {AdmissionPort,SqlMutation} from '../../admission/ports'
import {eq,trustedPredicate} from '../../admission/sql.server'
import {canonicalHash} from '../../admission/canonical'
import {AdmissionError} from '../../admission/errors'
import {manualAuthority} from '../manual/authority.server'
import type {DescriptorRegistry} from '../descriptors.server'
import {connectionsTable} from '../../connections/tables.server'
import {definitions,versions,type Definition} from './storage.server'
import {saveDefinition} from './contracts'
export function calendarConfiguration(db:D1Database,policy:PolicyPort,admission:AdmissionPort,descriptors:DescriptorRegistry){return async(ctx:RequestContext,raw:unknown)=>{
 const input=saveDefinition.parse(raw),d=input.definition,hash=await canonicalHash(input),permit=await manualAuthority(db,policy,ctx,d.appId,hash),schema=descriptors.get(d.appId,d.entityId).schema
 const scope=await policy.scope(ctx,{appId:d.appId,entityId:d.entityId,purpose:'export'})
 for(const id of [d.startFieldId,d.endFieldId,d.titleFieldId,...d.fieldIds].filter((id):id is string=>!!id))if(!scope.readableFieldIds.includes(id))throw new AdmissionError('forbidden','Choose fields you can currently read.')
 if(!['date','instant'].includes(schema.fields.find(f=>f.id===d.startFieldId)?.type??'')||d.endFieldId&&schema.fields.find(f=>f.id===d.endFieldId)?.type!==schema.fields.find(f=>f.id===d.startFieldId)?.type)throw new AdmissionError('validation','Choose a date or timestamp field and an optional end field of the same type.')
 if(!['text','number','boolean','date','instant','url','email'].includes(schema.fields.find(f=>f.id===d.titleFieldId)?.type??''))throw new AdmissionError('validation','Choose a scalar event title field.');
 if(d.fieldIds.some(id=>!['text','number','boolean','date','instant','url','email'].includes(schema.fields.find(f=>f.id===id)?.type??'')))throw new AdmissionError('validation','Only scalar fields can be shown in a calendar event.')
 const connection=await db.prepare("SELECT version,scopes_json FROM provider_connections WHERE id=? AND app_id=? AND adapter_id='google-calendar' AND owner_id=? AND account_id=? AND state='connected' AND revoked_at IS NULL").bind(d.connectionId,d.appId,ctx.principal.id,d.calendarId).first<{version:number;scopes_json:string}>()
 const catalogue=await db.prepare('SELECT calendars_json FROM record_calendar_catalogues WHERE connection_id=? AND owner_id=?').bind(d.connectionId,ctx.principal.id).first<{calendars_json:string}>()
 if(!connection||!catalogue||!JSON.parse(catalogue.calendars_json).some((c:{id:string})=>c.id===d.calendarId))throw new AdmissionError('forbidden','Refresh your connection and choose an owned calendar matching its account ID.')
 const old=input.id?await db.prepare('SELECT * FROM record_calendar_definitions WHERE id=? AND owner_id=? AND app_id=? AND entity_id=?').bind(input.id,ctx.principal.id,d.appId,d.entityId).first<Definition>():null
 if(input.id&&(!old||old.version!==input.version))throw new AdmissionError('version_conflict','Refresh your sync definition before editing.')
 if(old&&(old.calendar_id!==d.calendarId||old.connection_id!==d.connectionId||JSON.parse(old.definition_json).startFieldId!==d.startFieldId))throw new AdmissionError('validation','Disable this definition and resolve its events before changing its date field or destination.')
 const id=old?.id??createUlid(),version=(old?.version??0)+1,now=new Date().toISOString(),scopes=JSON.parse(connection.scopes_json) as {resource:string;readFields:string[];actions:string[]}[]
 if(d.enabled&&!scopes.some(s=>s.resource===d.calendarId&&s.actions.includes('record.calendar.sync')))scopes.push({resource:d.calendarId,readFields:[],actions:['record.calendar.sync']})
 const row={id,app_id:d.appId,entity_id:d.entityId,owner_id:ctx.principal.id,connection_id:d.connectionId,calendar_id:d.calendarId,definition_json:JSON.stringify(d),actor_json:JSON.stringify(ctx.principal),enabled:Number(d.enabled),version,created_at:old?.created_at??now,updated_at:now}
 const mutations:SqlMutation[]=[old?{kind:'update',table:definitions,set:row,where:eq(definitions,'id',id),expectedRows:1}:{kind:'insert',table:definitions,row},
 {kind:'insert',table:versions,row:{id:createUlid(),definition_id:id,definition_version:version,definition_json:JSON.stringify(d),created_at:now,updated_at:now}},
 {kind:'update',table:connectionsTable,set:{scopes_json:JSON.stringify(scopes),version:connection.version+1,updated_at:now},where:eq(connectionsTable,'id',d.connectionId),expectedRows:1}]
 const result=await admission.commit(ctx,{commandId:input.commandId,action:'record.calendar.configure',appId:d.appId,canonicalInputHash:hash,permit:{...permit,action:'record.calendar.configure'},guards:[...scope.currentAuthorityGuards,trustedPredicate('EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND version=?)',[d.connectionId,connection.version]),...(old?[trustedPredicate('EXISTS(SELECT 1 FROM record_calendar_definitions WHERE id=? AND version=?)',[id,old.version])]:[])],mutations,audit:[{action:'record.calendar.configure',subject:null,changes:[],sourceIds:[],personalContentRefs:[d.calendarId]},{action:'record.calendar.approve',subject:null,changes:[],sourceIds:[],personalContentRefs:[d.calendarId]}],events:[],outbox:[],committedResult:{id,version}})
 return result.result
}}

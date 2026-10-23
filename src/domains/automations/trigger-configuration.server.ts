import type {RecordAutomationDefinition} from './contracts'
import type {EntityDescriptor} from '../records/descriptors.server'
import type {PolicyScope} from '../authority/ports'
import {AuthorityError} from '../authority/errors'
import {identifier} from '../admission/sql.server'
import {offsetCalendarDate} from './schedule-clock'
export async function validateAutomationTrigger(db:D1Database,definition:RecordAutomationDefinition,d:EntityDescriptor,scope:PolicyScope,now:string){
 const trigger=definition.trigger;if(!trigger)return
 if(trigger.kind==='fields_updated'){
  if(definition.event!=='updated'||trigger.fieldIds.some(id=>!d.fields.has(id)||!scope.readableFieldIds.includes(id)))throw new AuthorityError('forbidden','Choose readable fields on an updated-record trigger.')
 }else if(trigger.kind==='date_offset'){
  if(d.fields.get(trigger.fieldId)?.field.type!=='date'||!scope.readableFieldIds.includes(trigger.fieldId))throw new AuthorityError('forbidden','Choose a readable date field.')
  try{offsetCalendarDate(now.slice(0,10),trigger.offsetDays)}catch{throw new AuthorityError('validation','Date offset is outside the supported calendar.',400)}
 }else{
  if(!await db.prepare(`SELECT 1 FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=? AND ${identifier(d.lifecycleColumn)}<>'deleted' AND (${scope.rowPredicate.sql})`).bind(trigger.recordId,...scope.rowPredicate.values).first())throw new AuthorityError('forbidden','Choose a currently readable schedule record.')
 }
}
export function automationTriggerConfig(definition:RecordAutomationDefinition){return {appId:definition.appId,entityId:definition.entityId,event:definition.trigger?.kind==='schedule'?'scheduled':definition.trigger?.kind==='date_offset'?'date_offset':definition.event,...definition.trigger}}

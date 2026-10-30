import type {CellValue} from '../../contracts/primitives'
import type {PolicyPort,PolicyScope,RequestContext} from '../authority/ports'
import type {DescriptorRegistry,EntityDescriptor} from '../records/descriptors.server'
import type {RecordAutomationAction} from './contracts'
import {AuthorityError} from '../authority/errors'
import {validateCell} from '../records/validators'
import {assertRecordValidation} from '../records/validation-rules'
import {schemaGuard} from '../records/change.server'
import {canonicalHash} from '../admission/canonical'

type CreateAction=Extract<RecordAutomationAction,{kind:'create'}>

/** Literal creation is restricted to the triggering table and native scalar cells. */
export function createActionValues(descriptor:EntityDescriptor,scope:PolicyScope,action:CreateAction){
 if(descriptor.writePolicy?.create===false)throw new AuthorityError('forbidden','This table requires a typed domain action.')
 const defaults=Object.fromEntries(descriptor.schema.fields.filter(field=>field.defaultValue!==undefined&&scope.writableFieldIds.includes(field.id)&&!field.readOnly&&!Object.hasOwn(action.values,field.id)).map(field=>[field.id,field.defaultValue!]))
 const values:Record<string,CellValue>={}
 for(const [fieldId,value]of Object.entries({...defaults,...action.values})){
  const field=descriptor.fields.get(fieldId)?.field
  if(!field||field.readOnly||field.type==='computed'||descriptor.writePolicy?.protectedFieldIds?.includes(fieldId)||!scope.writableFieldIds.includes(fieldId)||!scope.readableFieldIds.includes(fieldId))throw new AuthorityError('forbidden','Create requires a currently readable and writable field.')
  if(value!==null&&typeof value!=='string'&&typeof value!=='boolean')throw new AuthorityError('validation','Create supports literal scalar values only. Use a record template for linked or compound values.',400)
  values[fieldId]=validateCell(field,value)
 }
 assertRecordValidation(descriptor.schema,values)
 return values
}

/** Save and dry testing check the current human's explicit create authority. */
export async function authorizeCreateAction(deps:{policy:PolicyPort;descriptors:DescriptorRegistry},ctx:RequestContext,appId:string,entityId:string,action:CreateAction){
 const descriptor=deps.descriptors.get(appId,entityId),scope=await deps.policy.scope(ctx,{appId,entityId,purpose:'read'}),values=createActionValues(descriptor,scope,action)
 const permit=await deps.policy.authorize(ctx,{appId,targetEntityId:entityId,action:'record.create',fieldIds:Object.keys(values),expected:[],cost:[],inputHash:await canonicalHash({appId,entityId,action,schemaVersion:descriptor.schema.version})})
 return {values,guards:[schemaGuard(descriptor),...scope.currentAuthorityGuards,...permit.guards]}
}

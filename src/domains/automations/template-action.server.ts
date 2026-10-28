import type {Ref} from '../../contracts/primitives'
import {AuthorityError} from '../authority/errors'
import type {PolicyPort,RequestContext} from '../authority/ports'
import type {DescriptorRegistry} from '../records/descriptors.server'
import type {createRecordTemplates} from '../records/templates/service.server'
import type {RecordAutomationAction} from './contracts'
import {schemaGuard} from '../records/change.server'
import {canonicalHash} from '../admission/canonical'

export type AutomationTemplates=ReturnType<typeof createRecordTemplates>
export type TemplateAction=Extract<RecordAutomationAction,{kind:'apply_record_template'}>

/** Approval is bounded to the current template's explicit parent and child tables. */
export async function authorizeTemplateAction(deps:{templates:AutomationTemplates;policy:PolicyPort;descriptors:DescriptorRegistry},ctx:RequestContext,appId:string,action:TemplateAction){
 const {template,guards}=await deps.templates.definition(ctx,appId,action.entityId,action.templateId)
 const current=[...guards],entities=new Set<string>(),readEntities=new Set<string>()
 for(const row of [{entityId:template.entityId,values:template.values},...template.children]){
  const descriptor=deps.descriptors.get(appId,row.entityId)
  const scope=await deps.policy.scope(ctx,{appId,entityId:row.entityId,purpose:'read'})
  for(const [fieldId,value]of Object.entries(row.values)){
   if(descriptor.fields.get(fieldId)?.field.type!=='relation'||value===null)continue
   for(const ref of (Array.isArray(value)?value:[value]) as Ref[]){
    if(ref.appId!==appId)throw new AuthorityError('forbidden','Automation templates require linked records in the same base.')
    const target=await deps.policy.scope(ctx,{appId,entityId:ref.entityId,purpose:'read'})
    current.push(...target.currentAuthorityGuards);readEntities.add(ref.entityId)
   }
  }
  const fields=[...new Set([...Object.keys(row.values),...descriptor.schema.fields.filter(field=>field.defaultValue!==undefined).map(field=>field.id),...('parentFieldId'in row?[row.parentFieldId]:[])])]
  const permit=await deps.policy.authorize(ctx,{appId,action:'record.create',targetEntityId:row.entityId,expected:[],fieldIds:fields,cost:[],inputHash:await canonicalHash({appId,action,version:template.version})})
  current.push(schemaGuard(descriptor),...scope.currentAuthorityGuards,...permit.guards)
  entities.add(row.entityId)
 }
 return {template,guards:current,entityIds:[...entities],readEntityIds:[...readEntities]}
}

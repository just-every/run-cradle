import type {EntitySchema,Form,View} from '../contracts'
import type {EntityDescriptor} from '../descriptors.server'
import type {ViewSnapshot} from './view-removal.server'
import type {SqlPredicate} from '../../admission/ports'
import {canonical} from '../../admission/canonical'
import {calculationKind} from '../calculation-schema'
import {validateFormLogic} from '../form-definition'
import {currentSchemaForm} from '../metadata-schema'
import {validateTableRules} from '../validation-schema'
import {validateCell} from '../validators'
import {dependencySnapshots} from './dependents-snapshots.server'
import {calculationReferences,conditionFields,formReferences,physicalField,viewReferences,type FieldReference} from './dependents-references.server'

export type DependencyImpact={kind:string;id:string;name:string;details:string[]}
type Change={before:EntitySchema;after?:EntitySchema;removed:Set<string>;converted:Set<string>}
const identity=(appId:string,entityId:string)=>appId+':'+entityId

/** Enumerate actual typed references. Display text and action prose never act as
 * implicit identifiers, and credentials are projected without their digests. */
export async function schemaDependents(db:D1Database,prior:EntityDescriptor[],schemas:EntitySchema[],snapshots:{views:ViewSnapshot[];forms:ViewSnapshot[]}):Promise<{byEntity:Record<string,DependencyImpact[]>;guards:SqlPredicate[];refusals:Record<string,string[]>}>{
 const byEntity:Record<string,DependencyImpact[]>={},refusals:Record<string,string[]>={},changes=new Map<string,Change>()
 for(const descriptor of prior){
  const before=descriptor.schema,after=schemas.find(schema=>schema.appId===before.appId&&schema.id===before.id)
  const removed=new Set(before.fields.filter(field=>!after?.fields.some(next=>next.id===field.id)).map(field=>field.id))
  const converted=new Set(before.fields.filter(field=>{const next=after?.fields.find(next=>next.id===field.id);return next&&canonical(physicalField(field))!==canonical(physicalField(next))}).map(field=>field.id))
  if(!after||removed.size||converted.size){changes.set(identity(before.appId,before.id),{before,after,removed,converted});byEntity[before.id]=[];refusals[before.id]=[]}
 }
 if(!changes.size)return {byEntity,guards:[],refusals}
 const stored=await dependencySnapshots(db,[...prior.map(descriptor=>descriptor.schema.appId),...schemas.map(schema=>schema.appId)])
 const beforeAll=new Map(stored.schemas.map(schema=>[identity(schema.appId,schema.id),schema]))
 for(const descriptor of prior)beforeAll.set(identity(descriptor.schema.appId,descriptor.schema.id),descriptor.schema)
 const afterAll=new Map(beforeAll)
 for(const descriptor of prior)afterAll.delete(identity(descriptor.schema.appId,descriptor.schema.id))
 for(const schema of schemas)afterAll.set(identity(schema.appId,schema.id),schema)
 const viewById=new Map(snapshots.views.map(snapshot=>[snapshot.id,JSON.parse(snapshot.definition_json) as View]))
 const changedReference=(reference:FieldReference)=>{const change=changes.get(identity(reference.appId,reference.entityId));return change&&(!change.after||change.removed.has(reference.fieldId)||change.converted.has(reference.fieldId))?change:undefined}
 const describe=(change:Change,ids:string[])=>[...new Set(ids)].map(id=>{const field=change.before.fields.find(field=>field.id===id);return `${field?.label??id} (${id})`}).join(', ')
 function add(change:Change,kind:string,id:string,name:string,details:string[]){
  const list=byEntity[change.before.id]!,existing=list.find(item=>item.kind===kind&&item.id===id)
  if(existing)existing.details=[...new Set([...existing.details,...details])]
  else list.push({kind,id,name,details:[...new Set(details)]})
 }
 function refuse(change:Change,message:string){if(!refusals[change.before.id]!.includes(message))refusals[change.before.id]!.push(message)}
 function localReferences(appId:string,entityId:string,ids:string[]){return ids.map(fieldId=>({appId,entityId,fieldId}))}
 const sources=new Map(beforeAll)
 for(const schema of schemas)if(!sources.has(identity(schema.appId,schema.id)))sources.set(identity(schema.appId,schema.id),schema)
 for(const source of sources.values()){
  const next=afterAll.get(identity(source.appId,source.id))
  const sourceFields=new Map(source.fields.map(field=>[field.id,field]))
  for(const field of next?.fields??[])if(!sourceFields.has(field.id))sourceFields.set(field.id,field)
  for(const field of sourceFields.values()){
   const nextField=next?.fields.find(candidate=>candidate.id===field.id)
   if(field.expression||nextField?.expression){
    const nextRefs=nextField?.expression&&next?calculationReferences(nextField.expression,next):[],refs=[...calculationReferences(source.fields.find(original=>original.id===field.id)?.expression,source),...nextRefs]
    for(const reference of refs){const change=changedReference(reference);if(!change)continue
     add(change,calculationKind(nextField?.expression?nextField:field),source.id+':'+field.id,`${source.label} · ${field.label}`,[`References ${describe(change,[reference.fieldId])}`])
     if(nextRefs.some(ref=>ref.appId===reference.appId&&ref.entityId===reference.entityId&&ref.fieldId===reference.fieldId))refuse(change,`${source.label} · ${field.label} still calculates from ${describe(change,[reference.fieldId])}. Update or remove this calculation before changing its dependency.`)
    }
   }
   if(field.relation){
    const relation=field.relation,targetChange=changes.get(identity(relation.ownerAppId,relation.entityId)),sourceChange=changes.get(identity(source.appId,source.id))
    if(targetChange&&!targetChange.after){add(targetChange,'relation',source.id+':'+field.id,`${source.label} · ${field.label}`,[`Canonical incoming link to ${targetChange.before.label}`]);if(nextField?.relation?.ownerAppId===relation.ownerAppId&&nextField.relation.entityId===relation.entityId)refuse(targetChange,`${source.label} · ${field.label} still links to this table. Remove or retarget the link before deleting the table.`)}
    if(sourceChange&&!sourceChange.after&&afterAll.has(identity(relation.ownerAppId,relation.entityId))){add(sourceChange,'relation',source.id+':'+field.id,`${source.label} · ${field.label}`,[`Outgoing link to ${beforeAll.get(identity(relation.ownerAppId,relation.entityId))?.label??relation.entityId}`]);refuse(sourceChange,`${field.label} links to a surviving table. Remove the outgoing link in a separate reviewed change before deleting this table.`)}
    const picker=field.linkPicker
    const pickerView=picker?.viewId?viewById.get(picker.viewId):undefined
    if(picker)for(const reference of localReferences(relation.ownerAppId,relation.entityId,[...picker.searchFieldIds,...picker.displayFieldIds,...(pickerView?.appId===relation.ownerAppId&&pickerView.entityId===relation.entityId?viewReferences(pickerView).all:[])])){const change=changedReference(reference);if(!change)continue
     add(change,'picker',source.id+':'+field.id,`${source.label} · ${field.label}`,[`Picker fields or its limiting view use ${describe(change,[reference.fieldId])}`,...(picker.viewId?[`Limited to saved view ${pickerView?.name??picker.viewId} (${picker.viewId})`]:[])])
     const candidateTarget=afterAll.get(identity(relation.ownerAppId,relation.entityId)),candidateField=candidateTarget?.fields.find(value=>value.id===reference.fieldId),config=nextField?.relation?.ownerAppId===relation.ownerAppId&&nextField.relation.entityId===relation.entityId?nextField.linkPicker:undefined
     if(config&&(config.searchFieldIds.includes(reference.fieldId)||config.displayFieldIds.includes(reference.fieldId))){const type=candidateField?.type==='computed'?candidateField.resultType:candidateField?.type
      if(!candidateField||config.searchFieldIds.includes(reference.fieldId)&&!['text','url'].includes(type??'')||config.displayFieldIds.includes(reference.fieldId)&&!['text','url','number','date','instant','money','boolean','select','person'].includes(type??''))refuse(change,`${source.label} · ${field.label} has incompatible picker settings for ${describe(change,[reference.fieldId])}. Update the picker before changing this field.`)
     }
    }
   }
  }
  for(const incoming of source.incomingRelations??[]){const change=changes.get(identity(source.appId,incoming.sourceEntityId));if(!change||change.after&&!change.removed.has(incoming.sourceFieldId)&&!change.converted.has(incoming.sourceFieldId))continue
   add(change,'incoming_relation',source.id+':'+incoming.id,`${source.label} · ${incoming.label}`,[`Incoming section uses canonical link ${describe(change,[incoming.sourceFieldId])}`])
   const retained=next?.incomingRelations?.find(section=>section.id===incoming.id),canonicalLink=change.after?.fields.find(field=>field.id===retained?.sourceFieldId)?.relation
   if(retained&&(!canonicalLink||canonicalLink.ownerAppId!==source.appId||canonicalLink.entityId!==source.id))refuse(change,`${source.label} · ${incoming.label} still exposes this canonical link. Remove or update the incoming section first.`)
  }
  for(const rule of source.validationRules??[]){const ids=[...conditionFields(rule.when),...conditionFields(rule.require)],change=changes.get(identity(source.appId,source.id));if(!change||!ids.some(fieldId=>changedReference({appId:source.appId,entityId:source.id,fieldId})))continue
   add(change,'validation',source.id+':'+rule.id,`${source.label} · ${rule.name}`,[`Validation reads ${describe(change,ids.filter(id=>change.removed.has(id)||change.converted.has(id)))}`])
   const retained=next?.validationRules?.find(candidate=>candidate.id===rule.id)
   if(next&&retained)try{validateTableRules({fields:structuredClone(next.fields),validationRules:[structuredClone(retained)]},validateCell)}catch(error){refuse(change,`${source.label} · ${rule.name}: ${error instanceof Error?error.message:'validation references cannot be checked'}`)}
  }
 }
 for(const snapshot of snapshots.views){
  const view=JSON.parse(snapshot.definition_json) as View,change=changes.get(identity(view.appId,view.entityId));if(!change)continue
  const refs=viewReferences(view),affected=refs.all.filter(id=>change.removed.has(id)||change.converted.has(id))
  if(!change.after||affected.length)add(change,'view',snapshot.id,view.name,[!change.after?'View belongs to the deleted table':`Uses ${describe(change,affected)}`])
  if(!change.after)refuse(change,`Saved view ${view.name} still belongs to this table. Delete the view before deleting the table.`)
  else if(refs.sensitive.some(id=>change.converted.has(id)))refuse(change,`Saved view ${view.name} uses converted fields in a filter, layout, summary or formatting rule. Edit those type-sensitive settings before conversion.`)
 }
 for(const snapshot of snapshots.forms){
  const form=JSON.parse(snapshot.definition_json) as Form,change=changes.get(identity(form.appId,form.entityId));if(!change)continue
  const affected=formReferences(form).filter(id=>change.removed.has(id)||change.converted.has(id))
  if(!change.after||affected.length)add(change,'form',snapshot.id,form.title,[!change.after?'Form belongs to the deleted table':`Uses ${describe(change,affected)}`])
  if(!change.after)refuse(change,`Saved form ${form.title} still belongs to this table. Delete the form before deleting the table.`)
  else{
   const candidate=currentSchemaForm(structuredClone(form),change.after)
   for(const field of candidate.fields){
    const dangling=conditionFields(field.showWhen).filter(id=>change.removed.has(id))
    if(dangling.length)refuse(change,`Saved form ${form.title} · ${field.label} still has a visibility condition referencing ${describe(change,dangling)}. Update or remove the condition before deleting its field.`)
   }
   if(affected.some(id=>change.converted.has(id)))try{
    validateFormLogic(candidate,structuredClone(change.after.fields))
    if(candidate.fields.some(item=>{const field=change.after!.fields.find(field=>field.id===item.fieldId);return field?.readOnly||field?.type==='computed'}))throw new Error('Form submissions require writable stored fields')
   }catch(error){refuse(change,`Saved form ${form.title}: ${error instanceof Error?error.message:'type-sensitive conditions cannot be checked'}`)}
  }
 }
 for(const automation of stored.automations){const change=changes.get(identity(automation.appId,automation.entityId));if(!change)continue
  const affected=automation.actions.flatMap(action=>action.kind==='update'&&(change.removed.has(action.fieldId)||change.converted.has(action.fieldId))?[action.fieldId]:[])
  add(change,'automation',automation.id,automation.name,[`Record trigger belongs to ${change.before.label}`,`Action kinds: ${automation.actions.map(action=>action.kind).join(', ')}`,...(affected.length?[`Update actions write ${describe(change,affected)}`]:[])])
  if(!change.after||affected.length)refuse(change,`Automation ${automation.name} still ${!change.after?'triggers on this table':'updates '+describe(change,affected)}. Remove or update the automation before adopting this schema.`)
 }
 for(const key of stored.keys)for(const rule of key.rules){
  if(!rule.principals.some(principal=>principal.id===key.principalId)||!key.scopes.some(scope=>scope.appId===key.appId))continue
  const change=changes.get(identity(key.appId,rule.entityId));if(!change)continue
  const ids=[...rule.readableFields,...rule.writableFields,...conditionFields(rule.rows)],affected=ids.filter(id=>change.removed.has(id)||change.converted.has(id))
  if(!change.after||affected.length)add(change,'api_key',key.id,key.name||'Scoped API key',[`Policy rule ${rule.id} (${rule.effect}) for ${change.before.label}`,`Readable fields: ${describe(change,rule.readableFields)}`,`Writable fields: ${describe(change,rule.writableFields)}`,`Row filter fields: ${describe(change,conditionFields(rule.rows))||'none'}`,`Credential actions: ${[...new Set(key.scopes.filter(scope=>scope.appId===key.appId).flatMap(scope=>scope.actions))].join(', ')}`])
 }
 for(const change of changes.values()){
  add(change,'interface','unavailable','Interface dependents unavailable',['No interface object exists; interface dependencies cannot yet be checked.'])
  byEntity[change.before.id]!.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))
 }
 return {byEntity,guards:stored.guards,refusals}
}

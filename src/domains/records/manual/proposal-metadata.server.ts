import { createUlid } from '../../../core/shared/ids'
import { AdmissionError } from '../../admission/errors'
import { canonical } from '../../admission/canonical'
import type { SqlMutation } from '../../admission/ports'
import type { EntitySchema, Form, View } from '../contracts'
import { viewTable, formTable } from '../metadata.server'
import type { ProposedForm, ProposedView } from './proposal-contracts'

/** Check proposed views and forms against the proposed schema, as the view and form editors would. */
export function checkProposedMetadata(schemas:EntitySchema[],views:ProposedView[],forms:ProposedForm[]):string[] {
 const table=(entityId:string)=>{const schema=schemas.find(s=>s.id===entityId);if(!schema)throw new AdmissionError('validation','A proposed view or form names a table that is not in this base.');return schema}
 const field=(schema:EntitySchema,id:string)=>{const found=schema.fields.find(f=>f.id===id);if(!found)throw new AdmissionError('validation',`A proposed view or form on ${schema.label} names a field that is not in that table.`);return found}
 const lines:string[]=[]
 for(const view of views){
  const schema=table(view.entityId)
  for(const id of [...view.fields,...view.groupBy,...view.sort.map(s=>s.fieldId),...Object.values(view.layout)])field(schema,id!)
  if(view.display==='board'&&(!view.layout.boardFieldId||field(schema,view.layout.boardFieldId).type!=='select'))throw new AdmissionError('validation','Board needs a select field to group its cards.')
  if(view.display==='calendar'&&(!view.layout.startFieldId||field(schema,view.layout.startFieldId).type!=='date'))throw new AdmissionError('validation','Calendar and timeline need a date field')
  const by=view.display==='board'?`, by ${field(schema,view.layout.boardFieldId!).label}`:view.sort.length?`, sorted by ${view.sort.map(s=>field(schema,s.fieldId).label).join(', ')}`:''
  lines.push(`Add ${view.display} view “${view.name}” on ${schema.label}${by}`)
 }
 if(new Set(views.map(v=>v.entityId+':'+v.name)).size!==views.length)throw new AdmissionError('validation','View names must be unique within a table.')
 for(const form of forms){
  const schema=table(form.entityId)
  if(new Set(form.fields.map(f=>f.fieldId)).size!==form.fields.length)throw new AdmissionError('validation','Duplicate form fields')
  for(const item of form.fields){const target=field(schema,item.fieldId);if(target.type==='computed'||target.readOnly)throw new AdmissionError('validation','Form action does not accept this field')}
  if(schema.fields.some(f=>f.required&&f.type!=='computed'&&!form.fields.some(item=>item.fieldId===f.id&&item.required)))throw new AdmissionError('validation','Form must expose writable required fields')
  lines.push(`Add form “${form.title}” on ${schema.label} with ${form.fields.length} field${form.fields.length===1?'':'s'}`)
 }
 return lines
}

/** View and form rows created by the adopting owner in the same release commit. */
export function metadataMutations(appId:string,ownerId:string,now:string,views:ProposedView[],forms:ProposedForm[]):SqlMutation[] {
 return [
  ...views.map(input=>{const view:View={...input,appId,filter:{kind:'all',conditions:[]},visibility:'app',shipped:false,id:createUlid(),version:1,createdAt:now,updatedAt:now}
   return {kind:'insert' as const,table:viewTable,row:{id:view.id,app_id:appId,entity_id:view.entityId,owner_id:ownerId,version:1,visibility:'app',definition_json:canonical(view),created_at:now,updated_at:now}}}),
  ...forms.map(input=>{const form:Form={...input,appId,submitAction:'record.create',authenticated:true,id:createUlid(),version:1,createdAt:now,updatedAt:now}
   return {kind:'insert' as const,table:formTable,row:{id:form.id,app_id:appId,entity_id:form.entityId,version:1,definition_json:canonical(form),created_at:now,updated_at:now}}}),
 ]
}

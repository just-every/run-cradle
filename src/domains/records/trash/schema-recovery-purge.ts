import type {EntitySchema,View,Form} from '../contracts'
import type {StoredPreview} from '../manual/release.server'
import {canonical} from '../../admission/canonical'
import {currentSchemaView,currentSchemaForm} from '../metadata-schema'
export type SchemaDisposal={tables:Set<string>;fields:Map<string,Set<string>>}
/** Remove expired values from every recovery copy, not merely its latest release. */
export function purgeSchemaRecovery(input:string,disposal:SchemaDisposal){
 const detail=JSON.parse(input) as StoredPreview

 const prior=(detail.prior??[]).filter(value=>!disposal.tables.has(value.id)).map(value=>purgeSchemaDefinition(value,disposal))
 const schemas=(detail.schemas??[]).filter(value=>!disposal.tables.has(value.id)).map(value=>purgeSchemaDefinition(value,disposal))
 const snapshots:StoredPreview['snapshots']={}
 for(const [table,rows]of Object.entries(detail.snapshots??{})){
  const entity=table.match(/^r_([0-9a-hjkmnp-tv-z]{26})(?:_|$)/)?.[1]?.toUpperCase()
  if(entity&&disposal.tables.has(entity))continue
  const fields=entity?disposal.fields.get(entity):undefined
  if(fields&&[...fields].some(id=>table.includes('_f_'+id.toLowerCase())))continue
  const columns=[...(fields??[])].map(id=>'f_'+id.toLowerCase())
  snapshots[table]=columns.length?rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!columns.some(column=>key===column||key.startsWith(column+'_'))))):rows
 }
 const metadata=(snapshots:StoredPreview['viewSnapshots'],kind:'view'|'form')=>(snapshots??[]).flatMap(row=>{
  const definition=JSON.parse(row.definition_json) as View&Form
  if(disposal.tables.has(definition.entityId))return []
  const current=prior.find(schema=>schema.id===definition.entityId)??schemas.find(schema=>schema.id===definition.entityId)
  return [{...row,definition_json:current?canonical(kind==='view'?currentSchemaView(definition,current):currentSchemaForm(definition,current)):row.definition_json}]
 })
 const result={...detail,prior,schemas,snapshots,guards:[],adoptionGuards:[],calculations:[],viewSnapshots:metadata(detail.viewSnapshots,'view'),formSnapshots:metadata(detail.formSnapshots,'form'),impacts:(detail.impacts??[]).filter(impact=>!disposal.tables.has(impact.entityId)).map(impact=>({...impact,conversions:(impact.conversions??[]).filter(conversion=>!disposal.fields.get(impact.entityId)?.has(conversion.fieldId))}))}
 delete result.conversionPlan;delete result.restoration
 return canonical(result)
}

export function purgeSchemaDefinition(value:EntitySchema,disposal:SchemaDisposal):EntitySchema {
 const removed=disposal.fields.get(value.id)??new Set<string>(),fields=value.fields.filter(field=>!removed.has(field.id)),result={...value,fields}
 if(result.primaryFieldId&&!fields.some(field=>field.id===result.primaryFieldId)){const primary=fields.find(field=>!['relation','attachment','multi_select','computed'].includes(field.type));if(primary)result.primaryFieldId=primary.id;else delete result.primaryFieldId}
 if(result.validationRules)result.validationRules=result.validationRules.filter(rule=>![...removed].some(id=>JSON.stringify(rule).includes('"'+id+'"')))
 if(result.incomingRelations)result.incomingRelations=result.incomingRelations.filter(section=>!disposal.tables.has(section.sourceEntityId)&&!disposal.fields.get(section.sourceEntityId)?.has(section.sourceFieldId))
 return result
}

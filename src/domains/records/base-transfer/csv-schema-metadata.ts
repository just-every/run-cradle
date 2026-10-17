import type { Field } from '../contracts'
import type { SchemaDraft } from '../manual/contracts'
import { validateCell } from '../validators'
import { validateFieldConfiguration,validateTableRules } from '../validation-schema'
import type { CsvCorrespondence } from './correspondence-format'
import type { PreparedSource, ImportIdentities } from './contracts'
import { remapFieldValue,remapValidationRules } from './metadata-remap'
import { ImportInputError } from './input-error'
import { stableOptionId } from './format'

/** Schema metadata remains a review proposal until the byte-bound correspondence is accepted. */
export function validateCsvMetadata(data:CsvCorrespondence){
 const identities=new Set(data.tables.flatMap(t=>[t.id,...t.columns.map(c=>c.id),...t.rows.map(r=>r.id)]))
 if(data.baseId){if(identities.has(data.baseId))throw new ImportInputError('correspondence.json: duplicate base identity');identities.add(data.baseId)}
 for(const table of data.tables){
  const fields:Field[]=table.columns.map(c=>({id:c.id,label:c.key,type:c.type==='computed'?'text':c.type,required:c.required,unique:c.unique,...(c.relation?{relation:{ownerAppId:data.baseId!,entityId:c.relation.tableId,cardinality:c.relation.cardinality,onDelete:c.relation.onDelete}}:{}),...(c.options?{options:c.options}:{}),...(c.validation?{validation:c.validation}:{}),...(c.defaultValue!==undefined?{defaultValue:c.defaultValue}:{})}))
  for(const field of fields){
   for(const option of field.options??[]){if(identities.has(option.id))throw new ImportInputError('correspondence.json: duplicate option identity');identities.add(option.id)}
   if(field.options&&['select','multi_select'].includes(field.type)&&(!field.options.length||new Set(field.options.map(o=>o.label)).size!==field.options.length))throw new ImportInputError('correspondence.json: invalid select options')
   if(field.options&&!['select','multi_select'].includes(field.type))throw new ImportInputError('correspondence.json: options require a select field')
   try{validateFieldConfiguration(field,validateCell)}catch(error){throw new ImportInputError(`correspondence.json: ${field.label}: ${(error as Error).message}`)}
  }
  for(const rule of table.validationRules??[]){if(identities.has(rule.id))throw new ImportInputError('correspondence.json: duplicate rule identity');identities.add(rule.id)}
  try{validateTableRules({fields,validationRules:table.validationRules},validateCell)}catch(error){throw new ImportInputError(`correspondence.json: ${(error as Error).message}`)}
 }
}
export function restoreCsvMetadata(source:PreparedSource,ids:ImportIdentities,draft:SchemaDraft,accepted:boolean){
 if(!accepted||!source.csvCorrespondence)return
 const data=source.csvCorrespondence,map=new Map<string,string>()
 if(data.baseId)map.set(data.baseId,ids.appId)
 for(const table of data.tables){const identity=ids.tables[table.filename];map.set(table.id,identity.entityId)
  for(const row of table.rows)map.set(row.id,identity.records[`row-${row.ordinal}`])
  for(const column of table.columns){map.set(column.id,identity.fields[column.key]);for(const option of column.options??[]){const id=identity.options[column.key]?.[option.label];if(!id)throw new ImportInputError('CSV option mapping differs from accepted correspondence');map.set(option.id,id)}}
  for(const rule of table.validationRules??[]){const target=stableOptionId(ids.appId,table.filename,'validation-rule',rule.id);(ids.validationRules??={})[rule.id]=target;map.set(rule.id,target)}
 }
 for(const table of data.tables){const target=draft.tables.find(t=>t.id===map.get(table.id))!
  for(const column of table.columns){const field=target.fields.find(f=>f.id===map.get(column.id));if(!field)continue
   if(column.validation)field.validation=structuredClone(column.validation)
   if(column.defaultValue!==undefined)field.defaultValue=remapFieldValue(field,column.defaultValue,map)
  }
  if(table.validationRules)target.validationRules=remapValidationRules(table.validationRules,table.columns.map(c=>({id:c.id,type:c.type})),map)
 }
}

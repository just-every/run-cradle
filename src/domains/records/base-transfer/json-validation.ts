import { assertCalculationBounds } from '../calculation-bounds'
import { assertPortableInputBounds,encodedJsonBytes,jsonLimit,JSON_BASE_LIMIT,JSON_TABLE_LIMIT } from './json-limits'
export { JSON_BASE_LIMIT } from './json-limits'
import { ImportInputError } from './input-error'
import { AdmissionError } from '../../admission/errors'
import { portableBaseSchema,type PortableBase,type PortableField } from './json-format'
import { validateExpressionGraph } from '../formulas'
import { validateCell } from '../validators'
import { validateFieldConfiguration,validateTableRules } from '../validation-schema'
import { filterFields } from '../filter.server'
import { canonical } from '../../admission/canonical'
import type { Field } from '../contracts'
export function nativePortableField(field:PortableField,appId:string):Field {return {id:field.id,label:field.label,type:field.type,required:field.required,unique:field.unique,...(field.validation?{validation:structuredClone(field.validation)}:{}),...(field.defaultValue!==undefined?{defaultValue:structuredClone(field.defaultValue)}:{}),...(field.options?{options:field.options}:{}),...(field.relation?{relation:{ownerAppId:appId,entityId:field.relation.tableId,cardinality:field.relation.cardinality,onDelete:field.relation.onDelete}}:{}),...(field.type==='computed'?{readOnly:true,expression:field.expression?structuredClone(field.expression):{kind:'rollup' as const,aggregate:'lookup' as const,...field.lookup!},resultType:field.resultType}: {})}}
/** Strict allowlist plus cross-reference and native-value validation, before any persistence. */
export function validatePortableBase(input:unknown):PortableBase {
 assertPortableInputBounds(input)
 try{assertCalculationBounds(input&&typeof input==='object'&&'base' in input?input.base:null)}catch(error){throw new ImportInputError((error as Error).message)}
 const parsed=portableBaseSchema.safeParse(input);if(!parsed.success)throw new ImportInputError('Invalid Cradle base JSON: '+parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).slice(0,5).join('; '))
 const snapshot=parsed.data,base=snapshot.base,ids=new Set<string>(),tables=new Map(base.tables.map(t=>[t.id,t])),records=new Map(base.tables.map(t=>[t.id,new Map(t.records.map(r=>[r.id,r]))]))
 function unique(id:string,kind:string){if(ids.has(id))throw new ImportInputError(`Duplicate ${kind} identity ${id}`);ids.add(id)}
 unique(base.id,'base')
 for(const table of base.tables){unique(table.id,'table');for(const rule of table.validationRules??[])unique(rule.id,'validation rule');for(const field of table.fields)unique(field.id,'field');for(const inverse of table.incomingRelations)unique(inverse.id,'incoming relation');for(const record of table.records)unique(record.id,'record')}

 for(const view of base.views)unique(view.id,'view');for(const form of base.forms)unique(form.id,'form')
 const optionOwners=new Map<string,string>()
 for(const table of base.tables){
  jsonLimit('tableBytes',JSON_TABLE_LIMIT,encodedJsonBytes(table),table.label,'10 MiB')
  const fields=new Map(table.fields.map(f=>[f.id,f]));if(!fields.has(table.primaryFieldId)||!['text','number','date','select','url'].includes(fields.get(table.primaryFieldId)!.type))throw new ImportInputError(`${table.label}: invalid primary field`)
  if(table.fields.some(field=>field.label==='_record_id'))throw new ImportInputError(`${table.label}: the field name _record_id is reserved`)
  if(new Set(table.fields.map(f=>f.label)).size!==table.fields.length)throw new ImportInputError(`${table.label}: duplicate field labels`)
  for(const field of table.fields){
   if((field.type==='relation')!==Boolean(field.relation)||(field.type==='computed')!==Boolean(field.lookup||field.expression)||Boolean(field.lookup&&field.expression))throw new ImportInputError(`${field.label}: field definition does not match its type`)
   if(field.type==='computed'&&!field.resultType||field.type!=='computed'&&field.resultType)throw new ImportInputError(`${field.label}: invalid result type`)
   if(field.options&&!['select','multi_select'].includes(field.type)&&!(field.type==='computed'&&['select','multi_select'].includes(field.resultType??'')))throw new ImportInputError(`${field.label}: options require select type`)
   if(field.type==='select'||field.type==='multi_select'){
    if(!field.options?.length||new Set(field.options.map(o=>o.id)).size!==field.options.length||new Set(field.options.map(o=>o.label)).size!==field.options.length)throw new ImportInputError(`${field.label}: invalid select options`)
    for(const option of field.options){if(ids.has(option.id)||optionOwners.has(option.id))throw new ImportInputError('Duplicate select option identity');optionOwners.set(option.id,field.id)}
   }
   try{validateFieldConfiguration(nativePortableField(field,base.id),validateCell)}catch(error){throw new ImportInputError(`${field.label}: ${(error as Error).message}`)}
   if(field.relation&&!tables.has(field.relation.tableId))throw new ImportInputError(`${field.label}: dangling link table`)
   if(field.lookup){const relation=fields.get(field.lookup.relationFieldId)?.relation,source=relation&&tables.get(relation.tableId)?.fields.find(f=>f.id===field.lookup!.valueFieldId);if(!source||relation?.cardinality!=='one'||!['text','url','number','date','boolean','select'].includes(source.type)||source.type!==field.resultType||canonical(source.options??[])!==canonical(field.options??[]))throw new ImportInputError(`${field.label}: invalid lookup definition`)}
  }
  try{validateTableRules({fields:table.fields.map(f=>nativePortableField(f,base.id)),validationRules:table.validationRules},validateCell)}catch(error){throw new ImportInputError(`${table.label}: ${(error as Error).message}`)}
  for(const inverse of table.incomingRelations){const relation=tables.get(inverse.sourceEntityId)?.fields.find(f=>f.id===inverse.sourceFieldId)?.relation;if(!relation||relation.tableId!==table.id)throw new ImportInputError(`${inverse.label}: dangling incoming relation`)}
  for(const field of table.fields)if(field.unique&&field.type!=='computed'){
   if(field.relation?.cardinality==='many'||field.type==='multi_select')throw new ImportInputError(`${field.label}: collection fields cannot be unique`)
   const seen=new Set<string>();for(const row of table.records){const value=row.values[field.id];if(value===null)continue;const key=canonical(value);if(seen.has(key))throw new ImportInputError(`${field.label}: duplicate value in a unique field`);seen.add(key)}
  }
  for(const row of table.records){
   if(Object.keys(row.values).length!==table.fields.length||table.fields.some(f=>!Object.hasOwn(row.values,f.id)))throw new ImportInputError(`${table.label}: record must contain every field exactly once`)
   for(const [fieldId,error]of Object.entries(row.calculationErrors??{})){if(!fields.has(fieldId)||fields.get(fieldId)!.type!=='computed'||row.values[fieldId]!==null||error.fieldIds.some(id=>!base.tables.some(t=>t.fields.some(f=>f.id===id))))throw new ImportInputError(`${table.label}: invalid calculation error capture`)}
   for(const field of table.fields){const value=row.values[field.id];if(field.type==='multi_select'&&!Array.isArray(value))throw new ImportInputError(`${field.label}: multiple-select values require an array`);if(row.calculationErrors?.[field.id])continue;
    if(field.relation){const references=value===null?[]:Array.isArray(value)?value:[value];if(field.relation.cardinality==='many'?!Array.isArray(value):value!==null&&typeof value!=='string')throw new ImportInputError(`${field.label}: invalid link cardinality`);if(new Set(references).size!==references.length||references.some(id=>!records.get(field.relation!.tableId)!.has(String(id))))throw new ImportInputError(`${field.label}: dangling or duplicate link ID`);if(field.required&&!references.length)throw new ImportInputError(`${field.label}: required link is empty`)}
    else {const native=nativePortableField(field,base.id);if(field.type==='computed'){if(field.resultType==='array'){if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))throw new ImportInputError(`${field.label}: invalid array result`);continue}native.type=field.resultType!;native.required=false}if(canonical(validateCell(native,value))!==canonical(value))throw new ImportInputError(`${field.label}: value is not canonical`)}
   }
  }
 }
 try{validateExpressionGraph(base.tables.map(table=>({id:table.id,fields:table.fields.map(field=>nativePortableField(field,base.id))})))}catch(error){throw new ImportInputError((error as Error).message)}
 for(const table of base.tables)for(const field of table.fields)if(field.lookup){const relation=table.fields.find(f=>f.id===field.lookup!.relationFieldId)!.relation!,target=tables.get(relation.tableId)!;for(const row of table.records){const ref=row.values[field.lookup.relationFieldId],derived=ref===null?null:records.get(target.id)!.get(String(ref))!.values[field.lookup.valueFieldId];if(!row.calculationErrors?.[field.id]&&canonical(row.values[field.id])!==canonical(derived))throw new ImportInputError(`${field.label}: lookup display differs from its native definition`)}}
 for(const view of base.views){const table=tables.get(view.tableId);if(!table||[...view.fields,...view.groupBy,...view.sort.map(s=>s.fieldId),...filterFields(view.filter),...Object.values(view.layout)].some(id=>!table.fields.some(f=>f.id===id)))throw new ImportInputError(`${view.name}: dangling view field`);if(table){if(['calendar','timeline','agenda'].includes(view.display)&&(!view.layout.startFieldId||table.fields.find(f=>f.id===view.layout.startFieldId)?.type!=='date')||view.display==='timeline'&&!view.layout.endFieldId||view.display==='board'&&!view.layout.boardFieldId)throw new ImportInputError(`${view.name}: incomplete view layout`);const checkFilter=(filter:typeof view.filter):void=>{if(filter.kind!=='condition'){filter.conditions.forEach(checkFilter);return}const field=table.fields.find(f=>f.id===filter.fieldId)!,values=Array.isArray(filter.value)?filter.value:[filter.value];for(const value of values){if(value===undefined||value===null)continue;if((['select','multi_select'].includes(field.type)||['select','multi_select'].includes(field.resultType??''))&&!field.options?.some(o=>o.id===value))throw new ImportInputError(`${view.name}: dangling filter option`);if(field.relation){if(typeof value!=='object'||!('recordId'in value)||!('appId'in value)||!('entityId'in value)||value.appId!==base.id||value.entityId!==field.relation.tableId||!records.get(field.relation.tableId)!.has(String(value.recordId)))throw new ImportInputError(`${view.name}: dangling filter link`)}}};checkFilter(view.filter)}}
 for(const form of base.forms){const table=tables.get(form.tableId);if(!table||new Set(form.fields.map(f=>f.fieldId)).size!==form.fields.length||form.fields.some(f=>!table.fields.some(s=>s.id===f.fieldId&&s.type!=='computed'))||table.fields.some(f=>f.required&&f.type!=='computed'&&!form.fields.some(item=>item.fieldId===f.id&&item.required)))throw new ImportInputError(`${form.title}: invalid form fields`)}
 return snapshot
}
export function parsePortableBase(bytes:Uint8Array):PortableBase {jsonLimit('fileBytes',JSON_BASE_LIMIT,bytes.byteLength,'Cradle base JSON','200 MiB');let input:unknown;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new ImportInputError('Choose a valid UTF-8 Cradle base JSON file')};return validatePortableBase(input)}

/** The actual downloadable encoding must fit the same total-byte bound as import. */
export function serializePortableBase(snapshot:PortableBase):string {const size=encodedJsonBytes(snapshot,true)+1;if(size>JSON_BASE_LIMIT)throw new AdmissionError('capacity_limit',`Cradle base JSON fileBytes limit ${JSON_BASE_LIMIT}; current ${size}`);return JSON.stringify(snapshot,null,2)+'\n'}

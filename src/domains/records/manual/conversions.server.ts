import type { CellValue, Money } from '../../../contracts/primitives'
import type { EntitySchema, Field } from '../contracts'
import type { EntityDescriptor } from '../descriptors.server'
import { canonical } from '../../admission/canonical'
import { decimal, format, normalize } from '../exact'
import { validateCell } from '../validators'
import { decode } from '../codec.server'

export type ConversionImpact = {
 fieldId:string; label:string; from:Field['type']; to:Field['type']
 converted:{recordId:string;before:CellValue;after:CellValue;beforeLabel:string;afterLabel:string}[]
 losses:{recordId:string;value:CellValue;valueLabel:string;reason:string}[]
 refusal?:string
}
export type ConversionValues = Record<string,Record<string,Record<string,CellValue>>>
type Conversion = (value:CellValue)=>{value:CellValue;label?:string}

/** Every changed storage meaning has a reviewed result or an explicit refusal.
 * Source snapshots, including link targets, are fenced by the release caller. */
export function planFieldConversions(prior:EntityDescriptor[],schemas:EntitySchema[],snapshots:Record<string,Record<string,unknown>[]>) {
 const fieldIds:Record<string,string[]>={},values:ConversionValues={},impacts:Record<string,ConversionImpact[]>={},refusals:Record<string,string[]>={}
 for(const schema of schemas){
  const old=prior.find(d=>d.schema.appId===schema.appId&&d.schema.id===schema.id)
  if(!old)continue
  for(const field of schema.fields){
   const before=old.fields.get(field.id)?.field
   if(!before||!physicalChange(before,field))continue
   ;(fieldIds[schema.id]??=[]).push(field.id)
   const impact:ConversionImpact={fieldId:field.id,label:field.label,from:before.type,to:field.type,converted:[],losses:[]}
   ;(impacts[schema.id]??=[]).push(impact)
   const refuse=(reason:string)=>{impact.refusal??=reason;const messages=refusals[schema.id]??=[];if(!messages.includes(reason))messages.push(reason)}
   let convert:Conversion
   try{convert=converter(before,field,prior,schemas,snapshots)}catch(error){refuse(`${field.label}: ${message(error)}`);continue}
   const rows=requiredRows(snapshots,old.table.tableId)
   for(const row of rows){
    const recordId=String(row[old.idColumn]),value=decode(old.fields.get(field.id)!,row)
    let next:CellValue,afterLabel:string
    try{
     const result:ReturnType<Conversion>=value===null?{value:null}:convert(value)
     next=validateCell(field,result.value);afterLabel=result.label??label(field,next)
     impact.converted.push({recordId,before:value,after:next,beforeLabel:label(before,value),afterLabel})
    }catch(error){
     const reason=message(error)
     impact.losses.push({recordId,value,valueLabel:label(before,value),reason})
     if(field.required){
      refuse(`${field.label}: conversion would leave a required value empty. Resolve the listed losses before adopting.`)
      // A refused loss still previews as empty, so destination rules report it
      // without trying to interpret the old value as the destination type.
      next=null
     }else next=validateCell(field,null)
    }
    const records=values[schema.id]??={},record=records[recordId]??={}
    record[field.id]=next
   }
  }
 }
 return {fieldIds,values,impacts,refusals}
}

function physicalChange(before:Field,after:Field){
 return before.type!==after.type||canonical(before.relation??null)!==canonical(after.relation??null)||canonical(before.options??null)!==canonical(after.options??null)
}
function converter(before:Field,after:Field,prior:EntityDescriptor[],schemas:EntitySchema[],snapshots:Record<string,Record<string,unknown>[]>):Conversion {
 if(before.type==='attachment'||after.type==='attachment')throw new Error('Attachment conversion is refused: file custody and FILE-002 store references must be preserved by an attachment-specific migration.')
 if(before.type==='computed'||after.type==='computed')throw new Error('Converting a computed field is not supported; its calculated values are not stored conversion input.')
 if(before.type===after.type)throw new Error(before.type==='relation'?'Changing an existing relationship target or cardinality is not supported.':'Changing existing field options requires a separate reviewed option migration.')
 if(before.type==='text'&&after.type==='select')return value=>{
  const text=stringValue(value),matches=after.options?.filter(option=>option.label===text)??[]
  if(matches.length!==1)throw new Error(matches.length?'More than one option has this exact label.':'No option has this exact label.')
  return {value:matches[0]!.id,label:matches[0]!.label}
 }
 if(before.type==='select'&&after.type==='text')return value=>({value:selectLabel(before,value)})
 if(before.type==='select'&&after.type==='relation')return relationConverter(before,after,prior,schemas,snapshots)
 if(before.type==='number'&&after.type==='money')return value=>{
  const amount=decimal(normalize(stringValue(value))),shift=2-amount.scale
  if(shift<0&&amount.units%10n**BigInt(-shift)!==0n)throw new Error('USD currency requires exact cents; this value would require rounding.')
  const minor=shift>=0?amount.units*10n**BigInt(shift):amount.units/10n**BigInt(-shift)
  return {value:{minor:String(minor),currency:'USD',scale:2}}
 }
 if(before.type==='money'&&after.type==='number')return value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||!('minor'in value))throw new Error('Expected a canonical money value.')
  const money=value as Money
  if(money.currency!=='USD')throw new Error('Only USD currency can convert to a number; exchange rates are never inferred.')
  return {value:normalize(format({units:BigInt(money.minor),scale:money.scale}))}
 }
 if(before.type==='text'&&after.type==='date')return value=>{
  const text=stringValue(value),us=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  return {value:us?`${us[3]}-${us[1]!.padStart(2,'0')}-${us[2]!.padStart(2,'0')}`:text}
 }
 if(before.type==='date'&&after.type==='text'||before.type==='number'&&after.type==='text')return value=>({value:stringValue(value)})
 if(before.type==='text'&&after.type==='number')return value=>({value:normalize(stringValue(value))})
 throw new Error(`Conversion from ${before.type} to ${after.type} has no defined mapping.`)
}

function relationConverter(before:Field,after:Field,prior:EntityDescriptor[],schemas:EntitySchema[],snapshots:Record<string,Record<string,unknown>[]>):Conversion {
 const relation=after.relation
 if(!relation||relation.cardinality!=='one'||relation.onDelete!=='restrict')throw new Error('Select conversion requires a single linked record with restricted deletion.')
 const target=prior.find(d=>d.schema.appId===relation.ownerAppId&&d.schema.id===relation.entityId)
 const candidate=schemas.find(s=>s.appId===relation.ownerAppId&&s.id===relation.entityId)
 if(!target||!candidate)throw new Error('The linked target must be an existing table retained by this release.')
 const primaryId=target.schema.primaryFieldId,nextPrimaryId=candidate.primaryFieldId
 const primary=target.schema.fields.find(field=>field.id===primaryId),nextPrimary=candidate.fields.find(field=>field.id===nextPrimaryId)
 if(!primary||primary.type!=='text'||primaryId!==nextPrimaryId||canonical(primary)!==canonical(nextPrimary??null))throw new Error('Link matching requires an unchanged current text primary field; changing or removing it in this release is refused.')
 const labels=new Map<string,string[]>()
 for(const row of requiredRows(snapshots,target.table.tableId)){
  if(['deleted','archived'].includes(String(row[target.lifecycleColumn])))continue
  const value=decode(target.fields.get(primary.id)!,row)
  if(typeof value!=='string')continue
  const ids=labels.get(value)??[];ids.push(String(row[target.idColumn]));labels.set(value,ids)
 }
 return value=>{
  const text=selectLabel(before,value),matches=labels.get(text)??[]
  if(matches.length!==1)throw new Error(matches.length?'The exact primary label matches several linked records.':'No current linked record has this exact primary label.')
  return {value:{appId:relation.ownerAppId,entityId:relation.entityId,recordId:matches[0]!},label:text}
 }
}
function requiredRows(snapshots:Record<string,Record<string,unknown>[]>,table:string){
 const rows=snapshots[table];if(!rows)throw new Error(`Conversion snapshot is missing for physical table ${table}.`);return rows
}
function stringValue(value:CellValue){if(typeof value!=='string')throw new Error('Expected a canonical text value.');return value}
function selectLabel(field:Field,value:CellValue){const option=field.options?.find(option=>option.id===value);if(!option)throw new Error('The stored select option is unavailable.');return option.label}
function label(field:Field,value:CellValue):string {
 if(value===null)return 'Empty'
 if(field.type==='select')return field.options?.find(option=>option.id===value)?.label??String(value)
 if(typeof value==='string')return value
 if(typeof value==='object'&&!Array.isArray(value)&&'minor'in value)return `${value.currency} ${format({units:BigInt(value.minor),scale:value.scale})}`
 return canonical(value)
}
function message(error:unknown){return error instanceof Error?error.message:'The value does not satisfy the destination field.'}

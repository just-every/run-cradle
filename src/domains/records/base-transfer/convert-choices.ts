import type { Field } from '../contracts'
import type { ColumnOverride,SourceColumn,SourceTable } from './contracts'
import { rawText,nonempty } from './format'
import { convertCell } from './convert'
import { parseLinkCell } from './parse'
/** Default native choices follow distinct, nonempty source values in row order for every source format. */
export function selectOptionLabels(table:SourceTable,column:SourceColumn,override:ColumnOverride):string[] {
 return override.options??[...new Set(table.rows.map(row=>rawText(row.values[column.key])).filter(label=>label!==''))]
}
/** Choices validate every source cell, not just displayed samples. No writes or row identity allocation. */
export function columnChoices(table:SourceTable,column:SourceColumn,override:ColumnOverride):{validTypes:Field['type'][];reasons:string[]} {
 const values=table.rows.map(row=>row.values[column.key]),labels=selectOptionLabels(table,column,override),reasons:string[]=[],validTypes:Field['type'][]=[]
 const options=labels.map((label,i)=>({label,id:'0000000000000000000000'+String(i).padStart(4,'0')}))
 for(const type of ['text','number','date','boolean','select','url'] as const){
  if(type==='select'&&(!labels.length||labels.some(v=>!v||v.length>200)))continue
  const field:Field={id:'00000000000000000000000001',label:column.label,type,required:false,unique:false,...(type==='select'?{options}:{})}
  const conventions=type==='date'?[override.dateConvention,'day-first','month-first'] as const:[override.dateConvention]
  if(conventions.some(dateConvention=>table.rows.every(row=>{try{convertCell(field,column,row.values[column.key],{...override,dateConvention},row.numericOrigins&&Object.hasOwn(row.numericOrigins,column.key)?row.numericOrigins[column.key]:undefined,row.numericTokens?.[column.key]);return true}catch{return false}})))validTypes.push(type)
 }
 const linkShape=values.every(value=>{try{if(Array.isArray(value))return value.every(v=>typeof v==='string');parseLinkCell(rawText(value));return true}catch{return false}})
 if(linkShape)validTypes.push('relation')
 if(column.lookup)validTypes.push('computed')
 if(column.sourceType)reasons.push(`Source ${column.sourceType}; full source bytes and unsupported values retained.`)
 if(column.sourceType==='multipleSelects')reasons.push('Multiple-select has no builder type. API label arrays are joined by comma plus space in source order; this changes representation and is counted. Unused options remain source metadata.')
 if(column.sourceType==='dateTime')reasons.push('Datetime has no builder type: retain the exported instant text exactly, with no timezone conversion.')
 if(['formula','rollup'].includes(column.sourceType??''))reasons.push('Exported formula/rollup content may be kept as text or number; formula or rollup behavior is not recreated.')
 if(['singleCollaborator','multipleCollaborators','createdBy','lastModifiedBy'].includes(column.sourceType??''))reasons.push('Collaborator content remains inert source text; no account, contact, user link or activation is created.')
 if(['multipleAttachments','attachment','button'].includes(column.sourceType??''))reasons.push(`Skip by default: ${values.filter(nonempty).length} nonempty values retained only in original source.`)
 if(values.some(value=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawText(value))))reasons.push('Slash dates need an explicit day-first or month-first convention; never guessed, even when one row appears unambiguous.')
 if(validTypes.includes('number'))reasons.push('NUMBER uses exact canonical decimal strings: currency symbols, outer whitespace, comma groups, parentheses, trailing zeros and percent display are named conversions; a displayed % divides by 100, an API fraction stays a fraction.')
 if(validTypes.includes('select'))reasons.push('SELECT compares exact labels; option IDs replace source labels. Defaults use distinct nonempty values in first-seen row order for CSV and API. Source metadata choices remain in accounting; owner choices can explicitly retain or add unused options.')
 if(validTypes.includes('relation'))reasons.push('Links use exact raw primary values for CSV or source IDs for API; quoting is explicit. Missing, ambiguous and rejected targets are separately accounted; no trim, case-fold or first-match.')
 return {validTypes,reasons}
}

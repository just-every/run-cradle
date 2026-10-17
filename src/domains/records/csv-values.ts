import { AdmissionError } from '../admission/errors'
import type { Field } from './contracts'
import type { CellValue } from '../../contracts/primitives'
import { validateCsvCell } from './csv-validation'

export function decodeCsvValue(field:Field,raw:string):CellValue {
 if(field.type==='computed')throw new AdmissionError('validation',`${field.label} is computed and cannot be imported.`)
 if(raw==='\\N')return validateCsvCell(field,null)
 if(raw.startsWith('\\\\'))raw=raw.slice(1)
 let value:unknown=raw
 if(field.type==='boolean')value=raw===''?null:raw==='true'?true:raw==='false'?false:raw
 else if(field.type==='select')value=raw===''?null:(field.options?.find(o=>o.label===raw)??field.options?.find(o=>o.id===raw))?.id??raw
 else if(field.type==='money'||field.type==='multi_select'){try{value=raw===''?field.type==='multi_select'?[]:null:JSON.parse(raw)}catch{throw new AdmissionError('validation',`${field.label}: use the exported typed value.`)}}
 else if(field.type==='relation') {try{value=raw===''?null:JSON.parse(raw)}catch{throw new AdmissionError('validation',`${field.label}: links require exported reference JSON; labels alone cannot identify records.`)}}
 else if(field.type!=='text'&&raw==='')value=null
 return validateCsvCell(field,value)
}
export function encodeCsvValue(field:Field,value:CellValue):string {
 if(value===null)return '\\N'
 if(field.type==='select'||field.type==='computed'&&field.resultType==='select')value=field.options?.find(o=>o.id===value)?.label??String(value)
 if(typeof value==='string')return value.startsWith('\\')?'\\'+value:value
 return typeof value==='boolean'?String(value):JSON.stringify(value)
}

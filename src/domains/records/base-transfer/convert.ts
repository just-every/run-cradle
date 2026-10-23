import {returnStoreReferences} from '../portable-store-references'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'
import type { Field } from '../contracts'
import type { SourceColumn,ColumnOverride,NumericOrigin,NumericToken } from './contracts'
import { normalize,decimal,format } from '../exact'
import { rawText,rawCellText } from './format'
import { validateCell } from '../validators'
import { exactApiNumber } from './numeric-lexeme'
export function numberValue(raw:string,percent=false):string {
 let text=raw.trim(),negative=false
 if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1)}
 const hasPercent=text.endsWith('%');if(hasPercent)text=text.slice(0,-1)
 text=text.replace(/^[£$€¥]/,'')
 if(text.includes(',')){if(!/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text))throw new Error('Expected comma groups of three digits');text=text.replaceAll(',','')}
 if(negative)text='-'+text
 let out=normalize(text)
 if(hasPercent){const value=decimal(out);out=format({units:value.units,scale:value.scale+2});decimal(out)}
 // API percent values are already fractions; an undecorated CSV number is too.
 void percent;return out
}
export function dateValue(raw:string,convention:ColumnOverride['dateConvention']):string {
 let out=raw
 if(!/^\d{4}-\d\d-\d\d$/.test(out)){
  const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw)
  if(!match)throw new Error('Date formats are YYYY-MM-DD or D/M/YYYY with a chosen day/month convention')
  if(!convention||convention==='iso')throw new Error('Choose day-first or month-first date convention; day/month is never guessed')
  const [,a,b,y]=match;out=`${y}-${(convention==='day-first'?b:a).padStart(2,'0')}-${(convention==='day-first'?a:b).padStart(2,'0')}`
 }
 if(Number.isNaN(Date.parse(out))||new Date(out).toISOString().slice(0,10)!==out)throw new Error('Invalid calendar date')
 return out
}
export function convertCell(field:Field,column:SourceColumn,value:Json|undefined,override:ColumnOverride,origin?:NumericOrigin,tokens?:NumericToken[]):{value:Json;changed:boolean} {
 if(field.type==='attachment')return {value:returnStoreReferences(value) as unknown as Json,changed:false}
 if(origin&&value!==origin.lexeme)throw new Error('API numeric token provenance does not match cell')
 if(value===null&&column.typedNulls)return {value:null,changed:false}
 const raw=origin?.lexeme??rawCellText(value,tokens);let converted:unknown=raw
 if(field.type==='text'){const text=column.sourceType==='multipleSelects'&&Array.isArray(value)?value.map(rawText).join(', '):raw;return {value:text,changed:!!origin||(typeof value!=='string'&&value!==undefined&&value!==null)}}
 if(field.type==='boolean'){
  if(value===true||raw==='checked')converted=true
  else if(value===false||value===undefined||value===null||raw==='')converted=false
  else throw new Error('Checkbox expects checked/empty in CSV or true/false in API')
 }else if(raw==='')converted=null
 else if(field.type==='number'){
  if(typeof value==='number'&&Number.isInteger(value)&&!Number.isSafeInteger(value))throw new Error('Unsafe API integer cannot establish exact digits; source response bytes retained')
  converted=origin?exactApiNumber(origin.lexeme):numberValue(typeof value==='number'?expandNumber(value):raw,column.sourceType==='percent')
 }
 else if(field.type==='money')converted=typeof value==='object'?value:JSON.parse(raw)
 else if(field.type==='multi_select'){
  const labels=Array.isArray(value)?value:JSON.parse(raw)
  if(!Array.isArray(labels)||labels.some(label=>typeof label!=='string'))throw new Error('Multiple-select expects a JSON array of exact option labels')
  converted=labels.map(label=>{const option=field.options?.find(o=>o.label===label);if(!option)throw new Error(`Unknown select option ${JSON.stringify(label)}`);return option.id})
 }
 else if(field.type==='date')converted=dateValue(raw,override.dateConvention)
 else if(field.type==='select'){
  const option=field.options?.find(o=>o.label===raw)
  if(!option)throw new Error(`Unknown select option ${JSON.stringify(raw)}`)
  converted=option.id
 }else if(field.type==='relation'||field.type==='computed')throw new Error('Relation and computed cells require whole-base planning')
 const validated=validateCell(field,converted) as Json
 return {value:validated,changed:!!origin||raw!==rawText(validated)||typeof value!==typeof validated}
}

function expandNumber(value:number):string {
 const text=String(value);if(!/[eE]/.test(text))return text
 const [mantissa,exponent]=text.split(/[eE]/),negative=mantissa.startsWith('-'),digits=mantissa.replace('-','').replace('.',''),point=(mantissa.replace('-','').split('.')[0].length)+Number(exponent)
 const expanded=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point)
 return (negative?'-':'')+expanded
}

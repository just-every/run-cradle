import { Buffer } from 'node:buffer'
import { canonicalChunks } from './canonical-stream'
import { ImportInputError } from './input-error'
export const JSON_BASE_LIMIT=200*1024*1024
export const JSON_TABLE_LIMIT=10*1024*1024
export function jsonLimit(name:string,allowed:number,current:number,location:string,unit=''):void {
 if(current>allowed)throw new ImportInputError(`${location}: LIMIT ${name} value ${allowed} CURRENT ${current}${unit?` (${unit})`:''}`)
}
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined
/** Check counts before schema cloning, without encoding whole input objects. */
export function assertPortableInputBounds(input:unknown):void {
 const tables=object(object(input)?.base)?.tables;if(!Array.isArray(tables))return
 jsonLimit('tables',20,tables.length,'Cradle base JSON')
 for(const [index,raw]of tables.entries()){
  const table=object(raw);if(!table)continue;const where=`Cradle base JSON table ${index+1}`
  if(Array.isArray(table.fields))jsonLimit('fields',80,table.fields.length,where)
  if(!Array.isArray(table.records))continue
  jsonLimit('records',10000,table.records.length,where+' rows')
  for(const [rowIndex,rawRow]of table.records.entries())for(const [key,value]of Object.entries(object(object(rawRow)?.values)??{})){
   if(Array.isArray(value))jsonLimit('linkTargets',10000,value.length,where+` row ${rowIndex+1} field ${key}`)
   if(typeof value==='string'){let count=0;for(const _ of value)count++;jsonLimit('cellCharacters',100000,count,where+` row ${rowIndex+1} field ${key}`)}
  }
 }
}
/** Exact UTF-8 JSON size; bounded string chunks avoid a giant temporary encoding. */
export function encodedJsonBytes(value:unknown,pretty=false):number {
 let size=0;for(const chunk of canonicalChunks(value))size+=Buffer.byteLength(chunk)
 if(pretty){
  const spacing=(item:unknown,depth:number):number=>{if(item===null||typeof item!=='object')return 0;const values=Array.isArray(item)?item:Object.values(item),count=values.length;if(!count)return 0;return count+1+count*2*(depth+1)+2*depth+(Array.isArray(item)?0:count)+values.reduce<number>((sum,child)=>sum+spacing(child,depth+1),0)}
  size+=spacing(value,0)
 }
 return size
}

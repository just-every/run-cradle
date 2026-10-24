import {parquetWriteBuffer} from 'hyparquet-writer/src/write.js'
import type {Field} from '../records/contracts'

/** Flat columns keep CSV labels and display values. Numeric and boolean columns
 * retain their types; structured values and dates retain CSV's text encoding.
 * Explicit types also support empty files and all-null deletion tombstones. */
export function encodeWarehouseParquet(headers:string[],rows:string[][],fields:Field[]):ArrayBuffer{
 if(headers.length!==fields.length+2||rows.some(row=>row.length!==headers.length))throw new Error('Export column capture is inconsistent.')
 return parquetWriteBuffer({codec:'UNCOMPRESSED',createdBy:'Cradle warehouse export',columnData:headers.map((name,index)=>{
  const field=fields[index-2],type=field?.resultType??field?.type
  if(type==='number')return {name,type:'DOUBLE' as const,data:rows.map(row=>{
   const value=row[index]!
   if(value==='')return null
   if(!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)||!Number.isFinite(Number(value)))throw new Error(`Parquet number column ${name} contains an unavailable numeric value.`)
   return Number(value)
  })}
  if(type==='boolean')return {name,type:'BOOLEAN' as const,data:rows.map(row=>{
   const value=row[index]!
   if(value==='')return null
   if(value!=='Yes'&&value!=='No')throw new Error(`Parquet boolean column ${name} contains an unavailable boolean value.`)
   return value==='Yes'
  })}
  return {name,type:'STRING' as const,data:rows.map(row=>row[index]!)}
 })})
}

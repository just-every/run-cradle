import {AuthorityError} from '../authority/errors'
import type {Field} from '../records/contracts'
import {encodeCsv} from '../portability/csv'
import {encodeWarehouseParquet} from './parquet.server'

/** Files are partitioned at row boundaries; no record is silently truncated.
 * A watermark advances only after every part and its manifest are verified. */
export function warehouseFiles(headers:string[],rows:string[][],fields:Field[],format:'csv'|'parquet',remote:boolean,maxBytes=1048576){
 const encode=(part:string[][])=>format==='parquet'?encodeWarehouseParquet(headers,part,fields):encodeCsv(headers,part)
 const size=(body:string|ArrayBuffer)=>typeof body==='string'?new TextEncoder().encode(body).length:body.byteLength
 const output:{body:string|ArrayBuffer;rows:number;records:string[][]}[]=[]
 function append(part:string[][]){
  const body=encode(part)
  if(!remote||size(body)<=maxBytes){output.push({body,rows:part.length,records:part});return}
  if(part.length<=1)throw new AuthorityError('capacity_limit',`Record ${part[0]?.[0]??'(empty table)'} encoded size ${size(body)} bytes exceeds ${maxBytes===900000?'warehouseBigQueryFileBytes':'warehouseTransferBytes'} value ${maxBytes}; no export watermark was advanced.`,409)
  const middle=Math.floor(part.length/2);append(part.slice(0,middle));append(part.slice(middle))
 }
 if(remote&&rows.length){for(let offset=0;offset<rows.length;offset+=200)append(rows.slice(offset,offset+200))}else append(rows)
 return output
}

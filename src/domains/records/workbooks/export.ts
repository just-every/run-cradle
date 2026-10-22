import {Buffer} from 'node:buffer'
import type {Field,RecordRow} from '../contracts'
import type {PortableBase} from '../base-transfer/json-format'
import {exportCsvSet,safeDownloadName} from '../base-transfer/export-csv-set'
import {parseCsv} from '../../portability/csv'
import {format} from '../exact'
import {writeWorkbook,type ExportCell} from './write'
export const workbookMime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export function typedExportCell(field:Pick<Field,'type'|'resultType'|'numberFormat'>,value:unknown,display:string):ExportCell{
 const type=field.resultType??field.type
 if(value===null)return {value:null,type:'text'}
 if(type==='boolean')return {value:!!value,type:'boolean'}
 if(type==='number')return {value:String(value),type:'number',...(field.numberFormat==='percent'?{format:'percentage' as const}:{})}
 if(type==='money'){const money=value as {minor:string;scale:number;currency:string};return {value:format({units:BigInt(money.minor),scale:money.scale}),type:'number',format:'currency',currency:money.currency}}
 if(type==='date'||type==='instant')return {value:String(value),type}
 return {value:display,type:'text'}
}
export const workbookDownload=(bytes:Uint8Array,name:string)=>({filename:safeDownloadName(name)+'.xlsx',content:Buffer.from(bytes).toString('base64'),encoding:'base64',contentType:workbookMime})
export function exportBaseWorkbook(snapshot:PortableBase){
 const displayed=exportCsvSet(snapshot)
 return workbookDownload(writeWorkbook(snapshot.base.tables.map((table,i)=>{const csv=parseCsv(new TextEncoder().encode(displayed.files[i]!.csv)),fields=[table.fields.find(f=>f.id===table.primaryFieldId)!,...table.fields.filter(f=>f.id!==table.primaryFieldId)]
  return {name:table.label,headers:csv.headers,rows:table.records.map((row,j)=>csv.headers.map((_,k)=>fields[k]?typedExportCell(fields[k],row.values[fields[k].id],csv.rows[j]![k]!):{value:csv.rows[j]![k]!,type:'text'}))}
 })),snapshot.base.name)
}
export function exportViewWorkbook(snapshot:{rows:RecordRow[];headers?:string[];values?:string[][];fields?:Field[]},name:string){
 return workbookDownload(writeWorkbook([{name,headers:snapshot.headers!,rows:snapshot.rows.map((row,i)=>snapshot.fields!.map((field,j)=>{const cell=row.fields[field.id];if(cell?.state!=='value')return {type:'text' as const,value:snapshot.values![i]![j]!};return typedExportCell(field,cell.value,snapshot.values![i]![j]!)}))}]),name)
}

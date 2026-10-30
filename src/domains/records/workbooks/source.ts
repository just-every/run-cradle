import {Buffer} from 'node:buffer'
import type {PreparedSource,UploadedArtifact} from '../base-transfer/contracts'
import {hash,canonical} from '../base-transfer/format'
import {readWorkbook,type WorkbookSheet} from './read'
export function tabularSource(sheets:WorkbookSheet[],artifact:UploadedArtifact,format:'xlsx'|'google-sheets'):PreparedSource{
 const artifactHash=hash(artifact.bytes),namespace='cradle-'+format,source:PreparedSource={format,namespace,bundle:{records:[],artifacts:[{name:artifact.filename,sha256:artifactHash,size:artifact.bytes.length,original:{status:'available',base64:Buffer.from(artifact.bytes).toString('base64')}}],diagnostics:[]},tables:[]}
 for(const [sheetIndex,sheet]of sheets.entries()){
  const key='sheet-'+(sheetIndex+1),columns=sheet.headers.map((label,i)=>{const kinds=new Set(sheet.rows.map(row=>row[i]!).filter(cell=>cell.value!==null).map(cell=>cell.type));const kind=kinds.size===1?[...kinds][0]:undefined,percent=kind==='number'&&sheet.rows.map(row=>row[i]!).filter(cell=>cell.value!==null).every(cell=>cell.percent);return {typedNulls:true,key:'column-'+(i+1),label,...(kind&&kind!=='text'?{sourceType:percent?'percent':kind==='boolean'?'checkbox':kind==='instant'?'dateTime':kind}:{})}})
  const rows=sheet.rows.map((cells,i)=>({key:'row-'+(i+1),values:Object.fromEntries(columns.map((column,j)=>[column.key,cells[j]!.value])),numericOrigins:Object.fromEntries(columns.flatMap((column,j)=>cells[j]!.type==='number'&&cells[j]!.value!==null?[[column.key,{lexeme:String(cells[j]!.value),pointer:`/${key}/${i+2}/${j+1}`}]]:[])),location:{artifact:artifact.filename,row:i+2}}))
  for(const [i,row]of rows.entries()){
   const formulas=Object.fromEntries(columns.flatMap((column,j)=>{const cell=sheet.rows[i][j];return cell.formula===undefined?[]:[[column.key,{expression:cell.formula,coordinate:cell.coordinate!,...(cell.formulaKind?{kind:cell.formulaKind}:{})}]]}))
   if(Object.keys(formulas).length)Object.assign(row,{formulas})
  }
  source.tables.push({key,label:sheet.name,columns,rows});for(const row of rows)source.bundle.records.push({namespace,kind:key,sourceId:row.key,payload:row.values,payloadHash:hash(canonical(row.values)),artifactHash,location:row.location})
 }
 return source
}
export const prepareWorkbookSource=(artifact:UploadedArtifact)=>tabularSource(readWorkbook(artifact.bytes,artifact.filename),artifact,'xlsx')

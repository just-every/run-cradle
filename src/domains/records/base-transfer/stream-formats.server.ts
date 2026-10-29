import {createHash} from 'node:crypto'
import type {BaseStreamSource,PortableTable} from './stream-source.server'
import {streamWorkbook} from '../workbooks/stream'
import {streamZip,type StreamEntry} from '../workbooks/stream-zip'
import {typedExportCell} from '../workbooks/export'
import {exportCsvSetContent,safeDownloadName,csvSetGuide} from './export-csv-set'
const encoder=new TextEncoder(),encode=(value:string)=>encoder.encode(value)
async function* text(value:string){yield encode(value)}

export async function* streamBaseJson(source:BaseStreamSource,includeRecords=true):AsyncGenerator<Uint8Array>{
 const snapshot=source.snapshot
 yield encode('{"format":"cradle-base","version":1,"envelope":'+JSON.stringify(snapshot.envelope)+',"base":{"id":'+JSON.stringify(snapshot.base.id)+',"name":'+JSON.stringify(snapshot.base.name)+',"tables":[')
 for(const [index,table]of snapshot.base.tables.entries()){
  const {records,...metadata}=table
  yield encode((index?',':'')+JSON.stringify(metadata).slice(0,-1)+',"records":[')
  if(includeRecords){let separator='';for await(const row of source.rows(table)){yield encode(separator+JSON.stringify(row));separator=','}}
  yield encode(']}')
 }
 await source.check()
 yield encode('],"views":'+JSON.stringify(snapshot.base.views)+',"forms":'+JSON.stringify(snapshot.base.forms)+(snapshot.base.interfaces?.length?',"interfaces":'+JSON.stringify(snapshot.base.interfaces):'')+'}}\n')
}
export function streamBaseWorkbook(source:BaseStreamSource){
 return streamWorkbook(source.snapshot.base.tables.map(table=>({name:table.label,headers:source.headers(table),rows:(async function*(){const fields=source.fields(table);for await(const row of source.rows(table)){const display=await source.displayed(table,row);yield display.values.map((value,i)=>fields[i]?typedExportCell(fields[i]!,row.values[fields[i]!.id],value):{value,type:'text' as const})}await source.check()})()})))
}
/** CSV correspondence is emitted in passes; only digests and schema survive a pass. */
export async function* streamBaseCsvSet(source:BaseStreamSource){
 const snapshot=source.snapshot,schema=structuredClone(snapshot)
 for(const view of schema.base.views)if(view.timelineBaseline)view.timelineBaseline.records=[]
 const template=exportCsvSetContent(schema),stats=new Map<string,{bytes:number;sha256:string}>(),names=new Map(snapshot.base.tables.map((table,i)=>[table.id,`${String(i+1).padStart(2,'0')}-${safeDownloadName(table.label)}.csv`]))
 async function* csv(table:PortableTable){let bytes=0;const hash=createHash('sha256');for await(const chunk of source.csv(table)){bytes+=chunk.length;hash.update(chunk);yield chunk}stats.set(table.id,{bytes,sha256:hash.digest('hex')})}
 async function* correspondence(){
  yield encode('{"format":"cradle-csv-correspondence","version":1,"baseId":'+JSON.stringify(snapshot.base.id)+',"tables":[')
  for(const [i,table]of snapshot.base.tables.entries()){
   const original=template.correspondence.tables[i]!,{rows,...metadata}=original,stat=stats.get(table.id)!
   yield encode((i?',':'')+JSON.stringify({...metadata,...stat}).slice(0,-1)+',"rows":[')
   let ordinal=0;const primary=source.fields(table)[0]!;for await(const row of source.rows(table)){yield encode((ordinal?',':'')+JSON.stringify({id:row.id,ordinal:++ordinal,primary:source.scalar(primary,row.values[primary.id])}))}
   yield encode(']}')
  }
  yield encode('],"references":[')
  let separator=''
  for(const table of snapshot.base.tables)for await(const row of source.rows(table)){const display=await source.displayed(table,row);for(const reference of display.references){yield encode(separator+JSON.stringify({tableId:table.id,recordId:row.id,...reference}));separator=','}}
  yield encode('],"cells":[');separator=''
  for(const table of snapshot.base.tables){const fields=source.fields(table);for await(const row of source.rows(table)){for(const [i,field]of fields.entries())if(field.type!=='relation'&&template.correspondence.tables.find(t=>t.id===table.id)!.columns[i]!.type!=='computed'&&source.scalar(field,row.values[field.id])===''){yield encode(separator+JSON.stringify({tableId:table.id,recordId:row.id,columnId:field.id,state:row.values[field.id]===null?'null':template.correspondence.tables.find(t=>t.id===table.id)!.columns[i]!.type==='boolean'?'false':'empty'}));separator=','}}}
  await source.check();yield encode(']}\n')
 }
 async function* entries():AsyncGenerator<StreamEntry>{
  for(const table of snapshot.base.tables)yield {name:names.get(table.id)!,body:csv(table)}
  yield {name:'correspondence.json',body:correspondence()}
  yield {name:'import-options.json',body:text(JSON.stringify(template.options,null,2))}
  yield {name:'README.txt',body:text(csvSetGuide(template)+'\nComplete exports can exceed the bounded import limits. Split or reduce a large download before returning through an import door.\n')}
 }
 yield* streamZip(entries())
}

/** Preserve existing JSON/base64 response contracts without buffering the download. */
export async function* streamDownloadEnvelope(bytes:AsyncIterable<Uint8Array>,data:{filename:string;encoding:'utf8'|'base64';contentType:string;omissions?:string[]},meta:unknown){
 yield encode('{"data":'+JSON.stringify(data).slice(0,-1)+',"content":"')
 if(data.encoding==='utf8'){
  const decoder=new TextDecoder()
  for await(const chunk of bytes){const text=decoder.decode(chunk,{stream:true});yield encode(JSON.stringify(text).slice(1,-1))}
  const tail=decoder.decode();if(tail)yield encode(JSON.stringify(tail).slice(1,-1))
 }else{
  let pending=new Uint8Array(0)
  for await(const chunk of bytes){const joined=new Uint8Array(pending.length+chunk.length);joined.set(pending);joined.set(chunk,pending.length);const size=joined.length-joined.length%3;for(let offset=0;offset<size;offset+=12288){const end=Math.min(size,offset+12288);yield encode(btoa(String.fromCharCode(...joined.subarray(offset,end))))}pending=joined.slice(size)}
  if(pending.length)yield encode(btoa(String.fromCharCode(...pending)))
 }
 yield encode('"},"meta":'+JSON.stringify(meta)+'}')
}

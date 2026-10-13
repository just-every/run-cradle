import {parseBaseCsv} from '../records/base-transfer/parse'
import {inflateSync} from 'node:zlib'
import {pdfText} from './pdf-text.server'
import {gzipText} from './gzip-text.server'
const limit=32*1024*1024
/** Inspection is lossless or refused. Never turn undecodable bytes into U+FFFD. */
export function attachmentText(input:Uint8Array,mediaType:string,encoding?:string):string[]{
 let bytes=input;const metadata:string[]=[]
 for(const part of (encoding??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).reverse()){
  if(part==='identity')continue
  if(part!=='gzip'&&part!=='deflate')throw new Error('unsupported content encoding')
  if(part==='gzip'){const decoded=gzipText(bytes,limit);metadata.push(...decoded.text);bytes=decoded.buffer;continue}
  const decoded=inflateSync(bytes,{maxOutputLength:limit,info:true}) as unknown as {buffer:Uint8Array;engine:{bytesWritten:number}}
  if(decoded.engine.bytesWritten!==bytes.length)throw new Error('uninspectable trailing compressed attachment data')
  bytes=decoded.buffer
 }
 if(bytes.byteLength>limit)throw new Error('decoded attachment exceeds inspection limit')
 const type=mediaType.split(';')[0]!.trim().toLowerCase()
 // Readers may recognize a PDF after leading bytes. Such files are outside the
 // strict envelope subset, but must still reach its refusal rather than text.
 if(type==='application/pdf'||new TextDecoder('latin1').decode(bytes.subarray(0,1024)).includes('%PDF-'))return [...metadata,...pdfText(bytes)]
 if(type&& !['text/plain','text/csv','application/json','text/markdown'].includes(type))throw new Error('unsupported attachment format')
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new Error('uninspectable binary attachment')
 if(type==='text/csv'){const csv=parseBaseCsv(bytes,'attachment',160);return [...metadata,text,...csv.headers,...csv.rows.flatMap(row=>row.cells)]}
 if(type==='application/json')return [...metadata,text,JSON.stringify(JSON.parse(text))]
 try{return [...metadata,text,JSON.stringify(JSON.parse(text))]}catch{return [...metadata,text]}
}

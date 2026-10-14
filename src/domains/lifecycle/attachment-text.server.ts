import {inflateSync} from 'node:zlib'
import {pdfText} from './pdf-text.server'
import {gzipText} from './gzip-text.server'
import {InspectionBudget} from './inspection-budget.server'
/** Inspection is lossless or refused. Never turn undecodable bytes into U+FFFD. */
export function attachmentText(input:Uint8Array,mediaType:string,encoding?:string):string[]{
 const budget=new InspectionBudget();budget.charge(input.byteLength)
 let bytes=input;const metadata:string[]=[]
 for(const part of (encoding??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).reverse()){
  if(part==='identity')continue
  if(part!=='gzip'&&part!=='deflate')throw new Error('unsupported content encoding')
  if(part==='gzip'){const decoded=gzipText(bytes,budget);metadata.push(...decoded.text);bytes=decoded.buffer;continue}
  const decoded=inflateSync(bytes,{maxOutputLength:Math.max(1,budget.left),info:true}) as unknown as {buffer:Uint8Array;engine:{bytesWritten:number}}
  if(decoded.engine.bytesWritten!==bytes.length)throw new Error('uninspectable trailing compressed attachment data')
  budget.charge(decoded.buffer.length);bytes=decoded.buffer
 }
 const type=mediaType.split(';')[0]!.trim().toLowerCase()
 // Readers may recognize a PDF after leading bytes. Such files are outside the
 // strict envelope subset, but must still reach its refusal rather than text.
 if(type==='application/pdf'||new TextDecoder('latin1').decode(bytes.subarray(0,1024)).includes('%PDF-'))return [...metadata,...pdfText(bytes,budget)]
 if(type&& !['text/plain','text/csv','application/json','text/markdown'].includes(type))throw new Error('unsupported attachment format')
 const text=budget.build(bytes.length,()=>new TextDecoder('utf-8',{fatal:true}).decode(bytes))
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw new Error('uninspectable binary attachment')
 const out=[...metadata,text]
 // Quoted CSV cells double their quotes; JSON strings may escape any character.
 // Both forms are scanned as best-effort extra copies, never parsed strictly.
 if(text.includes('""'))out.push(budget.build(text.length,()=>text.replaceAll('""','"')))
 if(/\\[u\/]/.test(text))out.push(budget.build(text.length,()=>jsonUnescaped(text)))
 return out
}
const shortEscapes:Record<string,string>={'"':'"','\\':'\\','/':'/',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t'}
/** Decodes JSON string escapes wherever they occur; an escaped backslash is consumed as one pair. */
const jsonUnescaped=(text:string)=>text.replace(/\\(?:u([\da-fA-F]{4})|(["\\\/bfnrt]))/g,(_,hex:string|undefined,short:string|undefined)=>hex?String.fromCharCode(parseInt(hex,16)):shortEscapes[short!]!)

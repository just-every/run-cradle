import {Buffer} from 'node:buffer'
import {gunzipSync,inflateRawSync} from 'node:zlib'
import type {InspectionBudget} from './inspection-budget.server'

/** Inspect every RFC 1952 member, including metadata zlib otherwise discards.
 * Member outputs and the validated whole output are both charged to the budget. */
export function gzipText(bytes:Uint8Array,budget:InspectionBudget):{buffer:Uint8Array;text:string[]}{
 const text:string[]=[];let at=0,expanded=0
 while(at<bytes.length){
  const start=at
  if(at+10>bytes.length||bytes[at]!==31||bytes[at+1]!==139||bytes[at+2]!==8)throw new Error('invalid gzip member')
  const flags=bytes[at+3]!;at+=10
  if(flags&0xe0)throw new Error('unsupported gzip flags')
  // Extra fields carry arbitrary application-defined binary encodings. No
  // inspection promise is possible without understanding their subfield format.
  if(flags&4)throw new Error('uninspectable gzip extra fields')
  for(const flag of [8,16])if(flags&flag){
   const end=bytes.indexOf(0,at)
   if(end<0)throw new Error('unterminated gzip metadata')
   const field=bytes.subarray(at,end)
   budget.keep(text,[Buffer.from(field.buffer,field.byteOffset,field.byteLength).toString('latin1')])
   // RFC 1952 specifies Latin-1; also inspect lossless UTF-8 used by writers.
   try{const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(field);if(utf8!==text.at(-1))budget.keep(text,[utf8])}catch{}
   at=end+1
  }
  if(flags&2)at+=2
  if(at>=bytes.length)throw new Error('truncated gzip member')
  // Raw inflate supplies the member boundary; gunzip below remains responsible
  // for header CRC, payload CRC and size validation across the complete stream.
  const member=inflateRawSync(bytes.subarray(at),{maxOutputLength:Math.max(1,budget.left),info:true}) as unknown as {buffer:Uint8Array;engine:{bytesWritten:number}}
  const consumed=member.engine.bytesWritten
  if(!Number.isSafeInteger(consumed)||consumed<=0||consumed>bytes.length-at-8)throw new Error('uninspectable gzip member boundary')
  expanded+=member.buffer.length;budget.charge(member.buffer.length)
  at+=consumed+8
  if(at>bytes.length||at<=start)throw new Error('truncated gzip trailer')
 }
 budget.charge(expanded)
 const decoded=gunzipSync(bytes,{maxOutputLength:Math.max(1,expanded),info:true}) as unknown as {buffer:Uint8Array;engine:{bytesWritten:number}}
 if(decoded.engine.bytesWritten!==bytes.length)throw new Error('uninspectable trailing compressed attachment data')
 return {buffer:decoded.buffer,text}
}

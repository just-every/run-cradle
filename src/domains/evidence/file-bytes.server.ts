import {EvidenceError} from './shared.server'
import {directUploadBytes, directUploadLimit} from './upload-limits'

type FileBytes = {bytes:number; media_type:string; object_key:string; sha256:string}

function magic(type:string, bytes:Uint8Array){
 const begins=(prefix:number[])=>prefix.every((value,index)=>bytes[index]===value)
 if(type==='image/png')return begins([137,80,78,71,13,10,26,10])
 if(type==='image/jpeg')return begins([255,216,255])
 if(type==='application/pdf')return begins([37,80,68,70,45])
 if(type==='image/webp')return begins([82,73,70,70])&&[87,69,66,80].every((value,index)=>bytes[index+8]===value)
 return !bytes.includes(0)
}

/** Settle both ends before the caller deletes rejected bytes or releases custody. */
export async function storeFileBytes(bucket:R2Bucket, file:FileBytes, body:ReadableStream<Uint8Array>){
 let bytes=0, pref=0
 const prefix=new Uint8Array(32), text=file.media_type.startsWith('text/')?new TextDecoder('utf-8',{fatal:true}):null
 const stream=body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
  transform(chunk,controller){
   bytes+=chunk.length
   if(bytes>file.bytes||bytes>directUploadBytes)throw new EvidenceError('upload_rejected',`File exceeds its declared ${file.bytes} bytes. Direct uploads allow at most ${directUploadLimit}.`,413)
   if(pref<32){const take=chunk.subarray(0,32-pref);prefix.set(take,pref);pref+=take.length}
   if(text){if(chunk.includes(0))throw new EvidenceError('upload_rejected','Text contains a binary NUL');text.decode(chunk,{stream:true})}
   controller.enqueue(chunk)
  },
  flush(){
   if(text)text.decode()
   if(bytes!==file.bytes||!magic(file.media_type,prefix.subarray(0,pref)))throw new EvidenceError('upload_rejected','File length or signature does not match')
  },
 }))
 const fixed=new FixedLengthStream(file.bytes),abort=new AbortController()
 const stored=(async()=>{
  try{return await bucket.put(file.object_key,fixed.readable,{sha256:file.sha256,httpMetadata:{contentType:file.media_type}})}
  catch(error){abort.abort(error);throw error}
 })()
 const writes=await Promise.allSettled([stream.pipeTo(fixed.writable,{signal:abort.signal}),stored])
 for(const result of writes)if(result.status==='rejected'){
  // R2 BadDigest is a refused upload; other storage failures retain their error.
  if(result.reason instanceof Error&&/\(10037\)$/.test(result.reason.message))throw new EvidenceError('upload_rejected','Stored checksum mismatch',413)
  throw result.reason
 }
 const head=await bucket.head(file.object_key)
 if(!head||head.size!==file.bytes||!head.checksums.sha256||Array.from(new Uint8Array(head.checksums.sha256),byte=>byte.toString(16).padStart(2,'0')).join('')!==file.sha256)throw new EvidenceError('upload_rejected','Stored checksum mismatch')
}

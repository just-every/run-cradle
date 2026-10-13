import {deflateSync,gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export function compressedPdf(text,filter='FlateDecode'){
 const stream=deflateSync(Buffer.from('BT /F1 12 Tf 72 720 Td ('+text.replace(/[()\\]/g,'\\$&')+') Tj ET'))
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),Buffer.concat([Buffer.from('<< /Length '+stream.length+' /Filter /'+filter+' >>\nstream\n'),stream,Buffer.from('\nendstream')])]
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[];let size=parts[0].length
 for(const [i,object] of objects.entries()){offsets.push(size);const part=Buffer.concat([Buffer.from((i+1)+' 0 obj\n'),object,Buffer.from('\nendobj\n')]);parts.push(part);size+=part.length}
 parts.push(Buffer.from('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+size+'\n%%EOF\n'))
 return Buffer.concat(parts)
}
/** R2 network edge used by the SQL/public-route fixture. It retains exact bytes
 * and metadata and implements the list/get/delete contract the product uses. */
export function objectBucket(){
 const objects=new Map()
 const body=(key,stored,range)=>({key,etag:hash(stored.bytes),size:stored.bytes.length,httpMetadata:structuredClone(stored.httpMetadata),customMetadata:structuredClone(stored.customMetadata),async arrayBuffer(){return Uint8Array.from(range?stored.bytes.subarray(range.offset,range.offset+range.length):stored.bytes).buffer}})
 return {objects,async put(key,bytes,metadata={}){objects.set(key,{bytes:Buffer.from(typeof bytes==='string'?new TextEncoder().encode(bytes):bytes),httpMetadata:metadata.httpMetadata??{},customMetadata:metadata.customMetadata??{}})},async get(key,options){const v=objects.get(key);return v?body(key,v,options?.range):null},async head(key){const v=objects.get(key);return v?body(key,v):null},async list(){return {objects:[...objects].map(([key,v])=>body(key,v)),truncated:false}},async delete(key){for(const k of Array.isArray(key)?key:[key])objects.delete(k)},snapshot(){return [...objects].map(([key,v])=>[key,v.bytes.toString('base64'),v.httpMetadata,v.customMetadata]).sort()}}
}
export const encodedText=(text,encoding)=>encoding==='gzip'?gzipSync(Buffer.from(text)):deflateSync(Buffer.from(text))
/** Real gzip optional fields; payload stays independent of envelope identity. */
export function gzipMetadata(body,{name,comment,extra}={}){
 const member=gzipSync(Buffer.from(body)),header=Buffer.from(member.subarray(0,10)),fields=[]
 if(extra){header[3]|=4;const field=Buffer.alloc(6);field.writeUInt16LE(extra.length+4);field.write('PI',2);field.writeUInt16LE(extra.length,4);fields.push(field,extra)}
 for(const [flag,value] of [[8,name],[16,comment]])if(value!==undefined){header[3]|=flag;fields.push(Buffer.from(value),Buffer.from([0]))}
 return Buffer.concat([header,...fields,member.subarray(10)])
}

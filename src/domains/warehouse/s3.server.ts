import type {PlatformBindings} from '../../core/platform/bindings'
import type {S3Destination,S3Access} from './destination-configuration.server'
import type {WarehouseStage} from './provider-contracts'
import {RelayTransport} from '../integrations/relay-transport.server'
import {AuthorityError} from '../authority/errors'
const encode=(value:string)=>encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())
const bytes=(value:string)=>new TextEncoder().encode(value)
const hex=(value:ArrayBuffer)=>Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('')
async function hash(value:Uint8Array<ArrayBuffer>){return hex(await crypto.subtle.digest('SHA-256',value))}
async function hmac(key:Uint8Array<ArrayBuffer>,value:string){const imported=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',imported,bytes(value)))}
function base64(value:Uint8Array){let output='';for(let offset=0;offset<value.length;offset+=8192)output+=String.fromCharCode(...value.subarray(offset,offset+8192));return btoa(output)}
function decode(value:string){return Uint8Array.from(atob(value),char=>char.charCodeAt(0))}
const xml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const text=(body:string)=>new TextDecoder().decode(decode(body))
const partBytes=5*1024*1024,readBytes=1024*1024

/** Multipart parts meet S3's 5 MiB minimum. Readback is ranged so neither a
 * record nor a manifest is limited by the ordinary relay response envelope. */
export async function createS3WarehouseStore(env:PlatformBindings,destination:S3Destination,access:S3Access):Promise<WarehouseStage>{
 if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new Error('Trusted egress relay is required for S3 exports.')
 const target=destination,relay=new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET)
 async function request(method:'PUT'|'GET'|'HEAD'|'DELETE'|'POST',key:string,body?:Uint8Array<ArrayBuffer>,contentType?:string,query:Record<string,string>={},extra:Record<string,string>={}){
  const payload=body??new Uint8Array(),digest=await hash(payload),url=new URL(target.endpoint)
  url.pathname='/'+[target.bucket,...target.prefix?target.prefix.split('/'):[],...key.split('/')].map(encode).join('/')
  const canonicalQuery=Object.entries(query).map(([name,value])=>[encode(name),encode(value)] as const).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>name+'='+value).join('&')
  url.search=canonicalQuery
  const time=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=time.slice(0,8),scope=`${day}/${target.region}/s3/aws4_request`,headers={'x-amz-content-sha256':digest,'x-amz-date':time}
  const canonical=`${method}\n${url.pathname}\n${canonicalQuery}\nhost:${url.host}\nx-amz-content-sha256:${digest}\nx-amz-date:${time}\n\nhost;x-amz-content-sha256;x-amz-date\n${digest}`
  const signing=await hmac(await hmac(await hmac(await hmac(bytes('AWS4'+access.secretAccessKey),day),target.region),'s3'),'aws4_request')
  const signature=hex((await hmac(signing,`AWS4-HMAC-SHA256\n${time}\n${scope}\n${await hash(bytes(canonical))}`)).buffer)
  const response=await relay.send({url:url.href,method,body:base64(payload),bodyEncoding:'base64',...(payload.length>readBytes?{transferPart:'warehouse-v1' as const}:{}),headers:{...headers,...extra,...contentType?{'content-type':contentType}:{},authorization:`AWS4-HMAC-SHA256 Credential=${access.accessKeyId}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`}})
  if(response.status===404&&(method==='HEAD'||method==='GET'))return null
  if(response.status<200||response.status>=300)throw new AuthorityError('provider_unavailable',`S3 ${method.toLowerCase()} was refused (${response.status}); exported-copy custody is unconfirmed.`,503)
  return response
 }
 return {
  async put(key,body,options){
   const payload=typeof body==='string'?bytes(body):new Uint8Array(body)
   if(payload.length<=readBytes){await request('PUT',key,payload,options.httpMetadata.contentType);return}
   const started=await request('POST',key,undefined,options.httpMetadata.contentType,{uploads:''})
   const uploadId=/<UploadId>([^<]+)<\/UploadId>/.exec(text(started!.body))?.[1]
   if(!uploadId)throw new Error('S3 multipart upload returned no upload identity.')
   let complete=false
   try{
    const parts=[]
    for(let offset=0,index=1;offset<payload.length;offset+=partBytes,index++){
     const part=payload.slice(offset,offset+partBytes),query={partNumber:String(index),uploadId}
     // Repeating a part number overwrites that part in this unfinished upload;
     // no completed object or Snowflake load can be duplicated.
     let response
     try{response=await request('PUT',key,part,undefined,query)}catch{response=await request('PUT',key,part,undefined,query)}
     const etag=response!.headers.etag
     if(!etag)throw new Error('S3 multipart upload returned no part ETag.')
     parts.push(`<Part><PartNumber>${index}</PartNumber><ETag>${xml(etag)}</ETag></Part>`)
    }
    const result=await request('POST',key,bytes('<CompleteMultipartUpload>'+parts.join('')+'</CompleteMultipartUpload>'),'application/xml',{uploadId})
    if(/<Error[ >]/.test(text(result!.body)))throw new Error('S3 multipart completion was refused.')
    complete=true
   }finally{if(!complete)await request('DELETE',key,undefined,undefined,{uploadId})}
  },
  async get(key){
   const head=await request('HEAD',key);if(!head)return null
   const length=Number(head.headers['content-length'])
   if(!Number.isSafeInteger(length)||length<0)throw new Error('S3 readback returned no valid object length.')
   return {async arrayBuffer(){
    const output=new Uint8Array(length)
    for(let offset=0;offset<length;offset+=readBytes){
     const end=Math.min(length,offset+readBytes)-1,response=await request('GET',key,undefined,undefined,{}, {range:`bytes=${offset}-${end}`})
     if(!response||response.status!==206||response.headers['content-range']!==`bytes ${offset}-${end}/${length}`)throw new Error('S3 ranged readback differs from its source object.')
     const part=decode(response.body);if(part.length!==end-offset+1)throw new Error('S3 ranged readback is incomplete.')
     output.set(part,offset)
    }
    return output.buffer
   }}
  },
  async head(key){return request('HEAD',key)},async delete(key){await request('DELETE',key)},
 }
}

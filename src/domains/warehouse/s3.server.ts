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
function decode(value:string):ArrayBuffer{return Uint8Array.from(atob(value),char=>char.charCodeAt(0)).buffer}

/** SigV4 path-style requests cross the same pinned public-DNS relay as webhooks.
 * Credentials and location are server configuration; redirects are never followed. */
export async function createS3WarehouseStore(env:PlatformBindings,destination:S3Destination,access:S3Access):Promise<WarehouseStage>{
 if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new Error('Trusted egress relay is required for S3 exports.')
 const target=destination
 const relay=new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET)
 async function request(method:'PUT'|'GET'|'HEAD'|'DELETE',key:string,body?:string|ArrayBuffer,contentType?:string){
  const payload=typeof body==='string'?bytes(body):body?new Uint8Array(body):new Uint8Array(),digest=await hash(payload),url=new URL(target.endpoint)
  const path=[target.bucket,...target.prefix?target.prefix.split('/'):[],...key.split('/')].map(encode).join('/')
  url.pathname='/'+path
  const time=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=time.slice(0,8),scope=`${day}/${target.region}/s3/aws4_request`,headers={'x-amz-content-sha256':digest,'x-amz-date':time}
  const canonical=`${method}\n${url.pathname}\n\nhost:${url.host}\nx-amz-content-sha256:${digest}\nx-amz-date:${time}\n\nhost;x-amz-content-sha256;x-amz-date\n${digest}`
  const signing=await hmac(await hmac(await hmac(await hmac(bytes('AWS4'+access.secretAccessKey),day),target.region),'s3'),'aws4_request')
  const signature=hex((await hmac(signing,`AWS4-HMAC-SHA256\n${time}\n${scope}\n${await hash(bytes(canonical))}`)).buffer)
  const response=await relay.send({url:url.href,method,body:base64(payload),bodyEncoding:'base64',headers:{...headers,...contentType?{'content-type':contentType}:{},authorization:`AWS4-HMAC-SHA256 Credential=${access.accessKeyId}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`}})
  if(response.status===404&&(method==='HEAD'||method==='GET'))return null
  if(response.status<200||response.status>=300)throw new AuthorityError('provider_unavailable',`S3 ${method.toLowerCase()} was refused (${response.status}); exported-copy custody is unconfirmed.`,503)
  return response
 }
 return {
  async put(key,body,options){await request('PUT',key,body,options.httpMetadata.contentType)},
  async get(key){const response=await request('GET',key);return response?{async arrayBuffer(){return decode(response.body)}}:null},
  async head(key){return request('HEAD',key)},async delete(key){await request('DELETE',key)},
 }
}

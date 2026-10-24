import type {PlatformBindings} from '../../core/platform/bindings'
import {AuthorityError} from '../authority/errors'
import {RelayTransport} from '../integrations/relay-transport.server'
import type {WarehouseObjectMeta,WarehouseRemoteDestination,WarehouseStage} from './provider-contracts'

export type SnowflakeConfig={kind:'snowflake';account:string;user:string;database:string;schema:string;tablePrefix:string;stage:string;stageStorage:{kind:'s3';endpoint:string;region:string;bucket:string;prefix:string};warehouse?:string;role?:string}
export type SnowflakeCredentials={privateKeyPem:string;accessKeyId:string;secretAccessKey:string}
const provenanceBase='_cradle_export_file'
const bytes=(value:string)=>new TextEncoder().encode(value)
function base64(value:Uint8Array){let raw='';for(const byte of value)raw+=String.fromCharCode(byte);return btoa(raw)}
const url64=(value:Uint8Array)=>base64(value).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
const identifier=(value:string)=>{if(!value||value.length>255||/[\0\r\n]/.test(value))throw new AuthorityError('provider_unavailable','Snowflake identifier is invalid.',503);return '"'+value.replace(/"/g,'""')+'"'}
const literal=(value:string)=>"'"+value.replace(/'/g,"''")+"'"
const sha=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))
const hex=(value:Uint8Array)=>[...value].map(byte=>byte.toString(16).padStart(2,'0')).join('')
type SqlResult={code?:string;statementHandle?:string;data?:unknown[][];resultSetMetaData?:{rowType?:{name:string}[]}}

/** The owner's named external stage must point at stageStorage's bucket/prefix.
 * File bytes remain there until COPY and erasure are independently confirmed. */
export async function createSnowflakeDestination(env:PlatformBindings,config:SnowflakeConfig,credentials:SnowflakeCredentials,_stage:WarehouseStage):Promise<WarehouseRemoteDestination>{
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(config.account))throw new AuthorityError('provider_unavailable','Use a Snowflake account identifier without a host or region suffix.',503)
 if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new AuthorityError('provider_unavailable','Trusted egress relay is required for Snowflake exports.',503)
 const relay=new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET),origin=`https://${config.account.toLowerCase()}.snowflakecomputing.com`
 let privateKey:CryptoKey,publicKey:CryptoKey
 try{
  const pem=credentials.privateKeyPem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')
  privateKey=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},true,['sign'])
  const jwk=await crypto.subtle.exportKey('jwk',privateKey)
  publicKey=await crypto.subtle.importKey('jwk',{kty:jwk.kty,n:jwk.n,e:jwk.e},{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},true,['verify'])
 }catch{throw new AuthorityError('provider_unavailable','Snowflake requires an unencrypted RSA PKCS8 private key for the configuring owner user.',503)}
 const fingerprint=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',await crypto.subtle.exportKey('spki',publicKey))))
 async function token(){
  const now=Math.floor(Date.now()/1000),subject=config.account.toUpperCase()+'.'+config.user.toUpperCase()
  const head=url64(bytes(JSON.stringify({alg:'RS256',typ:'JWT'}))),body=url64(bytes(JSON.stringify({iss:subject+'.SHA256:'+fingerprint,sub:subject,iat:now,exp:now+60}))),unsigned=head+'.'+body
  return unsigned+'.'+url64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,bytes(unsigned))))
 }
 async function request(method:'POST'|'GET',path:string,body?:unknown){
  return relay.send({url:origin+path,method,headers:{authorization:'Bearer '+await token(),'X-Snowflake-Authorization-Token-Type':'KEYPAIR_JWT','content-type':'application/json',accept:'application/json'},body:body===undefined?'':JSON.stringify(body)})
 }
 async function requestId(key:string){const value=await sha(key);value[6]=(value[6]!&15)|64;value[8]=(value[8]!&63)|128;const encoded=hex(value.slice(0,16));return `${encoded.slice(0,8)}-${encoded.slice(8,12)}-${encoded.slice(12,16)}-${encoded.slice(16,20)}-${encoded.slice(20)}`}
 async function execute(statement:string,key:string,bindings?:Record<string,{type:'TEXT';value:string}>,reconcile=false):Promise<SqlResult>{
  const id=await requestId(key+'\n'+statement),body={statement,timeout:10,database:config.database,schema:config.schema,...config.warehouse?{warehouse:config.warehouse}:{},...config.role?{role:config.role}:{},...bindings?{bindings}:{}}
  let response
  try{response=await request('POST',`/api/v2/statements?requestId=${id}${reconcile?'&retry=true':''}`,body)}
  catch{response=await request('POST',`/api/v2/statements?requestId=${id}&retry=true`,body)}
  if(response.status>=500)response=await request('POST',`/api/v2/statements?requestId=${id}&retry=true`,body)
  for(let attempt=0;attempt<12;attempt++){
   let result:SqlResult
   try{result=JSON.parse(response.body)}catch{throw new AuthorityError('provider_unavailable','Snowflake SQL acknowledgement is uncertain; exported-copy custody is unconfirmed.',503)}
   if(response.status===200&&result.code==='090001'&&Array.isArray(result.data))return result
   if(response.status!==202||!result.statementHandle||!/^[A-Za-z0-9_-]{1,200}$/.test(result.statementHandle))throw new AuthorityError('provider_unavailable',`Snowflake SQL was not confirmed (${response.status}); exported-copy custody is unconfirmed.`,503)
   await new Promise(resolve=>setTimeout(resolve,500))
   response=await request('GET','/api/v2/statements/'+encodeURIComponent(result.statementHandle))
  }
  throw new AuthorityError('provider_unavailable','Snowflake statement is still running; exported-copy custody is unconfirmed.',503)
 }
 async function shape(meta:WarehouseObjectMeta){
  if(!['csv','parquet'].includes(meta.format)||meta.columnTypes.some(type=>!['STRING','DOUBLE','BOOLEAN'].includes(type))||meta.headers.length!==meta.columnTypes.length||new Set(meta.headers).size!==meta.headers.length||meta.headers[0]!=='_record_id'||meta.headers[1]!=='_operation')throw new AuthorityError('provider_unavailable','Snowflake export columns conflict with export custody metadata.',503)
  if(!/^[a-f0-9]{64}$/.test(meta.schemaHash))throw new AuthorityError('provider_unavailable','Snowflake export schema hash is invalid.',503)
  let provenance=provenanceBase
  for(let suffix=1;meta.headers.includes(provenance);suffix++)provenance=provenanceBase+'_'+suffix
  const suffix=hex(await sha(meta.sourceTable)).slice(0,16)+'_'+meta.schemaHash.slice(0,12)
  return {provenance,table:[config.database,config.schema,config.tablePrefix+'_'+suffix].map(identifier).join('.'),stage:'@'+config.stage.split('.').map(identifier).join('.')}
 }
 async function verifyStage(stage:string,key:string){
  const result=await execute(`DESCRIBE STAGE ${stage.slice(1)}`,key+':stage:'+crypto.randomUUID())
  const names=(result.resultSetMetaData?.rowType??[]).map(column=>column.name.toLowerCase()),property=names.indexOf('property'),value=names.indexOf('property_value'),parent=names.indexOf('parent_property')
  const locations=property<0||value<0?[]:(result.data??[]).filter(row=>String(row[property]).toUpperCase()==='URL'&&(parent<0||String(row[parent]).toUpperCase()==='STAGE_LOCATION')).map(row=>row[value])
  if(locations.length!==1||typeof locations[0]!=='string')throw new AuthorityError('provider_unavailable','Snowflake stage location metadata is unavailable; no COPY was authorized.',503)
  let raw=locations[0],location:URL
  try{
   if(raw.startsWith('[')){const parsed:unknown=JSON.parse(raw);if(!Array.isArray(parsed)||parsed.length!==1||typeof parsed[0]!=='string')throw new Error();raw=parsed[0]}
   location=new URL(raw)
  }catch{throw new AuthorityError('provider_unavailable','Snowflake stage location metadata is invalid; no COPY was authorized.',503)}
  const target=config.stageStorage,endpoint=new URL(target.endpoint),prefix=target.prefix.replace(/^\/+|\/+$/g,''),path=(value:string)=>decodeURIComponent(value).replace(/\/+$/,'')
  let matches=false
  if(!location.username&&!location.password&&!location.search&&!location.hash&&endpoint.protocol==='https:'){
   if(location.protocol==='s3compat:')matches=location.host.toLowerCase()===endpoint.host.toLowerCase()&&path(location.pathname)==='/'+target.bucket+(prefix?'/'+prefix:'')
   else if(location.protocol==='s3:'){
    const suffix=target.region.startsWith('cn-')?'amazonaws.com.cn':'amazonaws.com'
    const aws=new Set([`s3.${target.region}.${suffix}`,`s3-${target.region}.${suffix}`,...target.region==='us-east-1'?['s3.amazonaws.com']:[]])
    matches=aws.has(endpoint.host.toLowerCase())&&location.hostname===target.bucket&&path(location.pathname)===(prefix?'/'+prefix:'')
   }
  }
  if(!matches)throw new AuthorityError('provider_unavailable','Snowflake stage URL, bucket, prefix or endpoint differs from the configured S3 storage; no COPY was authorized.',503)
 }
 async function copy(key:string,meta:WarehouseObjectMeta,reconcile=false){
  const {table,stage,provenance}=await shape(meta),columns=meta.headers.map(identifier),types=meta.columnTypes
  await verifyStage(stage,key)
  await execute(`CREATE TABLE IF NOT EXISTS ${table} (${columns.map((column,i)=>column+' '+types[i]).join(',')},${identifier(provenance)} STRING NOT NULL)`,key+':create:'+crypto.randomUUID())
  const select=meta.headers.map((header,i)=>meta.format==='parquet'?`GET($1,${literal(header)})::${types[i]}`:types[i]==='STRING'?`$${i+1}::STRING`:`NULLIF($${i+1},'')::${types[i]}`)
  const format=meta.format==='parquet'?"TYPE=PARQUET":"TYPE=CSV SKIP_HEADER=1 FIELD_OPTIONALLY_ENCLOSED_BY='\"' EMPTY_FIELD_AS_NULL=FALSE NULL_IF=()"
  const sql=`COPY INTO ${table} (${[...columns,identifier(provenance)].join(',')}) FROM (SELECT ${[...select,literal(key)].join(',')} FROM ${stage}) FILES=(${literal(key)}) FILE_FORMAT=(${format}) ON_ERROR='ABORT_STATEMENT' FORCE=FALSE PURGE=FALSE`
  await execute(sql,key+':copy',undefined,reconcile)
  if(!reconcile){
   const read=await execute(`SELECT COUNT(*) AS "count" FROM ${table} WHERE ${identifier(provenance)}=:1`,key+':read:'+crypto.randomUUID(),{1:{type:'TEXT',value:key}})
   if(String(read.data?.[0]?.[0])!==String(meta.recordIds.length))throw new AuthorityError('provider_unavailable','Snowflake imported-row readback differs; export watermark remains unconfirmed.',503)
  }
  return table
 }
 return {
  async prepare(key,meta){const {stage}=await shape(meta);await verifyStage(stage,key)},
  async write(key,_body,meta){await copy(key,meta)},
  async erase(key,meta){
   // Fence any in-flight or lost-acknowledgement COPY before issuing deletion.
   // The same request id reconciles the original statement; FORCE=FALSE also
   // preserves Snowflake's file-load deduplication if its request cache expired.
   const table=await copy(key,meta,true),ids=[...new Set(meta.recordIds)]
   // Bounded SQL bindings also cover older custody files larger than today's
   // row-partitioned exports. Each batch is independently read back before the
   // next; interruption safely repeats idempotent deletions without dropping IDs.
   for(let offset=0;offset<ids.length;offset+=1000){
    const batch=ids.slice(offset,offset+1000)
    const bindings=Object.fromEntries(batch.map((value,index)=>[String(index+1),{type:'TEXT' as const,value}]))
    const where=identifier('_record_id')+' IN ('+batch.map((_,index)=>':'+(index+1)).join(',')+')'
    await execute(`DELETE FROM ${table} WHERE ${where}`,key+':erase:'+crypto.randomUUID(),bindings)
    const remaining=await execute(`SELECT COUNT(*) AS "count" FROM ${table} WHERE ${where}`,key+':erase-read:'+crypto.randomUUID(),bindings)
    if(String(remaining.data?.[0]?.[0])!=='0')throw new AuthorityError('provider_unavailable','Snowflake still contains exported record copies; erasure confirmation refused.',503)
   }
  },
 }
}

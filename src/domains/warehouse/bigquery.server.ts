import type {PlatformBindings} from '../../core/platform/bindings'
import type {WarehouseObjectMeta,WarehouseRemoteDestination} from './provider-contracts'
import {RelayTransport} from '../integrations/relay-transport.server'
import {warehouseTransfers} from './transfers.server'
import {AuthorityError} from '../authority/errors'

export type BigQueryConfig={kind:'bigquery';project:string;dataset:string;tablePrefix:string;location:string}
export type BigQueryCredentials={clientEmail:string;privateKey:string}
type Job={jobReference?:{projectId?:string;jobId?:string;location?:string};labels?:Record<string,string>;configuration?:{load?:{destinationTable?:{projectId:string;datasetId:string;tableId:string};sourceFormat?:string};query?:{query?:string;useLegacySql?:boolean;parameterMode?:string;queryParameters?:unknown[]}};status?:{state?:string;errorResult?:unknown;errors?:unknown[]};statistics?:{load?:{outputRows?:string}}}
const bytes=(value:string)=>new TextEncoder().encode(value)
function base64(value:Uint8Array){let output='';for(let i=0;i<value.length;i+=8192)output+=String.fromCharCode(...value.subarray(i,i+8192));return btoa(output)}
const url64=(value:Uint8Array)=>base64(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
async function hash(value:Uint8Array<ArrayBuffer>){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),n=>n.toString(16).padStart(2,'0')).join('')}
function unavailable(cause:string):never{throw new AuthorityError('provider_unavailable','BigQuery '+cause+'; export custody is unconfirmed.',503)}
function json(value:string):Record<string,any>{try{const parsed=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed}catch{return unavailable('returned an invalid response')}}
function safeConfig(config:BigQueryConfig){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(config.project)||!/^[A-Za-z_][A-Za-z0-9_]{0,1023}$/.test(config.dataset)||!/^[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(config.tablePrefix)||!/^[A-Za-z0-9-]{1,100}$/.test(config.location))throw new AuthorityError('validation','BigQuery requires a valid project, dataset, table prefix and location.',400)
}
/** BigQuery's documented flexible column-name set, preserved byte-for-byte.
 * https://cloud.google.com/bigquery/docs/schemas#flexible-column-names
 * STRICT deliberately refuses unsupported labels rather than renaming them. */
export function validateBigQueryColumns(meta:WarehouseObjectMeta){
 if(meta.headers.length!==meta.columnTypes.length||meta.headers[0]!=='_record_id'||meta.headers[1]!=='_operation'||!meta.sourceTable||!/^[a-f0-9]{64}$/.test(meta.schemaHash))throw new AuthorityError('validation','BigQuery export column metadata is inconsistent.',400)
 const names=new Set<string>()
 for(const label of meta.headers){
  if(!label||Array.from(label).length>300||!/^[\p{L}\p{N}\p{Pc}\p{Pd}\p{M}&%=+:'<>#|\s]+$/u.test(label)||/^(?:_TABLE_|_FILE_|_PARTITION|_ROW_TIMESTAMP|__ROOT__|_COLIDENTIFIER|_CHANGE_SEQUENCE_NUMBER|_CHANGE_TYPE|_CHANGE_TIMESTAMP)/i.test(label))throw new AuthorityError('validation',`BigQuery cannot preserve field label ${JSON.stringify(label)}. Use a supported flexible column name before exporting; no file was sent.`,400)
  const folded=label.toLowerCase()
  if(names.has(folded))throw new AuthorityError('validation',`BigQuery field label ${JSON.stringify(label)} duplicates another label without regard to case; no file was sent.`,400)
  names.add(folded)
 }
 if(meta.columnTypes.some(type=>!['STRING','DOUBLE','BOOLEAN'].includes(type)))throw new AuthorityError('validation','BigQuery export contains an unsupported column type.',400)
}
/** The table identity isolates both source base/table and schema revision. */
export async function bigQueryTable(config:BigQueryConfig,meta:WarehouseObjectMeta){return config.tablePrefix+(await hash(bytes(meta.sourceTable))).slice(0,16)+'_'+meta.schemaHash.slice(0,12)}

/** Multipart load jobs append the exact exported file. Deterministic job IDs are
 * the custody/reconciliation key; a lost acknowledgement never causes a new job. */
export function createBigQueryDestination(env:PlatformBindings,config:BigQueryConfig,credentials:BigQueryCredentials):WarehouseRemoteDestination{
 safeConfig(config)
 if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new AuthorityError('unconfigured','Trusted egress relay is required for BigQuery exports.',503)
 const transfers=warehouseTransfers(env),relay=new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET),project=encodeURIComponent(config.project)
 const jobs=`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/jobs`
 const location='?location='+encodeURIComponent(config.location)
 const prepared=new Map<string,{access:string;job:Job|null;metadata:string;expiresAt:number}>()
 async function token(){
  if(!/^[^\s@]+@[^\s@]+$/.test(credentials.clientEmail))throw new AuthorityError('validation','BigQuery service-account client email is invalid.',400)
  let key:CryptoKey
  try{
   const pem=credentials.privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')
   key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),char=>char.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign'])
  }catch{throw new AuthorityError('validation','BigQuery requires an unencrypted PKCS8 service-account private key.',400)}
  const now=Math.floor(Date.now()/1000),unsigned=url64(bytes(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+url64(bytes(JSON.stringify({iss:credentials.clientEmail,scope:'https://www.googleapis.com/auth/bigquery',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})))
  const assertion=unsigned+'.'+url64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,bytes(unsigned))))
  const response=await relay.send({url:'https://oauth2.googleapis.com/token',method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString()})
  if(response.status!==200)return unavailable('service-account authorization was refused')
  const result=json(response.body)
  if(typeof result.access_token!=='string'||!result.access_token||result.access_token.length>16384||/[\r\n\0]/.test(result.access_token))return unavailable('authorization returned no usable access token')
  return result.access_token as string
 }
 async function request(access:string,url:string,body?:string|Uint8Array<ArrayBuffer>,contentType='application/json',method?:'PUT',extra:Record<string,string>={}){
  // Job receipts can contain all 500 exported field definitions. Use the
  // existing bounded binary envelope for both directions rather than the
  // smaller legacy notification response limit, including empty-body GETs.
  const payload=body===undefined?new Uint8Array():typeof body==='string'?bytes(body):body
  const response=await relay.send({url,method:method??(body===undefined?'GET':'POST'),headers:{...extra,authorization:'Bearer '+access,...(body===undefined?{}:{'content-type':contentType})},body:base64(payload),bodyEncoding:'base64'})
  try{return {...response,body:new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(response.body),char=>char.charCodeAt(0)))}}catch{return unavailable('returned an invalid response encoding')}
 }
 async function lookup(access:string,id:string){
  const response=await request(access,jobs+'/'+encodeURIComponent(id)+location)
  if(response.status===404)return null
  if(response.status!==200)return unavailable('job reconciliation was refused')
  const job=json(response.body) as Job
  if(job.jobReference?.jobId!==id||job.jobReference.projectId!==config.project||job.jobReference.location?.toLowerCase()!==config.location.toLowerCase())return unavailable('job identity or location changed')
  return job
 }
 async function completed(access:string,id:string,initial?:Job|null){
  let job=initial??await lookup(access,id)
  // Bounded observation only. Pending/unknown work remains in durable custody,
  // and subsequent calls reconcile this same job rather than inventing another.
  for(let attempt=0;job&&job.status?.state!=='DONE'&&attempt<4;attempt++){
   await new Promise(resolve=>setTimeout(resolve,250))
   job=await lookup(access,id)
  }
  if(!job||job.status?.state!=='DONE')return unavailable('job is pending or its outcome is unknown')
  return job
 }
 function assertSuccess(job:Job){if(job.status?.errorResult||job.status?.errors?.length)return unavailable('job failed')}
 async function jobId(operation:string,key:string){return 'cradle_'+operation+'_'+await hash(bytes(key))}
 async function query(access:string,id:string,sql:string,ids:string[]){
  let job=await lookup(access,id)
  if(!job){
   const response=await request(access,jobs,JSON.stringify({jobReference:{projectId:config.project,jobId:id,location:config.location},configuration:{query:{query:sql,useLegacySql:false,parameterMode:'NAMED',queryParameters:[{name:'ids',parameterType:{type:'ARRAY',arrayType:{type:'STRING'}},parameterValue:{arrayValues:ids.map(value=>({value}))}}]}}}))
   if(response.status!==200&&response.status!==201&&response.status!==409)return unavailable('erasure job acknowledgement is unknown or refused')
   job=await lookup(access,id)
  }
  const done=await completed(access,id,job);assertSuccess(done)
  const found=done.configuration?.query,parameters=[{name:'ids',parameterType:{type:'ARRAY',arrayType:{type:'STRING'}},parameterValue:{arrayValues:ids.map(value=>({value}))}}]
  if(found?.query!==sql||found.useLegacySql!==false||found.parameterMode!=='NAMED'||JSON.stringify(found.queryParameters)!==JSON.stringify(parameters))return unavailable('erasure job receipt does not match its record custody')
  return done
 }
 async function prepare(key:string,meta:WarehouseObjectMeta){
  validateBigQueryColumns(meta)
  // These are read-only provider operations. The caller records its dispatch
  // marker only after preflight succeeds, so invalid keys or refused OAuth/job
  // lookups cannot strand a never-sent file as an ambiguous remote upload.
  const access=await token(),job=await lookup(access,await jobId('load',key))
  prepared.set(key,{access,job,metadata:JSON.stringify(meta),expiresAt:Date.now()+30000})
 }
 return {
  prepare,
  async write(key,body,meta){
   validateBigQueryColumns(meta)
   let ready=prepared.get(key)
   if(!ready||ready.expiresAt<Date.now()||ready.metadata!==JSON.stringify(meta)){await prepare(key,meta);ready=prepared.get(key)!}
   prepared.delete(key)
   const access=ready.access,id=await jobId('load',key),tableId=await bigQueryTable(config,meta),digest=(await hash(body)).slice(0,63)
   let job=ready.job
   if(!job){
    const boundary='cradle_'+(await hash(bytes(key))).slice(0,32)
    const metadata={jobReference:{projectId:config.project,jobId:id,location:config.location},labels:{cradle_content:digest},configuration:{load:{destinationTable:{projectId:config.project,datasetId:config.dataset,tableId},sourceFormat:meta.format==='parquet'?'PARQUET':'CSV',writeDisposition:'WRITE_APPEND',createDisposition:'CREATE_IF_NEEDED',columnNameCharacterMap:'STRICT',schema:{fields:meta.headers.map((name,index)=>({name,type:meta.columnTypes[index]==='DOUBLE'?'FLOAT':meta.columnTypes[index]==='BOOLEAN'?'BOOLEAN':'STRING',mode:'NULLABLE'}))},...(meta.format==='csv'?{skipLeadingRows:1,allowQuotedNewlines:true,encoding:'UTF-8',fieldDelimiter:',',quote:'"'}:{})}}}
    try{
     if(body.length>900000){
      const retained=await transfers.get('bigquery',key)
      if(retained&&retained.sha256!==await hash(body))return unavailable('interrupted upload source changed')
      const started=retained?null:await request(access,`https://bigquery.googleapis.com/upload/bigquery/v2/projects/${project}/jobs?uploadType=resumable`,JSON.stringify(metadata))
      if(started?.status===409){job=await lookup(access,id)}else{
       const session=retained?.uploadId??started!.headers.location
       let url:URL
       try{url=new URL(session)}catch{return unavailable('resumable upload returned no session')}
       if(started&&started.status!==200||url.protocol!=='https:'||url.hostname!=='bigquery.googleapis.com'||url.port&&url.port!=='443'||url.username||url.password||url.hash)return unavailable('resumable upload returned an invalid session')
       if(!retained)await transfers.set('bigquery',key,{uploadId:url.href,sha256:await hash(body)})
       const chunkSize=786432
       let offset=0,interruptions=0
       if(retained){
        const prefix=await request(access,url.href,new Uint8Array(),'application/octet-stream','PUT',{'content-range':`bytes */${body.length}`})
        if(prefix.status===200||prefix.status===201){offset=body.length}else{
         const range=/^bytes=0-(\d+)$/.exec(prefix.headers.range??'');offset=range?Number(range[1])+1:0
         if(prefix.status!==308||offset>body.length||offset!==body.length&&offset%262144!==0)return unavailable('retained resumable prefix is inconsistent')
        }
       }
       while(offset<body.length){
        const end=Math.min(offset+chunkSize,body.length)
        let response
        try{response=await request(access,url.href,body.slice(offset,end),'application/octet-stream','PUT',{'content-range':`bytes ${offset}-${end-1}/${body.length}`})}
        catch{
         if(++interruptions>2)return unavailable('resumable upload was interrupted repeatedly')
         // Read the existing session's committed prefix. Never invent another
         // append job or assume a disconnected part was not accepted.
         response=await request(access,url.href,new Uint8Array(),'application/octet-stream','PUT',{'content-range':`bytes */${body.length}`})
         if(response.status===200||response.status===201){offset=body.length;break}
         const prefix=/^bytes=0-(\d+)$/.exec(response.headers.range??'')
         const accepted=prefix?Number(prefix[1])+1:0
         if(response.status!==308||accepted<offset||accepted>end||accepted!==body.length&&accepted%262144!==0)return unavailable('resumable prefix readback is inconsistent')
         offset=accepted;continue
        }
        if(end<body.length){if(response.status!==308||response.headers.range!==`bytes=0-${end-1}`)return unavailable('resumable part acknowledgement is unknown or refused')}
        else if(response.status!==200&&response.status!==201&&response.status!==409)return unavailable('resumable completion acknowledgement is unknown or refused')
        offset=end
       }
      }
     }else{
      const start=bytes(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${meta.format==='parquet'?'application/vnd.apache.parquet':'text/csv'}\r\n\r\n`),end=bytes(`\r\n--${boundary}--\r\n`),multipart=new Uint8Array(start.length+body.length+end.length)
      multipart.set(start);multipart.set(body,start.length);multipart.set(end,start.length+body.length)
      const response=await request(access,`https://bigquery.googleapis.com/upload/bigquery/v2/projects/${project}/jobs?uploadType=multipart`,multipart,`multipart/related; boundary=${boundary}`)
      if(response.status!==200&&response.status!==201&&response.status!==409)return unavailable('load acknowledgement is unknown or refused')
     }
    }catch{
     // A final PUT can already have created the deterministic append job.
     // Only that identity may reconcile an uncertain acknowledgement.
     const known=await lookup(access,id);if(!known)return unavailable('load acknowledgement is unknown');job=known
    }
    job=job??await lookup(access,id)
   }
   const done=await completed(access,id,job),target=done.configuration?.load?.destinationTable
   if(done.labels?.cradle_content!==digest||target?.projectId!==config.project||target.datasetId!==config.dataset||target.tableId!==tableId||done.configuration?.load?.sourceFormat!==(meta.format==='parquet'?'PARQUET':'CSV'))return unavailable('load receipt does not match the exact exported file and destination')
   assertSuccess(done)
   if(done.statistics?.load?.outputRows!==String(meta.recordIds.length))return unavailable('loaded row count does not match the exported file')
   await transfers.set('bigquery',key,null)
  },
  async erase(key,meta){
   const access=await token(),loadId=await jobId('load',key),load=await completed(access,loadId),tableId=await bigQueryTable(config,meta),target=load.configuration?.load?.destinationTable
   // In particular, a 404 after an uncertain upload cannot mean erasure: that
   // earlier load could still arrive after a DELETE. Reconcile it to DONE first.
   if(target?.projectId!==config.project||target.datasetId!==config.dataset||target.tableId!==tableId)return unavailable('load destination does not match erasure custody')
   assertSuccess(load)
   const table='`'+config.project+'.'+config.dataset+'.'+tableId+'`'
   // A tiny-row file can carry more IDs than one bounded API envelope can
   // hold. Every ID participates in one deterministic DELETE and independent
   // COUNT readback; retries reconcile the same exact batches. Even an empty
   // export performs a readback rather than assuming a missing result is zero.
   let offset=0
   do{
    const ids=meta.recordIds.slice(offset,offset+1000),batchKey=key+':'+offset+':'+await hash(bytes(JSON.stringify(ids)))
    await query(access,await jobId('erase',batchKey),`DELETE FROM ${table} WHERE _record_id IN UNNEST(@ids)`,ids)
    const countId=await jobId('count',batchKey)
    await query(access,countId,`SELECT COUNT(*) AS remaining FROM ${table} WHERE _record_id IN UNNEST(@ids)`,ids)
    const response=await request(access,`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries/${countId}${location}`)
    if(response.status!==200)return unavailable('erasure readback was refused')
    const result=json(response.body)
    if(result.jobComplete!==true||result.totalRows!=='1'||result.rows?.length!==1||result.rows[0]?.f?.[0]?.v!=='0')return unavailable('erasure readback still contains exported records')
    offset+=ids.length
   }while(offset<meta.recordIds.length)
  },
 }
}

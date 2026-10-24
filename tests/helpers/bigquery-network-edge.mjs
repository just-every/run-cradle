import assert from 'node:assert/strict'
import {createHash,generateKeyPairSync,verify} from 'node:crypto'
import {parquetReadObjects} from 'hyparquet'

/** RFC4180 reader independent of the product's export encoder. */
function csvRows(buffer){
 const text=buffer.toString('utf8'),rows=[];let row=[],field='',quoted=false
 for(let i=0;i<text.length;i++){
  const char=text[i]
  if(quoted){if(char==='"'){if(text[i+1]==='"'){field+='"';i++}else quoted=false}else field+=char;continue}
  if(char==='"'){assert.equal(field,'');quoted=true}
  else if(char===','){row.push(field);field=''}
  else if(char==='\n'){row.push(field.endsWith('\r')?field.slice(0,-1):field);rows.push(row);row=[];field=''}
  else field+=char
 }
 assert.equal(quoted,false,'CSV quotes are balanced')
 if(field||row.length){row.push(field.endsWith('\r')?field.slice(0,-1):field);rows.push(row)}
 return {headers:rows.shift()??[],rows}
}
function multipart(body,contentType){
 const boundary=/boundary=([^;]+)/.exec(contentType)?.[1];assert.ok(boundary,'The load has a MIME boundary')
 const delimiter=Buffer.from('\r\n--'+boundary),first=body.indexOf('\r\n\r\n'),middle=body.indexOf(delimiter,first+4)
 assert.ok(first>=0&&middle>first,'Load metadata is a MIME part')
 const metadata=JSON.parse(body.subarray(first+4,middle).toString('utf8'))
 const mediaStart=body.indexOf('\r\n\r\n',middle+delimiter.length)+4,mediaEnd=body.indexOf(delimiter,mediaStart)
 assert.ok(mediaStart>3&&mediaEnd>=mediaStart,'The exact file is a second MIME part')
 return {metadata,media:body.subarray(mediaStart,mediaEnd)}
}
function scalar(value,type){
 if(value===''||value===null||value===undefined)return null
 if(type==='FLOAT'){const number=Number(value);assert.ok(Number.isFinite(number));return number}
 if(type==='BOOLEAN'){if(typeof value==='boolean')return value;assert.match(String(value),/^(?:true|false|yes|no|1|0)$/i);return /^(?:true|yes|1)$/i.test(String(value))}
 return String(value)
}

/** Real HTTP/TLS edge receiver for the warehouse matrix. Authentication, media
 * parsing, row storage and DELETE/COUNT readback are independent of app code. */
export async function bigQueryNetworkEdge(){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}})
 const access={clientEmail:'synthetic-cradle-121@example.invalid',privateKey},destination={kind:'bigquery',project:'synthetic-cradle-121',dataset:'synthetic_cradle_121',tablePrefix:'synthetic_cradle_',location:'US'}
 const tokens=new Set(),jobs=new Map(),tables=new Map(),uploads=[],calls=[],sessions=new Map();let denied=false,pending=false,loseAcknowledgement=false,losePart=false
 const hash=value=>createHash('sha256').update(value).digest('hex')
 function send(res,status,value){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))}
 async function acceptLoad(req,res,metadata,media){
   const jobId=metadata.jobReference.jobId,load=metadata.configuration.load
   if(jobs.has(jobId)){send(res,409,{error:{code:409}});return true}
   assert.equal(metadata.jobReference.projectId,destination.project);assert.equal(metadata.jobReference.location,destination.location)
   assert.equal(load.destinationTable.projectId,destination.project);assert.equal(load.destinationTable.datasetId,destination.dataset)
   assert.match(load.destinationTable.tableId,/^synthetic_cradle_[a-f0-9]{16}_[a-f0-9]{12}$/)
   assert.equal(load.writeDisposition,'WRITE_APPEND');assert.equal(load.createDisposition,'CREATE_IF_NEEDED')
   assert.equal(metadata.labels.cradle_content,hash(media).slice(0,63),'Load custody binds the exact transmitted media bytes')
   const fields=load.schema.fields,headers=fields.map(field=>field.name);let records
   // BigQuery's independent schema edge rejects unsupported names instead of
   // accepting a made-up provider capability or silently normalizing labels.
   const folded=new Set()
   for(const name of headers){
    assert.ok(name.length>0&&Array.from(name).length<=300&&/^[\p{L}\p{N}\p{Pc}\p{Pd}\p{M}&%=+:'<>#|\s]+$/u.test(name),'BigQuery accepts only documented flexible column-name characters')
    assert.ok(!/^(?:_TABLE_|_FILE_|_PARTITION|_ROW_TIMESTAMP|__ROOT__|_COLIDENTIFIER|_CHANGE_SEQUENCE_NUMBER|_CHANGE_TYPE|_CHANGE_TIMESTAMP)/i.test(name),'BigQuery rejects reserved column prefixes')
    assert.ok(!folded.has(name.toLowerCase()),'BigQuery column names are unique without regard to case');folded.add(name.toLowerCase())
   }
   if(load.sourceFormat==='CSV'){
    assert.equal(load.skipLeadingRows,1);assert.equal(load.allowQuotedNewlines,true);assert.equal(load.encoding,'UTF-8')
    const parsed=csvRows(media);assert.deepEqual(parsed.headers,headers)
    records=parsed.rows.map(row=>{assert.equal(row.length,headers.length);return Object.fromEntries(fields.map((field,index)=>[field.name,scalar(row[index],field.type)]))})
   }else{
    assert.equal(load.sourceFormat,'PARQUET')
    const file=media.buffer.slice(media.byteOffset,media.byteOffset+media.byteLength),decoded=await parquetReadObjects({file})
    records=decoded.map(row=>{assert.deepEqual(Object.keys(row),headers);return Object.fromEntries(fields.map(field=>[field.name,scalar(row[field.name],field.type)]))})
   }
   assert.equal(headers[0],'_record_id');assert.equal(headers[1],'_operation')
   const upload={jobId,tableId:load.destinationTable.tableId,format:load.sourceFormat.toLowerCase(),bytes:Buffer.from(media),headers,rows:records,applied:false}
   uploads.push(upload)
   const job={...metadata,status:{state:pending?'RUNNING':'DONE'},statistics:{load:{outputRows:String(records.length)}}}
   jobs.set(jobId,{job,upload})
   if(!pending){tables.set(upload.tableId,[...(tables.get(upload.tableId)??[]),...records]);upload.applied=true}
   if(loseAcknowledgement){loseAcknowledgement=false;res.destroy();return true}
   send(res,200,job);return true
 }
 async function receive(req,res,body){
  if(!['oauth2.googleapis.com','bigquery.googleapis.com'].includes(req.headers.host))return false
  const url=new URL(req.url,'https://'+req.headers.host);calls.push({host:req.headers.host,method:req.method,path:url.pathname})
  if(req.headers.host==='oauth2.googleapis.com'){
   assert.equal(req.method,'POST');assert.equal(url.pathname,'/token')
   const form=new URLSearchParams(body.toString('utf8'));assert.equal(form.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer')
   const parts=form.get('assertion').split('.');assert.equal(parts.length,3)
   const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'))
   assert.equal(header.alg,'RS256');assert.equal(header.typ,'JWT')
   assert.equal(claims.iss,access.clientEmail);assert.equal(claims.aud,'https://oauth2.googleapis.com/token');assert.equal(claims.scope,'https://www.googleapis.com/auth/bigquery')
   const now=Math.floor(Date.now()/1000);assert.ok(Math.abs(claims.iat-now)<60&&claims.exp>now&&claims.exp-claims.iat<=3600)
   assert.ok(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),publicKey,Buffer.from(parts[2],'base64url')),'OAuth verifies the service-account JWT with the independent public key')
   const token='synthetic-cradle-121-access-'+(tokens.size+1);tokens.add(token);send(res,200,{access_token:token,token_type:'Bearer',expires_in:3600});return true
  }
  assert.ok(tokens.has((req.headers.authorization??'').replace(/^Bearer /,'')),'BigQuery requires the OAuth-issued access token')
  const project='/projects/'+destination.project
  assert.ok(url.pathname.includes(project),'All work remains in the configured buyer project')
  if(req.method==='POST'&&url.pathname.startsWith('/upload/')){
   if(url.searchParams.get('uploadType')==='resumable'){
    const metadata=JSON.parse(body.toString('utf8')),id=metadata.jobReference.jobId
    if(jobs.has(id)){send(res,409,{error:{code:409}});return true}
    const session='synthetic-cradle-session-'+sessions.size;sessions.set(session,{metadata,parts:[],offset:0});res.writeHead(200,{location:`https://bigquery.googleapis.com/upload/bigquery/v2/projects/${destination.project}/jobs?upload_id=${session}`});res.end('{}');return true
   }
   assert.equal(url.searchParams.get('uploadType'),'multipart')
   const {metadata,media}=multipart(body,req.headers['content-type']);return acceptLoad(req,res,metadata,media)
  }
  if(req.method==='PUT'&&url.pathname.startsWith('/upload/')){
   const session=sessions.get(url.searchParams.get('upload_id'));assert.ok(session)
   if(req.headers['content-range']?.startsWith('bytes */')){assert.equal(body.length,0);res.writeHead(308,session.offset?{range:`bytes=0-${session.offset-1}`}:{ });res.end('{}');return true}
   const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(req.headers['content-range']??'');assert.ok(match)
   const start=Number(match[1]),end=Number(match[2]),total=Number(match[3]);assert.equal(start,session.offset);assert.equal(end-start+1,body.length)
   if(end+1<total)assert.equal(body.length%262144,0,'Non-final BigQuery chunks are a multiple of 256 KiB')
   session.parts.push(body);session.offset=end+1
   if(session.offset<total){if(losePart){losePart=false;res.destroy();return true}res.writeHead(308,{range:`bytes=0-${end}`});res.end('{}');return true}
   assert.equal(session.offset,total);sessions.delete(url.searchParams.get('upload_id'));return acceptLoad(req,res,session.metadata,Buffer.concat(session.parts))
  }
  const jobMatch=/\/jobs\/([^/]+)$/.exec(url.pathname)
  if(jobMatch&&req.method==='GET'){
   const stored=jobs.get(decodeURIComponent(jobMatch[1]))
   if(!stored){send(res,404,{error:{code:404}});return true}
   assert.equal(url.searchParams.get('location'),destination.location)
   if(!pending&&stored.upload&&!stored.upload.applied){const upload=stored.upload;tables.set(upload.tableId,[...(tables.get(upload.tableId)??[]),...upload.rows]);upload.applied=true;stored.job.status={state:'DONE'}}
   send(res,200,stored.job);return true
  }
  if(req.method==='POST'&&url.pathname.endsWith('/jobs')){
   const metadata=JSON.parse(body.toString('utf8')),id=metadata.jobReference.jobId
   if(jobs.has(id)){send(res,409,{error:{code:409}});return true}
   assert.equal(metadata.jobReference.location,destination.location)
   const query=metadata.configuration.query;assert.equal(query.useLegacySql,false);assert.equal(query.parameterMode,'NAMED')
   const parameter=query.queryParameters[0];assert.equal(parameter.name,'ids');assert.deepEqual(parameter.parameterType,{type:'ARRAY',arrayType:{type:'STRING'}})
   const ids=new Set(parameter.parameterValue.arrayValues.map(item=>item.value)),match=/^(DELETE FROM|SELECT COUNT\(\*\) AS remaining FROM) `([^`]+)` WHERE _record_id IN UNNEST\(@ids\)$/.exec(query.query)
   assert.ok(match,'Only parameterized record erasure and independent count queries are accepted')
   const [configuredProject,dataset,tableId]=match[2].split('.');assert.equal(configuredProject,destination.project);assert.equal(dataset,destination.dataset)
   if(match[1]==='DELETE FROM'&&denied){send(res,403,{error:{code:403}});return true}
   const remaining=(tables.get(tableId)??[]).filter(row=>!ids.has(row._record_id))
   if(match[1]==='DELETE FROM')tables.set(tableId,remaining)
   const count=(tables.get(tableId)??[]).filter(row=>ids.has(row._record_id)).length
   const job={...metadata,status:{state:'DONE'}};jobs.set(id,{job,...(match[1].startsWith('SELECT')?{result:{jobComplete:true,totalRows:'1',schema:{fields:[{name:'remaining',type:'INTEGER'}]},rows:[{f:[{v:String(count)}]}]}}:{})})
   send(res,200,job);return true
  }
  const resultMatch=/\/queries\/([^/]+)$/.exec(url.pathname)
  if(resultMatch&&req.method==='GET'){
   const stored=jobs.get(decodeURIComponent(resultMatch[1]));send(res,stored?.result?200:404,stored?.result??{error:{code:404}});return true
  }
  send(res,404,{error:{code:404}});return true
 }
 return {hosts:['oauth2.googleapis.com','bigquery.googleapis.com'],destination,access,receive,tables,jobs,uploads,calls,
  refuseDelete(value){denied=value},pendingLoads(value){pending=value},loseNextAcknowledgement(){loseAcknowledgement=true},loseNextPart(){losePart=true},
  assertEmpty(){for(const rows of tables.values())assert.equal(rows.length,0,'BigQuery has no exported record copies after confirmed erasure')},
 }
}

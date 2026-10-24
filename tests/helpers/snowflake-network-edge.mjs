import assert from 'node:assert/strict'
import {createHash,generateKeyPairSync,verify} from 'node:crypto'
import {parquetReadObjects} from 'hyparquet'

const quote=value=>'"'+value.replace(/"/g,'""')+'"'
const literal=value=>"'"+value.replace(/'/g,"''")+"'"
const unliteral=value=>value.slice(1,-1).replace(/''/g,"'")
const headersFrom=sql=>[...sql.matchAll(/"((?:[^"]|"")*)"/g)].map(match=>match[1].replace(/""/g,'"'))

/** Provider CSV decoding is independent of Cradle's import parser and its
 * interactive-import row budget. Snowflake accepts complete larger files. */
function readCsv(body){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(body),rows=[]
 let row=[],field='',quoted=false,closed=false
 function cell(){row.push(field);field='';closed=false}
 function record(){cell();rows.push(row);row=[]}
 for(let index=0;index<text.length;index++){
  const char=text[index]
  if(quoted){
   if(char==='"'){if(text[index+1]==='"'){field+='"';index++}else{quoted=false;closed=true}}
   else field+=char
  }else if(char==='"'){assert.equal(field,'','A quoted CSV field starts at its boundary');assert.equal(closed,false);quoted=true}
  else if(char===',')cell()
  else if(char==='\r'||char==='\n'){if(char==='\r'&&text[index+1]==='\n')index++;record()}
  else{assert.equal(closed,false,'Only a delimiter follows a quoted CSV field');field+=char}
 }
 assert.equal(quoted,false,'CSV quoted fields terminate')
 if(field!==''||row.length||closed)record()
 const headers=rows.shift();assert.ok(headers?.length)
 assert.ok(rows.every(values=>values.length===headers.length),'CSV records preserve every column')
 return {headers,rows}
}

/** Snowflake is an actual HTTP/TLS edge of automationNetworkEdge. JWTs are
 * verified with a separately generated public key; table rows come from the
 * staged bytes, read by CSV and Parquet readers independent of the writer. */
export async function snowflakeNetworkEdge({s3Objects,s3Access,stageStorage}){
 const account='synthetic-cradle-110',user='SYNTHETIC_CRADLE_110',host=account+'.snowflakecomputing.com'
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
 const fingerprint=createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('base64')
 const destination={kind:'snowflake',account,user,database:'SYNTHETIC_CRADLE',schema:'ANALYSIS',tablePrefix:'SYNTHETIC_CRADLE_110',stage:'SYNTHETIC_CRADLE.ANALYSIS.SYNTHETIC_CRADLE_STAGE',stageStorage,warehouse:'SYNTHETIC_CRADLE_WAREHOUSE'}
 const access={privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'}).toString(),...s3Access}
 const tables=new Map(),schemas=new Map(),loaded=new Set(),requests=new Map(),handles=new Map(),calls=[],uploads=[]
 const endpoint=new URL(stageStorage.endpoint),aws=/^s3[.-].*\.amazonaws\.com(?:\.cn)?$/.test(endpoint.hostname)||endpoint.hostname==='s3.amazonaws.com'
 const correctStageLocation=(aws?'s3://'+stageStorage.bucket:'s3compat://'+endpoint.host+'/'+stageStorage.bucket)+'/'+(stageStorage.prefix?stageStorage.prefix.replace(/^\/+|\/+$/g,'')+'/':'')
 let stageLocation=correctStageLocation,refuse=false,hold=false,loseAck=false
 function jwt(req){
  assert.equal(req.headers['x-snowflake-authorization-token-type'],'KEYPAIR_JWT')
  const parts=(req.headers.authorization??'').replace(/^Bearer /,'').split('.')
  assert.equal(parts.length,3,'Snowflake receives a JWT')
  const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'))
  assert.equal(header.alg,'RS256');assert.equal(header.typ,'JWT')
  assert.equal(claims.sub,account.toUpperCase()+'.'+user)
  assert.equal(claims.iss,claims.sub+'.SHA256:'+fingerprint)
  assert.ok(Number.isInteger(claims.iat)&&Number.isInteger(claims.exp)&&claims.iat<=Date.now()/1000+5&&claims.exp>Date.now()/1000&&claims.exp-claims.iat<=60,'JWT lifetime is bounded and current')
  assert.ok(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url')),'The independently held public key verifies the JWT')
 }
 const success=(data,rowType=[])=>({code:'090001',data,resultSetMetaData:{rowType:rowType.map(name=>({name}))}})
 async function execute(body){
  const sql=body.statement
  assert.equal(body.database,destination.database);assert.equal(body.schema,destination.schema)
  assert.equal(body.warehouse,destination.warehouse);assert.equal(body.timeout,10)
  if(sql.startsWith('DESCRIBE STAGE ')){
   assert.equal(sql,'DESCRIBE STAGE '+destination.stage.split('.').map(quote).join('.'))
   return success([['STAGE_LOCATION','URL','String',JSON.stringify([stageLocation]),'']],['parent_property','property','property_type','property_value','property_default'])
  }
  if(sql.startsWith('CREATE TABLE IF NOT EXISTS ')){
   const [,table,columns]=/^CREATE TABLE IF NOT EXISTS (.*?) \((.*)\)$/.exec(sql)??[]
   assert.ok(table&&columns,'Snowflake CREATE TABLE syntax')
   const fields=[...columns.matchAll(/"((?:[^"]|"")*)" (STRING|DOUBLE|BOOLEAN)( NOT NULL)?/g)].map(match=>({name:match[1].replace(/""/g,'"'),type:match[2]}))
   assert.ok(fields.length>=3);assert.match(fields.at(-1).name,/^_cradle_export_file(?:_\d+)?$/);assert.equal(new Set(fields.map(field=>field.name)).size,fields.length,'Provider provenance never masks a source field')
   if(!tables.has(table)){tables.set(table,[]);schemas.set(table,fields)}
   else assert.deepEqual(schemas.get(table),fields,'A schema-specific destination table retains its column types')
   return success([['Table already exists or was created.']])
  }
  if(sql.startsWith('COPY INTO ')){
   const match=/^COPY INTO (.*?) \((.*?)\) FROM \(SELECT (.*) FROM (@.*?)\) FILES=\(('(?:[^']|'')*')\) FILE_FORMAT=\((.*?)\) ON_ERROR='ABORT_STATEMENT' FORCE=FALSE PURGE=FALSE$/.exec(sql)
   assert.ok(match,'Snowflake COPY uses an exact file, aborts errors, retains staged custody and preserves file deduplication')
   const [,table,columnSql,projection,stage,fileLiteral,formatSql]=match,key=unliteral(fileLiteral)
   assert.equal(stage,'@'+destination.stage.split('.').map(quote).join('.'))
   const schema=schemas.get(table);assert.ok(schema,'COPY targets an existing typed table')
   const names=headersFrom(columnSql);assert.deepEqual(names,schema.map(field=>field.name))
   const physical='/'+[stageStorage.bucket,...stageStorage.prefix?stageStorage.prefix.split('/'):[],...key.split('/')].join('/')
   const object=[...s3Objects].find(([path])=>decodeURIComponent(path)===physical)?.[1]
   assert.ok(object,'COPY reads the exact owner-stage object previously uploaded by the Worker')
   const parquet=formatSql==='TYPE=PARQUET'
   if(!parquet)assert.equal(formatSql,`TYPE=CSV SKIP_HEADER=1 FIELD_OPTIONALLY_ENCLOSED_BY='"' EMPTY_FIELD_AS_NULL=FALSE NULL_IF=()`)
   let fileHeaders,records
   if(parquet){
    const array=object.body.buffer.slice(object.body.byteOffset,object.body.byteOffset+object.body.byteLength)
    records=await parquetReadObjects({file:array});fileHeaders=records.length?Object.keys(records[0]):schema.slice(0,-1).map(field=>field.name)
   }else{
    const parsed=readCsv(object.body);fileHeaders=parsed.headers
    records=parsed.rows.map(values=>Object.fromEntries(fileHeaders.map((name,index)=>[name,values[index]])))
   }
   assert.deepEqual(fileHeaders,names.slice(0,-1),'The table projection matches every column in the independent file readback')
   uploads.push({key,bytes:Buffer.from(object.body),format:parquet?'parquet':'csv',headers:fileHeaders,rows:records.map(record=>fileHeaders.map(name=>record[name]))})
   const expected=fileHeaders.map((name,index)=>parquet?`GET($1,${literal(name)})::${schema[index].type}`:schema[index].type==='STRING'?`$${index+1}::STRING`:`NULLIF($${index+1},'')::${schema[index].type}`)
   assert.equal(projection,[...expected,literal(key)].join(','),'COPY converts each file column to its declared type and adds durable file provenance')
   const loadKey=table+'\n'+key
   if(!loaded.has(loadKey)){
    const rows=records.map(record=>Object.fromEntries([...schema.slice(0,-1).map(field=>{
     const value=record[field.name]
     if(parquet)return [field.name,value]
     if(field.type==='DOUBLE'){assert.ok(value===''||Number.isFinite(Number(value)));return [field.name,value===''?null:Number(value)]}
     if(field.type==='BOOLEAN'){assert.ok(['','Yes','No'].includes(value));return [field.name,value===''?null:value==='Yes']}
     return [field.name,value]
    }),[schema.at(-1).name,key]]))
    tables.get(table).push(...rows);loaded.add(loadKey)
   }
   return success([[key,'LOADED',records.length,records.length,0]],['file','status','rows_parsed','rows_loaded','errors_seen'])
  }
  const match=/^(SELECT COUNT\(\*\) AS "count" FROM|DELETE FROM) (.*?) WHERE (.*)$/.exec(sql)
  assert.ok(match,'Only typed CREATE/COPY, bounded DELETE and independent COUNT statements are allowed')
  const [,operation,table,where]=match,rows=tables.get(table);assert.ok(rows,'Readback targets a table populated from actual files')
  let selected
  const provenance=/^"((?:[^"]|"")*)"=:1$/.exec(where)
  if(provenance){const column=provenance[1].replace(/""/g,'"');assert.equal(column,schemas.get(table).at(-1).name);selected=row=>row[column]===body.bindings['1'].value}
  else{
   const count=/^"_record_id" IN \((:\d+(?:,:\d+)*)\)$/.exec(where);assert.ok(count,'Erasure is bounded by record IDs')
   const ids=count[1].split(',').map(binding=>body.bindings[binding.slice(1)].value)
   selected=row=>ids.includes(row._record_id)
  }
  if(operation==='DELETE FROM'){
   if(refuse)return {code:'synthetic-cradle-110-delete-refused',data:null}
   tables.set(table,rows.filter(row=>!selected(row)));return success([[rows.filter(selected).length]],['number of rows deleted'])
  }
  return success([[String(rows.filter(selected).length)]],['count'])
 }
 function respond(res,result,handle){res.writeHead(result.data===null?422:200,{'content-type':'application/json'});res.end(JSON.stringify({...result,statementHandle:handle}))}
 return {hosts:[host],destination,access,tables,schemas,calls,uploads,
  mismatchStage(value){stageLocation=value?'s3compat://synthetic-cradle-111.example.com/synthetic-cradle-wrong-bucket/wrong-prefix/':correctStageLocation},setStageLocation(value){stageLocation=value},
  refuseDelete(value){refuse=value},holdCopy(value){hold=value},loseCopyAcknowledgementOnce(value=true){loseAck=value},
  async receive(req,res,raw){
   if(req.headers.host!==host)return false
   jwt(req);const url=new URL(req.url,'https://'+host)
   if(req.method==='GET'){
    const handle=url.pathname.split('/').at(-1),entry=handles.get(handle);assert.ok(entry,'Statement polling names a known handle')
    calls.push({method:req.method,path:req.url,statement:entry.body.statement})
    if(entry.pending&&hold){res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify({statementHandle:handle}));return true}
    if(entry.pending){entry.result=await execute(entry.body);entry.pending=false}
    respond(res,entry.result,handle);return true
   }
   assert.equal(req.method,'POST');assert.equal(url.pathname,'/api/v2/statements')
   const id=url.searchParams.get('requestId');assert.match(id??'',/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/)
   const body=JSON.parse(raw.toString()),copy=body.statement.startsWith('COPY INTO ')
   calls.push({method:req.method,path:req.url,statement:body.statement,bindings:body.bindings})
   let entry=requests.get(id)
   if(entry)assert.deepEqual(entry.body,body,'A repeated Snowflake request ID carries the exact original statement and bindings')
   else{
    const handle='synthetic-cradle-110-'+requests.size;entry={body,handle,pending:copy&&hold}
    if(!entry.pending)entry.result=await execute(body)
    requests.set(id,entry);handles.set(handle,entry)
   }
   if(entry.pending){res.writeHead(202,{'content-type':'application/json'});res.end(JSON.stringify({statementHandle:entry.handle}));return true}
   if(copy&&loseAck){loseAck=false;res.destroy();return true}
   respond(res,entry.result,entry.handle);return true
  },
 }
}

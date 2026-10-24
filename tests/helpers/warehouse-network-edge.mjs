import assert from 'node:assert/strict'
import {createHash,createHmac,randomBytes} from 'node:crypto'
import {bigQueryNetworkEdge} from './bigquery-network-edge.mjs'
import {snowflakeNetworkEdge} from './snowflake-network-edge.mjs'
import {automationNetworkEdge} from './automation-network-edge.mjs'

/** Actual TLS and pinned relay transport; only DNS/TLS routing reaches this
 * synthetic S3-compatible service. SigV4 is verified independently at the edge. */
export async function warehouseNetworkEdge(){
 const endpoint='https://warehouse-bucket.example.com',access={accessKeyId:'synthetic-cradle-91',secretAccessKey:'synthetic-cradle-92'},objects=new Map(),calls=[]
 const destination={kind:'s3',endpoint,region:'us-east-1',bucket:'synthetic-cradle-bucket',prefix:'analysis'},bigQuery=await bigQueryNetworkEdge(),snowflake=await snowflakeNetworkEdge({s3Objects:objects,s3Access:access,stageStorage:destination})
 let refuseDelete=false
 const hash=value=>createHash('sha256').update(value).digest('hex'),hmac=(key,value)=>createHmac('sha256',key).update(value).digest()
 const edge=await automationNetworkEdge({extraHosts:['warehouse-bucket.example.com',...bigQuery.hosts,...snowflake.hosts],async receive(req,res,body){
  if(await bigQuery.receive(req,res,body)||await snowflake.receive(req,res,body))return true
  if(req.headers.host!=='warehouse-bucket.example.com')return false
  calls.push({method:req.method,path:req.url})
  const authorization=req.headers.authorization??'',match=/^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=([a-f0-9]{64})$/.exec(authorization)
  assert.ok(match,'S3 receives a SigV4 Authorization header');assert.equal(match[1],access.accessKeyId)
  assert.equal(req.headers['x-amz-content-sha256'],hash(body),'The payload hash covers exact transmitted bytes')
  const time=req.headers['x-amz-date'];assert.equal(time.slice(0,8),match[2]);assert.ok(Math.abs(Date.now()-Date.parse(time.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6Z')))<60000)
  const canonical=`${req.method}\n${req.url}\n\nhost:${req.headers.host}\nx-amz-content-sha256:${hash(body)}\nx-amz-date:${time}\n\nhost;x-amz-content-sha256;x-amz-date\n${hash(body)}`
  const signing=hmac(hmac(hmac(hmac('AWS4'+access.secretAccessKey,match[2]),match[3]),'s3'),'aws4_request')
  assert.equal(match[4],hmac(signing,`AWS4-HMAC-SHA256\n${time}\n${match[2]}/${match[3]}/s3/aws4_request\n${hash(canonical)}`).toString('hex'),'S3 validates the canonical method, path, host, timestamp and payload signature')
  if(req.method==='PUT'){objects.set(req.url,{body,contentType:req.headers['content-type']});res.writeHead(200);res.end()}
  else if(req.method==='DELETE'){if(refuseDelete){res.writeHead(403);res.end('denied')}else{objects.delete(req.url);res.writeHead(204);res.end()}}
  else if(req.method==='HEAD'||req.method==='GET'){const object=objects.get(req.url);res.writeHead(object?200:404,object?{'content-type':object.contentType}:{});res.end(req.method==='GET'&&object?object.body:undefined)}
  else {res.writeHead(405);res.end()}
  return true
 }})
 const observeBucket={async list({prefix=''}){return {truncated:false,objects:[...objects.keys()].map(path=>({key:decodeURIComponent(path).slice('/synthetic-cradle-bucket/analysis/'.length)})).filter(object=>object.key.startsWith(prefix))}},async get(key){const object=[...objects.entries()].find(([path])=>decodeURIComponent(path)==='/synthetic-cradle-bucket/analysis/'+key)?.[1];return object?{httpMetadata:{contentType:object.contentType},async text(){return object.body.toString('utf8')},async arrayBuffer(){return object.body.buffer.slice(object.body.byteOffset,object.body.byteOffset+object.body.byteLength)}}:null}}
 return {...edge,access,objects,calls,observeBucket,destination,bigQuery,snowflake,bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},refuseDelete(value){refuseDelete=value}}
}

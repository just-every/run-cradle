import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {createUlid} from '../../src/core/shared/ids.ts'
const {Agent}=createRequire(import.meta.resolve('miniflare'))('undici')

export async function restRateLimitJourney(h){
 const appId=createUlid(),entityId=createUlid(),nameId=createUlid()
 const draft={appId,name:'synthetic-cradle-401 rate REST',tables:[{id:entityId,label:'Rate items',primaryFieldId:nameId,fields:[{id:nameId,label:'Name',type:'text',required:true,unique:false}]}]}
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const schema=(await h.request(`/api/v1/apps/${appId}/entities`)).data.items.find(row=>row.id===entityId)
 const issue=async name=>(await h.request('/api/user-keys',{method:'POST',status:201,body:{appId,entityId,expiresAt:new Date(Date.now()+86400000).toISOString(),commandId:createUlid(),name,permissions:'write'}})).data.key
 const first=await issue('synthetic-cradle-402 limited key'),other=await issue('synthetic-cradle-403 independent key')
 const document=await h.request(`/api/v1/apps/${appId}/openapi.json`,{secret:first.secret})
 const limit=document['x-cradle-rate-limit'];assert.equal(limit.scope,'authenticated credential');assert.ok(Number.isSafeInteger(limit.requests)&&limit.requests>1);assert.ok(Number.isSafeInteger(limit.windowSeconds)&&limit.windowSeconds>0)
 const operations=Object.entries(document.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,operation])=>({path,method:method.toUpperCase(),operation})))
 const endpoint=name=>{const item=operations.find(item=>item.operation['x-cradle-operation']===name&&item.operation['x-cradle-entityId']===entityId);assert.ok(item,`OpenAPI supplies ${name}`);return item}
 const bucket=id=>createHash('sha256').update('cradle.rest.v1:'+id).digest('hex')
 const dispatcher=new Agent({pipelining:0})
 const request=async(name,{secret=first.secret,body,status=200}={})=>{
  const item=endpoint(name),response=await fetch(h.origin+item.path,{dispatcher,method:item.method,headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify(body)})
  const value=await response.json();assert.equal(response.status,status,`${name}: ${value?.error?.code??'unexpected response'}`)
  return {value,retryAfter:response.headers.get('retry-after')}
 }
 const setBucket=async(id,count,windowStart=Date.now())=>h.db.prepare('INSERT INTO authority_rate_limits(key_hash,window_start,count) VALUES(?,?,?) ON CONFLICT(key_hash) DO UPDATE SET window_start=excluded.window_start,count=excluded.count').bind(bucket(id),windowStart,count).run()
 try{
  const firstCreate={commandId:createUlid(),schemaVersion:schema.version,values:{[nameId]:'synthetic-cradle-404 retained'}}
  await request('create',{body:firstCreate})
  const before=(await request('query',{body:{limit:1}})).value.data.total.value
  // Fill the durable counter near its declared limit; exercise the final slots through HTTP.
  await setBucket(first.id,limit.requests-1)
  await request('query',{body:{limit:1}})
  const refusedCommand=createUlid(),denied=await request('create',{status:429,body:{...firstCreate,commandId:refusedCommand,values:{[nameId]:'synthetic-cradle-405 must not exist'}}})
  assert.equal(denied.value.error.code,'rate_limited');assert.ok(Number.isInteger(Number(denied.retryAfter))&&Number(denied.retryAfter)>0,'An exceeded credential receives Retry-After')
  assert.equal(await h.db.prepare('SELECT count FROM authority_rate_limits WHERE key_hash=?').bind(bucket(first.id)).first('count'),limit.requests,'Refused requests do not advance the exhausted counter')
  assert.equal(await h.db.prepare('SELECT count(*) n FROM command_admissions WHERE command_id=?').bind(refusedCommand).first('n'),0,'A throttled write has no admission')
  assert.equal((await request('query',{secret:other.secret,body:{limit:1}})).value.data.total.value,before,'Another credential is independent and sees zero refused writes')
  // An expired persisted window refreshes on the next request without waiting on the clock.
  await setBucket(first.id,limit.requests,0)
  await request('query',{body:{limit:1}})
  const renewed=await h.db.prepare('SELECT window_start,count FROM authority_rate_limits WHERE key_hash=?').bind(bucket(first.id)).first()
  assert.equal(renewed.count,1);assert.ok(renewed.window_start>0)
  await setBucket(first.id,limit.requests-1)
  const parallel=await Promise.all(Array.from({length:2},async()=>{
   const item=endpoint('query'),response=await fetch(h.origin+item.path,{dispatcher,method:item.method,headers:{authorization:`Bearer ${first.secret}`,'content-type':'application/json'},body:JSON.stringify({limit:1})})
   await response.json();return response.status
  }))
  assert.deepEqual(parallel.sort(),[200,429],'Concurrent callers cannot claim the final slot twice')
  await h.request(`/api/user-keys/${first.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
  await request('query',{body:{limit:1},status:401})
 }finally{await dispatcher.close()}
}

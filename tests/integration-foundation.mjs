import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkHealth, isHealthMessage } from '../src/core/platform/health.ts'
import { configurationFaults } from '../src/core/platform/configuration.ts'
import { createCommandRegistry } from '../src/core/registry/commands.ts'
import { createCommandHttp } from '../src/core/registry/http.ts'
import { ApiError } from '../src/core/registry/errors.ts'
import { commandSchema, validate } from '../src/core/registry/validation.ts'
import { z } from 'zod'

const bindings=()=>({DB:{prepare:()=>({first:async()=>({value:1})})},FILES:{head:async()=>null},WORK_QUEUE:{send:async()=>{}},ASSETS:{fetch:async()=>new Response()},AUTH_LOCAL:'true',OWNER_EMAIL:'owner@example.test',INSTALLATION:{get(){}},MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test',APP_ORIGIN:'http://127.0.0.1:4210',SESSION_SECRET:'a'.repeat(32)})
test('health requires every real resource probe and finishes within retained deadline',async()=>{
  const value=bindings();let message;value.WORK_QUEUE.send=async m=>{message=m}
  assert.equal((await checkHealth(value)).status,'ok');assert.ok(isHealthMessage(message))
  for(const key of ['DB','FILES','WORK_QUEUE','ASSETS']){const fault=bindings();delete fault[key];const start=Date.now();const health=await checkHealth(fault);assert.equal(health.status,'unhealthy',key);assert.ok(health.missing.includes(key));assert.ok(Date.now()-start<1000)}
  const stalled=bindings();stalled.FILES.head=()=>new Promise(()=>{});const start=Date.now();assert.equal((await checkHealth(stalled)).storage,'unavailable');assert.ok(Date.now()-start<1000)
})
test('production config is explicit and names missing secrets without exposing values',()=>{
  const value=bindings();delete value.AUTH_LOCAL;delete value.MAIL_FROM;delete value.MAIL_PROVIDER;delete value.APP_ORIGIN;delete value.SESSION_SECRET
  const missing=configurationFaults(value);assert.ok(missing.includes('APP_ORIGIN'));assert.ok(missing.includes('SESSION_SECRET'));assert.ok(missing.includes('MAIL_FROM'));assert.ok(missing.includes('MAIL_PROVIDER_API_KEY'))
  value.APP_ORIGIN='https://cradle.example';value.SESSION_SECRET='a'.repeat(32);value.MAIL_FROM='owner@example.com';value.MAIL_PROVIDER='sendgrid';value.MAIL_PROVIDER_API_KEY='test-only-provider-key'
  assert.deepEqual(configurationFaults(value),[])
  value.APP_ORIGIN='https://cradle.example/path';assert.match(configurationFaults(value).join(),/APP_ORIGIN/)
})
test('typed command transport reauthenticates, validates, delegates exactly once and carries committed consistency',async()=>{
  let calls=0,auth=0;const commandId='01K00000000000000000000000'
  const admission={commit:async(ctx,plan)=>{calls++;return{replay:false,result:{commandId:plan.commandId,state:'committed',value:plan.committedResult,changed:[],eventIds:[]},consistencyToken:'committed-token'}},status:async()=>({commandId,state:'committed'})}
  const registry=createCommandRegistry(admission),schema=commandSchema(z.object({title:z.string().min(1)}).strict())
  const definition={action:'record.create',description:'Create a record',inputSchema:{type:'object'},input:{parse:value=>validate(schema,value)},visible:async()=>true,prepare:async(ctx,input)=>({commandId:input.commandId,action:'record.create',committedResult:input.input})}
  registry.register(definition);assert.throws(()=>registry.register(definition),/Duplicate/)
  const app=createCommandHttp({commands:registry,admission,authenticate:async(req,ingress,requestId)=>{auth++;if(req.headers.get('authorization')!=='Bearer test')throw new ApiError('signed_out','Sign in required');return{requestId,now:new Date().toISOString(),ingress,principal:{id:'actor'}}}})
  const send=(body,headers={authorization:'Bearer test'})=>app.request('https://app.example/api/v1/commands/record.create',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)})
  const input={commandId,expected:[],input:{title:'actual input'}}
  assert.equal((await send(input,{})).status,401);assert.equal(calls,0)
  assert.equal((await send({...input,actorId:'spoof'})).status,400);assert.equal(calls,0)
  assert.equal((await send(input,{authorization:'Bearer test',cookie:'session=x',origin:'https://evil.example'})).status,403);assert.equal(calls,0)
  const response=await send(input);assert.equal(response.status,200);assert.equal((await response.json()).meta.consistencyToken,'committed-token');assert.equal(calls,1);assert.equal(auth,4)
})

test('MCP uses the same typed command with fresh machine authentication and filtered discovery',async()=>{
  const { createMcpTransport }=await import('../src/core/registry/mcp.ts')
  let auth=0,executions=0
  const transport=createMcpTransport({commands:{discover:async()=>[{action:'record.patch',description:'Edit permitted record',inputSchema:{type:'object'}}],get:name=>name==='record.patch'?{visible:async()=>true,execute:async()=>{executions++;return{result:{state:'accepted',runId:'durable'},consistencyToken:'token'}}}:undefined,query:()=>undefined},admission:{},authenticate:async(_req,ingress)=>{auth++;assert.equal(ingress,'mcp');return{principal:{kind:'agent'}}}})
  const request=(method,params,credential=true)=>new Request('https://app.example/mcp',{method:'POST',headers:{'content-type':'application/json',...(credential?{authorization:'Bearer scoped'}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})
  assert.equal((await transport(request('tools/list',{},false))).status,401)
  const list=await(await transport(request('tools/list',{}))).json();assert.equal(list.result.tools.length,1)
  assert.equal((await transport(request('tools/call',{name:'arbitrary.sql',arguments:{}}))).status,404)
  const invoked=await(await transport(request('tools/call',{name:'record.patch',arguments:{}}))).json();assert.match(invoked.result.content[0].text,/accepted/);assert.equal(executions,1);assert.equal(auth,3)
})

test('client build contains no authority implementation or secret configuration',async()=>{
  const {readdir,readFile}=await import('node:fs/promises')
  const files=await readdir(new URL('../dist/client/assets/',import.meta.url))
  for(const file of files.filter(file=>file.endsWith('.js'))){const source=await readFile(new URL('../dist/client/assets/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/authority_sessions|authority_magic_tokens|MAIL_PROVIDER_API_KEY|CANDIDATE_RUNNER_TOKEN|SESSION_SECRET/,file)}
})

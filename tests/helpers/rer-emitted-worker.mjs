import {createFixtureMail} from './fixture-mail.mjs'
import {withRerDevelopment} from './rer-development.mjs'
import {checkoutDevKey} from './dev-gate.mjs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readdir} from 'node:fs/promises'
import {join,dirname} from 'node:path'
import {useRuntimeBindings} from './rer-data-fixture.mjs'
import {availableMachine} from './available-machine.mjs'
const built=new WeakSet()
/** The actual emitted Worker and direct verification share one D1/R2 owner. */
export async function withRerEmittedWorker(copy,origin,run,{mail=false}={}){
 await availableMachine()
 if(!built.has(copy)){await copy.command(['run','build']);built.add(copy)}
 const require=createRequire(join(copy.source,'package.json')),{Miniflare,convertV4MiniflareOptions,Log,LogLevel}=require('miniflare'),{unstable_getMiniflareWorkerOptions}=require('wrangler')
 const {workerOptions,main,externalWorkers}=unstable_getMiniflareWorkerOptions(join(copy.source,'dist/server/wrangler.json'))
 assert.ok(main,'Actual emitted Worker exists')
 const modulesRoot=dirname(main),{modulesRules,...options}=workerOptions,modules=[main,...(await readdir(modulesRoot,{recursive:true})).filter(file=>/\.m?js$/.test(file)).map(file=>join(modulesRoot,file)).filter(file=>file!==main)].map(path=>({type:'ESModule',path}))
 let calls=0
 const rejectNetwork=()=>{calls++;throw new Error('Local lifecycle rehearsal prohibits outbound network')}
 const mailEdge=mail?await createFixtureMail(new URL(origin).port,rejectNetwork):null
 const mailBindings=mailEdge?{...mailEdge.bindings,MAIL_FROM:'signin@fixture.example.test'}:{}
 const config=convertV4MiniflareOptions({host:'127.0.0.1',port:Number(new URL(origin).port),inspectorPort:0,resourcePersistencePath:join(copy.source,'.wrangler/state/v3'),workers:[{...options,modules,modulesRoot,bindings:{...options.bindings,...await copy.readVars(),...mailBindings,RER_DEV_KEY:await checkoutDevKey(copy.source),APP_ORIGIN:origin,AUTH_ORIGIN:origin,AUTH_LOCAL:'true'}},...externalWorkers]})
 for(const worker of config.workers)if(worker.dev)worker.dev.unsafeRegisterWorker=false
 config.workers[0].dev??={};config.workers[0].dev.outboundService={type:'fetcher',handler:mailEdge?.fetch??rejectNetwork}
 const logs=[];class PrivateLog extends Log{log(message){logs.push(message)}}
 config.log=new PrivateLog(LogLevel.INFO);config.handleStructuredLogs=message=>logs.push(JSON.stringify(message))
 let runtime,detach
 const start=async()=>{runtime=new Miniflare(config);await runtime.ready;detach=useRuntimeBindings(copy.source,{DB:await runtime.getD1Database('DB'),FILES:await runtime.getR2Bucket('FILES')})}
 const stop=async()=>{detach?.();detach=undefined;const owned=runtime;runtime=undefined;await owned?.dispose()}
 // Public offline CLI transfers must own the persisted bindings exclusively.
 // Release this exact Worker, then resume its unchanged configuration and port.
 const offline=async action=>{await stop();try{return await action()}finally{await start()}}
 try{
  await start()
  const result=await run(runtime,{offline})
  assert.equal(calls,0,'Native lifecycle proof made no external calls')
  return result
 }finally{try{await stop()}finally{try{await mailEdge?.close()}finally{await copy.log.writeFile(logs.join('\n')+'\n')}}}
}

/** Keep real CLI readiness, then acquire mail credentials only at a test-owned provider edge. */
export async function withNativeMail(copy,origin,run){
 await withRerDevelopment(copy,origin,async()=>{})
 return withRerEmittedWorker(copy,origin,run,{mail:true})
}

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
export async function withRerEmittedWorker(copy,origin,run){
 await availableMachine()
 if(!built.has(copy)){await copy.command(['run','build']);built.add(copy)}
 const require=createRequire(join(copy.source,'package.json')),{Miniflare,convertV4MiniflareOptions,Log,LogLevel}=require('miniflare'),{unstable_getMiniflareWorkerOptions}=require('wrangler')
 const {workerOptions,main,externalWorkers}=unstable_getMiniflareWorkerOptions(join(copy.source,'dist/server/wrangler.json'))
 assert.ok(main,'Actual emitted Worker exists')
 const modulesRoot=dirname(main),{modulesRules,...options}=workerOptions,modules=[main,...(await readdir(modulesRoot,{recursive:true})).filter(file=>/\.m?js$/.test(file)).map(file=>join(modulesRoot,file)).filter(file=>file!==main)].map(path=>({type:'ESModule',path}))
 const config=convertV4MiniflareOptions({host:'127.0.0.1',port:Number(new URL(origin).port),inspectorPort:0,resourcePersistencePath:join(copy.source,'.wrangler/state/v3'),workers:[{...options,modules,modulesRoot,bindings:{...options.bindings,...await copy.readVars(),RER_DEV_KEY:await checkoutDevKey(copy.source),APP_ORIGIN:origin,AUTH_ORIGIN:origin,AUTH_LOCAL:'true'}},...externalWorkers]})
 for(const worker of config.workers)if(worker.dev)worker.dev.unsafeRegisterWorker=false
 let calls=0;config.workers[0].dev??={};config.workers[0].dev.outboundService={type:'fetcher',handler(){calls++;throw new Error('Local lifecycle rehearsal prohibits outbound network')}}
 const logs=[];class PrivateLog extends Log{log(message){logs.push(message)}}
 config.log=new PrivateLog(LogLevel.INFO);config.handleStructuredLogs=message=>logs.push(JSON.stringify(message))
 const runtime=new Miniflare(config);let detach
 try{
  await runtime.ready;detach=useRuntimeBindings(copy.source,{DB:await runtime.getD1Database('DB'),FILES:await runtime.getR2Bucket('FILES')})
  const result=await run(runtime)
  assert.equal(calls,0,'Native lifecycle proof made no external calls')
  return result
 }finally{detach?.();try{await runtime.dispose()}finally{await copy.log.writeFile(logs.join('\n')+'\n')}}
}

/** Rer issues the ordinary private owner message; native emitted auth redeems it. */
export async function withNativeOutbox(copy,origin,run){
 await withRerDevelopment(copy,origin,async()=>{await copy.rer(['outbox'])})
 return withRerEmittedWorker(copy,origin,run)
}

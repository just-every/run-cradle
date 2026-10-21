import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_getMiniflareWorkerOptions } from 'wrangler'
import { queueConsumerOptions } from './queue-consumers.mjs'

// Test-only outbound provider interception. The actual emitted Cradle and Base
// implementations run unchanged in workerd; no live provider request escapes.
export async function baseEmittedRuntime(directory,port,bindings,outboundService,{automaticQueues}={}) {
 const {workerOptions,main,externalWorkers}=unstable_getMiniflareWorkerOptions('dist/server/wrangler.json')
 if(!main)throw new Error('Build the emitted Worker first.')
 const modulesRoot=path.dirname(main),{modulesRules,...options}=workerOptions
 const modules=[main,...(await readdir(modulesRoot,{recursive:true})).filter(file=>/\.m?js$/.test(file)).map(file=>path.join(modulesRoot,file)).filter(file=>file!==main)].map(file=>({type:'ESModule',path:file}))
 const envelope={type:'ESModule',path:path.join(modulesRoot,'__base_test_envelope__.mjs'),contents:`
  import actual, { InstallationCoordinator } from './${path.basename(main)}';
  export { InstallationCoordinator };
  export default { ...actual, async fetch(envelope,env,context) {
   const {url,testNow,...init}=await envelope.json();
   const realNow=Date.now;if(testNow)Date.now=()=>testNow;
   try{return await actual.fetch(new Request(url,init),env,context)}finally{Date.now=realNow}
  } };
 `}
 const config=convertV4MiniflareOptions({host:'127.0.0.1',port,inspectorPort:0,resourcePersistencePath:path.join(directory,'v3'),workers:[{...options,...queueConsumerOptions(automaticQueues),modules:[envelope,...modules],modulesRoot,bindings:{...options.bindings,...bindings},outboundService},...externalWorkers]})
 for(const worker of config.workers)if(worker.dev)worker.dev.unsafeRegisterWorker=false
 return new Miniflare(config)
}

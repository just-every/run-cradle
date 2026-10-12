import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_getMiniflareWorkerOptions } from 'wrangler'
import { testDevKey } from './dev-gate.mjs'

export async function emittedRuntime(directory, port, bindings, networkEdge) {
  const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions('dist/server/wrangler.json')
  assertMain(main)
  const modulesRoot=path.dirname(main),{modulesRules,...options}=workerOptions
  const modules=[main,...(await readdir(modulesRoot,{recursive:true})).filter(file=>/\.m?js$/.test(file)).map(file=>path.join(modulesRoot,file)).filter(file=>file!==main)].map(file=>({type:'ESModule',path:file}))
  const config=convertV4MiniflareOptions({host:'127.0.0.1',port,inspectorPort:0,resourcePersistencePath:path.join(directory,'v3'),workers:[{...options,modules,modulesRoot,bindings:{...options.bindings,...(bindings?.AUTH_LOCAL==='true'?{RER_DEV_KEY:testDevKey}:{}),...bindings}},...externalWorkers]})
  for(const worker of config.workers) if(worker.dev) worker.dev.unsafeRegisterWorker=false
  if(networkEdge){config.workers[0].dev??={};config.workers[0].dev.outboundService={type:'fetcher',handler:networkEdge}}
  return new Miniflare(config)
}
function assertMain(main) { if(!main)throw new Error('Build the emitted Worker before this test') }

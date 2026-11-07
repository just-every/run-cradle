import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { unstable_getMiniflareWorkerOptions } from 'wrangler'
import { testDevKey } from './dev-gate.mjs'
import { queueConsumerOptions } from './queue-consumers.mjs'
import { testClockSource } from './base-emitted-runtime.mjs'

export async function emittedOptions(directory, port, bindings, networkEdge, { automaticQueues, testClock = false } = {}) {
  const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions('dist/server/wrangler.json')
  assertMain(main)
  const modulesRoot=path.dirname(main),{modulesRules,...options}=workerOptions
  const modules=[main,...(await readdir(modulesRoot,{recursive:true})).filter(file=>/\.m?js$/.test(file)).map(file=>path.join(modulesRoot,file)).filter(file=>file!==main)].map(file=>({type:'ESModule',path:file}))
  if (testClock) modules.unshift({type:'ESModule',path:path.join(modulesRoot,'__emitted_test_clock__.mjs'),contents:`
    import actual, { InstallationCoordinator } from './${path.basename(main)}';
    export { InstallationCoordinator };
    ${testClockSource}
    export default { ...actual, fetch(request,env,context) {
      const now=request.headers.get('x-cradle-test-now');
      return withTestClock(now===null?undefined:Number(now),()=>actual.fetch(request,env,context));
    } };
  `})
  const config=convertV4MiniflareOptions({host:'127.0.0.1',port,inspectorPort:0,resourcePersistencePath:path.join(directory,'v3'),workers:[{...options,...queueConsumerOptions(automaticQueues),modules,modulesRoot,bindings:{...options.bindings,...(bindings?.AUTH_LOCAL==='true'?{RER_DEV_KEY:testDevKey}:{}),...bindings}},...externalWorkers]})
  for(const worker of config.workers) if(worker.dev) worker.dev.unsafeRegisterWorker=false
  if(networkEdge){config.workers[0].dev??={};config.workers[0].dev.outboundService={type:'fetcher',handler:networkEdge}}
  return config
}

export async function emittedRuntime(directory, port, bindings, networkEdge, options) {
  const runtime = new Miniflare(await emittedOptions(directory, port, bindings, networkEdge, options))
  try {
    const listener = await runtime.ready
    // Workerd owns the ephemeral listener from allocation through shutdown.
    // Reloading bindings pins that same listener; there is no probe to release.
    if (port === 0) {
      const assigned = Number(listener.port)
      bindings = { ...bindings, ...(bindings?.APP_ORIGIN ? { APP_ORIGIN: listener.origin } : {}) }
      await runtime.setOptions(await emittedOptions(directory, assigned, bindings, networkEdge, options))
    }
    return runtime
  } catch (error) { await runtime.dispose(); throw error }
}
function assertMain(main) { if(!main)throw new Error('Build the emitted Worker before this test') }

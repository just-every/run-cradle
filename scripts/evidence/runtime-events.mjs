import assert from 'node:assert/strict'
import {readFile,readdir,writeFile,unlink} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve,dirname,join} from 'node:path'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {unstable_getMiniflareWorkerOptions} from 'wrangler'
// Import the actual emitted artifact inside workerd, preserving its real bindings.
// Controlled queue delivery is the platform edge; product dispatch is unchanged.
export async function runtimeEvents(root,bindings){
 const require=createRequire(join(root,'package.json'))
 const {unstable_readConfig}=require('wrangler')
 const config=unstable_readConfig({config:join(root,'dist/server/wrangler.json')})
 const selected=unstable_getMiniflareWorkerOptions(config),modulesRoot=dirname(selected.main),probe=join(modulesRoot,'runtime-evidence-probe.mjs')
 await writeFile(probe,`import * as emitted from './${selected.main.split('/').at(-1)}';
 export {InstallationCoordinator} from './${selected.main.split('/').at(-1)}';
 export default {async fetch(request,env){
  let acknowledgements=0,retries=0;
  const owner=await env.DB.prepare("SELECT id FROM oa_operators WHERE role='owner' AND status='active' ORDER BY created_at LIMIT 1").first();
  if(!owner)throw Error('Real setup owner required for emitted Coordinator evidence');
  const coordinator=env.INSTALLATION.get(env.INSTALLATION.idFromName('workspace'));
  const missing=await coordinator.fetch('https://installation/initialize',{method:'POST',body:JSON.stringify({operatorId:'missing-evidence-owner'})});await missing.body?.cancel();
  const current=await coordinator.fetch('https://installation/initialize',{method:'POST',body:JSON.stringify({operatorId:owner.id})});await current.body?.cancel();
  await emitted.default.queue({messages:[{body:{kind:'cradle.health.v1',requestId:'local-evidence',createdAt:new Date().toISOString()},ack(){acknowledgements++},retry(){retries++}},{body:{kind:'unsupported.evidence.v1'},ack(){acknowledgements++},retry(){retries++}}]},env);
  await emitted.default.scheduled({scheduledTime:Date.now(),cron:'* * * * *'},env);
  return Response.json({exports:Object.keys(emitted).sort(),methods:Object.keys(emitted.default).sort(),acknowledgements,retries,scheduled:'completed',coordinator:{missingOwner:missing.status,currentOwner:current.status}});
 }};`)
 let runtime
 try{
  const {modulesRules,...options}=selected.workerOptions
  const files=[probe,...(await readdir(modulesRoot,{recursive:true})).filter(file=>/\.m?js$/.test(file)).map(file=>join(modulesRoot,file)).filter(file=>file!==probe)]
  runtime=new Miniflare({...convertV4MiniflareOptions({port:0,workers:[{...options,modules:files.map(path=>({type:'ESModule',path})),modulesRoot,bindings:{...options.bindings,...bindings}},...selected.externalWorkers]}),resourcePersistencePath:resolve(root,'.wrangler/state/v3')})
  const result=await(await runtime.dispatchFetch('http://localhost/evidence')).json()
  assert.ok(result.exports.includes('InstallationCoordinator'));assert.deepEqual(result.methods,['fetch','queue','scheduled'])
  assert.equal(result.acknowledgements,1);assert.equal(result.retries,1);assert.equal(result.scheduled,'completed');assert.deepEqual(result.coordinator,{missingOwner:403,currentOwner:204})
  return result
 }finally{if(runtime)await runtime.dispose();await unlink(probe)}
}

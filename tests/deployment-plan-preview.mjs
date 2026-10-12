import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {contract} from './contract.mjs'

contract('AUTH-BASE-001 BASE-SECRET-001 BASE-SECRET-002','real rer deployment dry-run validates the native artifact without contacting a provider or disclosing private values',()=>{
 const result=spawnSync(process.execPath,['scripts/rer.mjs','deploy','--dry-run','--non-interactive','--json'],{
  env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',NODE_OPTIONS:'--import '+resolve('tests/helpers/offline-provider-guard.mjs'),CLOUDFLARE_API_TOKEN:'test-only-offline-secret-canary'},
  encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024,
 })
 assert.equal(result.error,undefined);assert.equal(result.status,0,'Public rer dry-run succeeds')
 const results=result.stdout.split('\n').flatMap(line=>{try{const event=JSON.parse(line);return event.event==='result'?[event]:[]}catch{return[]}})
 assert.ok(results.some(event=>event.ok&&event.dryRun===true&&event.deployed===false),'The public result confirms no deployment')
 const requests=[...result.stderr.matchAll(/CRADLE_OFFLINE_PROVIDER_REQUESTS (\d+)/g)].map(match=>Number(match[1]))
 assert.ok(requests.length,'The child process runs the network-edge guard')
 assert.ok(requests.every(count=>count===0),'No child makes a provider request')
 assert.ok(!(result.stdout+result.stderr).includes('test-only-offline-secret-canary'),'Only private-input presence may be reported')
})

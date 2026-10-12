import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { contract } from './contract.mjs'
import { testDevKey, devKeyHeader } from './helpers/dev-gate.mjs'
const { createBaseAuth } = await import('../src/core/platform/base-auth.server.ts')
const { localMailEnabled } = await import('../src/core/platform/local-auth.server.ts')
const { developmentOutboxResponse } = await import('../src/core/platform/development-outbox.server.ts')


const key=testDevKey
const local={ RER_DEV_KEY:key, AUTH_LOCAL:'true', APP_ORIGIN:'http://127.0.0.1:4185', OWNER_EMAIL:'owner@example.test', SESSION_SECRET:'test-only-secret-with-more-than-32-characters', MAIL_PROVIDER:'development', MAIL_FROM:'auth@localhost.test' }
contract('AUTH-BASE-001 BASE-ACCESS-002', 'production configuration denies development sender and outbox despite local flags or forged Host', async()=>{
  let queries=0
  const db={prepare(){queries++;throw new Error('Unexpected database access')},batch(){queries++;throw new Error('Unexpected database batch')}}
  for(const bindings of [ {...local,APP_ORIGIN:'https://cradle.example.test'}, {...local,RER_VERSION:{id:'production'}}, {...local,RER_DEPLOY_SOURCE:'deployed-source'}, {...local,AUTH_LOCAL:'false'} ]) {
    assert.equal(localMailEnabled(bindings),false)
    assert.throws(()=>createBaseAuth({...bindings,DB:db}),/Development mail requires/)
    const response=await developmentOutboxResponse(new Request('http://127.0.0.1:4185/__dev/outbox',{headers:{host:'127.0.0.1:4185'}}),{...bindings,DB:db})
    assert.equal(response.status,404);assert.equal(response.headers.get('cache-control'),'no-store')
  }
  for(const headers of [{host:'evil.test'},{host:'127.0.0.1:4185',origin:'https://evil.test'},{host:'127.0.0.1:4185','sec-fetch-site':'cross-site'}]) {
    // The key is presented, so only the host/origin/fetch-site checks can refuse these.
    assert.equal((await developmentOutboxResponse(new Request(local.APP_ORIGIN+'/__dev/outbox',{headers:{...devKeyHeader(),...headers}}),{...local,DB:db})).status,404)
  }
  assert.equal(queries,0)
  assert.ok(createBaseAuth({...local,DB:db}),'Local mode still constructs real Base auth')
})

contract('AUTH-BASE-001 BASE-ACCESS-002', 'the local outbox refuses a request without this checkout\'s dev key, even from the configured loopback origin',async()=>{
  let queries=0
  const db={prepare(){queries++;throw new Error('Unexpected database access')},batch(){queries++;throw new Error('Unexpected database batch')}}
  const ask=(headers,env=local)=>developmentOutboxResponse(new Request(local.APP_ORIGIN+'/__dev/outbox',{headers:{host:'127.0.0.1:4185',...headers}}),{...env,DB:db})
  const keyless=await ask({});assert.equal(keyless.status,404);assert.equal(keyless.headers.get('cache-control'),'no-store')
  assert.equal((await ask(devKeyHeader('not-the-key-not-the-key-not-the-key-not-the-key'))).status,404,'A wrong key is refused')
  const {RER_DEV_KEY:_,...unkeyed}=local
  assert.equal((await ask(devKeyHeader(),unkeyed)).status,404,'A runtime without the key serves nothing, whatever a request presents')
  assert.equal(queries,0)
})

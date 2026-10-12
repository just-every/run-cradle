import './helpers/typescript-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
const {errorResponse,ApiError}=await import('../src/core/registry/errors.server.ts')
test('unexpected provider and SQL errors cannot reveal personal or credential sentinels',async()=>{
 for(const text of ['provider raw body secret-test-token personal@example.test','SQL INSERT bind value private-private-123']){
  const response=errorResponse(new Error(text),'request-identity','GET /api/test'),body=await response.json()
  assert.equal(response.status,500);assert.equal(body.error.requestId,'request-identity');assert.equal(body.error.message,'The operation could not be completed.');assert.ok(!JSON.stringify(body).includes(text))
 }
 const expected=await errorResponse(new ApiError('version_conflict','Refresh this record.'),'id','patch').json()
 assert.equal(expected.error.message,'Refresh this record.')
})

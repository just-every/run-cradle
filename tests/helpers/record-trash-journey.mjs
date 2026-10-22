import assert from 'node:assert/strict'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function recordTrashJourney(){
 const h=await userAutomationRuntime(18955)
 try{
  const {record}=await h.create('synthetic-cradle-20')
  const deleted=await h.request('/api/v1/commands/record.delete',{method:'POST',body:{commandId:createUlid(),expected:[{ref:record.ref,version:record.version}],input:{ref:record.ref,confirmation:record.id}}})
  assert.equal(deleted.data.state,'committed')
 }finally{await h.close()}
}

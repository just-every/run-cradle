import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'

export async function restCommentsJourney(h,{call,key,appId,entityId,record,nameId}){
 const id=record.id,command={commandId:createUlid(),recordVersion:record.version,body:'synthetic-cradle-220 REST comment',mentions:[]}
 const initial=await call('comments',{id})
 assert.equal(initial.items.length,0)
 assert.equal(initial.canAdd,false,'Record-write keys have no implicit comment authority')
 await call('comment.create',{id,body:command,status:403})
 assert.equal((await call('comments',{id})).items.length,0,'Refused comment writes change nothing')
 const added=await call('comment.create',{id,body:command,secret:null})
 assert.equal(added.result.value.body,command.body)
 const commentId=added.result.value.id
 assert.equal((await call('comment.create',{id,body:command,secret:null})).result.value.id,commentId,'Replaying creates only one comment')
 const visible=await call('comments',{id})
 assert.deepEqual(visible.items.map(item=>item.body),[command.body])
 assert.equal(visible.items[0].canEdit,false)
 const edit={commandId:createUlid(),recordVersion:record.version,version:1,body:'synthetic-cradle-221 REST edited',mentions:[]}
 await call('comment.update',{id,commentId,body:edit,status:403})
 assert.equal((await call('comments',{id})).items[0].body,command.body,'A record-write key cannot change a comment')
 const edited=await call('comment.update',{id,commentId,body:edit,secret:null})
 assert.equal(edited.result.value.body,edit.body)
 assert.equal(edited.result.value.version,2)
 await call('comment.update',{id,commentId,body:{...edit,commandId:createUlid()},status:409,secret:null})
 assert.equal((await call('comments',{id,query:{q:'REST edited'}})).items[0].body,edit.body)
 assert.equal((await call('comments',{id,query:{q:'not present'}})).items.length,0)
 const removal={commandId:createUlid(),recordVersion:record.version,version:2}
 await call('comment.delete',{id,commentId,body:removal,status:403})
 assert.equal((await call('comments',{id})).items[0].body,edit.body,'A refused deletion retains the comment')
 const removed=await call('comment.delete',{id,commentId,body:removal,secret:null})
 assert.equal(removed.result.value.deleted,true)
 const tombstone=(await call('comments',{id})).items[0]
 assert.equal(tombstone.body,null)
 assert.ok(tombstone.deletedAt)
 assert.equal(tombstone.canEdit,false)
 const credential=await key({permissions:'read'})
 assert.equal((await call('comments',{id,secret:credential.secret})).items[0].id,commentId)
 await h.request(`/api/user-keys/${credential.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId}})
 await call('comments',{id,status:401,secret:credential.secret})
 await call('comment.create',{id,body:{...command,commandId:createUlid()},status:401,secret:credential.secret})
 const other=(await call('create',{body:{commandId:createUlid(),schemaVersion:record.schemaVersion,values:{[nameId]:'synthetic-cradle-222 other comment record'}}})).result.value.rows[0]
 await call('comment.update',{id:other.id,commentId,body:{...edit,commandId:createUlid(),recordVersion:other.version},status:404,secret:null})
 assert.equal((await call('get',{id})).version,record.version,'Comments do not mutate record versions')
 return {appId,entityId,commentId}
}

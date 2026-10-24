import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
/** Trash stays hidden at record doors while its previously bound external event is cancelled. */
export async function recordCalendarTrash({call,command,deliver,drain,get,binding,provider,appId,entityId,recordId}){
 const original=await get(),before=await binding(),writes=provider.writes.length
 const deleted=await command('record.delete',{ref:original.ref,confirmation:original.id},[{ref:original.ref,version:original.version}]);assert.equal(deleted.state,'committed')
 await call(`/api/v1/apps/${appId}/entities/${entityId}/records/${recordId}`,undefined,404)
 await deliver({kind:'cradle.records.automations.v1',commandId:deleted.commandId});await drain()
 assert.equal(provider.writes.length,writes+1);assert.equal(provider.writes.at(-1).method,'DELETE');assert.equal((await binding()).state,'cancelled','Moving a record to Trash cancels its bound event through the ordinary change queue')
 await call(`/api/v1/apps/${appId}/entities/${entityId}/records/${recordId}?includeTrash=true`,undefined,404)
 const item=(await call(`/api/v1/records/trash?appId=${appId}`)).items.find(item=>item.id===recordId);assert.ok(item?.restorable)
 const restoreId=createUlid(),restored=await call('/api/v1/records/trash/restore',{commandId:restoreId,appId,entityId,recordId,version:item.version});assert.equal(restored.result.state,'committed')
 await deliver({kind:'cradle.records.automations.v1',commandId:restoreId});await drain()
 const after=await binding();assert.equal(after.state,'synced');assert.equal(provider.writes.at(-1).method,'POST');assert.notEqual(after.event_id,before.event_id,'Restoring a record starts a new external event generation')
 assert.equal((await get()).id,original.id)
}

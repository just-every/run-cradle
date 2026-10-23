import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {verifyWebhook} from '../../vendor/base/modules/integrations/core/webhook.ts'
import {changeSubscriptionDeletes} from './change-subscriptions-deletes.mjs'
import {unbase64} from '../../src/adapters/crypto.server.ts'

export async function changeSubscriptionsJourney(h,edge){
 const root='/api/v1/change-subscriptions',issue={commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'synthetic-cradle-2',permissions:'read',expiresAt:new Date(Date.now()+20*86400000).toISOString()}
 const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:issue})).data.key
 const body={commandId:createUlid(),appId:h.appId,entityId:h.entityId,url:edge.receiverOrigin+'/changes'}
 await h.request(root,{method:'POST',status:403,body})
 for(const url of ['http://receiver.example.com/','https://127.0.0.1/'])await h.request(root,{method:'POST',secret:key.secret,status:400,body:{...body,commandId:createUlid(),url}})
 const subscription=(await h.request(root,{method:'POST',secret:key.secret,status:201,body})).data
 const stored=await h.db.prepare('SELECT sealed_json FROM record_change_subscriptions WHERE id=?').bind(subscription.id).first()
 assert.ok(!stored.sealed_json.includes(subscription.signingKey)&&!stored.sealed_json.includes(edge.receiverOrigin))
 const listing=(await h.request(root+'?appId='+h.appId,{secret:key.secret})).data
 assert.equal(listing.length,1);assert.ok(!JSON.stringify(listing).includes(subscription.signingKey))
 const first=await h.create('synthetic-cradle-3'),second=await h.create('synthetic-cradle-4')
 await h.patch(first.record,{[h.statusId]:'synthetic-cradle-5'})
 const worker=await h.runtime.getWorker(),tick=()=>worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.changes.v1',commandId:first.commandId}}])
 await tick();await tick()
 const pings=edge.received.filter(r=>r.path==='/changes')
 assert.equal(pings.length,3,'One verifiable ping for each committed change, including recovery replay')
 for(const ping of pings){const verified=await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:h.appId,destinationId:subscription.id});const value=JSON.parse(verified.envelope.body);assert.equal(value.changeCount,1);assert.equal(value.subscriptionId,subscription.id);assert.ok(!ping.body.includes('synthetic-cradle-3'))}
 const route=(cursor,limit=200)=>`${root}/${subscription.id}/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`
 await h.request(route('invalid-cursor'),{secret:key.secret,status:400})
 const page=(await h.request(route(subscription.cursor),{secret:key.secret})).data
 assert.deepEqual(page.items.map(i=>i.kind),['create','create','update'])
 assert.equal(new Set(page.items.map(i=>i.id)).size,3)
 await h.create('synthetic-cradle-later-1');await tick()
 assert.deepEqual((await h.request(route(subscription.cursor),{secret:key.secret})).data,page,'A fixed signed window replays identically')
 let cursor=subscription.cursor,items=[],more=true
 while(more){const part=(await h.request(route(cursor,1),{secret:key.secret})).data;items.push(...part.items);cursor=part.cursor;more=part.hasMore}
 assert.deepEqual(items,page.items,'Paging has no gaps or duplicates')
 const later=(await h.request(route(page.cursor),{secret:key.secret})).data
 assert.deepEqual(later.items.map(i=>i.recordId),[(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/query`,{method:'POST',body:{limit:20}})).data.items.find(r=>r.fields[h.nameId].value==='synthetic-cradle-later-1').id])
 const current=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${second.record.ref.recordId}`)).data.record
 await h.patch(current,{[h.statusId]:null});await tick()
 assert.equal(edge.received.filter(r=>r.path==='/changes').length,4,'Saving an unchanged value produces no ping')
 const credential=await h.db.prepare('SELECT principal_id FROM authority_credentials WHERE id=?').bind(key.id).first()
 const membership=await h.db.prepare('SELECT policy_id FROM authority_memberships WHERE principal_id=? AND app_id=?').bind(credential.principal_id,h.appId).first()
 const policy=await h.db.prepare('SELECT rules_json FROM authority_policies WHERE id=?').bind(membership.policy_id).first(),rules=JSON.parse(policy.rules_json)
 for(const rule of rules){rule.readableFields=rule.readableFields.filter(id=>id!==h.statusId);rule.rows={kind:'condition',fieldId:h.nameId,op:'eq',value:'synthetic-cradle-3'}}
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),membership.policy_id).run()
 const narrowed=(await h.request(route(subscription.cursor),{secret:key.secret})).data.items
 assert.deepEqual(narrowed.map(i=>i.kind),['create']);assert.ok(narrowed.every(i=>i.changes.every(c=>c.fieldId!==h.statusId)),'Current row and field policy narrows retained payloads')
 const refreshed=(await h.request(`${root}/${subscription.id}/refresh`,{method:'POST',secret:key.secret,body:{commandId:createUlid()}})).data
 assert.ok(Date.parse(refreshed.expiresAt)>=Date.parse(subscription.expiresAt))
 const revoked=(await h.request('/api/user-keys',{method:'POST',status:201,body:{...issue,commandId:createUlid(),name:'synthetic-cradle-6'}})).data.key
 const stopped=(await h.request(root,{method:'POST',secret:revoked.secret,status:201,body:{...body,commandId:createUlid(),url:edge.receiverOrigin+'/revoked-changes'}})).data
 await h.request(`/api/user-keys/${revoked.id}/revoke`,{method:'POST',body:{commandId:createUlid(),appId:h.appId}})
 await h.create('synthetic-cradle-7');await tick()
 assert.ok(!edge.received.some(r=>r.path==='/revoked-changes'))
 await h.request(`${root}/${stopped.id}/changes?cursor=${encodeURIComponent(stopped.cursor)}`,{secret:revoked.secret,status:401})
 await changeSubscriptionDeletes(h,edge)
 const before=edge.received.filter(r=>r.path==='/changes').length
 await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()+8*86400000})
 const expiredSubscription=await h.request(route(subscription.cursor),{secret:key.secret,status:410})
 assert.equal(expiredSubscription.error.code,'subscription_expired')
 console.log('CHANGE_SUBSCRIPTION_LIFETIME PASS 410 subscription_expired')
 await h.create('synthetic-cradle-8');await tick()
 assert.equal(edge.received.filter(r=>r.path==='/changes').length,before)
 for(const ping of edge.received.filter(r=>r.path==='/changes'))await verifyWebhook({body:new TextEncoder().encode(ping.body),headers:ping.headers,key:unbase64(subscription.signingKey),tenant:h.appId,destinationId:subscription.id})
 await h.request(`${root}/${subscription.id}`,{method:'DELETE',secret:key.secret,body:{commandId:createUlid()}})
 assert.deepEqual((await h.request(root+'?appId='+h.appId,{secret:key.secret})).data,[])
}

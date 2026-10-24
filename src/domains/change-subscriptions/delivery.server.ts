import type {PlatformBindings} from '../../core/platform/bindings'
import type {createChangeSubscriptions} from './service.server'
import {resolveBackgroundContext} from '../authority/background.server'
import {environmentKeyring,open,type Sealed} from '../connections/crypto.server'
import {unbase64} from '../../adapters/crypto.server'
import {delegationCommandId} from '../authority/user-delegation.server'
import {RelayTransport} from '../integrations/relay-transport.server'
import {createWebhookProtocol} from '../../../vendor/base/modules/integrations/core/webhook.ts'
import {IntegrationsRepository} from '../../../vendor/base/modules/integrations/core/repository.ts'
import {D1SqlDatabase} from '../../../vendor/base/modules/integrations/core/database.ts'
import {DeliveryService} from '../../../vendor/base/modules/integrations/core/delivery.ts'
import {retentionMs,type Subscription,type Change} from './storage.server'

export function changeSubscriptionDelivery(env:PlatformBindings,service:ReturnType<typeof createChangeSubscriptions>,appOrigin:string,clock=()=>new Date()){
 const db=env.DB,version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1',keyring=environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)
 async function authorize(row:Subscription){
  const current=await db.prepare("SELECT * FROM record_change_subscriptions WHERE id=? AND state='active' AND expires_at>?").bind(row.id,clock().getTime()).first<Subscription>()
  if(!current)throw new Error('Subscription expired or inactive')
  const ctx=await resolveBackgroundContext(db,{credentialId:row.credential_id,principalId:row.principal_id,requestId:row.id,audience:appOrigin+'/api/v1',ingress:'schedule'})
  await service.access.scopes(ctx,current)
  return {...ctx,now:clock().toISOString()}
 }
 async function secret(row:Subscription){row=(await db.prepare("SELECT * FROM record_change_subscriptions WHERE id=? AND state='active' AND expires_at>?").bind(row.id,clock().getTime()).first<Subscription>())!;if(!row?.sealed_json)throw new Error('Subscription signing secret unavailable');return JSON.parse(await open(keyring,row.app_id,row.id,'change-subscription',JSON.parse(row.sealed_json) as Sealed)) as {url:string;signingKey:string}}
 function delivery(row:Subscription){
  if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new Error('Trusted egress relay is required')
  const relay=new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET)
  return new DeliveryService({repository:new IntegrationsRepository(new D1SqlDatabase(db),row.app_id),now:()=>clock().getTime(),transport:{async send(wire){await authorize(row);return relay.send(wire)}},protocols:[createWebhookProtocol({resolveDestination:async()=> (await secret(row)).url,signingKey:async()=>unbase64((await secret(row)).signingKey)})]})
 }
 return {async tick(commandId?:string){
  await db.prepare('DELETE FROM record_change_windows WHERE captured_at<?').bind(clock().getTime()-retentionMs).run()
  const rows=await db.prepare("SELECT * FROM record_change_subscriptions WHERE state='active' ORDER BY last_sequence,id LIMIT 200").all<Subscription>()
  for(const row of rows.results){
   if(row.expires_at<=clock().getTime()){await db.prepare("UPDATE record_change_subscriptions SET state='expired',sealed_json=NULL WHERE id=? AND expires_at<=?").bind(row.id,clock().getTime()).run();continue}
   let ctx
   try{ctx=await authorize(row)}catch(error){const code=error instanceof Error&&'code'in error?String(error.code):'inactive';const state=['not_found','schema_conflict','forbidden'].includes(code)?'ended':'inactive';await db.prepare('UPDATE record_change_subscriptions SET state=?,delivery_state=?,sealed_json=NULL WHERE id=?').bind(state,'authority_lost',row.id).run();continue}
   const pending=await db.prepare("SELECT id,change_sequence,action,subject_json,changes_json,created_at FROM admission_audit WHERE app_id=? AND change_sequence>? AND created_at>=? ORDER BY change_sequence,id LIMIT 200").bind(row.app_id,row.last_sequence,new Date(clock().getTime()-retentionMs).toISOString()).all<Change>()
   for(const change of pending.results){
    // A queue wake is an optimization. Every audit row after the durable watermark
    // is recovered here; an enqueue interrupted before the watermark is idempotent.
    const projected=await service.access.project(ctx,row,change)
    if(projected){const id=await delegationCommandId(row.id,change.id),client=delivery(row),body=JSON.stringify({subscriptionId:row.id,scope:{appId:row.app_id,entityId:row.entity_id,viewId:row.view_id},changeCount:1,cursor:await service.cursor(row.id,change.change_sequence,Date.parse(change.created_at))});await client.enqueue({id,tenant:row.app_id,destinationId:row.id,event:'record.changed',protocol:'webhook',body});const result=await client.dispatch(id);await db.prepare('UPDATE record_change_subscriptions SET delivery_state=? WHERE id=?').bind(result?.state==='accepted'?'delivered':result?.state==='queued'?'retrying':'failed',row.id).run()}
    await db.prepare('UPDATE record_change_subscriptions SET last_sequence=MAX(last_sequence,?) WHERE id=?').bind(change.change_sequence,row.id).run()
   }
   const due=await db.prepare("SELECT id FROM integration_deliveries WHERE namespace=? AND json_extract(envelope,'$.destinationId')=? AND state='queued' AND next_at<=? ORDER BY next_at,id LIMIT 100").bind(row.app_id,row.id,clock().getTime()).all<{id:string}>()
   for(const entry of due.results){const result=await delivery(row).dispatch(entry.id);await db.prepare('UPDATE record_change_subscriptions SET delivery_state=? WHERE id=?').bind(result?.state==='accepted'?'delivered':result?.state==='queued'?'retrying':'failed',row.id).run()}
  }
 }}
}

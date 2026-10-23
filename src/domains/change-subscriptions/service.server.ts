import type {RequestContext,AuthorityPermit,PolicyPort} from '../authority/ports'
import type {AdmissionPort,SqlMutation} from '../admission/ports'
import type {PlatformBindings} from '../../core/platform/bindings'
import type {createRecordServices} from '../records/service.server'
import {AuthorityError} from '../authority/errors'
import {principalGuards} from '../authority/guards.server'
import {canonicalHash} from '../admission/canonical'
import {trustedPredicate} from '../admission/sql.server'
import {digest,randomSecret} from '../authority/crypto.server'
import {createUlid} from '../../core/shared/ids'
import {environmentKeyring,seal} from '../connections/crypto.server'
import {validateDestination} from '../../../vendor/base/modules/integrations/core/destination.ts'
import {createCursorCodec} from '../records/cursor.server'
import type {ChangeItem} from './schema'
import {resyncRange,CursorExpired} from './resync.server'
import {subscriptionAccess} from './access.server'
import {subscriptions,windows,retentionMs,lifetimeMs,type Subscription,type Change} from './storage.server'

export function createChangeSubscriptions(env:PlatformBindings,policy:PolicyPort,admission:AdmissionPort,services:ReturnType<typeof createRecordServices>,cursorSecret:string){
 const db=env.DB,access=subscriptionAccess(db,policy,services),codec=createCursorCodec(cursorSecret)
 const version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1',keyring=environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)
 const position=async()=>Number((await db.prepare('SELECT COALESCE(MAX(change_sequence),0) n FROM admission_audit').first<{n:number}>())!.n)
 const cursor=(id:string,offset:number,time:number,nonce='origin',upper?:number)=>codec.encode({binding:id+':'+nonce+(upper===undefined?'':':'+upper),revision:time,offset})
 const belongs=(binding:string,id:string)=>binding.startsWith(id+':')
 const decode=async(token:string)=>{try{return await codec.decode(token)}catch{throw new AuthorityError('validation','Invalid signed change cursor.',400)}}
 function safe(row:Subscription){return {id:row.id,appId:row.app_id,entityId:row.entity_id,viewId:row.view_id,state:row.expires_at<=Date.now()?'expired':row.state,deliveryState:row.delivery_state,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString()}}
 async function scopeAvailable(ctx:RequestContext,row:Subscription,allowUnavailable:boolean){
  if(allowUnavailable&&row.state==='ended'&&row.delivery_state==='authority_lost')return false
  try{await access.scopes(ctx,row);return true}catch(error){
   if(!allowUnavailable||row.state!=='active'||!(error instanceof Error&&'code'in error)||!['not_found','schema_conflict','forbidden'].includes(String(error.code)))throw error
   await db.prepare("UPDATE record_change_subscriptions SET state='ended',delivery_state='authority_lost',sealed_json=NULL WHERE id=? AND state='active'").bind(row.id).run()
   row.state='ended';row.delivery_state='authority_lost';row.sealed_json=null;return false
  }
 }
 async function get(ctx:RequestContext,id:string,requireActive=true,allowUnavailable=false){
  await access.key(ctx)
  const row=await db.prepare('SELECT * FROM record_change_subscriptions WHERE id=? AND credential_id=? AND principal_id=?').bind(id,ctx.principal.credentialId,ctx.principal.id).first<Subscription>()
  if(!row)throw new AuthorityError('not_found','Subscription not found.',404)
  await scopeAvailable(ctx,row,allowUnavailable)
  if(requireActive&&(row.expires_at<=Date.parse(ctx.now)||row.state!=='active'&&!(allowUnavailable&&row.state==='ended'&&row.delivery_state==='authority_lost')))throw new AuthorityError('subscription_expired','Subscription is inactive or expired after 7 days. Refresh an active subscription before it expires.',410)
  return row
 }
 async function commit(ctx:RequestContext,commandId:string,action:string,row:Subscription,mutations:SqlMutation[]){const current=row.state==='ended'&&row.delivery_state==='authority_lost'?{scopes:[]}:await access.scopes(ctx,row),guards=[...principalGuards(ctx),...current.scopes.flatMap(s=>s.currentAuthorityGuards)];const permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:ctx.principal.kind},action,appId:row.app_id,grantId:null,grantVersion:null,policyVersion:current.scopes[0]?.policyVersion??0,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]};return admission.commit(ctx,{commandId,action,appId:row.app_id,canonicalInputHash:await canonicalHash({action,id:row.id,expiresAt:row.expires_at}),permit,guards,mutations,audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:safe(row)})}
 return {access,codec,cursor,get,
  async create(ctx:RequestContext,input:{commandId:string;appId:string;entityId?:string;viewId?:string;url:string}){
   const key=await access.key(ctx)
   if(!env.CONNECTION_ENCRYPTION_KEY||!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new AuthorityError('unconfigured','Configure the private connection encryption key and trusted HTTPS egress relay before subscribing.',503)
   let url:URL;try{url=validateDestination(input.url)}catch{throw new AuthorityError('validation','Use a public HTTPS receiver URL.',400)}
   const now=Date.parse(ctx.now),id=createUlid(),signingKey=randomSecret(),last=await position()
   const sealed=await seal(keyring,input.appId,id,'change-subscription',JSON.stringify({url:url.href,signingKey}))
   const row:Subscription={id,app_id:input.appId,entity_id:input.entityId??null,view_id:input.viewId??null,principal_id:ctx.principal.id,credential_id:ctx.principal.credentialId!,owner_id:key.issuer_id,sealed_json:JSON.stringify(sealed),created_at:now,expires_at:now+lifetimeMs,state:'active',last_sequence:last,delivery_state:'ready'}
   const receipt=await commit(ctx,input.commandId,'subscription.create',row,[{kind:'insert',table:subscriptions,row}])
   if(receipt.replay)throw new AuthorityError('version_conflict','Subscription already created. Its secret is shown once; delete it and create a new one to rotate.',409)
   return {...safe(row),signingKey,cursor:await cursor(id,last,now)}
  },
  async list(ctx:RequestContext,appId:string){await access.key(ctx);const rows=await db.prepare('SELECT * FROM record_change_subscriptions WHERE app_id=? AND credential_id=? ORDER BY created_at,id LIMIT 200').bind(appId,ctx.principal.credentialId).all<Subscription>();const out=[];for(const row of rows.results){await scopeAvailable(ctx,row,true);out.push(safe(row))}return out},
  async refresh(ctx:RequestContext,id:string,commandId:string){const row=await get(ctx,id);row.expires_at=Date.parse(ctx.now)+lifetimeMs;await commit(ctx,commandId,'subscription.refresh',row,[{kind:'update',table:subscriptions,set:{expires_at:row.expires_at},where:trustedPredicate("id=? AND credential_id=? AND state='active' AND expires_at>?",[id,ctx.principal.credentialId!,Date.parse(ctx.now)]),expectedRows:1}]);return safe(row)},
  async remove(ctx:RequestContext,id:string,commandId:string){const row=await get(ctx,id,false,true);const held=(await db.prepare('SELECT count(*) n FROM record_change_windows WHERE subscription_id=?').bind(id).first<{n:number}>())!.n;await commit(ctx,commandId,'subscription.delete',row,[{kind:'delete',table:windows,where:trustedPredicate('subscription_id=?',[id]),expectedRows:held},{kind:'delete',table:subscriptions,where:trustedPredicate('id=? AND credential_id=?',[id,ctx.principal.credentialId!]),expectedRows:1}]);return {deleted:true}},
  async changes(ctx:RequestContext,id:string,input:{cursor:string;through?:string;limit:number}){
   const row=await get(ctx,id,true,true),from=await decode(input.cursor),now=Date.parse(ctx.now)
   if(!belongs(from.binding,id))throw new AuthorityError('validation','Cursor belongs to another subscription.',400)
   if(from.revision<now-retentionMs)throw new CursorExpired(resyncRange(input.cursor,await cursor(id,await position(),now)))
   const requested=input.through?await decode(input.through):null
   if(requested&&!belongs(requested.binding,id))throw new AuthorityError('validation','Cursor belongs to another subscription.',400)
   const cursorHash=await digest(input.cursor),bounded=from.binding.split(':').length===3?Number(from.binding.split(':')[2]):requested?.offset??null
   await db.prepare('INSERT INTO record_change_windows(cursor_hash,subscription_id,through_sequence,captured_at) SELECT ?,?,MIN(COALESCE(?,MAX(change_sequence),0),COALESCE(MAX(change_sequence),0)),? FROM admission_audit WHERE 1 ON CONFLICT(cursor_hash) DO NOTHING').bind(cursorHash,id,bounded,now).run()
   const window=(await db.prepare('SELECT through_sequence,captured_at FROM record_change_windows WHERE cursor_hash=? AND subscription_id=?').bind(cursorHash,id).first<{through_sequence:number;captured_at:number}>())!
   const upper={binding:id,offset:window.through_sequence,revision:window.captured_at}
   if(upper.offset<from.offset)throw new AuthorityError('validation','Invalid change window.',400)
   // An unavailable scope never confirms deletion or exposes its retained rows.
   // Capture the same durable range as any fetch and return the existing marker.
   if(row.state==='ended'){
    const continuation=await cursor(id,upper.offset,upper.revision,await digest(input.cursor+':'+upper.offset))
    return {items:[],cursor:continuation,through:await cursor(id,upper.offset,upper.revision),hasMore:false,resyncRequired:resyncRange(input.cursor,continuation)}
   }
   const rows=await db.prepare("SELECT id,change_sequence,action,subject_json,changes_json,created_at FROM admission_audit WHERE app_id=? AND change_sequence>? AND change_sequence<=? AND created_at>=? ORDER BY change_sequence,id LIMIT ?").bind(row.app_id,from.offset,upper.offset,new Date(now-retentionMs).toISOString(),input.limit).all<Change>()
   // Import Kit writes deliberately bypass admission effects (RECORDS-005).
   // Its retained custody has no audit sequence or write timestamp, so no page
   // of this base can claim completeness until those writes are projected.
   // Fetch only: this uncertainty must never wake webhook delivery.
   const imported=await db.prepare('SELECT 1 FROM ik_jobs WHERE destination=? LIMIT 1').bind(row.app_id).first()
   const items:ChangeItem[]=[];let resyncRequired=Boolean(imported)
   for(const change of rows.results){const projected=await access.project(ctx,row,change);if(projected?.resyncRequired)resyncRequired=true;if(projected?.item)items.push(projected.item)}
   const next=rows.results.length===input.limit?rows.results.at(-1)!.change_sequence:upper.offset
   await access.scopes(ctx,row)
   const continuation=await cursor(id,next,upper.revision,await digest(input.cursor+':'+next),next<upper.offset?upper.offset:undefined)
   return {items,cursor:continuation,through:await cursor(id,upper.offset,upper.revision),hasMore:next<upper.offset,...(resyncRequired?{resyncRequired:resyncRange(input.cursor,continuation)}:{})}
  },
 }
}

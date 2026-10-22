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
import {subscriptionAccess} from './access.server'
import {subscriptions,windows,retentionMs,lifetimeMs,type Subscription,type Change} from './storage.server'

export function createChangeSubscriptions(env:PlatformBindings,policy:PolicyPort,admission:AdmissionPort,services:ReturnType<typeof createRecordServices>,cursorSecret:string){
 const db=env.DB,access=subscriptionAccess(db,policy,services),codec=createCursorCodec(cursorSecret)
 const version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1',keyring=environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)
 const position=async()=>Number((await db.prepare('SELECT COALESCE(MAX(change_sequence),0) n FROM admission_audit').first<{n:number}>())!.n)
 const cursor=(id:string,offset:number,time:number,nonce='origin')=>codec.encode({binding:id+':'+nonce,revision:time,offset})
 const belongs=(binding:string,id:string)=>binding.startsWith(id+':')
 function safe(row:Subscription){return {id:row.id,appId:row.app_id,entityId:row.entity_id,viewId:row.view_id,state:row.expires_at<=Date.now()?'expired':row.state,deliveryState:row.delivery_state,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString()}}
 async function get(ctx:RequestContext,id:string,requireActive=true){await access.key(ctx);const row=await db.prepare('SELECT * FROM record_change_subscriptions WHERE id=? AND credential_id=? AND principal_id=?').bind(id,ctx.principal.credentialId,ctx.principal.id).first<Subscription>();if(!row)throw new AuthorityError('not_found','Subscription not found.',404);await access.scopes(ctx,row);if(requireActive&&(row.state!=='active'||row.expires_at<=Date.parse(ctx.now)))throw new AuthorityError('subscription_expired','Subscription is inactive or expired after 7 days. Refresh an active subscription before it expires.',410);return row}
 async function commit(ctx:RequestContext,commandId:string,action:string,row:Subscription,mutations:SqlMutation[]){const current=await access.scopes(ctx,row),guards=[...principalGuards(ctx),...current.scopes.flatMap(s=>s.currentAuthorityGuards)];const permit:AuthorityPermit={actor:{id:ctx.principal.id,kind:ctx.principal.kind},action,appId:row.app_id,grantId:null,grantVersion:null,policyVersion:current.scopes[0]!.policyVersion,validUntil:ctx.principal.expiresAt,guards,reservationMutations:[],reservationIds:[]};return admission.commit(ctx,{commandId,action,appId:row.app_id,canonicalInputHash:await canonicalHash({action,id:row.id,expiresAt:row.expires_at}),permit,guards,mutations,audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:safe(row)})}
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
  async list(ctx:RequestContext,appId:string){await access.key(ctx);const rows=await db.prepare('SELECT * FROM record_change_subscriptions WHERE app_id=? AND credential_id=? ORDER BY created_at,id LIMIT 200').bind(appId,ctx.principal.credentialId).all<Subscription>();const out=[];for(const row of rows.results){await access.scopes(ctx,row);out.push(safe(row))}return out},
  async refresh(ctx:RequestContext,id:string,commandId:string){const row=await get(ctx,id);row.expires_at=Date.parse(ctx.now)+lifetimeMs;await commit(ctx,commandId,'subscription.refresh',row,[{kind:'update',table:subscriptions,set:{expires_at:row.expires_at},where:trustedPredicate("id=? AND credential_id=? AND state='active' AND expires_at>?",[id,ctx.principal.credentialId!,Date.parse(ctx.now)]),expectedRows:1}]);return safe(row)},
  async remove(ctx:RequestContext,id:string,commandId:string){const row=await get(ctx,id,false);const held=(await db.prepare('SELECT count(*) n FROM record_change_windows WHERE subscription_id=?').bind(id).first<{n:number}>())!.n;await commit(ctx,commandId,'subscription.delete',row,[{kind:'delete',table:windows,where:trustedPredicate('subscription_id=?',[id]),expectedRows:held},{kind:'delete',table:subscriptions,where:trustedPredicate('id=? AND credential_id=?',[id,ctx.principal.credentialId!]),expectedRows:1}]);return {deleted:true}},
  async changes(ctx:RequestContext,id:string,input:{cursor:string;through?:string;limit:number}){
   const row=await get(ctx,id),from=await codec.decode(input.cursor),now=Date.parse(ctx.now)
   if(!belongs(from.binding,id))throw new AuthorityError('validation','Cursor belongs to another subscription.',400)
   if(from.revision<now-retentionMs)throw new AuthorityError('cursor_expired','Change cursors are retained for 30 days; resynchronize the scope.',410)
   const requested=input.through?await codec.decode(input.through):null
   if(requested&&!belongs(requested.binding,id))throw new AuthorityError('validation','Cursor belongs to another subscription.',400)
   const cursorHash=await digest(input.cursor)
   await db.prepare('INSERT INTO record_change_windows(cursor_hash,subscription_id,through_sequence,captured_at) SELECT ?,?,MIN(COALESCE(?,MAX(change_sequence),0),COALESCE(MAX(change_sequence),0)),? FROM admission_audit ON CONFLICT(cursor_hash) DO NOTHING').bind(cursorHash,id,requested?.offset??null,now).run()
   const window=(await db.prepare('SELECT through_sequence,captured_at FROM record_change_windows WHERE cursor_hash=? AND subscription_id=?').bind(cursorHash,id).first<{through_sequence:number;captured_at:number}>())!
   const upper={binding:id,offset:window.through_sequence,revision:window.captured_at}
   if(upper.offset<from.offset)throw new AuthorityError('validation','Invalid change window.',400)
   const rows=await db.prepare("SELECT id,change_sequence,action,subject_json,changes_json,created_at FROM admission_audit WHERE app_id=? AND change_sequence>? AND change_sequence<=? AND created_at>=? ORDER BY change_sequence,id LIMIT ?").bind(row.app_id,from.offset,upper.offset,new Date(now-retentionMs).toISOString(),input.limit).all<Change>()
   const items=[];for(const change of rows.results){const projected=await access.project(ctx,row,change);if(projected)items.push(projected)}
   const next=rows.results.length===input.limit?rows.results.at(-1)!.change_sequence:upper.offset
   await access.scopes(ctx,row)
   return {items,cursor:await cursor(id,next,upper.revision,await digest(input.cursor+':'+next)),through:await cursor(id,upper.offset,upper.revision),hasMore:next<upper.offset}
  },
 }
}

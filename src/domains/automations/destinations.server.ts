import type { PolicyPort,RequestContext } from '../authority/ports'
import type { AdmissionPort } from '../admission/ports'
import type { PlatformBindings } from '../../core/platform/bindings'
import { randomSecret,digest } from '../authority/crypto.server'
import { userDelegationPolicy,delegationCommandId } from '../authority/user-delegation.server'
import { canonicalJson } from '../authority/grants.server'
import { AuthorityError } from '../authority/errors'
import { environmentKeyring,seal,open,type Sealed } from '../connections/crypto.server'
import { unbase64 } from '../../adapters/crypto.server'
import { validateDestination } from '../../../vendor/base/modules/integrations/core/destination.ts'
import { createWebhookProtocol } from '../../../vendor/base/modules/integrations/core/webhook.ts'
import { createSlackIncomingWebhookProtocol } from '../../../vendor/base/modules/integrations/slack/protocol.ts'
import { IntegrationsRepository } from '../../../vendor/base/modules/integrations/core/repository.ts'
import { D1SqlDatabase } from '../../../vendor/base/modules/integrations/core/database.ts'
import { DeliveryService } from '../../../vendor/base/modules/integrations/core/delivery.ts'
import type { TrustedTransport } from '../../../vendor/base/modules/integrations/core/types.ts'
import { RelayTransport } from '../integrations/relay-transport.server'
import { destinations } from './storage.server'
import {trustedPredicate} from '../admission/sql.server'
import type {RecordAutomationAction} from './contracts'
import type {Ref} from '../../contracts/primitives'
import {renderSlackEvent,serializeSlackMessage} from '../../../vendor/base/modules/integrations/slack/message.ts'

export function createAutomationDestinations(env:PlatformBindings,policy:PolicyPort,admission:AdmissionPort) {
 const db=env.DB,version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1'
 const keyring=environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)
 async function resolve(appId:string,id:string) {
  const row=await db.prepare('SELECT sealed_json FROM record_automation_destinations WHERE id=? AND app_id=? AND revoked_at IS NULL')
   .bind(id,appId).first<{sealed_json:string}>()
  if(!row)throw new Error('Destination unavailable')
  return JSON.parse(await open(keyring,appId,id,'record-automation.destination',JSON.parse(row.sealed_json) as Sealed)) as {url:string;signingKey:string}
 }
 return {
  async create(ctx:RequestContext,input:{commandId:string;appId:string;entityId:string;kind:'webhook'|'slack';url:string}) {
   const own=await userDelegationPolicy(db,policy,ctx,{...input,name:'Automation destination',permissions:'read',expiresAt:ctx.principal.expiresAt})
   const exported=await policy.scope(ctx,{appId:input.appId,entityId:input.entityId,purpose:'export'})
   if(!env.CONNECTION_ENCRYPTION_KEY)throw new AuthorityError('unconfigured','Configure the private connection encryption key before adding destinations.',503)
   let url:URL
   try{url=validateDestination(input.url)}catch{throw new AuthorityError('validation','Use a public HTTPS receiver URL.',400)}
   if(input.kind==='slack'&&(url.hostname!=='hooks.slack.com'||url.search||!/^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)))
    throw new AuthorityError('validation','Use a Slack incoming webhook URL.',400)
   const id=await delegationCommandId(input.commandId,'destination'),signingKey=randomSecret(),createdAt=Date.parse(ctx.now)
   const sealed=await seal(keyring,input.appId,id,'record-automation.destination',JSON.stringify({url:url.href,signingKey}))
   const receipt=await admission.commit(ctx,{commandId:input.commandId,action:'automation.destination.create',appId:input.appId,
    canonicalInputHash:await digest(canonicalJson(input)),permit:own.permit('automation.destination.create'),guards:[...own.guards,...exported.currentAuthorityGuards],
    mutations:[{kind:'insert',table:destinations,row:{id,app_id:input.appId,owner_id:ctx.principal.id,kind:input.kind,sealed_json:JSON.stringify(sealed),created_at:createdAt,revoked_at:null}}],
    audit:[{action:'automation.destination.create',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,kind:input.kind,createdAt:new Date(createdAt).toISOString()}})
   if(receipt.replay)throw new AuthorityError('version_conflict','Destination already saved. Its signing key is not recoverable; create a new destination to rotate it.',409)
   return {id,kind:input.kind,...(input.kind==='webhook'?{signingKey}:{})}
  },
  async revoke(ctx:RequestContext,input:{commandId:string;appId:string;entityId:string;id:string}) {
   const own=await userDelegationPolicy(db,policy,ctx,{...input,name:'Revoke automation destination',permissions:'read',expiresAt:ctx.principal.expiresAt})
   const row=await db.prepare('SELECT 1 FROM record_automation_destinations WHERE id=? AND app_id=? AND owner_id=?').bind(input.id,input.appId,ctx.principal.id).first()
   if(!row)throw new AuthorityError('not_found','Destination is unavailable.',404)
   return admission.commit(ctx,{commandId:input.commandId,action:'automation.destination.revoke',appId:input.appId,
    canonicalInputHash:await digest(canonicalJson(input)),permit:own.permit('automation.destination.revoke'),guards:own.guards,
    mutations:[{kind:'update',table:destinations,set:{revoked_at:Date.parse(ctx.now)},where:trustedPredicate('id=? AND app_id=? AND owner_id=? AND revoked_at IS NULL',[input.id,input.appId,ctx.principal.id]),expectedRows:1}],
    audit:[{action:'automation.destination.revoke',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id:input.id,revoked:true}})
  },
  async preview(ctx:RequestContext,appId:string,action:Extract<RecordAutomationAction,{kind:'webhook'|'slack'}>,ref:Ref,event:string,recordVersion:number,id:string){
   if(!await db.prepare('SELECT 1 FROM record_automation_destinations WHERE id=? AND app_id=? AND owner_id=? AND kind=? AND revoked_at IS NULL').bind(action.destinationId,appId,ctx.principal.id,action.kind).first())throw new AuthorityError('not_found','Destination is unavailable.',404)
   const destination=await resolve(appId,action.destinationId),body=action.kind==='slack'?serializeSlackMessage(renderSlackEvent('record.changed',action.text,{'record.changed':text=>({summary:text,sections:[text]})})):JSON.stringify({event,record:ref,version:recordVersion,deliveryId:id})
   const protocol=action.kind==='webhook'?createWebhookProtocol({resolveDestination:async()=>destination.url,signingKey:async()=>unbase64(destination.signingKey)}):createSlackIncomingWebhookProtocol({resolveDestination:async()=>destination.url})
   return protocol.prepare({id,tenant:appId,destinationId:action.destinationId,event:'record.'+event,protocol:action.kind==='webhook'?'webhook':'slack.incoming-webhook.v1',body},Date.parse(ctx.now))
  },
  delivery(appId:string,authorize:()=>Promise<void>) {
   if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new AuthorityError('unconfigured','Configure the trusted HTTPS egress relay before enabling outbound actions.',503)
   const relay=new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET)
   const transport:TrustedTransport={async send(wire){await authorize();return relay.send(wire)}}
   return new DeliveryService({repository:new IntegrationsRepository(new D1SqlDatabase(db),appId),transport,protocols:[
    createWebhookProtocol({resolveDestination:async id=>(await resolve(appId,id)).url,signingKey:async envelope=>unbase64((await resolve(appId,envelope.destinationId)).signingKey)}),
    createSlackIncomingWebhookProtocol({resolveDestination:async id=>(await resolve(appId,id)).url}),
   ]})
  },
 }
}

import {z} from 'zod'
import {createUlid} from '../../core/shared/ids'
import type {PlatformBindings} from '../../core/platform/bindings'
import type {ServerFoundation} from '../../core/app/foundation.server'
import type {RequestContext} from '../authority/ports'
import {environmentKeyring,seal,open,type Sealed} from '../connections/crypto.server'
import {ownerDelegationSnapshot} from '../authority/delegation.server'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
import {AuthorityError} from '../authority/errors'
import {baseAccess} from '../records/manual/base-access.server'
import {AdmissionError} from '../admission/errors'
import {and,trustedPredicate} from '../admission/sql.server'
import {validateDestination} from '../../../vendor/base/modules/integrations/core/destination.ts'
export type ChatProvider='slack'|'nook'|'teams'
export type ChatCredentials={clientSecret:string;signingSecret:string;appToken?:string;tenantId?:string}
export const externalTeam=(provider:ChatProvider,id:string)=>provider==='slack'?id:provider+':'+id
export type SlackInstall={instance_id:string;provider:ChatProvider;api_origin:string|null;owner_id:string;client_id:string;sealed_json:string;bot_sealed_json:string|null;team_id:string|null;team_name:string|null;version:number}
const input=z.object({provider:z.enum(['slack','nook','teams']).default('slack'),clientId:z.string().regex(/^[A-Za-z0-9._-]{1,200}$/),clientSecret:z.string().min(1).max(1000).optional(),signingSecret:z.string().min(1).max(1000).optional(),nookOrigin:z.string().max(2048).optional(),appToken:z.string().min(1).max(4096).optional(),tenantId:z.string().uuid().optional()}).strict().superRefine((value,ctx)=>{for(const key of value.provider==='nook'?['nookOrigin','appToken','signingSecret'] as const:value.provider==='teams'?['clientSecret','tenantId'] as const:['clientSecret','signingSecret'] as const)if(!value[key])ctx.addIssue({code:'custom',path:[key],message:'This provider configuration is required'})})
export function slackSettings(env:PlatformBindings,foundation:ServerFoundation,origin:string){
 const db=env.DB,version=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1',ring=environmentKeyring(version,v=>v===version?env.CONNECTION_ENCRYPTION_KEY:undefined)
 async function row(){return db.prepare("SELECT * FROM slack_app_installation WHERE id='installation'").first<SlackInstall>()}
 const guard=(installation:SlackInstall)=>trustedPredicate("EXISTS(SELECT 1 FROM slack_app_installation i JOIN authority_principals p ON p.id=i.owner_id JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE i.id='installation' AND i.version=? AND i.instance_id=? AND p.state='active' AND o.role='owner' AND o.status='active')",[installation.version,installation.instance_id])
 async function resolve(installed=false){
  const installation=await row();if(!installation)throw new AuthorityError('unconfigured','Configure the chat app in Settings first.',503)
  const current=guard(installation)
  if(!await db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first())throw new AuthorityError('forbidden','The chat app configuring owner is no longer active.')
  const credentials=JSON.parse(await open(ring,'workspace','installation','slack-app.configuration',JSON.parse(installation.sealed_json) as Sealed)) as ChatCredentials
  if(installed&&(!installation.bot_sealed_json||!installation.team_id))throw new AuthorityError('unconfigured','Install the selected chat app from Settings first.',503)
  const bot=installation.bot_sealed_json?JSON.parse(await open(ring,'workspace','installation','slack-app.bot',JSON.parse(installation.bot_sealed_json) as Sealed)) as {token:string;scopes:string[]}:null
  return {installation,credentials,bot,guard:current}
 }
 async function canOwn(ctx:RequestContext,appId:string){try{await ownerDelegationSnapshot(db,ctx,appId);return true}catch(error){if(error instanceof AuthorityError)return false;throw error}}
 async function baseOwner(ctx:RequestContext,appId:string){
  const access=await baseAccess(db,ctx,appId)
  if(access){if(!access.canManage)throw new AuthorityError('forbidden','Only a current base owner can configure Slack unfurl fields.');return and(...access.guards)}
  if(appId!==LAUNCH_APP_ID)throw new AuthorityError('forbidden','Slack unfurl fields require an included base with a current owner.')
  return (await ownerDelegationSnapshot(db,ctx,appId)).guard
 }
 async function canManage(ctx:RequestContext,appId:string){try{await baseOwner(ctx,appId);return true}catch(error){if(error instanceof AuthorityError||error instanceof AdmissionError&&error.code==='forbidden')return false;throw error}}
 const safeOwnerSql=`FROM slack_app_unfurl_fields f JOIN authority_principals p ON p.id=f.owner_id
  JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id
  JOIN authority_memberships a ON a.principal_id=p.id AND a.app_id=f.app_id
  JOIN authority_policies policy ON policy.id=a.policy_id AND policy.app_id=a.app_id
  LEFT JOIN manual_record_bases b ON b.id=f.app_id
  LEFT JOIN manual_base_roles r ON r.app_id=f.app_id AND r.principal_id=p.id AND r.policy_id=a.policy_id
  WHERE f.app_id=? AND f.entity_id=? AND p.kind='human' AND p.state='active' AND o.status='active' AND a.state='active'
  AND ((b.id IS NOT NULL AND (b.owner_id=p.id OR r.role='owner')) OR (b.id IS NULL AND f.app_id=? AND o.role='owner'))`
 async function safeFields(appId:string,entityId:string){
  const values=[appId,entityId,LAUNCH_APP_ID],saved=await db.prepare('SELECT f.fields_json,f.version '+safeOwnerSql).bind(...values).first<{fields_json:string;version:number}>()
  return saved?{fieldIds:JSON.parse(saved.fields_json) as string[],guard:trustedPredicate('EXISTS(SELECT 1 '+safeOwnerSql+' AND f.version=?)',[...values,saved.version])}:null
 }
 return {row,guard,resolve,canOwn,safeFields,async sealBot(value:{token:string;scopes:string[]}){return JSON.stringify(await seal(ring,'workspace','installation','slack-app.bot',JSON.stringify(value)))},
  async read(ctx:RequestContext,appId?:string,entityId?:string){
   const installation=await row(),canConfigure=await canOwn(ctx,LAUNCH_APP_ID),canManageUnfurls=Boolean(appId&&entityId&&await canManage(ctx,appId))
   const link=installation?.team_id?await db.prepare(`SELECT l.slack_user_id FROM slack_app_links l JOIN authority_principals p ON p.id=l.principal_id JOIN cradle_base_operators m ON m.principal_id=p.id AND m.base_id=l.base_operator_id JOIN oa_operators o ON o.id=m.base_id WHERE l.team_id=? AND l.principal_id=? AND l.authentication_epoch=? AND p.state='active' AND p.authentication_epoch=l.authentication_epoch AND o.status='active' AND o.version=l.base_operator_version`).bind(installation.team_id,ctx.principal.id,ctx.principal.authenticationEpoch).first<{slack_user_id:string}>():null
   const safe=appId&&entityId?await db.prepare('SELECT fields_json FROM slack_app_unfurl_fields WHERE app_id=? AND entity_id=?').bind(appId,entityId).first<{fields_json:string}>():null
   if(appId&&entityId)await foundation.policy.scope(ctx,{appId,entityId,purpose:'read'})
   return {provider:installation?.provider??'slack',nookOrigin:installation?.api_origin??'',configured:Boolean(installation),installed:Boolean(installation?.bot_sealed_json),clientId:installation?.client_id??'',teamName:installation?.team_name??'',linked:Boolean(link),slackUserId:link?.slack_user_id??null,canConfigure,canManageUnfurls,unfurlSafeFieldIds:safe?JSON.parse(safe.fields_json) as string[]:[],oauthCallbackUrl:origin+'/oauth/'+(installation?.provider??'slack')+'/callback',interactionUrl:origin+'/webhooks/'+(installation?.provider??'slack')+'/actions',eventsUrl:origin+'/webhooks/'+(installation?.provider??'slack')+'/events',linkCommandUrl:origin+'/webhooks/'+(installation?.provider??'slack')+'/link'}
  },
  async save(ctx:RequestContext,value:unknown){
   const own=await ownerDelegationSnapshot(db,ctx,LAUNCH_APP_ID),configuration=input.parse(value)
   if(!env.CONNECTION_ENCRYPTION_KEY)throw new AuthorityError('unconfigured','Configure the private connection encryption key before saving the chat app.',503)
   let apiOrigin:string|null=null
   if(configuration.provider==='nook'){let url:URL;try{url=validateDestination(configuration.nookOrigin!)}catch{throw new AuthorityError('validation','Use the public HTTPS origin of the Nook installation.',400)}if(url.pathname!=='/'||url.search||url.hash)throw new AuthorityError('validation','The Nook origin cannot include a path, query or fragment.',400);apiOrigin=url.origin}
   const sealed=JSON.stringify(await seal(ring,'workspace','installation','slack-app.configuration',JSON.stringify({clientSecret:configuration.clientSecret??'',signingSecret:configuration.signingSecret??'',...(configuration.appToken?{appToken:configuration.appToken}:{}),...(configuration.tenantId?{tenantId:configuration.tenantId}:{})})))
   const result=await db.prepare(`INSERT INTO slack_app_installation(id,owner_id,client_id,sealed_json,version,updated_at,provider,api_origin,instance_id) SELECT 'installation',?,?,?,1,?,?,?,? WHERE ${own.guard.sql} ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,client_id=excluded.client_id,sealed_json=excluded.sealed_json,provider=excluded.provider,api_origin=excluded.api_origin,instance_id=excluded.instance_id,bot_sealed_json=NULL,team_id=NULL,team_name=NULL,version=slack_app_installation.version+1,updated_at=excluded.updated_at`).bind(ctx.principal.id,configuration.clientId,sealed,ctx.now,configuration.provider,apiOrigin,createUlid(),...own.guard.values).run()
   if(!result.meta.changes)throw new AuthorityError('forbidden','Installation ownership changed before saving the chat app.')
   return this.read(ctx)
  },
  async remove(ctx:RequestContext){const own=await ownerDelegationSnapshot(db,ctx,LAUNCH_APP_ID);await db.prepare(`DELETE FROM slack_app_installation WHERE id='installation' AND (${own.guard.sql})`).bind(...own.guard.values).run();return this.read(ctx)},
  async fields(ctx:RequestContext,value:unknown){
   const data=z.object({appId:z.string(),entityId:z.string(),fieldIds:z.array(z.string()).max(500)}).strict().parse(value),ownership=await baseOwner(ctx,data.appId),scope=await foundation.policy.scope(ctx,{appId:data.appId,entityId:data.entityId,purpose:'read'}),descriptor=foundation.descriptors.get(data.appId,data.entityId)
   if(new Set(data.fieldIds).size!==data.fieldIds.length||data.fieldIds.some(id=>!descriptor.fields.has(id)||!scope.readableFieldIds.includes(id)))throw new AuthorityError('forbidden','Choose fields you can currently read in this base.')
   const current=and(ownership,...scope.currentAuthorityGuards)
   const result=await db.prepare(`INSERT INTO slack_app_unfurl_fields(app_id,entity_id,owner_id,fields_json,version) SELECT ?,?,?,?,1 WHERE ${current.sql} ON CONFLICT(app_id,entity_id) DO UPDATE SET owner_id=excluded.owner_id,fields_json=excluded.fields_json,version=slack_app_unfurl_fields.version+1`).bind(data.appId,data.entityId,ctx.principal.id,JSON.stringify(data.fieldIds),...current.values).run()
   if(!result.meta.changes)throw new AuthorityError('forbidden','Base ownership changed before saving unfurl fields.')
   return this.read(ctx,data.appId,data.entityId)
  },
 }
}

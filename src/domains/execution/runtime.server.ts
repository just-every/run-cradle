import {outlookCalendarAdapter} from '../../adapters/outlook-calendar.server';
import {recordCalendarAdapter} from '../../adapters/record-calendar.server';
import {readCalendarChanges,calendarSettlement} from '../records/calendar-sync/readback.server';
import {runFileStoreOperation} from '../records/file-stores/operation.server';
import {fileStoreProviders} from '../connections/oauth.server';
import {captureSheets} from '../records/sheets/capture.server'
import type { RequestContext,AuthConfiguration } from '../authority/ports';
import { createNotificationMailAuthority } from '../channels/mail-authority.server';
import { createApiKeyWriter } from '../connections/api-keys.server';
import { createWebhookPlanner } from '../connections/webhook-plan.server';
import { createConnectionService } from '../connections/service.server';
import { createCredentialAccess } from '../connections/credential-access.server';
import type { OAuthConfiguration,OAuthProvider } from '../connections/oauth.server';
import { environmentKeyring } from '../connections/crypto.server';
import { resendAdapter } from '../../adapters/resend.server';
import { calendarAdapter } from '../../adapters/calendar.server';
import { xeroAdapter } from '../../adapters/xero.server';
import { openaiAdapter } from '../../adapters/openai.server';
import { gmailPoller,type MailIntakePort } from '../../adapters/gmail.server';
import type { ProviderAdapter } from '../../adapters/contracts';
import { createExecutionService } from './service.server';
import { createExecutionHandlers } from './handlers.server';
import { createExecutionBackground } from './background.server';
import { createExecutionBudget } from './budget-bridge.server';
import { privatePayloadStore } from './payloads.server';
import type { ExecutionDependencies } from './ports';
import type { ModelSchema } from './model-ports';
import type { EffectRequest } from './contracts';
import { ApiError } from '../../core/registry/errors';
import type {EntityRegistry} from '../authority/scope.server';
export type ProviderRuntimeOptions=Pick<ExecutionDependencies,'db'|'admission'|'policy'|'workspaceId'|'currentGuards'|'observations'|'calendarAuthority'> & {
 notificationEntities?:EntityRegistry;bucket:R2Bucket;auth:AuthConfiguration;keyVersion:string;encryptionKey(version:string):string|undefined;
 /** Explicit provider-secret allowlist, never the full environment binding object. */
 secrets:ReadonlyMap<string,{dispatch?:string;readback?:string}>;
 oauth(provider:OAuthProvider):OAuthConfiguration;schemas:ReadonlyMap<string,ModelSchema>;
 webhookSecrets?:ReadonlyMap<string,{provider:'resend'|'xero';secret:string}>;
 webhookObservation?:Parameters<typeof createWebhookPlanner>[2];
 intake?(ctx:RequestContext,connectionId:string):Promise<{port:MailIntakePort;scope:unknown;pageToken:string|null}>;
};
export function createProviderRuntime(o:ProviderRuntimeOptions){
 const keyring=environmentKeyring(o.keyVersion,o.encryptionKey),payloads=privatePayloadStore(o.bucket,o.db),notification=createNotificationMailAuthority(o.db,o.notificationEntities),credentialAccess=createCredentialAccess(o.db,o.policy);
 const background=createExecutionBackground(o.db,{notification:notification.context});
 function connections(ctx:RequestContext):ReturnType<typeof createConnectionService>{return createConnectionService({db:o.db,admission:o.admission,policy:o.policy,workspaceId:o.workspaceId,keyring,appOrigin:o.auth.appOrigin,context:async()=>ctx,oauth:o.oauth,secret:async(ref,purpose)=>o.secrets.get(ref)?.[purpose],credentialAuthority:async(context,id,purpose,operation)=>{
  if(operation.attemptId){const saved=await o.db.prepare('SELECT a.connection_id,r.actor_json,r.request_json FROM execution_attempts a JOIN execution_runs r ON r.id=a.run_id WHERE a.id=?').bind(operation.attemptId).first<{connection_id:string;actor_json:string;request_json:string}>();if(saved&&saved.connection_id===id&&JSON.parse(saved.actor_json).id===context.principal.id){const r=JSON.parse(saved.request_json) as EffectRequest;if(r.action==='notification.email.send')return notification.authorize(context,r,'reconcile');if(r.action==='record.calendar.sync'&&o.calendarAuthority)return o.calendarAuthority(context,r,purpose==='dispatch'?'dispatch':'reconcile');}}
  return credentialAccess(context,id,purpose,operation);
 },sync:async(context,id):Promise<void|{activity:'transient-read'}>=>{const adapter=await o.db.prepare('SELECT adapter_id FROM provider_connections WHERE id=?').bind(id).first<{adapter_id:string}>();if(adapter&&(fileStoreProviders as readonly string[]).includes(adapter.adapter_id))return runFileStoreOperation(o.db,context,id,connections(context).credentials);if(adapter?.adapter_id==='google-calendar'||adapter?.adapter_id==='outlook')return readCalendarChanges(o.db,context,id,connections(context).credentials);if(adapter?.adapter_id==='google-sheets')return captureSheets(o.db,o.policy,o.admission,context,id,connections(context).credentials);if(!o.intake)throw new ApiError('unconfigured','Scoped Gmail source intake is unavailable.');const configured=await o.intake(context,id),service=connections(context);await gmailPoller(service.credentials,configured.port)(id,configured.scope,configured.pageToken,new Date(Date.now()+60000).toISOString(),{jobId:context.requestId});}});}
 const accounting=createExecutionBudget(o.db);
 const dependencies:ExecutionDependencies={db:o.db,admission:o.admission,policy:o.policy,workspaceId:o.workspaceId,keyring,payloads,...accounting,calendarAuthority:o.calendarAuthority,settlement:async(ctx,r,ids,result,binding)=>{const budget=await accounting.settlement(ctx,r,ids,result,binding);const calendar=await calendarSettlement(o.db,r,result,binding.attemptId);return {...budget,guards:[...budget.guards,...calendar.guards],mutations:[...budget.mutations,...calendar.mutations]};},observations:o.observations,notificationMailAuthority:notification.authorize,backgroundContext:background.run,
  currentGuards:async(ctx,r,mode,identity)=>r.action==='notification.email.send'?[...(await notification.authorize(ctx,r,mode)).guards]:o.currentGuards(ctx,r,mode,identity),
  adapters:ctx=>{const credentials=connections(ctx).credentials;return new Map<string,ProviderAdapter>([['outlook',outlookCalendarAdapter(credentials)],['resend',resendAdapter(credentials)],['google-calendar',(()=>{const repair=calendarAdapter(credentials),record=recordCalendarAdapter(credentials);const adapter=(e:import('../../adapters/contracts').EffectInput)=>e.input&&typeof e.input==='object'&&!Array.isArray(e.input)&&'definitionId'in e.input?record:repair;return {id:'google-calendar',version:'2',preflight:e=>adapter(e).preflight(e),execute:e=>adapter(e).execute(e),reconcile:e=>adapter(e).reconcile(e)};})()],['xero',xeroAdapter(credentials)],['openai',openaiAdapter(credentials,(value,sourceIds,name)=>{const schema=o.schemas.get(name);if(!schema)throw new Error('Unregistered model output schema');return schema.validate(value,sourceIds);})]]);}
 };
 const execution=createExecutionService(dependencies),handlers=createExecutionHandlers(dependencies);
 async function webhook(connectionId:string,provider:'resend'|'xero',body:unknown){let permit:Awaited<ReturnType<typeof execution.reconciliationPermit>>|undefined;const guards:import('../admission/ports').SqlPredicate[]=[];
  const planner=createWebhookPlanner(o.db,async(id,runId)=>{const ctx=await background.run(runId,'queue');const scoped=await execution.reconciliationPermit(ctx,runId);if(permit&&permit.actor.id!==scoped.actor.id)throw new ApiError('forbidden','Webhook batch spans authorities.');permit=scoped;guards.push(...scoped.guards);return ctx;},o.webhookObservation);
  const plan=await planner(connectionId,provider,body);if(!permit)throw new ApiError('forbidden','Webhook has no bound authority.');return {...plan,permit,guards:[...plan.guards,...guards]};
 }
 async function webhookSecret(connectionId:string,provider:'resend'|'xero'){const configured=o.webhookSecrets?.get(connectionId);if(!configured||configured.provider!==provider)throw new ApiError('unconfigured','Connection webhook signing secret is unavailable.');const row=await o.db.prepare('SELECT id FROM provider_connections WHERE id=? AND adapter_id=? AND state=? AND revoked_at IS NULL').bind(connectionId,provider,'connected').first();if(!row)throw new ApiError('forbidden','Webhook connection is not current.');return configured.secret;}
 return {execution,handlers,dependencies,connections,keyring,background,webhook,webhookSecret,writeCredentials:createApiKeyWriter({...o,keyring}),notificationAuthority:notification};
}

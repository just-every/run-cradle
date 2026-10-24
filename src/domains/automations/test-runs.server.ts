import type {PlatformBindings} from '../../core/platform/bindings'
import type {ServerFoundation} from '../../core/app/foundation.server'
import type {createRecordServices} from '../records/service.server'
import type {RequestContext} from '../authority/ports'
import type {createAutomationDestinations} from './destinations.server'
import type {createAutomationEffects} from './effects.server'
import {recordAutomationDefinition} from './contracts'
import {automationTestPreview,type ConfirmationEffect} from './test-preview.server'
import {sendBuilderTestMail} from './test-mail.server'
import {automationRecipient} from './recipients.server'
import {ownerDelegationSnapshot} from '../authority/delegation.server'
import {and,identifier,registerTable,trustedPredicate} from '../admission/sql.server'
import {canonicalHash,canonical} from '../admission/canonical'
import {AuthorityError} from '../authority/errors'
import type {AutomationRun} from './run-store.server'
const tests=registerTable('record_automation_tests',['id','automation_id','owner_id','app_id','entity_id','record_id','definition_version','record_version','mode','state','created_at','result_json','confirmation_hash'])
type Stored={id:string;automation_id:string;owner_id:string;app_id:string;entity_id:string;record_id:string;definition_version:number;record_version:number;mode:string;state:string;created_at:string;result_json:string;confirmation_hash:string}
/** Claim before the one permitted mail call. Neither retries, scheduler nor restore
 * may turn a test row into another effect. Interrupted dispatch stays unknown. */
export function createAutomationTests(env:PlatformBindings,foundation:ServerFoundation,reader:ReturnType<typeof createRecordServices>['reader'],destinations:ReturnType<typeof createAutomationDestinations>,effects:ReturnType<typeof createAutomationEffects>){
 const db=env.DB,{policy,admission,descriptors,entities}=foundation
 return {async run(ctx:RequestContext,input:{id:string;commandId:string;recordId:string;event:'created'|'updated';live?:{previewId:string;effects:ConfirmationEffect[]}}){
  const binding=await db.prepare('SELECT b.*,a.definition_version,v.definition_json FROM record_automation_bindings b JOIN automations a ON a.id=b.automation_id JOIN record_automation_versions v ON v.automation_id=a.id AND v.definition_version=a.definition_version WHERE b.automation_id=?').bind(input.id).first<{app_id:string;entity_id:string;owner_id:string;definition_version:number;definition_json:string}>()
  if(!binding||binding.owner_id!==ctx.principal.id)throw new AuthorityError('not_found','Only the automation author can test it.',404)
  const own=await ownerDelegationSnapshot(db,ctx,binding.app_id),scope=await policy.scope(ctx,{appId:binding.app_id,entityId:binding.entity_id,purpose:'read'}),ref={appId:binding.app_id,entityId:binding.entity_id,recordId:input.recordId},record=await reader.record(ctx,scope,ref),definition=recordAutomationDefinition.parse(JSON.parse(binding.definition_json))
  if(definition.trigger||definition.steps||definition.actions.some(action=>action.when))throw new AuthorityError('unconfigured','The builder test panel does not yet support these saved triggers or control steps. Use run history for enabled control definitions.',503)
  if(definition.actions.some(action=>['email','webhook','slack','sms','slack-app'].includes(action.kind)))await policy.scope(ctx,{appId:ref.appId,entityId:ref.entityId,purpose:'export'})
  if(definition.actions.some(action=>action.kind==='update'&&(!scope.writableFieldIds.includes(action.fieldId)||!scope.readableFieldIds.includes(action.fieldId))))throw new AuthorityError('forbidden','A test requires current read and write authority for each update field.')
  const narrow=(value:string)=>{const result=JSON.parse(value);for(const step of result.steps??[])if(step.input?.values)step.input.values=Object.fromEntries(Object.entries(step.input.values).filter(([id])=>scope.readableFieldIds.includes(id)));return result}
  const id=input.commandId,mode=input.live?'live':'dry',hash=await canonicalHash(input)
  const replay=await admission.replay(ctx,id,'automation.test',ref.appId,hash)
  async function replayResult(){const prior=await db.prepare('SELECT result_json,definition_version FROM record_automation_tests WHERE id=? AND owner_id=?').bind(id,ctx.principal.id).first<{result_json:string;definition_version:number}>();if(!prior)throw new AuthorityError('not_found','Test run is unavailable.',404);if(prior.definition_version!==binding!.definition_version)throw new AuthorityError('version_conflict','The automation definition changed. Start a new test command; this test will not resend.',409);await reader.assertScope(ctx,scope);return narrow(prior.result_json)}
  if(replay)return replayResult()
  const preview=await automationTestPreview({db,entities,descriptors,destinations},ctx,scope,id,definition,record,input.event)
  const confirmationHash=await canonicalHash({automationId:input.id,definitionVersion:binding.definition_version,recordId:record.id,recordVersion:record.version,event:input.event,effects:preview.confirmationEffects})
  if(input.live){const prior=await db.prepare('SELECT * FROM record_automation_tests WHERE id=? AND owner_id=? AND mode=\'dry\'').bind(input.live.previewId,ctx.principal.id).first<Stored>();if(!prior||prior.state!=='Complete'||prior.confirmation_hash!==confirmationHash||canonical(input.live.effects)!==canonical(preview.confirmationEffects))throw new AuthorityError('version_conflict','Preview the current record and confirm every named effect and destination before a live test.',409)}
  const guard=and(own.guard,...scope.currentAuthorityGuards,trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND definition_version=?)',[input.id,binding.definition_version]))
  let version=record.version
  const descriptor=descriptors.get(ref.appId,ref.entityId),recordGuard=trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(descriptor.table.tableId)} WHERE ${identifier(descriptor.idColumn)}=? AND ${identifier(descriptor.versionColumn)}=? AND (${scope.rowPredicate.sql}))`,[record.id,record.version,...scope.rowPredicate.values])
  async function authorize(){await reader.assertScope(ctx,scope);if((await reader.record(ctx,scope,ref)).version!==version)throw new AuthorityError('version_conflict','The chosen record changed during this test.',409);if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new AuthorityError('forbidden','The author’s authority or automation changed before the test effect.')}
  await authorize()
  const result={id,mode,testMode:mode,definitionVersion:binding.definition_version,recordId:record.id,recordLabel:record.id,state:'Unknown',queuedAt:ctx.now,trigger:preview.trigger,steps:preview.steps,confirmationEffects:preview.confirmationEffects}
  // Receiver URLs may contain credentials. History stores destination IDs and
  // payloads, never decrypted URLs or the signing secret.
  function withoutReceiverUrls(value:unknown):unknown{if(Array.isArray(value))return value.map(withoutReceiverUrls);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='wire'&&item&&typeof item==='object'?{...item as object,url:undefined}:withoutReceiverUrls(item)]));return value}
  function storedResult(){return JSON.stringify({...result,confirmationEffects:undefined,steps:result.steps.map(step=>step.kind==='webhook'||step.kind==='slack'?{...step,output:withoutReceiverUrls(step.output)}:step)})}

  const permit=await policy.authorize(ctx,{appId:ref.appId,targetEntityId:ref.entityId,action:'view.preview',expected:[],cost:[],inputHash:hash})
  const claimed=await admission.commit(ctx,{commandId:id,action:'automation.test',appId:ref.appId,canonicalInputHash:hash,permit:{...permit,action:'automation.test'},guards:[guard,recordGuard],mutations:[{kind:'insert',table:tests,row:{id,automation_id:input.id,owner_id:ctx.principal.id,app_id:ref.appId,entity_id:ref.entityId,record_id:record.id,definition_version:binding.definition_version,record_version:record.version,mode,state:'Unknown',created_at:ctx.now,result_json:storedResult(),confirmation_hash:confirmationHash}}],audit:[{action:'automation.test',subject:ref,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,mode}})
  if(claimed.replay)return replayResult()
  const effectContext={...ctx,causeRunIds:[...(ctx.causeRunIds??[]),id]}
  const run:AutomationRun={id,automation_id:input.id,definition_version:binding.definition_version,subject_id:record.id,state:'Running',definition_json:JSON.stringify({definition,event:{ref,event:input.event,version:record.version}}),cause_run_ids_json:'[]',principal_id:ctx.principal.id,credential_id:null,app_id:ref.appId,entity_id:ref.entityId}
  for(const step of result.steps){if(!preview.trigger.matches||step.state==='Failed')continue;const action=definition.actions[step.position]
   try{
    await authorize()
    if(mode==='live'){
     const outcome=await effects.execute(effectContext,run,{id:step.id,position:step.position,state:'Running',idempotency_key:step.id,started_at:Date.parse(ctx.now),result_json:null},action,scope,trustedPredicate('1'),version,authorize)
     step.state=outcome.state;step.output={preview:step.output,result:outcome.result};if(outcome.errorCode)step.errorCode=outcome.errorCode;if(action.kind==='update'&&outcome.state==='Complete')version=(await reader.record(ctx,scope,ref)).version
    }else if(action.kind==='email'){
     if(!ctx.principal.humanId)throw new AuthorityError('forbidden','A builder email address is required.')
     const builder=await automationRecipient(db,entities,ctx,{...ref,operatorId:ctx.principal.humanId})
     const sent=await sendBuilderTestMail(env,{id:step.id,email:builder.email,subject:action.subject,text:action.text},async()=>{await authorize();if(!await db.prepare(`SELECT 1 WHERE ${builder.guard.sql}`).bind(...builder.guard.values).first())throw new AuthorityError('forbidden','Builder mail authority changed.')})
     step.state=sent.state;step.output={...step.output as object,to:[builder.email],builderOnly:true,sent:sent.status==='accepted'||sent.status==='development',provider:sent}
    }else step.state='Complete'
   }catch(error){step.state=error instanceof AuthorityError?'Failed':['email','webhook','slack','sms','slack-app'].includes(action.kind)?'Unknown':'Failed';step.errorCode=error instanceof Error&&'code'in error?String(error.code):'test_failed';step.output={error:error instanceof Error?error.message:'The test failed.'}}
   if(['Unknown','Failed'].includes(step.state)){for(const later of result.steps.slice(step.position+1))if(later.state==='Preview')later.state='Skipped';break}
  }
  result.state=result.steps.some(step=>step.state==='Unknown')?'Unknown':result.steps.some(step=>step.state==='Failed')?'Failed':'Complete'
  await db.prepare('UPDATE record_automation_tests SET state=?,result_json=? WHERE id=?').bind(result.state,storedResult(),id).run()
  await authorize();return result
 }}
}

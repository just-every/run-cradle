import {z} from 'zod'
import {createUlid} from '../../../core/shared/ids'
import {canonicalHash} from '../../admission/canonical'
import {registerTable,trustedPredicate} from '../../admission/sql.server'
import type {ServerFoundation} from '../../../core/app/foundation.server'
import type {RequestContext} from '../../authority/ports'
import {ApiError} from '../../../core/registry/errors'
import {dueSchedule} from '../../../apps/launch/schedule'
import {csvPreviewInput,type createRecordsCsv} from '../csv.server'
import {idSchema} from '../validators'
import {sheetCsv,type createSheetsImport} from './import.server'
import {assertGuards} from '../fence.server'
import type {CsvImportPreview} from '../csv-import-contracts'
const table=registerTable('record_sheet_schedules',['id','owner_id','connection_id','app_id','entity_id','sheet','mapping_json','merge_field_id','state','version','last_slot','last_started_at','running_id','result_json','created_at'])
const inputSchema=csvPreviewInput.pick({appId:true,entityId:true,mapping:true,mergeFieldId:true}).extend({connectionId:idSchema,sheet:z.string().min(1).max(200),enabled:z.boolean()}).strict()
type Row={id:string;owner_id:string;connection_id:string;app_id:string;entity_id:string;sheet:string;mapping_json:string;merge_field_id:string;version:number;state:string;result_json:string|null}
type Counts=Pick<CsvImportPreview,'creates'|'updates'|'unchanged'|'rejected'>
type Outcome={runId:string;slot:string;status:'committed'|'unchanged'|'review_required'|'paused';previewId?:string;prospective?:Counts;applied:{creates:number;updates:number};refusals?:CsvImportPreview['errors'];error?:string;fieldIds?:string[]}
const counts=(preview:CsvImportPreview):Counts=>({creates:preview.creates,updates:preview.updates,unchanged:preview.unchanged,rejected:preview.rejected})
export function createSheetSchedules(db:D1Database,foundation:ServerFoundation,source:ReturnType<typeof createSheetsImport>,csv:ReturnType<typeof createRecordsCsv>,clock=()=>new Date()){
 function reviewFields(row:Row){const schema=foundation.descriptors.get(row.app_id,row.entity_id).schema,primary=schema.primaryFieldId??schema.fields.find(field=>field.type==='text')?.id;return [...(JSON.parse(row.mapping_json) as {fieldId:string}[]).map(item=>item.fieldId),...(primary?[primary]:[])]}
 async function read(ctx:RequestContext,id:string){
  await source.owner(ctx)
  const row=await db.prepare('SELECT * FROM record_sheet_schedules WHERE id=?').bind(id).first<Row>()
  if(!row)throw new ApiError('not_found','Sheets schedule not found.')
  const result=row.result_json?JSON.parse(row.result_json) as Outcome:null
  const fieldIds=[...new Set([...reviewFields(row),...(result?.fieldIds??[])])]
  const permit=await foundation.policy.authorize(ctx,{appId:row.app_id,targetEntityId:row.entity_id,fieldIds,action:'import.preview',expected:[],cost:[],inputHash:await canonicalHash({scheduleId:id})})
  const scope=await foundation.policy.scope(ctx,{appId:row.app_id,entityId:row.entity_id,purpose:'read'})
  // Retained refusal labels may name any source row. Narrowed readers must not see them.
  if(!scope.unrestrictedRows||fieldIds.some(fieldId=>!scope.readableFieldIds.includes(fieldId)))throw new ApiError('forbidden','Current access does not cover this import outcome.')
  await assertGuards(db,[...permit.guards,...scope.currentAuthorityGuards]);await source.owner(ctx)
  const {fieldIds:_,...outcome}=result??{}
  return {id:row.id,appId:row.app_id,entityId:row.entity_id,state:row.state,frequency:'hourly',outcome:result?outcome:null}
 }
 async function configure(ctx:RequestContext,input:unknown){await source.owner(ctx);const data=inputSchema.parse(input),hash=await canonicalHash(data),permit=await foundation.policy.authorize(ctx,{appId:data.appId,targetEntityId:data.entityId,action:'import.commit',expected:[],cost:[],inputHash:hash})
  const connection=await db.prepare('SELECT app_id FROM provider_connections WHERE id=?').bind(data.connectionId).first<{app_id:string}>();if(connection?.app_id!==data.appId)throw new ApiError('validation','A scheduled source must be connected in the destination base.');
  if(data.enabled){const capture=await source.read(ctx,data.connectionId),preview=await csv.preview(ctx,{appId:data.appId,entityId:data.entityId,mapping:data.mapping,mergeFieldId:data.mergeFieldId,csv:sheetCsv(capture,data.sheet)});if(preview.rejected)throw new ApiError('validation','The fresh source preview has refused rows. Correct them before enabling this schedule.')}
  const prior=await db.prepare('SELECT * FROM record_sheet_schedules WHERE app_id=? AND entity_id=? AND connection_id=? AND sheet=?').bind(data.appId,data.entityId,data.connectionId,data.sheet).first<Row>(),id=prior?.id??createUlid(),values={owner_id:ctx.principal.id,connection_id:data.connectionId,app_id:data.appId,entity_id:data.entityId,sheet:data.sheet,mapping_json:JSON.stringify(data.mapping),merge_field_id:data.mergeFieldId,state:data.enabled?'active':'paused',version:(prior?.version??0)+1,running_id:null}
  await foundation.admission.commit(ctx,{commandId:createUlid(),action:permit.action,appId:data.appId,canonicalInputHash:hash,permit,guards:[],mutations:[prior?{kind:'update',table,set:values,where:trustedPredicate('id=? AND version=? AND running_id IS NULL',[id,prior.version]),expectedRows:1}:{kind:'insert',table,row:{id,...values,created_at:ctx.now}}],audit:[{action:'import.schedule',subject:null,changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:{id,state:values.state}})
  return {id,state:values.state,frequency:'hourly'}
 }
 async function run(row:Row,slot:string){const actor=await db.prepare(`SELECT p.id,p.human_id,p.authentication_epoch FROM authority_principals p JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE p.id=? AND p.state='active' AND p.kind='human' AND o.status='active' AND o.role='owner'`).bind(row.owner_id).first<{id:string;human_id:string;authentication_epoch:number}>()
  if(!actor){await db.prepare("UPDATE record_sheet_schedules SET state='paused',version=version+1 WHERE id=? AND version=?").bind(row.id,row.version).run();return}
  const runId=createUlid(),at=clock().getTime(),acquired=await db.prepare("UPDATE record_sheet_schedules SET running_id=?,last_slot=?,last_started_at=? WHERE id=? AND version=? AND state='active' AND running_id IS NULL AND (last_slot IS NULL OR last_slot<>?) AND (last_started_at IS NULL OR last_started_at<=?) RETURNING id").bind(runId,slot,at,row.id,row.version,slot,at-3600000).first();if(!acquired)return
  const credential=createUlid(),now=new Date().toISOString(),expiresAt=new Date(Date.now()+300000).toISOString();let state='active',result:Outcome={runId,slot,status:'paused',applied:{creates:0,updates:0},error:'Scheduled import paused. Review owner rights, connection consent and mapping before enabling it again.'}
  try{await db.prepare('INSERT INTO authority_credentials(id,principal_id,token_hash,audience,scopes_json,created_at,expires_at,authentication_epoch) VALUES(?,?,?,?,?,?,?,?)').bind(credential,actor.id,await canonicalHash({nonce:crypto.randomUUID()}),'sheets-internal',JSON.stringify([{appId:row.app_id,actions:['connection.read','connection.sync','record.read','record.create','record.patch','import.preview','import.commit'],purposes:['read','export']}]),Date.now(),Date.parse(expiresAt),actor.authentication_epoch).run()
   const ctx:RequestContext={requestId:runId,now,ingress:'schedule',principal:{id:actor.id,kind:'human',humanId:actor.human_id,sessionId:null,credentialId:credential,issuedAt:now,expiresAt,authenticationEpoch:actor.authentication_epoch}},capture=await source.read(ctx,row.connection_id),preview=await csv.preview(ctx,{appId:row.app_id,entityId:row.entity_id,mapping:JSON.parse(row.mapping_json),mergeFieldId:row.merge_field_id,csv:sheetCsv(capture,row.sheet)})
   result={...result,previewId:preview.id,prospective:counts(preview),refusals:preview.errors,fieldIds:reviewFields(row)}
   if(preview.rejected){state='paused';result.status='review_required';delete result.error}
   else{
    await source.owner(ctx);if(preview.creates||preview.updates)await csv.commit(ctx,createUlid(),preview.id)
    result.status=preview.creates||preview.updates?'committed':'unchanged';result.applied={creates:preview.creates,updates:preview.updates};delete result.error
   }
  }catch{state='paused'}
  finally{await db.batch([db.prepare('DELETE FROM authority_credentials WHERE id=?').bind(credential),db.prepare('UPDATE record_sheet_schedules SET running_id=NULL,state=?,result_json=?,version=version+1 WHERE id=? AND version=? AND running_id=?').bind(state,JSON.stringify(result),row.id,row.version,runId)])}
 }
 async function scheduled(){const slot=dueSchedule(clock().getTime(),'UTC','hourly');if(!slot)return;for(const row of(await db.prepare("SELECT * FROM record_sheet_schedules WHERE state='active' ORDER BY id").all<Row>()).results)await run(row,slot)}
 return {configure,scheduled,read}
}

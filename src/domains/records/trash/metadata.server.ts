import type {RequestContext,AuthorityPermit} from '../../authority/ports'
import type {AdmissionPort} from '../../admission/ports'
import type {createRecordServices} from '../service.server'
import type {Form,View} from '../contracts'
import {RECORD_FORM_ENTITY_ID,RECORD_VIEW_ENTITY_ID} from '../contracts'
import {formTable} from '../metadata.server'
import {viewAccess,requireViewEdit} from '../view-access.server'
import {requireBaseAuthor} from '../manual/base-access.server'
import {trustedPredicate} from '../../admission/sql.server'
import {canonical,canonicalHash} from '../../admission/canonical'
import {AdmissionError} from '../../admission/errors'
import {trashLifetime} from './storage.server'
type Stored={id:string;app_id:string;entity_id:string;owner_id:string|null;version:number;definition_json:string;deleted_at:number|null;expires_at:number|null;visibility?:string;purge_state?:string}
export function metadataTrash(db:D1Database,services:ReturnType<typeof createRecordServices>,admission:AdmissionPort){
 const {policy,metadata,descriptors}=services
 async function formAuthority(ctx:RequestContext,row:Stored){const author=await requireBaseAuthor(db,ctx,row.app_id),form=JSON.parse(row.definition_json) as Form,scope=await policy.scope(ctx,{appId:row.app_id,entityId:row.entity_id,purpose:'read'}),d=descriptors.get(row.app_id,row.entity_id);if(form.fields.some(field=>!d.fields.has(field.fieldId)||!scope.readableFieldIds.includes(field.fieldId)))throw new AdmissionError('schema_conflict','The form has a removed or unreadable field. Restore would conflict with current schema.');const permit=await policy.authorize(ctx,{appId:row.app_id,targetEntityId:RECORD_FORM_ENTITY_ID,action:'form.save',expected:[],cost:[],inputHash:await canonicalHash({id:row.id})});return {form,permit,guards:[...scope.currentAuthorityGuards,...(author?.guards??[]),...permit.guards]}}
 async function formState(ctx:RequestContext,input:{commandId:string;appId:string;id:string;version:number},restore:boolean){
  const row=await db.prepare('SELECT * FROM record_forms WHERE id=? AND app_id=?').bind(input.id,input.appId).first<Stored>();if(!row)throw new AdmissionError('not_found','Form not found');const {form,permit,guards}=await formAuthority(ctx,row)
  if(row.version!==input.version)throw new AdmissionError('version_conflict','The form changed.')
  if(restore?!row.deleted_at:!!row.deleted_at)throw new AdmissionError('invalid_transition','The form is not in the required trash state.')
  if(restore&&row.expires_at!<=Date.parse(ctx.now))throw new AdmissionError('invalid_transition','The 30-day form restore window expired.')
  if(restore&&await db.prepare("SELECT 1 FROM record_forms WHERE app_id=? AND entity_id=? AND id<>? AND deleted_at IS NULL AND lower(json_extract(definition_json,'$.title'))=lower(?)").bind(row.app_id,row.entity_id,row.id,form.title).first())throw new AdmissionError('version_conflict','A newer form uses this title; restore would conflict.')
  const action=restore?'form.restore':'form.delete',next={...form,version:row.version+1,updatedAt:ctx.now}
  return admission.commit(ctx,{commandId:input.commandId,action,appId:row.app_id,canonicalInputHash:await canonicalHash({...input,restore}),permit:{...permit,action},guards,mutations:[{kind:'update',table:formTable,set:{deleted_at:restore?null:Date.parse(ctx.now),expires_at:restore?null:Date.parse(ctx.now)+trashLifetime,definition_json:canonical(next),version:next.version,updated_at:ctx.now},where:trustedPredicate('id=? AND version=?',[row.id,row.version]),expectedRows:1}],audit:[{action,subject:{appId:row.app_id,entityId:RECORD_FORM_ENTITY_ID,recordId:row.id},changes:[],sourceIds:[],personalContentRefs:[]}],events:[],outbox:[],committedResult:restore?next:{deletedId:row.id}})
 }
 return {formState,
  async list(ctx:RequestContext,appId:string){const items=[]
   for(const table of ['record_views','record_forms']){const rows=await db.prepare(`SELECT * FROM ${table} WHERE app_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at,id LIMIT 200`).bind(appId).all<Stored>();for(const row of rows.results){try{let name:string;if(table==='record_views'){const view=JSON.parse(row.definition_json) as View,access=await viewAccess(policy,ctx,view,row.owner_id!,'view.delete',db);requireViewEdit(access);const {id,version,createdAt,updatedAt,access:_access,timelineBaseline:_baseline,...definition}=view;await metadata.checkedView(ctx,definition);name=view.name}else name=(await formAuthority(ctx,row)).form.title;items.push({kind:table==='record_views'?'view':'form',id:row.id,entityId:row.entity_id,entityLabel:table==='record_views'?'Saved view':'Form',name,version:row.version,deletedAt:new Date(row.deleted_at!).toISOString(),expiresAt:new Date(row.expires_at!).toISOString(),restorable:row.expires_at!>Date.parse(ctx.now),purgeState:row.purge_state??'held'})}catch(error){if(!(error instanceof Error&&'code'in error&&['forbidden','not_found','schema_conflict'].includes(String(error.code))))throw error}}}
   return items
  },
  async restoreView(ctx:RequestContext,input:{commandId:string;appId:string;id:string;version:number}){const p=await metadata.prepareViewState(ctx,input.id,input.version,true);if(p.value.appId!==input.appId)throw new AdmissionError('forbidden','View belongs to another base.');const permit=await policy.authorize(ctx,{appId:input.appId,action:'view.delete',targetEntityId:RECORD_VIEW_ENTITY_ID,expected:[{ref:{appId:input.appId,entityId:RECORD_VIEW_ENTITY_ID,recordId:input.id},version:input.version}],cost:[],inputHash:await canonicalHash(input)});return admission.commit(ctx,{commandId:input.commandId,action:'view.restore',appId:input.appId,canonicalInputHash:await canonicalHash(input),permit:{...permit,action:'view.restore'},guards:p.guards,mutations:p.mutations,audit:p.audit,events:[],outbox:[],committedResult:p.value})},
 }
}

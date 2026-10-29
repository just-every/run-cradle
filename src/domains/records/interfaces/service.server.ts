import type {PolicyPort,RequestContext} from '../../authority/ports'
import type {AdmissionPort} from '../../admission/ports'
import type {createRecordMetadata} from '../metadata.server'
import {canonical,canonicalHash} from '../../admission/canonical'
import {trustedPredicate} from '../../admission/sql.server'
import {AdmissionError} from '../../admission/errors'
import {createUlid} from '../../../core/shared/ids'
import {assertGuards} from '../fence.server'
import {publishInterfaceInput,definitionSchema,type InterfaceInput,type InterfaceDefinition} from './contracts'
import {interfaces,interfaceVersions,interfaceGuard,interfaceUnavailable,type StoredInterface} from './storage.server'
import {interfaceAccess} from './access.server'

export function createRecordInterfaces(db:D1Database,metadata:ReturnType<typeof createRecordMetadata>,policy:PolicyPort,admission:AdmissionPort){
 const access=interfaceAccess(db,metadata,policy)
 async function stored(id:string){const row=await db.prepare('SELECT * FROM record_interfaces WHERE id=?').bind(id).first<StoredInterface>();if(!row)throw new AdmissionError('not_found','Interface not found.');return row}
 async function read(ctx:RequestContext,id:string){const row=await stored(id);if(row.deleted_at!==null)throw new AdmissionError('not_found','Interface not found.');const result=await access.project(ctx,JSON.parse(row.definition_json) as InterfaceDefinition);await assertGuards(db,[interfaceGuard(row)]);return result}
 async function list(ctx:RequestContext,appId:string,deleted=false){
  const rows=await db.prepare(`SELECT * FROM record_interfaces WHERE app_id=? AND deleted_at IS ${deleted?'NOT ':''}NULL ORDER BY created_at,id LIMIT 200`).bind(appId).all<StoredInterface>(),items:InterfaceDefinition[]=[]
  if(deleted)await access.author(ctx,appId,'0'.repeat(64))
  for(const row of rows.results)try{const value=await access.project(ctx,JSON.parse(row.definition_json) as InterfaceDefinition);await assertGuards(db,[interfaceGuard(row)]);items.push(value)}catch(error){if(!interfaceUnavailable(error))throw error}
  return {items}
 }
 async function commit(ctx:RequestContext,input:{commandId:string;id?:string;version?:number;definition:InterfaceInput},action:string,trash:boolean|null=null){
  const definition=definitionSchema.parse(input.definition),hash=await canonicalHash({action,...input,definition}),auth=await access.author(ctx,definition.appId,hash)
  const replay=await admission.replay<{id:string;version:number}>(ctx,input.commandId,action,definition.appId,hash)
  if(replay){const id=replay.result.state==='committed'?replay.result.value.id:input.id;if(!id)throw new AdmissionError('version_conflict','Interface publication is not committed.');return trash===true?{deletedId:id}:read(ctx,id)}
  const old=input.id?await stored(input.id):null
  if(old&&old.app_id!==definition.appId)throw new AdmissionError('not_found','Interface not found.')
  if(old&&old.version!==input.version)throw new AdmissionError('version_conflict','The interface changed. Reload its current version.')
  if(!old&&input.version!==undefined)throw new AdmissionError('validation','A new interface has no prior version.')
  if(!old&&(await db.prepare('SELECT COUNT(*) n FROM record_interfaces WHERE app_id=?').bind(definition.appId).first<{n:number}>())!.n>=200)throw new AdmissionError('capacity_limit','This base already holds 200 interfaces, including retained Trash. Restore or update an existing interface.')
  if(old&&(trash===false?old.deleted_at===null:old.deleted_at!==null))throw new AdmissionError('invalid_transition','The interface is not in the required current state.')
  if(trash===false&&old?.expires_at!==null&&old?.expires_at!==undefined&&old.expires_at<=Date.parse(ctx.now))throw new AdmissionError('invalid_transition','The 30-day interface restore window expired.')
  const guards=trash===true?[]:await access.validate(ctx,definition),id=old?.id??createUlid(),version=(old?.version??0)+1
  const next={...definition,id,version,authorId:ctx.principal.id,createdAt:old?.created_at??ctx.now,updatedAt:ctx.now}
  const row={id,app_id:definition.appId,author_id:ctx.principal.id,version,definition_json:canonical(next),created_at:next.createdAt,updated_at:ctx.now,deleted_at:trash===true?Date.parse(ctx.now):null,expires_at:trash===true?Date.parse(ctx.now)+30*86400000:null}
  await admission.commit(ctx,{commandId:input.commandId,action,appId:definition.appId,canonicalInputHash:hash,permit:{...auth.permit,action},guards:[...auth.guards,...guards,...(old?[interfaceGuard(old)]:[])],mutations:[old?{kind:'update',table:interfaces,set:row,where:trustedPredicate('id=? AND version=?',[id,old.version]),expectedRows:1}:{kind:'insert',table:interfaces,row},{kind:'insert',table:interfaceVersions,row:{interface_id:id,version,author_id:ctx.principal.id,definition_json:canonical(next),created_at:ctx.now}}],audit:[{action,subject:null,changes:[],sourceIds:[],personalContentRefs:[id]}],events:[],outbox:[],committedResult:{id,version}})
  return trash===true?{deletedId:id}:read(ctx,id)
 }
 async function publish(ctx:RequestContext,unknown:unknown){return commit(ctx,publishInterfaceInput.parse(unknown),'interface.publish') as Promise<InterfaceDefinition>}
 async function versions(ctx:RequestContext,id:string){const current=await stored(id),auth=await access.author(ctx,current.app_id,'0'.repeat(64));const rows=await db.prepare('SELECT version,author_id,created_at FROM record_interface_versions WHERE interface_id=? ORDER BY version DESC').bind(id).all<{version:number;author_id:string|null;created_at:string}>();await assertGuards(db,[...auth.guards,interfaceGuard(current)]);return {items:rows.results.map(row=>({version:row.version,authorId:row.author_id,createdAt:row.created_at}))}}
 async function readVersion(ctx:RequestContext,id:string,version:number){
  const current=await stored(id),auth=await access.author(ctx,current.app_id,'0'.repeat(64))
  const row=await db.prepare('SELECT definition_json FROM record_interface_versions WHERE interface_id=? AND version=?').bind(id,version).first<{definition_json:string}>();if(!row)throw new AdmissionError('not_found','Interface version not found.')
  const result=await access.project(ctx,JSON.parse(row.definition_json) as InterfaceDefinition);await assertGuards(db,[...auth.guards,interfaceGuard(current)]);return {...result,canEdit:false}
 }
 async function restore(ctx:RequestContext,id:string,input:{commandId:string;version:number;restoreVersion:number}){
  const current=await stored(id);await access.author(ctx,current.app_id,'0'.repeat(64))
  const prior=await db.prepare('SELECT definition_json FROM record_interface_versions WHERE interface_id=? AND version=?').bind(id,input.restoreVersion).first<{definition_json:string}>();if(!prior)throw new AdmissionError('not_found','Interface version not found.')
  const {appId,name,pages,audience}=JSON.parse(prior.definition_json) as InterfaceDefinition
  return commit(ctx,{commandId:input.commandId,id,version:input.version,definition:{appId,name,pages,audience}},'interface.restore') as Promise<InterfaceDefinition>
 }
 async function trash(ctx:RequestContext,id:string,input:{commandId:string;version:number},restore=false){const current=await stored(id),{appId,name,pages,audience}=JSON.parse(current.definition_json) as InterfaceDefinition;return commit(ctx,{...input,id,definition:{appId,name,pages,audience}},restore?'interface.trash.restore':'interface.delete',!restore)}
 return {read,list,publish,versions,readVersion,restore,trash}
}

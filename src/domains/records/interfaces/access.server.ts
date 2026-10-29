import type {PolicyPort,RequestContext} from '../../authority/ports'
import type {SqlPredicate} from '../../admission/ports'
import type {createRecordMetadata} from '../metadata.server'
import type {InterfaceInput,InterfaceDefinition,InterfaceComponent} from './contracts'
import {baseAccess,requireBaseAuthor} from '../manual/base-access.server'
import {trustedPredicate} from '../../admission/sql.server'
import {AdmissionError} from '../../admission/errors'
import {RECORD_FORM_ENTITY_ID} from '../contracts'
import {assertGuards} from '../fence.server'
import {interfaceUnavailable} from './storage.server'

export function interfaceAccess(db:D1Database,metadata:ReturnType<typeof createRecordMetadata>,policy:PolicyPort){
 async function author(ctx:RequestContext,appId:string,hash:string){
  const access=await requireBaseAuthor(db,ctx,appId)
  if(!access)throw new AdmissionError('forbidden','Only a current base owner or creator can publish interfaces.')
  const permit=await policy.authorize(ctx,{appId,targetEntityId:RECORD_FORM_ENTITY_ID,action:'form.save',expected:[],cost:[],inputHash:hash})
  return {access,permit,guards:[...access.guards,...permit.guards]}
 }
 async function audience(ctx:RequestContext,definition:InterfaceInput){
  try{
   const access=await baseAccess(db,ctx,definition.appId)
   if(!access||!access.canAdopt&&!definition.audience.people.includes(ctx.principal.id)&&(!access.role||!definition.audience.roles.includes(access.role)))throw new AdmissionError('not_found','Interface not found.')
   return access
  }catch(error){if(interfaceUnavailable(error))throw new AdmissionError('not_found','Interface not found.');throw error}
 }
 async function component(ctx:RequestContext,appId:string,item:InterfaceComponent):Promise<SqlPredicate[]>{
  if(item.kind==='text'||item.kind==='divider')return []
  const kind=item.kind,id=kind==='view'?item.viewId:(item as Extract<InterfaceComponent,{kind:'form'}>).formId,table=kind==='view'?'record_views':'record_forms'
  const stored=await db.prepare(`SELECT app_id,entity_id,version,definition_json,deleted_at${kind==='view'?',visibility':''} FROM ${table} WHERE id=?`).bind(id).first<{app_id:string;entity_id:string;version:number;definition_json:string;deleted_at:number|null;visibility?:string}>()
  if(!stored||stored.app_id!==appId||stored.deleted_at!==null||kind==='view'&&stored.visibility!=='app')throw new AdmissionError('validation','Interface components require a current shared view or authenticated form in this base.')
  if(kind==='view')await metadata.readView(ctx,id);else await metadata.readForm(ctx,id)
  const scope=await policy.scope(ctx,{appId,entityId:stored.entity_id,purpose:'read'})
  return [...scope.currentAuthorityGuards,trustedPredicate(`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND app_id=? AND version=? AND definition_json=? AND deleted_at IS NULL${kind==='view'?" AND visibility='app'":''})`,[id,appId,stored.version,stored.definition_json])]
 }
 async function validate(ctx:RequestContext,definition:InterfaceInput){
  const guards:SqlPredicate[]=[]
  for(const person of definition.audience.people){
   const guard=trustedPredicate("EXISTS(SELECT 1 FROM authority_memberships m JOIN authority_principals p ON p.id=m.principal_id JOIN operators o ON o.id=p.human_id WHERE m.app_id=? AND m.principal_id=? AND m.state='active' AND p.kind='human' AND p.state='active' AND o.active=1)",[definition.appId,person])
   await assertGuards(db,[guard]);guards.push(guard)
  }
  for(const page of definition.pages)for(const section of page.sections)for(const item of section.components)guards.push(...await component(ctx,definition.appId,item))
  return guards
 }
 async function project(ctx:RequestContext,definition:InterfaceDefinition){
  const access=await audience(ctx,definition),guards=[...access.guards]
  const pages=[] as InterfaceDefinition['pages']
  for(const page of definition.pages){const sections=[] as InterfaceDefinition['pages'][number]['sections'];for(const section of page.sections){const components:InterfaceComponent[]=[];for(const item of section.components)try{guards.push(...await component(ctx,definition.appId,item));components.push(item)}catch(error){if(!interfaceUnavailable(error)&&!(error instanceof AdmissionError&&error.code==='validation'))throw error}sections.push({...section,components})}pages.push({...page,sections})}
  await assertGuards(db,guards)
  return {...definition,pages,canEdit:access.canAdopt,...(!access.canAdopt?{audience:{roles:definition.audience.roles,people:[]},authorId:null}:{})}
 }
 return {author,audience,validate,project}
}

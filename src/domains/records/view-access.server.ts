import type { PolicyPort, RequestContext } from '../authority/ports'
import type { AuthorityPermit } from '../authority/ports'
import { AdmissionError } from '../admission/errors'
import { RECORD_SCHEMA_ENTITY_ID,RECORD_VIEW_ENTITY_ID,type View } from './contracts'

/** Creator capability is the existing schema-adoption grant; view-edit capability alone cannot unlock it. */
export async function viewAccess(policy:PolicyPort,ctx:RequestContext,view:Pick<View,'appId'|'id'|'version'|'visibility'|'locked'>,ownerId:string,action='view.save'){
 async function permit(name:string,entityId:string):Promise<AuthorityPermit|null>{
  try{return await policy.authorize(ctx,{appId:view.appId,action:name,targetEntityId:entityId,expected:[],cost:[],inputHash:'0'.repeat(64)})}
  catch(error){if(error instanceof Error&&'code'in error&&['forbidden','not_found','grant_expired','grant_revoked'].includes(String(error.code)))return null;throw error}
 }
 const [edit,creator]=await Promise.all([permit(action,RECORD_VIEW_ENTITY_ID),permit('release.adopt',RECORD_SCHEMA_ENTITY_ID)])
 const privateOwner=view.visibility!=='private'||ownerId===ctx.principal.id
 return {canEdit:!!edit&&privateOwner&&(!view.locked||!!creator),canLock:!!creator&&privateOwner,guards:[...(edit?.guards??[]),...(creator?.guards??[])]}
}
export function requireViewEdit(access:Awaited<ReturnType<typeof viewAccess>>,locking=false){
 if(!access.canEdit||locking&&!access.canLock)throw new AdmissionError('forbidden',locking?'Only a creator with schema-change authority may lock or unlock a view.':'You do not have permission to change this view.')
}

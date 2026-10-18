import {AdmissionError} from '../../domains/admission/errors'
import type {CommandInput} from '../../contracts/primitives'
import type {RequestContext} from '../../domains/authority/ports'
import {registerTable,trustedPredicate,and,eq} from '../../domains/admission/sql.server'
import {createUlid} from '../../core/shared/ids'
import {activityTable} from './storage.server'
import {emptyChange,load,versionGuard,plan,ref,integration,type LaunchContext} from './domain.server'
const comments=registerTable('comments',['id','created_at','updated_at','version','campaign_id','author_id','body','deleted_at'])
export async function prepareCommentDelete(context:LaunchContext,ctx:RequestContext,input:CommandInput<{id:string;version:number}>){
 const comment=await context.db.prepare('SELECT * FROM comments WHERE id=?').bind(input.input.id).first<{id:string;version:number;campaign_id:string;deleted_at:number|null}>()
 if(!comment)throw new AdmissionError('not_found','Comment was not found')
 if(comment.version!==input.input.version)throw new AdmissionError('version_conflict',`Comment has current version ${comment.version}`,comment.version)
 if(comment.deleted_at!==null)throw new AdmissionError('not_found','Comment was deleted')
 const campaign=await load(context.db,'campaign',comment.campaign_id),set=emptyChange(),now=Date.parse(ctx.now)
 versionGuard(set,'campaign',campaign,input.expected)
 set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM comments WHERE id=? AND version=? AND deleted_at IS NULL)',[comment.id,comment.version]))
 set.mutations.push({kind:'update',table:comments,set:{body:'',deleted_at:now,updated_at:now,version:comment.version+1},where:and(eq(comments,'id',comment.id),eq(comments,'version',comment.version)),expectedRows:1},{kind:'insert',table:activityTable,row:{id:createUlid(),created_at:now,updated_at:now,version:1,campaign_id:campaign.id,subject_id:comment.id,actor_id:ctx.principal.humanId??ctx.principal.id,type:'comment.deleted',message:'Comment deleted'}})
 set.audit.push({action:'comment.deleted',subject:ref('campaign',campaign.id),changes:[],sourceIds:[],personalContentRefs:[comment.id]})
 return plan(context,ctx,input,'launch.comment.delete',set,{id:comment.id,version:comment.version+1,deleted:true},'campaign')
}
/** Mention identities affect notification delivery; comment bodies remain plain text. */
export async function prepareComment(context:LaunchContext,ctx:RequestContext,input:CommandInput<{campaignId:string;body:string;mentions:string[]}>){
 const value=input.input,campaign=await load(context.db,'campaign',value.campaignId),set=emptyChange(),id=createUlid(),now=Date.parse(ctx.now)
 versionGuard(set,'campaign',campaign,input.expected)
 set.mutations.push({kind:'insert',table:comments,row:{id,created_at:now,updated_at:now,version:1,campaign_id:campaign.id,author_id:ctx.principal.humanId??ctx.principal.id,body:value.body,deleted_at:null}},{kind:'insert',table:activityTable,row:{id:createUlid(),created_at:now,updated_at:now,version:1,campaign_id:campaign.id,subject_id:id,actor_id:ctx.principal.humanId??ctx.principal.id,type:'comment.created',message:'Comment added'}})
 for(const operatorId of value.mentions){
  const current=await context.db.prepare('SELECT active FROM operators WHERE id=?').bind(operatorId).first<{active:number}>()
  if(!current?.active){set.guards.push(trustedPredicate('NOT EXISTS(SELECT 1 FROM operators WHERE id=? AND active=1)',[operatorId]));continue}
  const effects=await integration(context,'notification')(ctx,{kind:'comment-mentioned',operatorId,campaignId:campaign.id,subjectId:id,eventId:id})
  set.guards.push(...effects.guards);set.mutations.push(...effects.mutations)
 }
 set.audit.push({action:'comment.created',subject:ref('campaign',campaign.id),changes:[],sourceIds:[],personalContentRefs:[id]})
 const prepared=await plan(context,ctx,input,'launch.comment.create',set,{id,version:1,body:value.body},'campaign'),current=and(...prepared.permit.guards)
 if(!await context.db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values).first())throw new AdmissionError('forbidden','Current campaign comment authority is required.')
 return prepared
}

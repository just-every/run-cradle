import type {Ref} from '../../contracts/primitives';
import type {RequestContext} from '../authority/ports';
import type {EntityRegistry} from '../authority/scope.server';
import type {EvidenceDependencies} from './ports';
import type {MentionPort} from './comments.server';
import {automationRecipient} from '../automations/recipients.server';
import {createChannelsIntegration} from '../channels/integration.server';
import {AuthorityError} from '../authority/errors';
import type {ChannelEffects} from '../channels/ports';

/** Recipient identity is real operator data; read authority belongs to that recipient. */
export function createCommentMentions(deps:Pick<EvidenceDependencies,'db'|'access'>,entities:EntityRegistry,appOrigin:string){
 const {db}=deps;
 const prepare:MentionPort['prepare']=async(ctx,subject,commentId,memberIds)=>{
  const effects:ChannelEffects={guards:[],mutations:[]};
  for(const operatorId of memberIds){
   const recipient=await automationRecipient(db,entities,ctx,{...subject,operatorId});
   const href=new URL(`/app/records/${subject.appId}/${subject.entityId}/${subject.recordId}`,appOrigin).href;
   const integration=createChannelsIntegration(db,async()=>({guards:[recipient.guard],title:'You were mentioned in a comment',body:`Open the record to read the comment: ${href}`}));
   const next=await integration.notification(ctx,{kind:'comment-mentioned',operatorId,campaignId:null,subjectId:subject.recordId,eventId:commentId,appId:subject.appId,subjectType:subject.entityId});
   effects.guards.push(...next.guards);effects.mutations.push(...next.mutations);
  }
  return effects;
 };
 async function candidates(ctx:RequestContext,subject:Ref,q=''){
  await deps.access.checkReference(ctx,subject,[],'read');
  const rows=await db.prepare(`SELECT DISTINCT o.id,o.name FROM operators o JOIN authority_principals p ON p.human_id=o.id AND p.kind='human' AND p.state='active' JOIN authority_memberships m ON m.principal_id=p.id AND m.app_id=? AND m.state='active' WHERE o.active=1 AND instr(lower(o.name),lower(?))>0 ORDER BY o.name,o.id LIMIT 200`).bind(subject.appId,q).all<{id:string;name:string}>();
  const items:{id:string;name:string}[]=[];
  for(const row of rows.results){try{await automationRecipient(db,entities,ctx,{...subject,operatorId:row.id});items.push(row)}catch(error){if(!(error instanceof AuthorityError)||error.code!=='forbidden')throw error}}
  return {items,nextCursor:null,total:{kind:'exact' as const,value:items.length},evaluatedAt:ctx.now};
 }
 return {prepare,candidates};
}

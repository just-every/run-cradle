import { integration } from './domain.server'
import type { CommandInput } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { eq,trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import { tables,type LaunchRow } from './storage.server'
import { emptyChange,load,versionGuard,operator,recordChange,plan,toWire,fail,capacity,type LaunchContext } from './domain.server'
export async function prepareTransition(context:LaunchContext,ctx:RequestContext,input:CommandInput<Record<string,unknown>>,kind:'deliverable'|'risk'|'decision',operation:string){
 const before=await load(context.db,kind,String(input.input.id)),set=emptyChange();versionGuard(set,kind,before,input.expected);const now=Date.parse(ctx.now),after:LaunchRow={...before,updated_at:now,version:before.version+1};let linked:LaunchRow|null=null
 if(kind==='deliverable'){after.state=operation==='complete'?'Complete':'Open';after.completed_at=operation==='complete'?now:null;after.completed_by_id=operation==='complete'?ctx.principal.humanId:null}
 if(kind==='risk'){
  if(operation==='resolve'){if(before.state==='Resolved')fail('Risk is already resolved');after.state='Resolved';after.resolution_note=String(input.input.resolutionNote);after.resolved_at=now;after.resolved_by_id=ctx.principal.humanId}
  if(operation==='reopen'){if(before.state!=='Resolved')fail('Only a resolved risk can reopen');after.state='Watching';after.resolution_note=null;after.resolved_at=null;after.resolved_by_id=null}
  if(operation==='escalate'){
   if(before.state==='Resolved')fail('A resolved risk cannot escalate');after.state='Escalated';after.escalated_at=now;after.escalated_by_id=ctx.principal.humanId;after.escalation_reason=String(input.input.reason)
   if(before.severity==='Critical'){
    const existing=await context.db.prepare("SELECT id FROM decisions WHERE risk_id=? AND state IN ('Awaiting approval','In review')").bind(before.id).first<{id:string}>();set.guards.push(trustedPredicate("EXISTS(SELECT 1 FROM decisions WHERE risk_id=? AND state IN ('Awaiting approval','In review'))=?",[before.id,existing?1:0]));if(!existing){await capacity(context.db,set,'decision');await operator(context.db,set,ctx.principal.humanId??before.owner_id);const campaign=await load(context.db,'campaign',String(before.campaign_id));linked={id:createUlid(),created_at:now,updated_at:now,version:1,campaign_id:before.campaign_id,risk_id:before.id,requester_id:ctx.principal.humanId??before.owner_id,assignee_id:campaign.owner_id,title:`Resolve Critical risk: ${before.title}`,priority:'Critical',due_at:now+86400000,recommendation:String(input.input.reason),impact:String(before.signal),state:'Awaiting approval'};set.mutations.push({kind:'insert',table:tables.decision,row:linked});recordChange(set,ctx,'decision',null,linked,'decision.created')}
    const campaign=await load(context.db,'campaign',String(before.campaign_id));const effects=await integration(context,'notification')(ctx,{kind:'critical-risk-escalated',operatorId:String(campaign.owner_id),campaignId:campaign.id,subjectId:before.id,eventId:input.commandId});set.guards.push(...effects.guards);set.mutations.push(...effects.mutations)
   }
  }
 }
 if(kind==='decision'){
  if(['Approved','Rejected','Cancelled'].includes(String(before.state)))fail('A terminal decision cannot change; create a superseding decision')
  if(operation==='assign'){await operator(context.db,set,input.input.assigneeId);after.assignee_id=String(input.input.assigneeId);const effects=await integration(context,'notification')(ctx,{kind:'decision-assigned',operatorId:String(after.assignee_id),campaignId:String(after.campaign_id),subjectId:after.id,eventId:input.commandId});set.guards.push(...effects.guards);set.mutations.push(...effects.mutations)}
  if(operation==='request-change'){after.state='In review';after.rationale=String(input.input.rationale)}
  if(operation==='outcome'){const outcome=String(input.input.outcome),rationale=String(input.input.rationale??'');if(outcome!=='Approved'&&!rationale.trim())fail('Rejection or cancellation requires rationale');after.state=outcome;after.outcome_at=now;after.outcome_by_id=ctx.principal.humanId;after.rationale=rationale
   if(before.risk_id&&outcome==='Approved'){const risk=await load(context.db,'risk',String(before.risk_id));set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM risks WHERE id=? AND version=?)',[risk.id,risk.version]));const next={...risk,state:'In progress',updated_at:now,version:risk.version+1};if(risk.state==='Needs decision'||risk.state==='Escalated'){set.mutations.push({kind:'update',table:tables.risk,set:{state:next.state,updated_at:now,version:next.version},where:eq(tables.risk,'id',risk.id),expectedRows:1});recordChange(set,ctx,'risk',risk,next,'risk.updated')}}
  }
 }
 set.mutations.push({kind:'update',table:tables[kind],set:Object.fromEntries(Object.entries(after).filter(([k])=>tables[kind].writableColumnIds.includes(k))),where:eq(tables[kind],'id',before.id),expectedRows:1});recordChange(set,ctx,kind,before,after,`${kind}.updated`)
 return plan(context,ctx,input,`launch.${kind}.${operation}`,set,kind==='risk'&&operation==='escalate'?{risk:toWire(after),decision:linked?toWire(linked):null}:toWire(after),kind)
}

import { integration } from './domain.server'
import type { CommandInput } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { eq,trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import { tables,dependencyTable,type LaunchRow } from './storage.server'
import { emptyChange,load,versionGuard,recordChange,plan,fail,type LaunchContext } from './domain.server'
import { prepareRecord } from './records.server'
import { readableWire } from './result-projection.server'
export const localDate=(now:string,timezone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))
export const shiftDate=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00.000Z')+days*86400000).toISOString().slice(0,10)
export async function prepareMilestone(context:LaunchContext,ctx:RequestContext,input:CommandInput<Record<string,unknown>>,operation:string){
 if(operation==='set-predecessors'){
  const before=await load(context.db,'milestone',String(input.input.id)),set=emptyChange();versionGuard(set,'milestone',before,input.expected)
  const predecessors=input.input.predecessorIds as string[];if(new Set(predecessors).size!==predecessors.length)fail('Duplicate predecessor')
  const edges=(await context.db.prepare('SELECT id,milestone_id,predecessor_id FROM milestone_dependencies ORDER BY id').all<{id:string;milestone_id:string;predecessor_id:string}>()).results
  const graph=new Map<string,string[]>();for(const edge of edges)if(edge.milestone_id!==before.id)graph.set(edge.milestone_id,[...(graph.get(edge.milestone_id)??[]),edge.predecessor_id]);graph.set(before.id,predecessors)
  const visiting=new Set<string>(),visited=new Set<string>();const visit=(id:string)=>{if(visiting.has(id))fail('Milestone dependency cycle');if(visited.has(id))return;visiting.add(id);for(const p of graph.get(id)??[])visit(p);visiting.delete(id);visited.add(id)};visit(before.id)
  set.guards.push(trustedPredicate('(SELECT COUNT(*) FROM milestone_dependencies)=?',[edges.length]));for(const edge of edges)set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM milestone_dependencies WHERE id=? AND milestone_id=? AND predecessor_id=?)',[edge.id,edge.milestone_id,edge.predecessor_id]))
  for(const id of predecessors){const row=await load(context.db,'milestone',id);set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM milestones WHERE id=? AND version=?)',[row.id,row.version]))}
  set.mutations.push({kind:'delete',table:dependencyTable,where:eq(dependencyTable,'milestone_id',before.id),expectedRows:edges.filter(e=>e.milestone_id===before.id).length})
  const now=Date.parse(ctx.now);for(const predecessorId of predecessors)set.mutations.push({kind:'insert',table:dependencyTable,row:{id:createUlid(),created_at:now,updated_at:now,version:1,milestone_id:before.id,predecessor_id:predecessorId}})
  const after={...before,updated_at:now,version:before.version+1};set.mutations.push({kind:'update',table:tables.milestone,set:{updated_at:now,version:after.version},where:eq(tables.milestone,'id',before.id),expectedRows:1});recordChange(set,ctx,'milestone',before,after,'milestone.dependencies-changed')
  return plan(context,ctx,input,'launch.milestone.set-predecessors',set,{...await readableWire(context,ctx,set,'milestone',after),predecessorIds:predecessors},'milestone')
 }
 if(!['create','patch','delete'].includes(operation))fail('Unknown milestone operation')
 return prepareRecord(context,ctx,input,'milestone',operation as 'create'|'patch'|'delete',async(set,result)=>{
 const row=result as Record<string,unknown>,guards=set.guards,mutations=set.mutations
 if(operation==='patch'){
  const conflicts=await context.db.prepare('SELECT p.id,p.version,(COALESCE(p.end_date,p.start_date)>?) AS conflicting FROM milestone_dependencies d JOIN milestones p ON p.id=d.predecessor_id WHERE d.milestone_id=?').bind(String(row.startDate),String(input.input.id)).all<{id:string;version:number;conflicting:number}>()
  if(row.status==='On track'&&conflicts.results.some(r=>r.conflicting)&&!String(row.conflictReason??'').trim())fail('On track with dependency conflict requires conflictReason')
  guards.push(trustedPredicate('(SELECT COUNT(*) FROM milestone_dependencies WHERE milestone_id=?)=?',[String(input.input.id),conflicts.results.length]))
  for(const r of conflicts.results)guards.push(trustedPredicate('EXISTS(SELECT 1 FROM milestones WHERE id=? AND version=?)',[r.id,r.version]))
 }
 if(operation!=='create'){
  const request=await context.db.prepare("SELECT id,version,notification_id FROM launch_readiness WHERE milestone_id=? AND state='Outstanding'").bind(String(input.input.id)).first<{id:string;version:number;notification_id:string|null}>()
  const settings=await context.db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first<{timezone:string}>();if(!settings)fail('Workspace timezone is required');const today=localDate(ctx.now,settings!.timezone)
  if(request&&(operation==='delete'||row.status==='Complete'||String(row.startDate)<today||String(row.startDate)>shiftDate(today,5))){if(request.notification_id){const withdrawn=await integration(context,'withdrawNotification')(ctx,request.notification_id);guards.push(...withdrawn.guards);mutations.push(...withdrawn.mutations)}mutations.unshift({kind:'update',table:tables.readiness,set:{state:'Cancelled',updated_at:Date.parse(ctx.now),version:request.version+1},where:eq(tables.readiness,'id',request.id),expectedRows:1})}
 }
 })
}

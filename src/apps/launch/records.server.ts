import { integration } from './domain.server'
import type { CommandInput, Json } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { eq,trustedPredicate } from '../../domains/admission/sql.server'
import { createUlid } from '../../core/shared/ids'
import { type LaunchKind } from './descriptors.server'
import { tables,type LaunchRow } from './storage.server'
import { readableWire } from './result-projection.server'
import { emptyChange, load,versionGuard,validateDomain,mappedFields,physicalFields,recordChange,plan,capacity,toWire,fail,type LaunchContext,type ChangeSet } from './domain.server'
export async function prepareRecord(context:LaunchContext,ctx:RequestContext,input:CommandInput<{id?:string;fields?:Record<string,unknown>;changes?:Record<string,unknown>}>,kind:LaunchKind,operation:'create'|'patch'|'delete',prepareEffects?:(set:ChangeSet,result:Json)=>Promise<void>){
 const set=emptyChange(),now=Date.parse(ctx.now),id=input.input.id??createUlid(),before=operation==='create'?null:await load(context.db,kind,id)
 const finish=async(result:Json,row?:LaunchRow)=>{await prepareEffects?.(set,result);return plan(context,ctx,input,`launch.${kind}.${operation}`,set,row?await readableWire(context,ctx,set,kind,row):result,kind)}
 if(before)versionGuard(set,kind,before,input.expected)
 if(kind==='decision'&&operation==='patch'&&before&&['Approved','Rejected','Cancelled'].includes(String(before.state)))fail('A terminal decision cannot be edited; create a superseding decision')
 if(operation==='delete'){
  if(kind==='risk'){
   const linked=(await context.db.prepare('SELECT * FROM decisions WHERE risk_id=?').bind(id).all<LaunchRow>()).results
   set.guards.push(trustedPredicate('(SELECT COUNT(*) FROM decisions WHERE risk_id=?)=?',[id,linked.length]))
   for(const decision of linked){
    const after={...decision,risk_id:null,updated_at:now,version:decision.version+1}
    set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM decisions WHERE id=? AND version=?)',[decision.id,decision.version]))
    set.mutations.push({kind:'update',table:tables.decision,set:{risk_id:null,updated_at:now,version:after.version},where:eq(tables.decision,'id',decision.id),expectedRows:1})
    recordChange(set,ctx,'decision',decision,after,'decision.updated')
   }
  }
  set.mutations.push({kind:'delete',table:tables[kind],where:eq(tables[kind],'id',id),expectedRows:1});recordChange(set,ctx,kind,before,null,`${kind}.deleted`)
  return finish({deletedId:id})
 }
 const fields={...(before?mappedFields(kind,before):{}),...(input.input.fields??input.input.changes??{})};delete fields.tags;delete fields.customFields
 await validateDomain(context.db,set,kind,fields,operation==='create',id)
 if(operation==='create')await capacity(context.db,set,kind)
 const after:LaunchRow={...(before??{id,created_at:now,version:0}),...physicalFields(kind,fields),updated_at:now,version:(before?.version??0)+1}
 if(kind==='campaign'&&(!before||input.input.changes?.health!==undefined)){after.health_updated_at=now;after.health_set_by_id=ctx.principal.humanId}
 if(!before){if(kind==='campaign')after.archived_at=null;if(kind==='deliverable')after.state='Open';if(kind==='risk')after.state='Watching';if(kind==='decision')after.state='Awaiting approval'}
 set.mutations.push(before?{kind:'update',table:tables[kind],set:Object.fromEntries(Object.entries(after).filter(([k])=>tables[kind].writableColumnIds.includes(k))),where:eq(tables[kind],'id',id),expectedRows:1}:{kind:'insert',table:tables[kind],row:after})
 recordChange(set,ctx,kind,before,after,`${kind}.${before?'updated':'created'}`)
 if(kind==='decision'&&after.assignee_id&&after.assignee_id!==before?.assignee_id){const effects=await integration(context,'notification')(ctx,{kind:'decision-assigned',operatorId:String(after.assignee_id),campaignId:String(after.campaign_id),subjectId:id,eventId:input.commandId});set.guards.push(...effects.guards);set.mutations.push(...effects.mutations)}
 return finish(toWire(after),after)
}

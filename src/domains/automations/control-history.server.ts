import type {RequestContext,PolicyScope} from '../authority/ports'
import type {EntityDescriptor} from '../records/descriptors.server'
import type {SqlPredicate} from '../admission/ports'
import type {ControlSnapshot} from './control-plan.server'
import {identifier} from '../admission/sql.server'
export async function automationItemHistory(db:D1Database,ctx:RequestContext,scope:PolicyScope,d:EntityDescriptor,guard:SqlPredicate,json:string,actions:{position:number;state:string;error_code:string|null}[]){
 const plan=(JSON.parse(json) as Partial<ControlSnapshot>).plan??[],ids=[...new Set(plan.flatMap(entry=>entry.item?[entry.item]:[]))],visible=new Set<string>()
 if(!ids.length)return []
 const rows=await db.prepare(`SELECT ${identifier(d.idColumn)} AS id FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)} IN (SELECT value FROM json_each(?)) AND ${identifier(d.lifecycleColumn)}<>'deleted' AND (${scope.rowPredicate.sql}) AND (${guard.sql})`).bind(JSON.stringify(ids),...scope.rowPredicate.values,...guard.values).all<{id:string}>()
 for(const row of rows.results)visible.add(row.id)
 const byPosition=new Map(actions.map(action=>[action.position,action]))
 const grouped=new Map<string,{step:number;recordId:string|null;state:string;expected:number;actions:typeof actions}>()
 for(const [index,entry]of plan.entries())if(entry.item){
  const key=`${entry.step}:${entry.item}`,item=grouped.get(key)??{step:entry.step,recordId:visible.has(entry.item)?entry.item:null,state:'Pending',expected:0,actions:[]}
  item.expected++
  const action=byPosition.get(index);if(action)item.actions.push(action)
  grouped.set(key,item)
 }
 for(const item of grouped.values())item.state=!item.recordId?'Skipped':item.actions.some(action=>action.state==='Unknown')?'Unknown':item.actions.some(action=>action.state==='Failed')?'Failed':item.actions.length<item.expected?'Pending':item.actions.some(action=>['Pending','Running','Held'].includes(action.state))?'Pending':item.actions.every(action=>action.state==='Skipped')?'Skipped':'Complete'
 return [...grouped.values()].map(({expected,...item})=>item)
}

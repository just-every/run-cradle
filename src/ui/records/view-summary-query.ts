import type {Page} from '../../contracts/primitives'
import type {EntitySchema,Query,RecordRow,ViewResult} from '../../domains/records/contracts'
import {readApi} from '../shared/api'
import {createSummaryAccumulator} from './view-summary-accumulator'
import type {SummaryAggregate,SummaryValue} from './view-summary-values'
export type ViewSummaryInput={schema:EntitySchema;query:Query;fields:string[];viewId?:string}
export type SummaryGroup={key:string;row:RecordRow;count:number}
export type ViewSummarySnapshot={aggregates:Record<string,Record<SummaryAggregate,SummaryValue>>;groups:SummaryGroup[];groupsUnavailable?:string;total:number;groupBy:string[];evaluatedAt:string}
// Covers the contract's table size and the included application's largest declared table.
export const VIEW_SUMMARY_LIMIT=500000
const methods:SummaryAggregate[]=['sum','average','min','max','count','empty','percent-filled']
/** Stream revision-fenced pages into bounded per-column statistics, never a retained copy of the table. */
export async function readViewSummary({schema,query,fields,viewId}:ViewSummaryInput,signal:AbortSignal):Promise<ViewSummarySnapshot>{
 const visible=[...new Set(fields)].filter(id=>schema.fields.some(field=>field.id===id))
 if(!visible.length&&!query.groupBy?.length)throw Error('Choose at least one visible, readable field before calculating a summary.')
 const url=viewId?`/api/v1/views/${encodeURIComponent(viewId)}/query`:`/api/v1/apps/${encodeURIComponent(schema.appId)}/entities/${encodeURIComponent(schema.id)}/query`
 const accumulators=new Map(visible.map(id=>[id,createSummaryAccumulator(schema.fields.find(f=>f.id===id)!)])),ids=new Set<string>(),cursors=new Set<string>(),groups=new Map<string,SummaryGroup>()
 let cursor:string|undefined,reported:Page<RecordRow>['total']|undefined,evaluatedAt='',groupBy=query.groupBy??[],viewVersion:number|undefined,groupsUnavailable:string|undefined
 do{
  signal.throwIfAborted()
  // Group totals are accumulated below. Do not rescan every group for each page.
  const body={...query,includeGroups:false,fields:[...new Set([...visible,...groupBy])],cursor}
  const {data}=await readApi<Page<RecordRow>|ViewResult>(url,{method:'POST',body:JSON.stringify(body)},signal);signal.throwIfAborted()
  const page='records'in data?data.records:data
  if('records'in data){
   if(data.schema.id!==schema.id||data.schema.appId!==schema.appId||data.schema.version!==schema.version||data.schema.physicalRevision!==schema.physicalRevision)throw Error('The table schema changed. Refresh the view before calculating its summary.')
   if(visible.some(id=>!data.view.fields.includes(id)||!data.schema.fields.some(f=>f.id===id)))throw Error('The saved view fields or access changed. Refresh the view before calculating its summary.')
   if(viewVersion!==undefined&&viewVersion!==data.view.version)throw Error('The saved view changed during the summary. Refresh and calculate again.')
   viewVersion=data.view.version;groupBy=query.groupBy??data.view.groupBy
  }
  if(!Number.isInteger(page.total.value)||page.total.value<0||reported&&(reported.kind!==page.total.kind||reported.value!==page.total.value))throw Error('The matching records changed during the summary. Refresh and calculate again.')
  reported=page.total
  if(ids.size+page.items.length>VIEW_SUMMARY_LIMIT)throw Error(`Summary exceeds the ${VIEW_SUMMARY_LIMIT.toLocaleString()}-record limit. Narrow the filters. No partial totals are shown.`)
  for(const row of page.items){
   if(ids.has(row.id))throw Error('The query repeated a record during the summary. Refresh and calculate again.')
   ids.add(row.id);for(const accumulator of accumulators.values())accumulator.add(row)
   if(groupBy.length&&!groupsUnavailable){
    if(groupBy.some(id=>row.fields[id]?.state!=='value')){groupsUnavailable='Group counts are unavailable because a grouping field is restricted or unavailable.';groups.clear()}
    else{const key=JSON.stringify(groupBy.map(id=>row.fields[id])),group=groups.get(key);if(group)group.count++;else groups.set(key,{key,row:{...row,fields:Object.fromEntries(groupBy.map(id=>[id,row.fields[id]!]))},count:1})}
   }
  }
  evaluatedAt=page.evaluatedAt;cursor=page.nextCursor??undefined
  if(cursor){if(!page.items.length||cursors.has(cursor)||ids.size>=VIEW_SUMMARY_LIMIT)throw Error('The query could not finish within the summary limit. No partial totals are shown.');cursors.add(cursor)}
 }while(cursor)
 if(!reported||reported.kind==='exact'&&ids.size!==reported.value||reported.kind==='at_least'&&ids.size<reported.value)throw Error('The query ended before every matching record was read. Refresh and calculate again. No partial totals are shown.')
 return {aggregates:Object.fromEntries([...accumulators].map(([id,a])=>[id,Object.fromEntries(methods.map(method=>[method,a.result(method)])) as Record<SummaryAggregate,SummaryValue>])),groups:[...groups.values()],...(groupsUnavailable?{groupsUnavailable}:{}),total:ids.size,groupBy,evaluatedAt}
}

import type {Cell,Ref} from '../../contracts/primitives'
import type {PolicyScope} from '../authority/ports'
import {and,identifier,trustedPredicate} from '../admission/sql.server'
import type {EntityDescriptor} from './descriptors.server'
import type {Filter,Sort} from './contracts'
import {compileFilter,filterFields} from './filter.server'
import {decode} from './codec.server'
import {compareValues} from './evaluated-query'
import {assertGuards} from './fence.server'

/** Page the authorized linked set; retain result cells, never complete raw records. */
export async function linkedCalculationCells(db:D1Database,target:EntityDescriptor,scope:PolicyScope,refs:Ref[],valueFieldId:string,filter:Filter|undefined,countOnly:boolean,selection:{sort?:Sort[];limit?:number}|undefined,render:(row:Record<string,unknown>,fieldId:string)=>Promise<Cell>):Promise<Cell[]>{
 const sort=selection?.sort??[],dependencies=[...filterFields(filter),...sort.map(item=>item.fieldId),...(countOnly?[]:[valueFieldId])]
 if(dependencies.some(id=>!scope.readableFieldIds.includes(id)))return [{state:'redacted',reason:'policy'}]
 if(!refs.length)return []
 const where=and(scope.rowPredicate,...scope.currentAuthorityGuards,trustedPredicate(`${identifier(target.idColumn)} IN (SELECT value FROM json_each(?))`,[JSON.stringify(refs.map(ref=>ref.recordId))]),compileFilter(target,scope,filter)),order=new Map(refs.map((ref,index)=>[ref.recordId,index]))
 async function cell(row:Record<string,unknown>,id:string):Promise<Cell>{const storage=target.fields.get(id)!;return storage.field.type!=='computed'&&!storage.join&&storage.field.type!=='relation'?{state:'value',value:decode(storage,row)}:render(row,id)}
 type Result={id:string;keys:Extract<Cell,{state:'value'}>[];value:Cell}
 const results:Result[]=[],capacity=selection?.limit??10000
 function compare(a:Result,b:Result){
  for(const [index,item]of sort.entries()){const field=target.fields.get(item.fieldId)!.field,type=field.type==='computed'?field.resultType:field.type,comparison=compareValues(a.keys[index]!.value,b.keys[index]!.value,type==='number');if(comparison)return item.direction==='asc'?comparison:-comparison}
  if(sort.length)return a.id<b.id?-1:a.id>b.id?1:0
  return order.get(a.id)!-order.get(b.id)!
 }
 let lastId:string|undefined,count=0
 for(;;){
  const pageWhere=and(where,lastId===undefined?trustedPredicate('1=1'):trustedPredicate(`${identifier(target.idColumn)}> ?`,[lastId])),page=await db.prepare(`SELECT * FROM ${identifier(target.table.tableId)} WHERE ${pageWhere.sql} ORDER BY ${identifier(target.idColumn)} ASC LIMIT 200`).bind(...pageWhere.values).all<Record<string,unknown>>()
  await assertGuards(db,scope.currentAuthorityGuards)
  for(const row of page.results){
   if(++count>10000)return Array.from({length:10001},()=>({state:'value' as const,value:null}))
   const keys=await Promise.all(sort.map(item=>cell(row,item.fieldId))),bad=keys.find(cell=>cell.state!=='value');if(bad)return [bad]
   const result:Result={id:String(row[target.idColumn]),keys:keys as Extract<Cell,{state:'value'}>[],value:countOnly?{state:'value',value:null}:await cell(row,valueFieldId)}
   let low=0,high=results.length;while(low<high){const middle=(low+high)>>>1;if(compare(results[middle]!,result)<0)low=middle+1;else high=middle}
   if(low<capacity){results.splice(low,0,result);if(results.length>capacity)results.pop()}
  }
  if(page.results.length<200)break
  lastId=String(page.results.at(-1)![target.idColumn])
 }
 return results.map(result=>result.value)
}

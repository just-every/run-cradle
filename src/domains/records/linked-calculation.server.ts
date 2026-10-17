import type { Cell, Ref } from '../../contracts/primitives'
import type { PolicyScope } from '../authority/ports'
import { and, identifier, trustedPredicate } from '../admission/sql.server'
import type { EntityDescriptor } from './descriptors.server'
import type { Filter, Sort } from './contracts'
import { compileFilter, filterFields } from './filter.server'
import { decode } from './codec.server'
import { compareValues } from './evaluated-query'

/** Filter and sort the complete authorized linked set before taking its first N. */
export async function linkedCalculationCells(db:D1Database,target:EntityDescriptor,scope:PolicyScope,refs:Ref[],valueFieldId:string,filter:Filter|undefined,countOnly:boolean,selection:{sort?:Sort[];limit?:number}|undefined,render:(row:Record<string,unknown>,fieldId:string)=>Promise<Cell>):Promise<Cell[]> {
  const sort=selection?.sort??[],dependencies=[...filterFields(filter),...sort.map(item=>item.fieldId),...(countOnly?[]:[valueFieldId])]
  if(dependencies.some(id=>!scope.readableFieldIds.includes(id)))return [{state:'redacted',reason:'policy'}]
  if(!refs.length)return []
  const where=and(scope.rowPredicate,...scope.currentAuthorityGuards,trustedPredicate(`${identifier(target.idColumn)} IN (SELECT value FROM json_each(?))`,[JSON.stringify(refs.map(ref=>ref.recordId))]),compileFilter(target,scope,filter))
  const result=await db.prepare(`SELECT * FROM ${identifier(target.table.tableId)} WHERE ${where.sql} LIMIT 10001`).bind(...where.values).all<Record<string,unknown>>()
  // Keep the refusal visible even when a small limit was requested.
  if(result.results.length>10000)return result.results.map(()=>({state:'value',value:null}))
  async function cell(row:Record<string,unknown>,id:string):Promise<Cell>{const storage=target.fields.get(id)!;return storage.field.type!=='computed'&&!storage.join&&storage.field.type!=='relation'?{state:'value',value:decode(storage,row)}:render(row,id)}
  let rows=result.results
  if(sort.length){
    const prepared=await Promise.all(rows.map(async row=>({row,cells:await Promise.all(sort.map(item=>cell(row,item.fieldId)))})))
    const bad=prepared.flatMap(item=>item.cells).find(cell=>cell.state!=='value');if(bad)return [bad]
    prepared.sort((a,b)=>{for(let index=0;index<sort.length;index++){const order=sort[index]!,field=target.fields.get(order.fieldId)!.field,type=field.type==='computed'?field.resultType:field.type,comparison=compareValues((a.cells[index] as Extract<Cell,{state:'value'}>).value,(b.cells[index] as Extract<Cell,{state:'value'}>).value,type==='number');if(comparison)return order.direction==='asc'?comparison:-comparison}const left=String(a.row[target.idColumn]),right=String(b.row[target.idColumn]);return left<right?-1:left>right?1:0})
    rows=prepared.map(item=>item.row)
  }else{const order=new Map(refs.map((ref,index)=>[ref.recordId,index]));rows.sort((a,b)=>order.get(String(a[target.idColumn]))!-order.get(String(b[target.idColumn]))!)}
  if(selection?.limit!==undefined)rows=rows.slice(0,selection.limit)
  return countOnly?rows.map(()=>({state:'value',value:null})):Promise.all(rows.map(row=>cell(row,valueFieldId)))
}

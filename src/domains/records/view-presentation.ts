import type { Field, Filter, RecordRow } from './contracts'
import { matchesFilter } from './evaluated-query'
export type ViewAggregate = 'sum'|'average'|'min'|'max'|'count'|'empty'|'percent-filled'
export type ViewSummaryChoice = {fieldId:string;aggregate:ViewAggregate}
export type ViewColorRule = {filter:Filter;target:'row'|'cell';fieldId?:string;color:'mint'|'butter'|'coral'|'lilac'}
export function presentationFields(filter:Filter,depth=0):string[]{if(depth>64)throw Error('Colour rule depth exceeds 64');return filter.kind==='condition'?[filter.fieldId]:filter.conditions.flatMap(item=>presentationFields(item,depth+1))}
/** A colour is derived exclusively from projected, visible cells. Missing evidence never becomes a match. */
export function viewColor(row:RecordRow,fields:Field[],rules:ViewColorRule[],fieldId?:string){
 if(!rules.length)return undefined
 const numeric=new Set(fields.filter(f=>f.type==='number'||f.type==='computed'&&f.resultType==='number').map(f=>f.id))
 for(const rule of rules){
  if(fieldId?rule.target!=='cell'||rule.fieldId!==fieldId:rule.target!=='row')continue
  if(presentationFields(rule.filter).some(id=>row.fields[id]?.state!=='value'))continue
  function matches(filter:Filter):boolean{if(filter.kind!=='condition')return filter.kind==='all'?filter.conditions.every(matches):filter.conditions.some(matches);const cell=row.fields[filter.fieldId],value=filter.value;if(cell?.state==='value'&&cell.value&&typeof cell.value==='object'&&'minor'in cell.value&&value&&typeof value==='object'&&'minor'in value&&(cell.value.currency!==value.currency||cell.value.scale!==value.scale))return false;return matchesFilter(row,filter,numeric,new Date().toISOString())}
  if(matches(rule.filter))return rule.color
 }
 return undefined
}

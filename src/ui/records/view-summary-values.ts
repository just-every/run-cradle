import type {CellValue} from '../../contracts/primitives'
import type {Field} from '../../domains/records/contracts'
export type SummaryAggregate='sum'|'average'|'min'|'max'|'count'|'empty'|'percent-filled'
export type SummaryValue={available:true;value:string;note?:string}|{available:false;reason:string}
export const summaryEmpty=(value:CellValue)=>value===null||value===''||Array.isArray(value)&&value.length===0
export const summaryNumeric=(field:Field)=>['number','money'].includes(field.type==='computed'?field.resultType??'':field.type)

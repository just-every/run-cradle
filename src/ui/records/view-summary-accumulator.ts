import type {CellValue,Money} from '../../contracts/primitives'
import type {Field,RecordRow} from '../../domains/records/contracts'
import {add,compare,decimal,divide,format} from '../../domains/records/exact'
import {summaryEmpty,summaryNumeric,type SummaryAggregate,type SummaryValue} from './view-summary-values'
const money=(value:CellValue):value is Money=>!!value&&!Array.isArray(value)&&typeof value==='object'&&'minor'in value
/** Running statistics retain no record values beyond the current minimum and maximum. */
export function createSummaryAccumulator(field:Field){
 let rows=0,filled=0,total='0',min:string|undefined,max:string|undefined,currency:string|undefined,scale:number|undefined,unreadable=false,error=''
 function addRow(row:RecordRow){
  rows++;const cell=row.fields[field.id];if(cell?.state!=='value'){unreadable=true;return}if(summaryEmpty(cell.value))return;filled++
  if(!summaryNumeric(field))return
  try{
   let value:string
   if((field.type==='computed'?field.resultType:field.type)==='money'){
    if(!money(cell.value)||!/^[A-Z]{3}$/.test(cell.value.currency)||!Number.isInteger(cell.value.scale)||cell.value.scale<0||cell.value.scale>6)throw Error('A money value is invalid.')
    if(currency!==undefined&&(currency!==cell.value.currency||scale!==cell.value.scale))throw Error('Mixed currencies or money scales cannot be aggregated.')
    currency=cell.value.currency;scale=cell.value.scale;value=cell.value.minor
   }else{if(typeof cell.value!=='string')throw Error('A number value is invalid.');value=cell.value}
   decimal(value);total=add(total,value);if(min===undefined||compare(value,min)<0)min=value;if(max===undefined||compare(value,max)>0)max=value
  }catch(cause){error=cause instanceof Error?cause.message:'The selected values cannot be aggregated.'}
 }
 function result(aggregate:SummaryAggregate):SummaryValue{
  const unavailable=(reason:string):SummaryValue=>({available:false,reason})
  if(unreadable)return unavailable('A selected cell is restricted, unavailable or missing. No aggregate can be shown for this field.')
  if(aggregate==='count')return {available:true,value:String(filled)}
  if(aggregate==='empty')return {available:true,value:String(rows-filled)}
  if(aggregate==='percent-filled'){
   if(!rows)return unavailable('Percent filled is undefined when no records match.')
   try{return {available:true,value:`${divide(String(filled*100),String(rows))}%`}}
   catch{const units=(BigInt(filled)*10000n+BigInt(rows)/2n)/BigInt(rows);return {available:true,value:`≈ ${format({units,scale:2})}%`,note:`${filled} filled of ${rows}; percentage rounded to two decimal places.`}}
  }
  if(!summaryNumeric(field))return unavailable('Sum, average, minimum and maximum require a number or money field.')
  if(error)return unavailable(error)
  if(!filled)return aggregate==='sum'&&(field.type==='computed'?field.resultType:field.type)!=='money'?{available:true,value:'0'}:unavailable('No filled values are available for this calculation.')
  let value=aggregate==='min'?min!:aggregate==='max'?max!:total
  if(aggregate==='average'){
   const exact=decimal(total),denominator=BigInt(filled)*10n**BigInt(exact.scale)
   if(exact.units*10n**32n%denominator===0n)value=format({units:exact.units*10n**32n/denominator,scale:32})
   else{const divisor=denominator*10n**BigInt(scale??0),absolute=exact.units<0n?-exact.units:exact.units,units=(absolute*1000000n+divisor/2n)/divisor*(exact.units<0n?-1n:1n),sum=currency?`${currency} ${format({units:exact.units,scale:exact.scale+(scale??0)})}`:total;return {available:true,value:`≈ ${currency?currency+' ':''}${format({units,scale:6})}`,note:`Rounded to six decimal places; exact average is ${sum} ÷ ${filled}.`}}
  }
  const exact=decimal(value);return {available:true,value:currency?`${currency} ${format({units:exact.units,scale:exact.scale+scale!})}`:format(exact)}
 }
 return {add:addRow,result}
}

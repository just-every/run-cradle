import type {Store,TallyScope} from '../../../vendor/base/modules/import-kit/src/d1/retirement-tally.ts'
import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types.ts'
import {checkSql,valueBytes} from '../../../vendor/base/modules/import-kit/src/d1/budget.ts'

/** Every before-image is retained, including duplicate images. Combining the
 * independent SELECTs leaves room for atomic archive retirement as schema grows;
 * it changes neither the request limit nor the erasure's guards and journal. */
export function nativeTallyBefore(stores:Store[],receipt:string,scope:TallyScope):D1Sql[]{
 const prefix='INSERT INTO ik_d1_erasure_tally(receipt_id,store,image) '
 const output:D1Sql[]=[],encoder=new TextEncoder()
 let selections:string[]=[],params:unknown[]=[],bytes=0,payload=0
 const flush=()=>{
  if(!selections.length)return
  const statement={sql:prefix+selections.join(' UNION ALL '),params}
  checkSql(statement);output.push(statement)
  selections=[];params=[];bytes=0;payload=0
 }
 for(const store of stores){
  const selection=`SELECT ?,?,${store.image} FROM ${store.name} WHERE ${store.where}`
  const values=[receipt,store.name,...store.params(scope)],size=encoder.encode(selection).length+11
  const valuesSize=values.reduce<number>((sum,value)=>sum+valueBytes(value),0)
  if(selections.length&&(params.length+values.length>100||bytes+size>90000||payload+valuesSize>1500000||selections.length>=50))flush()
  selections.push(selection);params.push(...values);bytes+=size;payload+=valuesSize
 }
 flush()
 return output
}

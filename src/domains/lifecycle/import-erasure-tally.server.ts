import {Buffer} from 'node:buffer'
import type {D1Sql} from '../../../vendor/base/modules/import-kit/src/d1/types'
import type {Store,TallyScope} from '../../../vendor/base/modules/import-kit/src/d1/retirement-tally'
import {checkSql,valueBytes} from '../../../vendor/base/modules/import-kit/src/d1/budget'

/** Capture every store's exact before-images without spending one statement per
 * store per destination. Retained installation snapshots need that same request
 * budget for their DROP statements. UNION ALL preserves every row, including
 * duplicates, and every capture still precedes all native and custody writes in
 * the single erasure batch. D1 permits five terms per compound SELECT; bindings,
 * SQL bytes and value bytes are bounded too. Journal checks stay separate. */
export function tallyBefore(stores:Store[],receipt:string,scope:TallyScope):D1Sql[]{
 const insert='INSERT INTO ik_d1_erasure_tally(receipt_id,store,image) '
 const statements:D1Sql[]=[]
 let selects:string[]=[],params:NonNullable<D1Sql['params']>=[],bytes=Buffer.byteLength(insert),values=0
 const flush=()=>{
  if(!selects.length)return
  const statement={sql:insert+selects.join(' UNION ALL '),params}
  checkSql(statement)
  statements.push(statement)
  selects=[];params=[];bytes=Buffer.byteLength(insert);values=0
 }
 for(const store of stores){
  const select=`SELECT ?,?,${store.image} FROM ${store.name} WHERE ${store.where}`
  const bindings=[receipt,store.name,...store.params(scope)]
  const size=Buffer.byteLength(select)+Buffer.byteLength(' UNION ALL '),payload=bindings.reduce<number>((n,value)=>n+valueBytes(value),0)
  if(selects.length&&(selects.length>=5||params.length+bindings.length>100||bytes+size>90000||values+payload>1500000))flush()
  selects.push(select);params.push(...bindings);bytes+=size;values+=payload
 }
 flush()
 return statements
}

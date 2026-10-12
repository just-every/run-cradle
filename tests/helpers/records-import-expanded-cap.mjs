import assert from 'node:assert/strict'
import {prepareCsvSource} from '../../src/domains/records/base-transfer/source.ts'

/** Twenty legal CSVs with identical bytes. Parse one and reuse immutable scalar
 * values/base64 across the others so the regression does not allocate its own
 * 600 MB expected string merely to prove the product must never allocate it. */
export function expandedSource(){
 const bytes=Buffer.from('Name,Content\r\n'+Array.from({length:64},(_,i)=>`Row ${i+1},${'x'.repeat(100000)}`).join('\r\n')+'\r\n')
 assert.ok(bytes.length<10*1024*1024)
 const first=prepareCsvSource([{filename:'Capacity 1.csv',bytes}]),tables=[],artifacts=[],records=[]
 for(let i=0;i<20;i++){
  const key=`Capacity ${i+1}.csv`,rows=first.tables[0].rows.map(row=>({...row,location:{...row.location,artifact:key}}))
  tables.push({...first.tables[0],key,label:`Capacity ${i+1}`,rows})
  artifacts.push({...first.bundle.artifacts[0],name:key})
  records.push(...first.bundle.records.map((record,index)=>({...record,kind:key,location:rows[index].location})))
 }
 return {...first,tables,bundle:{records,artifacts,diagnostics:[]}}
}

/** A join guard fails the old whole-preview canonical encoder before it can
 * allocate a dangerous string. Legal leaf strings remain unmodified. */
export function guardExpandedJoins(){
 const join=Array.prototype.join;let largest=0
 Array.prototype.join=function(separator=','){
  let length=0
  for(const item of this){if(typeof item==='string')length+=item.length}
  largest=Math.max(largest,length)
  assert.ok(length<32*1024*1024,`unsafe aggregate string join before physical admission: ${length}`)
  return Reflect.apply(join,this,[separator])
 }
 return {largestJoin:()=>largest,restore:()=>{Array.prototype.join=join}}
}
export function counts(h){
 return Object.fromEntries(h.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,h.sql.prepare('SELECT COUNT(*) n FROM "'+name.replaceAll('"','""')+'"').get().n]))
}

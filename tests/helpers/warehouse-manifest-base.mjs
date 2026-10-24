import assert from 'node:assert/strict'
import {createUlid} from './launch-authority-runtime.mjs'

/** Wide but valid public schema: source identities and exact Unicode labels
 * make a useful portable manifest exceed the old transfer envelope naturally. */
export async function warehouseManifestBase(doors){
 const appId=createUlid(),tables=Array.from({length:27},(_,index)=>{
  const fields=Array.from({length:80},(_,column)=>({id:createUlid(),label:`Field ${String(column).padStart(2,'0')} `+'𝄞'.repeat(95),type:'text',required:false,unique:false}))
  return {id:createUlid(),label:'Synthetic manifest table '+index,primaryFieldId:fields[0].id,fields}
 })
 const schema={appId,name:'Synthetic warehouse manifest',tables}
 assert.ok(Buffer.byteLength(JSON.stringify(schema))<1048576,'The wide schema fits the unchanged public intake limit')
 const preview=await doors.call('/api/v1/records/schema-preview',{method:'POST',body:JSON.stringify(schema)})
 assert.equal(preview.status,200,JSON.stringify(preview.body))
 await doors.commit('release.adopt',{kind:'manual_schema',previewId:preview.body.data.id})
 const listed=await doors.call(`/api/v1/apps/${appId}/entities`)
 assert.equal(listed.status,200,JSON.stringify(listed.body));assert.equal(listed.body.data.items.length,tables.length)
 return {appId,tables}
}

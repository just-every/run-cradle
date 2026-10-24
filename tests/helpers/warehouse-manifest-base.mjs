import assert from 'node:assert/strict'
import {createUlid} from './launch-authority-runtime.mjs'

/** Valid public schemas from separately adopted bases: source identities and
 * exact Unicode labels naturally exceed the old manifest transfer envelope.
 * Each adoption stays within the unchanged D1 statement and intake bounds. */
export async function warehouseManifestBase(doors){
 const appIds=[],tables=[]
 for(let index=0;index<27;index++){
  const appId=createUlid(),fields=Array.from({length:80},(_,column)=>({id:createUlid(),label:`Field ${String(column).padStart(2,'0')} `+'𝄞'.repeat(95),type:'text',required:false,unique:false}))
  const table={id:createUlid(),label:'Synthetic manifest table '+index,primaryFieldId:fields[0].id,fields}
  const schema={appId,name:'Synthetic warehouse manifest '+index,tables:[table]}
  assert.ok(Buffer.byteLength(JSON.stringify(schema))<1048576,'Every schema fits the unchanged public intake limit')
  const preview=await doors.call('/api/v1/records/schema-preview',{method:'POST',body:JSON.stringify(schema)})
  assert.equal(preview.status,200,JSON.stringify(preview.body))
  await doors.commit('release.adopt',{kind:'manual_schema',previewId:preview.body.data.id})
  const listed=await doors.call(`/api/v1/apps/${appId}/entities`)
  assert.equal(listed.status,200,JSON.stringify(listed.body));assert.equal(listed.body.data.items.filter(item=>item.id===table.id).length,1,'The adopted table appears once beside the built-in schema entity')
  assert.deepEqual(listed.body.data.items.find(item=>item.id===table.id).fields.map(field=>({id:field.id,label:field.label})),fields.map(field=>({id:field.id,label:field.label})),'Public readback preserves every wide-schema field')
  appIds.push(appId);tables.push(table)
 }
 return {appIds,tables}
}

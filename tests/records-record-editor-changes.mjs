import './helpers/records-tsx-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {setup} from './helpers/records-import-harness.mjs'
import {resumeD1Import} from '../vendor/base/modules/import-kit/src/d1/index.ts'
import {createUlid} from '../src/core/shared/ids.ts'
const {recordEditorChanges}=await import('../src/ui/records/record-editor.tsx')

contract('RECORDS-002 RECORDS-005','editor scalar payload preserves exact imported MANY tuples while genuine relation change still reaches native storage',async()=>{
 const x=await setup()
 try{
  let job=x.job;while(job.state!=='completed')job=await resumeD1Import(job.id,x.context)
  const descriptor=x.r.registry.get(x.appId,x.tableId),join=descriptor.fields.get(x.relation.id).join.table.tableId,ref={appId:x.appId,entityId:x.tableId,recordId:x.ids[0]},scope=await x.r.policy.scope(x.h.ctx,{appId:x.appId,entityId:x.tableId,purpose:'read'}),read=()=>x.r.services.reader.record(x.h.ctx,scope,ref),before=await read(),tuples=async()=>(await x.h.db.prepare(`SELECT * FROM "${join}" ORDER BY id`).all()).results,original=await tuples(),values=Object.fromEntries(Object.entries(before.fields).filter(([,cell])=>cell.state==='value').map(([id,cell])=>[id,cell.value]))
  values[x.name.id]='42';const changes=recordEditorChanges(before,values);assert.deepEqual(Object.keys(changes),[x.name.id]);await x.r.commands.get('record.patch').execute(x.h.ctx,{commandId:createUlid(),expected:[{ref,version:1}],input:{ref,changes}});assert.deepEqual(await tuples(),original);const edited=await read();assert.equal(edited.version,2);assert.equal(edited.fields[x.name.id].value,'42')
  const newValues={...values,[x.relation.id]:[{recordId:x.ids[0],entityId:x.tableId,appId:x.appId}]},relationChanges=recordEditorChanges(edited,newValues);assert.deepEqual(Object.keys(relationChanges),[x.relation.id]);await x.r.commands.get('record.patch').execute(x.h.ctx,{commandId:createUlid(),expected:[{ref,version:2}],input:{ref,changes:relationChanges}});const after=await tuples();assert.equal(after.find(tuple=>tuple.record_id===x.ids[0]).value,x.ids[0]);assert.deepEqual(after.filter(tuple=>tuple.record_id!==x.ids[0]),original.filter(tuple=>tuple.record_id!==x.ids[0]))
 }finally{x.h.close()}
})
contract('RECORDS-002 RECORDS-005','editor compares typed null, checkbox, decimal, ordered references and the accepted concurrent record version',()=>{
 const fields={decimal:{state:'value',value:'1.00'},checked:{state:'value',value:false},empty:{state:'value',value:null},select:{state:'value',value:'choice-a'},links:{state:'value',value:[{appId:'a',entityId:'e',recordId:'one'},{appId:'a',entityId:'e',recordId:'two'}]},money:{state:'value',value:{minor:'100',currency:'AUD',scale:2}}},record={fields},same=Object.fromEntries(Object.entries(fields).map(([id,cell])=>[id,structuredClone(cell.value)]));same.links[0]={recordId:'one',appId:'a',entityId:'e'}
 assert.deepEqual(recordEditorChanges(record,same),{})
 assert.deepEqual(recordEditorChanges(record,{...same,decimal:'1.0',checked:true,empty:'',select:null,links:[...same.links].reverse()}),{decimal:'1.0',checked:true,empty:'',select:null,links:[...same.links].reverse()})
 const current={fields:{...fields,decimal:{state:'value',value:'3.00'}}};assert.deepEqual(recordEditorChanges(current,same),{decimal:'1.00'},'An explicitly reviewed current version is the new comparison base')
})

import './typescript-loader.mjs'
import {readFile,writeFile} from 'node:fs/promises'
import {openImportD1} from './records-import-d1-runtime.mjs'
import {loadDescriptorRegistry} from '../../src/domains/records/loader.server.ts'
import {createApplicationEntityRegistry} from '../../src/core/app/composition/entities.server.ts'
import {createPolicyPort} from '../../src/domains/authority/policy.server.ts'
import {importAuthority} from '../../src/domains/records/base-transfer/authority.server.ts'
import {createNativeImportTarget} from '../../src/domains/records/base-transfer/target.server.ts'
import {resumeD1Import,undoD1Import,readD1ImportOriginals,readD1PersistedImport} from '../../vendor/base/modules/import-kit/src/d1/index.ts'
const [mode,directory,receiptFile]=process.argv.slice(2),runtime=await openImportD1(directory,mode==='crash')
try{
 if(mode==='crash'){
  const {setup}=await import('./records-import-harness.mjs'),x=await setup({...runtime,close:()=>{}}),job=await resumeD1Import(x.job.id,x.context)
  await writeFile(receiptFile,JSON.stringify({ctx:x.h.ctx,jobId:job.id,appId:x.appId,tableId:x.tableId,nameId:x.name.id,relationId:x.relation.id,namespace:x.context.namespace,checkpoint:job.checkpoint}))
  process.send({committed:job.checkpoint,originalBase64:x.bytes.toString('base64')});await new Promise(()=>{})
 }else{
  // No source/parser/mapping is loaded in this branch. Only stored job and current auth.
  const receipt=JSON.parse(await readFile(receiptFile,'utf8')),registry=await loadDescriptorRegistry(runtime.db,[]),policy=createPolicyPort(runtime.db,createApplicationEntityRegistry(registry)),authority=await importAuthority(runtime.db,policy,receipt.ctx,receipt.appId),targets=createNativeImportTarget(registry),context={destination:receipt.appId,namespace:receipt.namespace,mappingVersion:'cradle-native-base-v1',storage:{database:runtime.db,targets},authorization:{principalId:receipt.ctx.principal.id,predicate:()=>authority},batchSize:1,maxBatches:1}
  let job=await resumeD1Import(receipt.jobId,context);while(job.state!=='completed')job=await resumeD1Import(job.id,context)
  const read=await readD1PersistedImport(context),d=registry.get(receipt.appId,receipt.tableId),scalar=d.fields.get(receipt.nameId).column,records=read.rows.filter(r=>r.targetKind.startsWith('record:')),names=new Map(records.map(r=>[r.targetId,r.value.row[scalar]])),normalized=records.map(r=>({name:names.get(r.targetId),links:read.rows.find(l=>l.targetKind.startsWith('link:')&&l.targetId===r.targetId).value.values.map(v=>names.get(v.value))})).sort((a,b)=>a.name.localeCompare(b.name))
  let undo=await undoD1Import(job.id,context);while(undo.state!=='undone')undo=await resumeD1Import(job.id,context)
  const originals=await readD1ImportOriginals(job.id,context),after=await readD1PersistedImport(context)
  await writeFile(receiptFile+'.result',JSON.stringify({normalized,provenance:read.provenance.length,unique:new Set(read.rows.map(r=>r.targetKind+':'+r.targetId)).size,state:undo.state,remainingRows:after.rows.length,retainedOriginalBase64:originals[0].original.base64}))
 }
}finally{await runtime.close()}

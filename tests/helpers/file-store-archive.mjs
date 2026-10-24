import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {exportArchive} from '@runeditrun/rer/modules/portability/files'
import {installationBucket} from '../../scripts/portability/bucket.mjs'
import {portabilityPolicy,transient} from '../../scripts/portability/policy.mjs'
import {derivedSearch} from '../../scripts/portability/records.mjs'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {fileStoresProvider} from './file-stores-provider.mjs'
import {fileStoreBindings} from './file-stores-journey.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'
/** The archive's store reference and retained copy are both authored through the product doors. */
export async function fileStoreArchive(directory){
 const provider=fileStoresProvider(),h=await userAutomationRuntime(0,{outbound:request=>provider.fetch(request),bindings:fileStoreBindings})
 try{
  const fieldId=createUlid(),entity=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
  const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:{appId:h.appId,name:'Automation acceptance',tables:[{id:h.entityId,label:'Items',primaryFieldId:h.nameId,fields:[...entity.fields,{id:fieldId,label:'Files',type:'attachment',required:false,unique:false}]}]}})).data
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
  const schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
  let record=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'synthetic-cradle-archive-files'}}}})).data.value
  const connectionId=(await h.request('/api/v1/commands/connection.configure',{method:'POST',body:{commandId:createUlid(),expected:[],input:{appId:h.appId,adapterId:'google-drive',name:'synthetic-cradle-archive-store',accountId:'ignored',scopes:[],ownership:[],credentialRef:null}}})).data.value.connectionId
  const consent=(await h.request('/api/v1/commands/connection.begin-consent',{method:'POST',body:{commandId:createUlid(),expected:[],input:{connectionId,returnTo:'/app/records'}}})).data.value
  await h.request('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-2',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{status:303})
  const browse=(await h.request('/api/v1/records/file-stores/browse',{method:'POST',body:{appId:h.appId,entityId:h.entityId,fieldId,connectionId}})).data
  const members=browse.items.slice(0,2).map(item=>({reference:{provider:'google-drive',...Object.fromEntries(['itemId','name','mediaType','size','modifiedAt','link'].map(k=>[k,item[k]])),connectionId,attachedBy:browse.attachedBy,account:browse.account,digest:item.digest,attachedAt:browse.attachedAt}}))
  record=(await h.patch(record,{[fieldId]:members})).data.value
  const copy=(await h.request('/api/v1/records/file-stores/keep-copy',{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,fieldId,recordId:record.ref.recordId,provider:'google-drive',itemId:members[0].reference.itemId}})).data
  const file=await h.db.prepare('SELECT object_key,sha256,bytes FROM evidence_files WHERE id=?').bind(copy.fileId).first(),table=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?").bind('%_f_'+fieldId.toLowerCase()).first()).name
  const values=(await h.db.prepare(`SELECT value FROM "${table}" WHERE record_id=? ORDER BY position`).bind(record.ref.recordId).all()).results.map(row=>row.value)
  assert.equal(values[0],copy.fileId);assert.equal(JSON.parse(values[1]).itemId,members[1].reference.itemId)
  const bucket=await h.runtime.getR2Bucket('FILES'),service=await createPortability({db:h.db,buckets:{FILES:installationBucket(h.db,bucket)},policy:{...portabilityPolicy,derivedTables:await derivedSearch(h.db)}})
  await exportArchive(service,directory+'/file-stores.rer',transient)
  return {connectionId,fileId:copy.fileId,...file,table,recordId:record.ref.recordId,values,bytes:provider.payload('google-drive',0)}
 }finally{await h.close()}
}

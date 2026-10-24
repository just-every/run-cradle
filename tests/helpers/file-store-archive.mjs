import './typescript-loader.mjs'
import {platformInstall} from './platform-archive.mjs'
import {recordCalendarProvider} from './record-calendar-provider.mjs'
import {addRecordCalendarArchiveState} from './record-calendar-archive.mjs'
import {createHash} from 'node:crypto'
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
 const provider=fileStoresProvider(),calendarProvider=recordCalendarProvider(),h=await userAutomationRuntime(0,{outbound:async request=>{const url=new URL(request.url);if(url.pathname.startsWith('/calendar/'))return calendarProvider.fetch(request);if(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'&&(await request.clone().text()).includes('synthetic-cradle-code-calendar-archive'))return calendarProvider.fetch(request);return provider.fetch(request)},bindings:fileStoreBindings,installMigrations:platformInstall})
 try{
  const fieldId=createUlid(),calendarDateId=createUlid(),entity=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
  const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:{appId:h.appId,name:'Automation acceptance',tables:[{id:h.entityId,label:'Items',primaryFieldId:h.nameId,fields:[...entity.fields,{id:calendarDateId,label:'Archive calendar date',type:'date',required:false,unique:false},{id:fieldId,label:'Files',type:'attachment',required:false,unique:false}]}]}})).data
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
  const schema=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data
  let record=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:schema.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'synthetic-cradle-archive-files',[calendarDateId]:'2026-12-07'}}}})).data.value
  const connectionId=(await h.request('/api/v1/commands/connection.configure',{method:'POST',body:{commandId:createUlid(),expected:[],input:{appId:h.appId,adapterId:'google-drive',name:'synthetic-cradle-archive-store',accountId:'ignored',scopes:[],ownership:[],credentialRef:null}}})).data.value.connectionId
  const consent=(await h.request('/api/v1/commands/connection.begin-consent',{method:'POST',body:{commandId:createUlid(),expected:[],input:{connectionId,returnTo:'/app/records'}}})).data.value
  await h.request('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-2',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{status:303})
  const browse=(await h.request('/api/v1/records/file-stores/browse',{method:'POST',body:{appId:h.appId,entityId:h.entityId,fieldId,connectionId}})).data
  const members=browse.items.slice(0,2).map(item=>({reference:{provider:'google-drive',...Object.fromEntries(['itemId','name','mediaType','size','modifiedAt','link'].map(k=>[k,item[k]])),connectionId,attachedBy:browse.attachedBy,account:browse.account,digest:item.digest,attachedAt:browse.attachedAt}}))
  record=(await h.patch(record,{[fieldId]:members})).data.value
  const copy=(await h.request('/api/v1/records/file-stores/keep-copy',{method:'POST',body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,fieldId,recordId:record.ref.recordId,provider:'google-drive',itemId:members[0].reference.itemId}})).data
  const uploadedBytes=Buffer.from('synthetic-cradle-uploaded-control'),uploadedHash=createHash('sha256').update(uploadedBytes).digest('hex')
  const stage=(await h.request('/api/v1/commands/source.stage',{method:'POST',body:{commandId:createUlid(),expected:[],input:{appId:h.appId,purpose:'source'}}})).data.value
  const upload=(await h.request('/api/v1/commands/upload.begin',{method:'POST',body:{commandId:createUlid(),expected:[],input:{appId:h.appId,subject:stage.subject,filename:'synthetic-cradle-uploaded.txt',mediaType:'text/plain',bytes:uploadedBytes.length,sha256:uploadedHash}}})).data.value
  const csrf=(await(await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
  const uploaded=await fetch(h.origin+upload.uploadUrl,{method:'PUT',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'text/plain'},body:uploadedBytes});assert.equal(uploaded.status,200,await uploaded.clone().text())
  const uploadedKey=(await h.db.prepare('SELECT object_key FROM evidence_files WHERE id=?').bind(upload.file.id).first()).object_key
  const file=await h.db.prepare('SELECT object_key,sha256,bytes FROM evidence_files WHERE id=?').bind(copy.fileId).first(),table=(await h.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?").bind('%_f_'+fieldId.toLowerCase()).first()).name
  const values=(await h.db.prepare(`SELECT value FROM "${table}" WHERE record_id=? ORDER BY position`).bind(record.ref.recordId).all()).results.map(row=>row.value)
  assert.equal(values[0],copy.fileId);assert.equal(JSON.parse(values[1]).itemId,members[1].reference.itemId)
  const calendar=await addRecordCalendarArchiveState(h,calendarProvider,calendarDateId,record.ref.recordId)
  const bucket=await h.runtime.getR2Bucket('FILES'),service=await createPortability({db:h.db,buckets:{FILES:installationBucket(h.db,bucket)},policy:{...portabilityPolicy,derivedTables:await derivedSearch(h.db)}})
  await exportArchive(service,directory+'/file-stores.rer',transient)
  return {calendar,connectionId,fileId:copy.fileId,...file,table,recordId:record.ref.recordId,values,bytes:provider.payload('google-drive',0),uploadedKey,uploadedFileId:upload.file.id,uploadedBytes}
 }finally{await h.close()}
}

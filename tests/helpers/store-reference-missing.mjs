import assert from 'node:assert/strict'
import {portableStoreFixture,importStoreSnapshot,assertNoStoreCredentials} from './store-reference-exits.mjs'
import {workbookDoors} from './workbook-http.mjs'

/** Capture two genuine edge items, return them, and connect as the returning person. */
export async function missingStoreReturn(h,provider,code='synthetic-cradle-code-1'){
 const d=await workbookDoors(h),fixture=portableStoreFixture()
 async function connect(appId){
  const connectionId=(await d.command('connection.configure',{appId,adapterId:'google-drive',name:'synthetic-cradle-missing-return',accountId:'ignored',scopes:[],ownership:[],credentialRef:null})).value.connectionId
  const consent=(await d.command('connection.begin-consent',{connectionId,returnTo:'/app/records'})).value
  const callback=await d.raw('/oauth/google/callback?'+new URLSearchParams({code,state:new URL(consent.authorizationUrl).searchParams.get('state')}));assert.equal(callback.status,303);await callback.arrayBuffer()
  return connectionId
 }
 const seed=await importStoreSnapshot(h,fixture.snapshot),seedMap=seed.preview.identities.tables[fixture.entityId],seedApp=seed.preview.identities.appId,seedConnection=await connect(seedApp)
 const listed=await d.call('/api/v1/records/file-stores/browse',{appId:seedApp,entityId:seedMap.entityId,fieldId:seedMap.fields[fixture.filesId],connectionId:seedConnection})
 assert.ok(listed.account,'The captured reference has a provider-verified account identity')
 const [missing,present]=listed.items
 const captures=[missing,present].map(item=>({kind:'store',schema:1,provider:'google-drive',account:listed.account,itemId:item.itemId,name:item.name,type:item.mediaType,size:item.size,modified:item.modifiedAt,digest:item.digest,link:item.link,attachedBy:listed.attachedBy,attachedAt:listed.attachedAt}))
 fixture.snapshot.base.tables[0].records[0].values[fixture.filesId]=captures
 const returned=await importStoreSnapshot(h,fixture.snapshot),appId=returned.preview.identities.appId,map=returned.preview.identities.tables[fixture.entityId],entityId=map.entityId,fieldId=map.fields[fixture.filesId],recordId=map.records[fixture.rowId],connectionId=await connect(appId)
 const connections=(await d.call('/api/v1/records/file-stores/connections?appId='+appId)).connections
 assert.ok(connections.some(connection=>connection.id===connectionId&&connection.state==='connected'),'The returning person holds the connected account')
 const own=await d.call('/api/v1/records/file-stores/browse',{appId,entityId,fieldId,connectionId});assert.equal(own.account,listed.account,'The returning account matches the captured account')
 const address={appId,entityId,recordId,fieldId},recordPath=`/api/v1/apps/${appId}/entities/${entityId}/records/${recordId}`
 const record=async()=>(await d.call(recordPath)).record
 async function portable(){
  const exported=await d.call('/api/v1/records/base-export',{appId,format:'json'});assertNoStoreCredentials(exported.content)
  const table=JSON.parse(exported.content).base.tables.find(table=>table.id===entityId)
  return table.records.find(row=>row.id===recordId).values[fieldId]
 }
 const original=await record(),portableBefore=await portable(),canonicalBefore=JSON.stringify(portableBefore),missingPortable=JSON.stringify(portableBefore[0])
 const check=item=>d.call('/api/v1/records/file-stores/resolve',{...address,provider:'google-drive',itemId:item.itemId})
 async function unchanged(){
  const current=await record();assert.equal(current.version,original.version,'A missing file never advances the record version');assert.deepEqual(current,original,'Missing checks preserve the entire record')
  const reference=current.fields[fieldId].value.find(member=>member.reference.itemId===missing.itemId).reference
  assert.equal(reference.resolution,'unresolved');assert.equal(reference.connectionId,null,'No matching connection is bound to a missing item')
  assert.deepEqual(reference.portable,captures[0]);assert.equal(JSON.stringify(await portable()),canonicalBefore,'Unresolved portable objects re-export byte for byte')
  const thumbnail=await d.raw('/api/v1/records/file-stores/thumbnail?'+new URLSearchParams({...address,itemId:missing.itemId}));assert.equal(thumbnail.status,404);assert.deepEqual(await thumbnail.json(),{state:'none'})
 }
 const traceStart=provider.traces.length,missingKey='google-drive:'+missing.itemId
 provider.missingMetadata.add(missingKey)
 function metadataOnly(){
  const traces=provider.traces.slice(traceStart)
  assert.ok(traces.length>0,'The check reaches the provider edge')
  for(const trace of traces){assert.equal(trace.method,'GET');assert.equal(trace.origin,'https://www.googleapis.com');assert.ok([missing,present].some(item=>trace.path==='/drive/v3/files/'+item.itemId));assert.equal(trace.query.alt,undefined,'No file-byte fetch');assert.ok(trace.query.fields?.includes('sha256Checksum'),'A metadata selector requests the digest');assert.notEqual(trace.query.fields,'thumbnailLink','No thumbnail lookup')}
  assert.ok(traces.some(trace=>trace.path.endsWith('/'+missing.itemId)&&trace.status===404),'A real metadata response reports provider-edge HTTP 404')
  assert.deepEqual(provider.writes,[],'No provider write or sharing call')
  return traces
 }
 return {appId,address,missing,present,original,captures,missingPortable,check,record,portable,unchanged,metadataOnly,cleanup:()=>provider.missingMetadata.delete(missingKey)}
}

export async function missingStoreResolution(h,provider){
 const proof=await missingStoreReturn(h,provider)
 try{
  for(let attempt=0;attempt<2;attempt++){
   const outcome=await proof.check(proof.missing);assert.equal(outcome.state,'unresolved');assert.match(outcome.reason,/not find|not grant access/);await proof.unchanged()
  }
  await h.restart()
  await proof.unchanged()
  const afterRestart=await proof.check(proof.missing);assert.equal(afterRestart.state,'unresolved');assert.match(afterRestart.reason,/not find|not grant access/);await proof.unchanged()
  const versionAfterMissing=(await proof.record()).version
  const control=await proof.check(proof.present);assert.equal(control.state,'resolved','A separate present item resolves through the same account')
  const current=await proof.record(),missing=current.fields[proof.address.fieldId].value.find(member=>member.reference.itemId===proof.missing.itemId).reference
  assert.equal(missing.resolution,'unresolved');assert.equal(missing.connectionId,null);assert.deepEqual(missing.portable,proof.captures[0]);assert.equal(JSON.stringify((await proof.portable())[0]),proof.missingPortable,'The control cannot change the missing portable capture')
  const traces=proof.metadataOnly(),receipt={point:'FILE-007 acceptance 2 missing item',missing:'unresolved',reason:afterRestart.reason,connectionId:missing.connectionId,versionBefore:proof.original.version,versionAfterMissing,portableUnchanged:true,repeatedChecks:3,workerRestart:true,present:control.state,traces}
  console.log('PROBE FILE-007 acceptance-2: matching-account metadata HTTP 404 -> Unresolved, no binding, unchanged version and portable content; repeated checks and Worker restart persist; present control resolves')
  if(process.env.CRADLE_FILE_STORE_MISSING_RECEIPT){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.CRADLE_FILE_STORE_MISSING_RECEIPT,JSON.stringify(receipt,null,2)+'\n')}
 }finally{proof.cleanup()}
}

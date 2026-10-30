import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {contract} from './contract.mjs'
import {fileStoresProvider} from './helpers/file-stores-provider.mjs'

// Resolve TypeScript dependencies only after the loader has registered its hooks.
const [{fileStoresJourney,fileStoreBindings},{userAutomationRuntime},{STAGING_ENTITY,STAGING_OWNER,STAGING_FILES},{createUlid},{evidenceCommentsJourney}]=await Promise.all([
 import('./helpers/file-stores-journey.mjs'),
 import('./helpers/user-automation-runtime.mjs'),
 import('../src/domains/evidence/staging.server.ts'),
 import('../src/core/shared/ids.ts'),
 import('./helpers/evidence-comments-journey.mjs'),
])

contract('BASE-INPUT-003 BASE-ACCESS-004 COLLAB-001','private source/file and authority identifiers become indistinguishable from missing after current access is removed',async()=>{
 const h=await userAutomationRuntime(0)
 try{
  await evidenceCommentsJourney(h)
  const command=input=>({commandId:createUlid(),expected:[],input})
  const staged=(await h.request('/api/v1/commands/source.stage',{method:'POST',body:command({appId:h.appId,purpose:'source'})})).data.value
  const text='Private stored evidence',sha256=createHash('sha256').update(text).digest('hex')
  const upload=(await h.request('/api/v1/commands/upload.begin',{method:'POST',body:command({appId:h.appId,subject:staged.subject,filename:'private.txt',mediaType:'text/plain',bytes:Buffer.byteLength(text),sha256})})).data.value
  const proof=await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}}),csrf=(await proof.json()).csrfToken
  const uploaded=await fetch(h.origin+upload.uploadUrl,{method:'PUT',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'text/plain'},body:text})
  assert.equal(uploaded.status,200);await uploaded.arrayBuffer()
  const source=(await h.request('/api/v1/commands/source.capture',{method:'POST',body:command({appId:h.appId,subject:staged.subject,kind:'file',fileIds:[upload.file.id],text})})).data.value
  const download=await fetch(h.origin+upload.uploadUrl,{headers:{cookie:h.cookie}})
  assert.equal(download.status,200);assert.equal(await download.text(),text)
  assert.equal((await h.request(`/api/v1/sources/${source.id}/content`)).data.text,text)
  const policyRow=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(h.operator,h.appId).first()
  const rules=JSON.parse(policyRow.rules_json)
  async function compare(kind,id){
   const outcomes=[]
   for(const target of [id,createUlid()]){
    const response=await fetch(h.origin+`/api/v1/${kind}/${target}/content`,{headers:{cookie:h.cookie}})
    assert.equal(response.status,404)
    const body=await response.json();outcomes.push({code:body.error.code,message:body.error.message,retry:body.error.retry})
   }
   assert.deepEqual(outcomes[0],outcomes[1])
  }
  for(const restriction of ['row','field']){
   const scoped=rules.map(r=>r.entityId!==STAGING_ENTITY?r:restriction==='row'?{...r,rows:{kind:'condition',fieldId:STAGING_OWNER,op:'eq',value:createUlid()}}:{...r,readableFields:r.readableFields.filter(id=>id!==STAGING_FILES)})
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(scoped),policyRow.id).run()
   await compare('files',upload.file.id);await compare('sources',source.id)
  }
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policyRow.id).run()
  for(const [kind,table,id]of [['files','evidence_files',upload.file.id],['sources','evidence_sources',source.id]]){
   await h.db.prepare(`UPDATE ${table} SET entity_id=? WHERE id=?`).bind(createUlid(),id).run()
   await compare(kind,id)
   await h.db.prepare(`UPDATE ${table} SET entity_id=? WHERE id=?`).bind(staged.subject.entityId,id).run()
  }
  const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'Scoped key',permissions:'write',expiresAt:new Date(Date.now()+3600000).toISOString()}})).data.key
  const grant=await h.db.prepare('SELECT d.grant_id FROM authority_delegations d JOIN authority_credentials c ON c.principal_id=d.principal_id WHERE c.id=?').bind(key.id).first()
  const policy=await h.db.prepare('SELECT policy_id FROM authority_memberships WHERE app_id=? AND principal_id=?').bind(h.appId,h.operator).first()
  await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE app_id=? AND principal_id=?").bind(h.appId,h.operator).run()
  for(const [prefix,id,suffix]of [['files',upload.file.id,'/content'],['sources',source.id,'/content'],['grants',grant.grant_id,''],['policies',policy.policy_id,'']]){
   const outcomes=[]
   for(const target of [id,createUlid()]){
    const response=await fetch(h.origin+`/api/v1/${prefix}/${target}${suffix}`,{headers:{cookie:h.cookie}})
    assert.equal(response.status,404)
    const body=await response.json();outcomes.push({code:body.error.code,message:body.error.message,retry:body.error.retry})
    assert.ok(!JSON.stringify(body).includes(text))
   }
   assert.deepEqual(outcomes[0],outcomes[1])
  }
 }finally{await h.close()}
})

contract('FILE-002 FILE-004 FILE-005 FILE-006 FILE-007 COLLAB-002 BASE-ACCESS-004','record history reprojects retained relation and attachment cells under current authority; personal store references attach without unasked copying and retain only owner-requested copies from each connected store',async()=>{
 const provider=fileStoresProvider(),h=await userAutomationRuntime(0,{outbound:request=>provider.fetch(request),bindings:fileStoreBindings}),observations={}
 try{
  const relationId=createUlid(),visible=(await h.create('Visible history')).record,hidden=(await h.create('Hidden history')).record
  const draft={appId:h.appId,name:'Automation acceptance',tables:[{id:h.entityId,label:'Items',primaryFieldId:h.nameId,fields:[
   {id:h.nameId,label:'Name',type:'text',required:true,unique:false},
   {id:h.statusId,label:'Status',type:'text',required:false,unique:false},
   {id:relationId,label:'Related',type:'relation',required:false,unique:false,relation:{ownerAppId:h.appId,entityId:h.entityId,cardinality:'many',onDelete:'restrict'}},
  ]}]}
  const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:draft})).data
  await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
  const linked=(await h.patch(visible,{[relationId]:[visible.ref,hidden.ref],[h.statusId]:'Retained visible change'})).data.value
  await h.patch(linked,{[relationId]:[visible.ref]})
  const history=async ref=>(await h.request('/api/v1/history?'+new URLSearchParams(ref))).data
  const record=async ref=>(await h.request(`/api/v1/apps/${ref.appId}/entities/${ref.entityId}/records/${ref.recordId}`)).data.record
  const includes=(value,id)=>JSON.stringify(value).includes(id)
  const beforeRestore=await record(visible.ref)
  const prior=(await history(visible.ref)).items.flatMap(entry=>entry.changes).find(change=>change.fieldId===h.statusId&&change.after.state==='value'&&change.after.value==='Retained visible change')
  assert.equal(prior.before.state,'value')
  const restored=(await h.patch(beforeRestore,{[h.statusId]:prior.before.value})).data.value
  assert.deepEqual(restored.fields[h.statusId],prior.before,'History values restore through the ordinary audited write door')
  const restoreAudit=(await history(visible.ref)).items.find(entry=>entry.changes.some(change=>change.fieldId===h.statusId&&change.before.state==='value'&&change.before.value==='Retained visible change'&&change.after.state==='value'&&change.after.value===prior.before.value))
  assert.ok(restoreAudit,'Restoring is itself visible in record history')
  await h.patch(beforeRestore,{[h.statusId]:'stale restore'},undefined,createUlid(),409)
  assert.deepEqual((await record(visible.ref)).fields[h.statusId],prior.before,'Stale restore changes nothing')
  observations.allowedHistory=includes(await history(visible.ref),hidden.ref.recordId)
  const auditRows=(await h.db.prepare('SELECT id,changes_json FROM admission_audit WHERE app_id=?').bind(h.appId).all()).results
  const foreignApp=createUlid()
  for(const row of auditRows){const changes=JSON.parse(row.changes_json),foreign=JSON.parse(JSON.stringify(changes),(_key,value)=>value?.recordId===hidden.ref.recordId?{...value,appId:foreignApp}:value);await h.db.prepare('UPDATE admission_audit SET changes_json=? WHERE id=?').bind(JSON.stringify(foreign),row.id).run()}
  observations.foreignRelationLeak=includes(await history(visible.ref),foreignApp)
  for(const row of auditRows)await h.db.prepare('UPDATE admission_audit SET changes_json=? WHERE id=?').bind(row.changes_json,row.id).run()
  const p=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(h.operator,h.appId).first(),rules=JSON.parse(p.rules_json)
  const setRules=async value=>h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(value),p.id).run()
  await setRules(rules.map(r=>r.entityId===h.entityId?{...r,rows:{kind:'condition',fieldId:h.nameId,op:'eq',value:'Visible history'}}:r))
  const restricted=await history(visible.ref)
  observations.hiddenRelationLeak=includes(restricted,hidden.ref.recordId)
  observations.visibleRelationRetained=includes(restricted,visible.ref.recordId)
  observations.visibleScalarRetained=includes(restricted,'Retained visible change')
  observations.currentRecordHiddenLeak=includes(await record(visible.ref),hidden.ref.recordId)
  await setRules(rules.map(r=>r.entityId===h.entityId?{...r,readableFields:r.readableFields.filter(id=>id!==relationId)}:r))
  observations.maskedFieldLeak=includes(await history(visible.ref),relationId)
  await setRules(rules)
  await fileStoresJourney(h,provider,draft.tables[0].fields)

  // The current manual builder cannot create attachment fields. Use native private
  // intake and a retained historical attachment-cell snapshot in its real audit row.
  const staged=(await h.request('/api/v1/commands/source.stage',{method:'POST',body:{commandId:createUlid(),expected:[],input:{appId:h.appId,purpose:'source'}}})).data.value
  const bytes='History attachment bytes',sha256=createHash('sha256').update(bytes).digest('hex')
  const upload=(await h.request('/api/v1/commands/upload.begin',{method:'POST',body:{commandId:createUlid(),expected:[],input:{appId:h.appId,subject:staged.subject,filename:'history.txt',mediaType:'text/plain',bytes:Buffer.byteLength(bytes),sha256}}})).data.value
  const csrf=(await (await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
  const put=await fetch(h.origin+upload.uploadUrl,{method:'PUT',headers:{cookie:h.cookie,origin:h.origin,'x-csrf-token':csrf,'content-type':'text/plain'},body:bytes});assert.equal(put.status,200);await put.arrayBuffer()
  const captureId=createUlid()
  await h.request('/api/v1/commands/source.capture',{method:'POST',body:{commandId:captureId,expected:[],input:{appId:h.appId,subject:staged.subject,kind:'file',fileIds:[upload.file.id],text:bytes}}})
  await h.db.prepare('UPDATE admission_audit SET changes_json=? WHERE command_id=?').bind(JSON.stringify([{fieldId:STAGING_FILES,before:{state:'value',value:[{fileId:upload.file.id}]},after:{state:'value',value:[]}}]),captureId).run()
  observations.allowedAttachmentHistory=includes(await history(staged.subject),upload.file.id)
  await h.db.prepare("UPDATE evidence_files SET state='rejected',version=version+1 WHERE id=?").bind(upload.file.id).run()
  observations.unavailableAttachmentLeak=includes(await history(staged.subject),upload.file.id)
  await h.db.prepare("UPDATE evidence_files SET state='available',app_id=?,version=version+1 WHERE id=?").bind(createUlid(),upload.file.id).run()
  observations.foreignAttachmentLeak=includes(await history(staged.subject),upload.file.id)
  await h.db.prepare("UPDATE evidence_files SET app_id=?,version=version+1 WHERE id=?").bind(h.appId,upload.file.id).run()
  observations.restoredAttachmentHistory=includes(await history(staged.subject),upload.file.id)
  const key=(await h.request('/api/user-keys',{method:'POST',status:201,body:{commandId:createUlid(),appId:h.appId,entityId:h.entityId,name:'History reader with scoped grant',permissions:'write',expiresAt:new Date(Date.now()+3600000).toISOString()}})).data.key
  const historyRoute='/api/v1/history?'+new URLSearchParams(visible.ref)
  observations.allowedKeyHistory=includes((await h.request(historyRoute,{secret:key.secret})).data,hidden.ref.recordId)
  const delegation=await h.db.prepare('SELECT d.grant_id FROM authority_delegations d JOIN authority_credentials c ON c.principal_id=d.principal_id WHERE c.id=?').bind(key.id).first()
  assert.ok(delegation.grant_id,'A writable native key has an actual scoped grant')
  await h.db.prepare("UPDATE authority_grants SET state='revoked',revoked_at=? WHERE id=?").bind(Date.now(),delegation.grant_id).run()
  const revokedGrant=await h.request(historyRoute,{secret:key.secret,status:403})
  observations.revokedGrantLeak=includes(revokedGrant,hidden.ref.recordId)
  await h.db.prepare("UPDATE authority_grants SET state='active',revoked_at=NULL WHERE id=?").bind(delegation.grant_id).run()
  await setRules(rules)
  observations.staleIssuerPolicyLeak=includes(await h.request(historyRoute,{secret:key.secret,status:403}),hidden.ref.recordId)
  await h.db.prepare("UPDATE authority_memberships SET state='removed',version=version+1 WHERE app_id=? AND principal_id=?").bind(h.appId,h.operator).run()
  const revoked=await fetch(h.origin+'/api/v1/history?'+new URLSearchParams(visible.ref),{headers:{cookie:h.cookie}})
  observations.revokedStatus=revoked.status
  observations.revokedBodyLeak=includes(await revoked.json(),hidden.ref.recordId)
  await h.db.prepare("UPDATE authority_memberships SET state='active',version=version+1 WHERE app_id=? AND principal_id=?").bind(h.appId,h.operator).run()
  await h.db.prepare('UPDATE oa_sessions SET revoked_at=1').run()
  const revokedSession=await fetch(h.origin+historyRoute,{headers:{cookie:h.cookie}})
  observations.revokedSessionStatus=revokedSession.status
  observations.revokedSessionLeak=includes(await revokedSession.json(),hidden.ref.recordId)
  assert.deepEqual(observations,{allowedHistory:true,foreignRelationLeak:false,hiddenRelationLeak:false,visibleRelationRetained:true,visibleScalarRetained:true,currentRecordHiddenLeak:false,maskedFieldLeak:false,allowedAttachmentHistory:true,unavailableAttachmentLeak:false,foreignAttachmentLeak:false,restoredAttachmentHistory:true,allowedKeyHistory:true,revokedGrantLeak:false,staleIssuerPolicyLeak:false,revokedStatus:403,revokedBodyLeak:false,revokedSessionStatus:401,revokedSessionLeak:false})
 }finally{
  await h.close()
  if(process.env.HISTORY_EVIDENCE){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.HISTORY_EVIDENCE,JSON.stringify({observations,cleanup:'runtime disposed and temporary D1/R2 removed'},null,2)+'\n')}
 }
})

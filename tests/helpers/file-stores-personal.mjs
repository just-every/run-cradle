import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {AUTHORITY_ENTITY_IDS} from '../../src/domains/authority/contracts.ts'
import {fileStoreActors} from './file-stores-actors.mjs'
export async function personalStoresJourney(h,provider,fieldId){
 const {people,request,command}=await fileStoreActors(h,h.appId),{editor,second,reader}=people,address={appId:h.appId,entityId:h.entityId,fieldId}
 async function connect(person,adapterId='google-drive',code='synthetic-cradle-code-1'){
  const id=(await command(person.cookie,'connection.configure',{appId:h.appId,adapterId,name:'synthetic-cradle-personal-'+adapterId,accountId:'caller-supplied-identity-is-ignored',scopes:[],ownership:[],credentialRef:null})).value.connectionId
  const consent=(await command(person.cookie,'connection.begin-consent',{connectionId:id,returnTo:'/app/records'})).value
  const family={ 'google-drive':'google',onedrive:'microsoft',dropbox:'dropbox',box:'box'}[adapterId]
  await request(person.cookie,'/oauth/'+family+'/callback?'+new URLSearchParams({code,state:new URL(consent.authorizationUrl).searchParams.get('state')}),{status:303})
  assert.notEqual((await h.db.prepare('SELECT account_id FROM provider_connections WHERE id=?').bind(id).first()).account_id,'caller-supplied-identity-is-ignored')
  return id
 }
 const connections={},references=[]
 for(const adapterId of ['google-drive','onedrive','dropbox','box']){
  const id=connections[adapterId]=await connect(editor,adapterId)
  const picked=(await request(editor.cookie,'/api/v1/records/file-stores/browse',{body:{...address,connectionId:id}})).items[0]
  references.push({reference:{provider:adapterId,...Object.fromEntries(['itemId','name','mediaType','size','modifiedAt','link'].map(k=>[k,picked[k]])),connectionId:id,attachedBy:editor.id}})
  for(const person of [second,{cookie:h.cookie}]){
   await request(person.cookie,'/api/v1/records/file-stores/browse',{body:{...address,connectionId:id},status:403})
   await request(person.cookie,'/api/v1/connections/'+id,{status:403})
   await command(person.cookie,'connection.begin-consent',{connectionId:id,returnTo:'/app/records'},[],403)
  }
 }
 const checkBytes=async()=>{for(const table of ['file_store_requests','connection_jobs','command_admissions','admission_audit'])assert.ok(!JSON.stringify((await h.db.prepare(`SELECT * FROM ${table}`).all()).results).includes(provider.png.toString('base64')),'No thumbnail bytes in '+table);assert.equal((await(await h.runtime.getR2Bucket('FILES')).list()).objects.length,0)}
 provider.observeThumbnails(checkBytes)
 const id=connections['google-drive'],browse=await request(editor.cookie,'/api/v1/records/file-stores/browse',{body:{...address,connectionId:id}}),item=browse.items[0]
 const entity=(await request(editor.cookie,`/api/v1/apps/${h.appId}/entities/${h.entityId}`))
 let record=(await command(editor.cookie,'record.create',{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'synthetic-cradle-personal-file',[fieldId]:references}},[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:entity.version}])).value
 const thumbnail=async(person,status,requestedItem=item.itemId)=>{const r=await fetch(h.origin+'/api/v1/records/file-stores/thumbnail?'+new URLSearchParams({...address,recordId:record.ref.recordId,itemId:requestedItem}),{headers:{cookie:person.cookie}});assert.equal(r.status,status);assert.match(r.headers.get('cache-control'),/no-store/);if(status===200)assert.deepEqual(Buffer.from(await r.arrayBuffer()),provider.png);else await r.json()}
 // Different provider accounts may see the same shared item; access is decided at the network edge.
 for(const adapterId of ['onedrive','dropbox','box']){
  const reference=references.find(r=>r.reference.provider===adapterId).reference
  await thumbnail(reader,404,reference.itemId)
  const own=await connect(reader,adapterId,'synthetic-cradle-code-reader')
  await request(reader.cookie,'/api/v1/records/file-stores/browse',{body:{...address,connectionId:own},status:403})
  await thumbnail(reader,200,reference.itemId)
  provider.denied.add('synthetic-cradle-access-reader');await thumbnail(reader,404,reference.itemId)
  await request(editor.cookie,'/api/v1/records/file-stores/settings',{body:{kind:'sharing',appId:h.appId,connectionId:connections[adapterId],enabled:true}})
  await thumbnail(reader,200,reference.itemId)
  await request(editor.cookie,'/api/v1/records/file-stores/settings',{body:{kind:'sharing',appId:h.appId,connectionId:connections[adapterId],enabled:false}})
  await thumbnail(reader,404,reference.itemId);provider.denied.delete('synthetic-cradle-access-reader')
 }
 const metadata=await request(reader.cookie,`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.ref.recordId}`)
 assert.equal(metadata.record.fields[fieldId].value[0].reference.name,item.name);assert.equal(metadata.record.fields[fieldId].value[0].reference.link,item.link)
 await thumbnail(reader,404)
 const readerConnection=await connect(reader,'google-drive','synthetic-cradle-code-reader')
 await request(reader.cookie,'/api/v1/records/file-stores/browse',{body:{...address,connectionId:readerConnection},status:403})
 await thumbnail(reader,200)
 provider.denied.add('synthetic-cradle-access-reader');await thumbnail(reader,404)
 const sharing=enabled=>request(editor.cookie,'/api/v1/records/file-stores/settings',{body:{kind:'sharing',appId:h.appId,connectionId:id,enabled}})
 await sharing(true);await thumbnail(reader,200);await sharing(false);await thumbnail(reader,404)
 assert.ok((await h.db.prepare("SELECT 1 FROM admission_audit WHERE actor_id=? AND action LIKE 'connection.preview-sharing.%'").bind(editor.id).first()),'Sharing changes are audited')
 await sharing(true)
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(editor.id,h.appId).first()
 const rules=JSON.parse(policy.rules_json)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules.map(r=>r.entityId===h.entityId?{...r,readableFields:r.readableFields.filter(f=>f!==fieldId),writableFields:r.writableFields.filter(f=>f!==fieldId)}:r)),policy.id).run()
 await thumbnail(reader,404)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
 const settings=(enabled,connectRole)=>request(h.cookie,'/api/v1/records/file-stores/settings',{body:{kind:'policy',appId:h.appId,provider:'google-drive',enabled,connectRole}})
 const configure={appId:h.appId,adapterId:'google-drive',name:'synthetic-cradle-blocked',accountId:'me',scopes:[],ownership:[],credentialRef:null}
 await settings(true,'installation-owner');await command(second.cookie,'connection.configure',configure,[],403)
 await settings(true,'base-authors');await command(second.cookie,'connection.configure',configure,[],403)
 await settings(false,'writers');await request(editor.cookie,'/api/v1/records/file-stores/browse',{body:{...address,connectionId:id},status:403})
 await settings(true,'writers');await thumbnail(reader,200)
 await command(second.cookie,'connection.revoke',{connectionId:id},[],403)
 await command(h.cookie,'connection.revoke',{connectionId:id});await thumbnail(reader,404)
 await checkBytes();provider.observeThumbnails(undefined)
 for(const table of ['file_store_requests','connection_jobs','command_admissions','admission_audit']){const rows=(await h.db.prepare(`SELECT * FROM ${table}`).all()).results;assert.ok(!JSON.stringify(rows).includes(provider.png.toString('base64')),'No thumbnail bytes in '+table)}
 assert.equal((await(await h.runtime.getR2Bucket('FILES')).list()).objects.length,0)
 // Native and SCIM removal use the same lifecycle plan; the native door proves the credential revocation.
 const version=(await h.db.prepare('SELECT version FROM authority_principals WHERE id=?').bind(editor.id).first()).version
 await command(h.cookie,'member.remove',{memberId:editor.id,reason:'synthetic-cradle-deprovision'},[{ref:{appId:h.appId,entityId:AUTHORITY_ENTITY_IDS.member,recordId:editor.id},version}])
 assert.equal((await h.db.prepare('SELECT count(*) n FROM provider_connections WHERE owner_id=? AND revoked_at IS NULL').bind(editor.id).first()).n,0)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM connection_credentials WHERE connection_id IN(SELECT id FROM provider_connections WHERE owner_id=?)').bind(editor.id).first()).n,0)
 assert.deepEqual(provider.writes,[])
}

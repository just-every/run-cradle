import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {workbookDoors} from './workbook-http.mjs'
import {fileStoreActors} from './file-stores-actors.mjs'
export async function storeReferenceResolution(h,provider,snapshot){
 const source=structuredClone(snapshot),attacher=createUlid()
 for(const table of source.base.tables)for(const row of table.records)for(const value of Object.values(row.values))if(Array.isArray(value))for(const item of value)if(item?.kind==='store')item.attachedBy=attacher
 const d=await workbookDoors(h),bytes=Buffer.from(JSON.stringify(source)),returned=await d.adopt(bytes,'synthetic-cradle-resolve.json'),appId=returned.preview.identities.appId,entities=(await d.call(`/api/v1/apps/${appId}/entities`)).items,entity=entities.find(e=>e.id===returned.preview.identities.tables[source.base.tables[0].id].entityId),field=entity.fields.find(f=>f.type==='attachment'),rows=(await d.call(`/api/v1/apps/${appId}/entities/${entity.id}/query`,{})).items,row=rows.find(r=>r.fields[field.id]?.value?.length),ref={appId,entityId:entity.id,recordId:row.id},address={...ref,fieldId:field.id}
 const members=row.fields[field.id].value,drive=members.find(m=>m.reference.provider==='google-drive').reference,graph=members.find(m=>m.reference.provider==='onedrive').reference
 const {people,command,request}=await fileStoreActors(h,appId)
 async function connect(adapterId,cookie=h.cookie){const value=(await command(cookie,'connection.configure',{appId,adapterId,name:'synthetic-cradle-return-'+adapterId,accountId:'ignored-source-account',scopes:[],ownership:[],credentialRef:null})).value,id=value.connectionId,consent=(await command(cookie,'connection.begin-consent',{connectionId:id,returnTo:'/app/records'})).value,family={'google-drive':'google',onedrive:'microsoft',dropbox:'dropbox',box:'box'}[adapterId];await request(cookie,'/oauth/'+family+'/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{status:303});return id}
 const call=(reference,extra={})=>d.call('/api/v1/records/file-stores/resolve',{...address,provider:reference.provider,itemId:reference.itemId,...extra})
 await connect('google-drive',people.editor.cookie)
 const before=provider.seen.length,unavailable=await call(drive);assert.equal(unavailable.state,'unresolved');assert.equal(provider.seen.length,before,"Another person's matching connection is never used")
 await request(people.reader.cookie,'/api/v1/records/file-stores/resolve',{body:{...address,provider:'google-drive',itemId:drive.itemId},status:403})
 // The generic record writer cannot bind an imported reference, including by its original attacher.
 await d.call('/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref,version:row.version}],input:{ref,changes:{[field.id]:members.map(m=>m.reference.itemId===drive.itemId?{reference:{...m.reference,connectionId:createUlid(),resolution:'resolved'}}:m)}}},403)
 const ownDrive=await connect('google-drive');await connect('onedrive')
 provider.denied.add('synthetic-cradle-access-1');assert.equal((await call(graph)).state,'unresolved');provider.denied.delete('synthetic-cradle-access-1')
 const graphResult=await call(graph);assert.equal(graphResult.state,'resolved');assert.equal(graphResult.record.fields[field.id].value.find(m=>m.reference.itemId===graph.itemId).reference.attachedBy,attacher)
 provider.changeDigest('google-drive',drive.itemId)
 const changed=await call(drive);assert.equal(changed.state,'changed');assert.ok(changed.item.digest)
 let current=(await d.call(`/api/v1/apps/${appId}/entities/${entity.id}/records/${row.id}`)).record;assert.equal(current.fields[field.id].value.find(m=>m.reference.itemId===drive.itemId).reference.resolution,'unresolved')
 await d.call('/api/v1/records/file-stores/resolve',{...address,provider:drive.provider,itemId:drive.itemId,confirmChanged:true,observedDigest:drive.portable.digest},409)
 await call(drive,{confirmChanged:true,observedDigest:changed.item.digest});current=(await d.call(`/api/v1/apps/${appId}/entities/${entity.id}/records/${row.id}`)).record
 const resolved=current.fields[field.id].value.find(m=>m.reference.itemId===drive.itemId).reference;assert.equal(resolved.resolution,'resolved');assert.equal(resolved.attachedBy,attacher);assert.deepEqual(resolved.portable.digest,changed.item.digest)
 const history=(await d.call('/api/v1/history?'+new URLSearchParams(ref))).items;assert.ok(history.some(entry=>entry.action==='attachment.reference.confirm-changed'),'Explicit changed-content acceptance is audited')
 const reexport=JSON.parse((await d.call('/api/v1/records/base-export',{appId,format:'json'})).content);assert.ok(!JSON.stringify(reexport).includes('connectionId'));assert.ok(reexport.base.tables.flatMap(t=>t.records).some(r=>Object.values(r.values).some(v=>Array.isArray(v)&&v.some(m=>m?.kind==='store'&&m.itemId===drive.itemId&&m.digest?.value===changed.item.digest.value))))
 // One public bulk request reviews and confirms multiple selected references atomically.
 const listed=await d.call('/api/v1/records/file-stores/browse',{appId,entityId:entity.id,fieldId:field.id,connectionId:ownDrive})
 const bulkSource=structuredClone(source),bulkItems=listed.items.slice(0,2)
 const captures=bulkItems.map(item=>({kind:'store',schema:1,provider:'google-drive',account:listed.account,itemId:item.itemId,name:'synthetic-cradle-before-'+item.itemId,type:item.mediaType,size:1,modified:'2026-10-01T00:00:00.000Z',digest:item.digest,link:item.link,attachedBy:attacher,attachedAt:'2026-10-01T00:00:00.000Z'}))
 // Keep an unselected reference and another provider to prove selection and account isolation.
 bulkSource.base.tables[0].records[0].values[source.base.tables[0].fields.find(f=>f.type==='attachment').id]=[...captures,{...captures[0],itemId:listed.items[2].itemId,name:listed.items[2].name,digest:listed.items[2].digest,link:listed.items[2].link},{...captures[0],provider:'onedrive',account:'synthetic-cradle-foreign-account',itemId:graph.itemId,link:graph.link}]
 const imported=await d.adopt(Buffer.from(JSON.stringify(bulkSource)),'synthetic-cradle-bulk.json'),bulkApp=imported.preview.identities.appId,bulkTable=imported.preview.identities.tables[source.base.tables[0].id],bulkEntity=bulkTable.entityId,bulkField=bulkTable.fields[source.base.tables[0].fields.find(f=>f.type==='attachment').id]
 const bulkRow=(await d.call(`/api/v1/apps/${bulkApp}/entities/${bulkEntity}/query`,{})).items.find(r=>r.fields[bulkField]?.value?.some(member=>member.reference?.name.startsWith('synthetic-cradle-before-'))),bulkAddress={appId:bulkApp,entityId:bulkEntity,recordId:bulkRow.id,fieldId:bulkField},bulkRef={appId:bulkApp,entityId:bulkEntity,recordId:bulkRow.id}
 async function bulkConnect(provider,cookie=h.cookie,code='synthetic-cradle-code-1'){
  const id=(await command(cookie,'connection.configure',{appId:bulkApp,adapterId:provider,name:'synthetic-cradle-bulk-store',accountId:'ignored',scopes:[],ownership:[],credentialRef:null})).value.connectionId,consent=(await command(cookie,'connection.begin-consent',{connectionId:id,returnTo:'/app/records'})).value
  await request(cookie,'/oauth/'+(provider==='onedrive'?'microsoft':'google')+'/callback?'+new URLSearchParams({code,state:new URL(consent.authorizationUrl).searchParams.get('state')}),{status:303});return id
 }
 const bulkActors=await fileStoreActors(h,bulkApp)
 await bulkConnect('google-drive',bulkActors.people.editor.cookie)
 const selections=[]
 for(const item of bulkItems){provider.changeDigest('google-drive',item.itemId);const answer=await d.call('/api/v1/records/file-stores/resolve',{...bulkAddress,provider:'google-drive',itemId:item.itemId});assert.equal(answer.state,'unresolved')}
 const connectionId=await bulkConnect('google-drive');await bulkConnect('onedrive')
 async function review(){const items=[];for(const item of bulkItems){const checked=await d.call('/api/v1/records/file-stores/resolve',{...bulkAddress,provider:'google-drive',itemId:item.itemId});assert.equal(checked.state,'changed');items.push({provider:'google-drive',itemId:item.itemId,observedDigest:checked.item.digest})}return items}
 selections.push(...await review())
 const bulk=(items=selections,status=200)=>d.call('/api/v1/records/file-stores/resolve-bulk',{...bulkAddress,items},status)
 const recordNow=async()=>(await d.call(`/api/v1/apps/${bulkApp}/entities/${bulkEntity}/records/${bulkRow.id}`)).record
 const original=await recordNow(),historyBefore=(await d.call('/api/v1/history?'+new URLSearchParams(bulkRef))).items.length
 const unchanged=async()=>{assert.deepEqual(await recordNow(),original);assert.equal((await d.call('/api/v1/history?'+new URLSearchParams(bulkRef))).items.length,historyBefore,'Refused batches do not accept or audit any reference')}
 const beforeForeign=provider.seen.length
 await bulk([...selections,{provider:'onedrive',itemId:graph.itemId,observedDigest:graph.portable.digest}],403);await unchanged()
 assert.ok(provider.seen.slice(beforeForeign).every(path=>!path.includes('graph.microsoft.com')),'No foreign-account credential is used')
 await request(bulkActors.people.reader.cookie,'/api/v1/records/file-stores/resolve-bulk',{body:{...bulkAddress,items:selections},status:403});await unchanged()
 provider.changeDigest('google-drive',bulkItems[1].itemId)
 await bulk(selections,409);await unchanged();selections.splice(0,selections.length,...await review())
 await bulk([...selections,selections[0]],400);await unchanged()
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(bulkApp,h.operator).first(),rules=JSON.parse(policy.rules_json)
 for(const restriction of ['field','row']){
  const limited=rules.map(rule=>rule.entityId!==bulkEntity?rule:restriction==='field'?{...rule,writableFields:rule.writableFields.filter(id=>id!==bulkField)}:{...rule,rows:{kind:'condition',fieldId:bulkTable.fields[source.base.tables[0].primaryFieldId],op:'eq',value:'synthetic-cradle-no-match'}})
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(limited),policy.id).run()
  await bulk(selections,restriction==='field'?403:404)
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run();await unchanged()
 }
 // Fences remain live while the metadata network edge is answering.
 for(const fence of ['policy','connection','field']){
  let observed=false
  provider.observeMetadata(async()=>{if(observed)return;observed=true;if(fence==='policy')await h.db.prepare("UPDATE file_store_policies SET enabled=0,version=version+1 WHERE provider='google-drive'").run();else if(fence==='connection')await h.db.prepare('UPDATE provider_connections SET control_epoch=control_epoch+1 WHERE id=?').bind(connectionId).run();else await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules.map(rule=>rule.entityId===bulkEntity?{...rule,writableFields:rule.writableFields.filter(id=>id!==bulkField)}:rule)),policy.id).run()})
  try{await bulk(selections,fence==='connection'?409:403)}finally{provider.observeMetadata(null);await h.db.prepare("UPDATE file_store_policies SET enabled=1,version=version+1 WHERE provider='google-drive'").run();await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
  assert.equal(observed,true);await unchanged()
 }
 provider.changeMetadata('google-drive',bulkItems[0].itemId,{name:'synthetic-cradle-refreshed.png',size:'3072',modifiedTime:'2026-10-21T02:03:04.000Z'})
 const accepted=await bulk();assert.equal(accepted.state,'confirmed');const after=await recordNow()
 for(const [i,selection] of selections.entries()){const resolved=after.fields[bulkField].value[i].reference;assert.equal(resolved.resolution,'resolved');assert.equal(resolved.connectionId,connectionId);assert.equal(resolved.attachedBy,attacher);assert.deepEqual(resolved.portable.digest,selection.observedDigest);assert.equal(resolved.portable.attachedAt,captures[i].attachedAt)}
 assert.deepEqual(after.fields[bulkField].value.slice(2),original.fields[bulkField].value.slice(2),'Unselected references are unchanged')
 const facts=(await d.call('/api/v1/history?'+new URLSearchParams(bulkRef))).items.filter(entry=>entry.action==='attachment.reference.confirm-changed');assert.equal(facts.length,2);for(const item of bulkItems)assert.ok(facts.some(fact=>JSON.stringify(fact.changes).includes(item.itemId)),'Each accepted reference has its own attributed audit fact')
 const refreshed=after.fields[bulkField].value[0].reference;assert.equal(refreshed.portable.name,'synthetic-cradle-refreshed.png');assert.equal(refreshed.portable.size,3072);assert.equal(refreshed.portable.modified,'2026-10-21T02:03:04.000Z')
 const portableAgain=JSON.parse((await d.call('/api/v1/records/base-export',{appId:bulkApp,format:'json'})).content),portableValues=portableAgain.base.tables[0].records.find(r=>r.values[bulkField]?.some(member=>member.name===refreshed.name)).values[bulkField]
 assert.deepEqual(portableValues.slice(0,2),after.fields[bulkField].value.slice(0,2).map(member=>member.reference.portable));assert.ok(!JSON.stringify(portableAgain).includes('connectionId'))
 await bulk(selections,404);assert.deepEqual(await recordNow(),after,'A retained confirmation cannot replay an accepted reference')
 provider.changeMetadata('google-drive',bulkItems[0].itemId,{})
 // A null source digest resolves as unverified; no hash is invented for the capture.
 for(const table of source.base.tables)for(const row of table.records)for(const value of Object.values(row.values))if(Array.isArray(value))for(const item of value)if(item?.kind==='store'&&item.provider==='google-drive')item.digest=null
 const nullBytes=Buffer.from(JSON.stringify(source)),nullReturn=await d.adopt(nullBytes,'synthetic-cradle-null-digest.json'),nullApp=nullReturn.preview.identities.appId
 const nullEntity=(await d.call(`/api/v1/apps/${nullApp}/entities`)).items.find(e=>e.id===nullReturn.preview.identities.tables[source.base.tables[0].id].entityId),nullField=nullEntity.fields.find(f=>f.type==='attachment'),nullRow=(await d.call(`/api/v1/apps/${nullApp}/entities/${nullEntity.id}/query`,{})).items.find(r=>r.fields[nullField.id]?.value?.length)
 // Connect at the returning base, using the same public consent path.
 const configured=(await d.command('connection.configure',{appId:nullApp,adapterId:'google-drive',name:'synthetic-cradle-unverified-store',accountId:'ignored',scopes:[],ownership:[],credentialRef:null})).value.connectionId,consent=(await d.command('connection.begin-consent',{connectionId:configured,returnTo:'/app/records'})).value
 const callback=await d.raw('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:new URL(consent.authorizationUrl).searchParams.get('state')}));assert.equal(callback.status,303);await callback.arrayBuffer()
 const unverified=await d.call('/api/v1/records/file-stores/resolve',{appId:nullApp,entityId:nullEntity.id,recordId:nullRow.id,fieldId:nullField.id,provider:'google-drive',itemId:drive.itemId});assert.equal(unverified.state,'unverified')
 assert.deepEqual(provider.writes,[],'Metadata resolution and confirmation never write or share at the provider')
}

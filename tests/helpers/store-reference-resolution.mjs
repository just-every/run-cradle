import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {workbookDoors} from './workbook-http.mjs'
import {fileStoreActors} from './file-stores-actors.mjs'
export async function storeReferenceResolution(h,provider,snapshot){
 const source=structuredClone(snapshot),attacher=createUlid()
 for(const table of source.base.tables)for(const row of table.records)for(const value of Object.values(row.values))if(Array.isArray(value))for(const item of value)if(item?.kind==='store')item.attachedBy=attacher
 const d=await workbookDoors(h),bytes=Buffer.from(JSON.stringify(source)),returned=await d.adopt(bytes,'synthetic-cradle-resolve.json'),appId=returned.preview.identities.appId,entities=(await d.call(`/api/v1/apps/${appId}/entities`)).items,entity=entities.find(e=>e.fields.some(f=>f.type==='attachment')),field=entity.fields.find(f=>f.type==='attachment'),rows=(await d.call(`/api/v1/apps/${appId}/entities/${entity.id}/query`,{})).items,row=rows.find(r=>r.fields[field.id]?.value?.length),ref={appId,entityId:entity.id,recordId:row.id},address={...ref,fieldId:field.id}
 const members=row.fields[field.id].value,drive=members.find(m=>m.reference.provider==='google-drive').reference,graph=members.find(m=>m.reference.provider==='onedrive').reference
 const {people,command,request}=await fileStoreActors(h,appId)
 async function connect(adapterId,cookie=h.cookie){const value=(await command(cookie,'connection.configure',{appId,adapterId,name:'synthetic-cradle-return-'+adapterId,accountId:'ignored-source-account',scopes:[],ownership:[],credentialRef:null})).value,id=value.connectionId,consent=(await command(cookie,'connection.begin-consent',{connectionId:id,returnTo:'/app/records'})).value,family={'google-drive':'google',onedrive:'microsoft',dropbox:'dropbox',box:'box'}[adapterId];await request(cookie,'/oauth/'+family+'/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{status:303});return id}
 const call=(reference,extra={})=>d.call('/api/v1/records/file-stores/resolve',{...address,itemId:reference.itemId,...extra})
 await connect('google-drive',people.editor.cookie)
 const before=provider.seen.length,unavailable=await call(drive);assert.equal(unavailable.state,'unresolved');assert.equal(provider.seen.length,before,"Another person's matching connection is never used")
 await request(people.reader.cookie,'/api/v1/records/file-stores/resolve',{body:{...address,itemId:drive.itemId},status:403})
 // The generic record writer cannot bind an imported reference, including by its original attacher.
 await d.call('/api/v1/commands/record.patch',{commandId:createUlid(),expected:[{ref,version:row.version}],input:{ref,changes:{[field.id]:members.map(m=>m.reference.itemId===drive.itemId?{reference:{...m.reference,connectionId:createUlid(),resolution:'resolved'}}:m)}}},403)
 await connect('google-drive');await connect('onedrive')
 const graphResult=await call(graph);assert.equal(graphResult.state,'resolved');assert.equal(graphResult.record.fields[field.id].value.find(m=>m.reference.itemId===graph.itemId).reference.attachedBy,attacher)
 provider.changeDigest('google-drive',drive.itemId)
 const changed=await call(drive);assert.equal(changed.state,'changed');assert.ok(changed.item.digest)
 let current=(await d.call(`/api/v1/apps/${appId}/entities/${entity.id}/records/${row.id}`)).record;assert.equal(current.fields[field.id].value.find(m=>m.reference.itemId===drive.itemId).reference.resolution,'unresolved')
 await call(drive,{confirmChanged:true,observedDigest:changed.item.digest});current=(await d.call(`/api/v1/apps/${appId}/entities/${entity.id}/records/${row.id}`)).record
 const resolved=current.fields[field.id].value.find(m=>m.reference.itemId===drive.itemId).reference;assert.equal(resolved.resolution,'resolved');assert.equal(resolved.attachedBy,attacher);assert.deepEqual(resolved.portable.digest,changed.item.digest)
 const history=(await d.call('/api/v1/history?'+new URLSearchParams(ref))).items;assert.ok(history.some(entry=>entry.action==='attachment.reference.confirm-changed'),'Explicit changed-content acceptance is audited')
 const reexport=JSON.parse((await d.call('/api/v1/records/base-export',{appId,format:'json'})).content);assert.ok(!JSON.stringify(reexport).includes('connectionId'));assert.ok(reexport.base.tables.flatMap(t=>t.records).some(r=>Object.values(r.values).some(v=>Array.isArray(v)&&v.some(m=>m?.kind==='store'&&m.itemId===drive.itemId&&m.digest?.value===changed.item.digest.value))))
 // A null source digest resolves as unverified; no hash is invented for the capture.
 for(const table of source.base.tables)for(const row of table.records)for(const value of Object.values(row.values))if(Array.isArray(value))for(const item of value)if(item?.kind==='store'&&item.provider==='google-drive')item.digest=null
 const nullBytes=Buffer.from(JSON.stringify(source)),nullReturn=await d.adopt(nullBytes,'synthetic-cradle-null-digest.json'),nullApp=nullReturn.preview.identities.appId
 const nullEntity=(await d.call(`/api/v1/apps/${nullApp}/entities`)).items.find(e=>e.fields.some(f=>f.type==='attachment')),nullField=nullEntity.fields.find(f=>f.type==='attachment'),nullRow=(await d.call(`/api/v1/apps/${nullApp}/entities/${nullEntity.id}/query`,{})).items.find(r=>r.fields[nullField.id]?.value?.length)
 // Connect at the returning base, using the same public consent path.
 const configured=(await d.command('connection.configure',{appId:nullApp,adapterId:'google-drive',name:'synthetic-cradle-unverified-store',accountId:'ignored',scopes:[],ownership:[],credentialRef:null})).value.connectionId,consent=(await d.command('connection.begin-consent',{connectionId:configured,returnTo:'/app/records'})).value
 const callback=await d.raw('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:new URL(consent.authorizationUrl).searchParams.get('state')}));assert.equal(callback.status,303);await callback.arrayBuffer()
 const unverified=await d.call('/api/v1/records/file-stores/resolve',{appId:nullApp,entityId:nullEntity.id,recordId:nullRow.id,fieldId:nullField.id,itemId:drive.itemId});assert.equal(unverified.state,'unverified')
 assert.deepEqual(provider.writes,[],'Metadata resolution and confirmation never write or share at the provider')
}

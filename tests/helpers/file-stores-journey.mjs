import {storeReferenceResolution} from './store-reference-resolution.mjs'
import {assertNoStoreCredentials} from './store-reference-exits.mjs'
import {csvDownloadEntries} from './base-csv-download.mjs'
import {readWorkbook} from '../../src/domains/records/workbooks/read.ts'
import {personalStoresJourney} from './file-stores-personal.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {storeScopes} from './file-stores-provider.mjs'
const stores=[['google-drive','google','Google Drive'],['onedrive','microsoft','OneDrive'],['dropbox','dropbox','Dropbox'],['box','box','Box']]
const bindings={GOOGLE_CLIENT_ID:'synthetic-cradle-client-1',GOOGLE_CLIENT_SECRET:'synthetic-cradle-client-secret-1',MICROSOFT_CLIENT_ID:'synthetic-cradle-client-2',MICROSOFT_CLIENT_SECRET:'synthetic-cradle-client-secret-2',DROPBOX_CLIENT_ID:'synthetic-cradle-client-3',DROPBOX_CLIENT_SECRET:'synthetic-cradle-client-secret-3',BOX_CLIENT_ID:'synthetic-cradle-client-4',BOX_CLIENT_SECRET:'synthetic-cradle-client-secret-4',CONNECTION_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}
export const fileStoreBindings=bindings
/** Each store: connect, list, search, attach, read back, thumbnail, with no bytes kept and no provider write. */
export async function fileStoresJourney(h,provider,existingFields){
 const fieldId=createUlid(),relationless=[...existingFields,{id:fieldId,label:'Files',type:'attachment',required:false,unique:false}]
 const preview=(await h.request('/api/v1/records/schema-preview',{method:'POST',body:{appId:h.appId,name:'Automation acceptance',tables:[{id:h.entityId,label:'Items',primaryFieldId:h.nameId,fields:relationless}]}})).data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 const entity=(await h.request(`/api/v1/apps/${h.appId}/entities`)).data.items.find(e=>e.id===h.entityId)
 const created=(await h.request('/api/v1/commands/record.create',{method:'POST',body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:entity.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'Store references'}}}})).data.value
 const record=async()=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.ref.recordId}`)).data.record
 const address={appId:h.appId,entityId:h.entityId,fieldId},bucket=await h.runtime.getR2Bucket('FILES')
 let current=created,members=[],connections={}
 for(const [adapterId,family,label] of stores){
  const configured=(await h.request('/api/v1/commands/connection.configure',{method:'POST',body:{commandId:createUlid(),expected:[],input:{appId:h.appId,adapterId,name:'Synthetic Cradle '+label,accountId:'me',scopes:[],ownership:[],credentialRef:null}}})).data.value.connectionId
  const consent=(await h.request('/api/v1/commands/connection.begin-consent',{method:'POST',body:{commandId:createUlid(),expected:[],input:{connectionId:configured,returnTo:'/app/records'}}})).data.value,url=new URL(consent.authorizationUrl)
  assert.deepEqual(url.searchParams.get('scope').split(' '),storeScopes[adapterId],label+' asks only for its narrowest read scope')
  await h.request('/oauth/'+family+'/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:url.searchParams.get('state')}),{status:303})
  connections[adapterId]=configured
  const listed=(await h.request('/api/v1/records/file-stores/connections?appId='+h.appId)).data.connections.find(c=>c.id===configured);assert.equal(listed.state,'connected',label)
  const browse=(await h.request('/api/v1/records/file-stores/browse',{method:'POST',body:{...address,connectionId:configured}})).data
  assert.equal(browse.provider,adapterId);assert.equal(browse.items.length,3,label+' lists files, not folders')
  const found=(await h.request('/api/v1/records/file-stores/browse',{method:'POST',body:{...address,connectionId:configured,query:'budget'}})).data;assert.deepEqual(found.items.map(i=>i.name),['synthetic-cradle-budget.xlsx'],label+' searches by name')
  const picked=browse.items.find(i=>i.name==='synthetic-cradle-plan.png')
  const reference={provider:adapterId,itemId:picked.itemId,name:picked.name,mediaType:picked.mediaType,size:picked.size,modifiedAt:picked.modifiedAt,link:picked.link,connectionId:configured,attachedBy:browse.attachedBy,account:browse.account,digest:picked.digest,attachedAt:browse.attachedAt}
  members=[...members,{reference}]
  current=(await h.patch(current,{[fieldId]:members})).data.value
  const stored=(await record()).fields[fieldId].value;assert.equal(stored.length,members.length);assert.deepEqual(stored.at(-1).reference,reference,label+' reference reads back as picked')
  const thumb=await fetch(h.origin+'/api/v1/records/file-stores/thumbnail?'+new URLSearchParams({...address,recordId:created.ref.recordId,itemId:picked.itemId}),{headers:{cookie:h.cookie}})
  assert.equal(thumb.status,200,label);assert.equal(thumb.headers.get('content-type'),adapterId==='dropbox'?'image/jpeg':'image/png');assert.deepEqual(Buffer.from(await thumb.arrayBuffer()),provider.png,label+' thumbnail comes from the store on demand')
  assert.equal((await h.db.prepare('SELECT count(*) n FROM file_store_requests').first()).n,0,'No request or thumbnail is kept')
 }
 assert.equal((await bucket.list()).objects.length,0,'No file bytes were stored');assert.equal((await h.db.prepare('SELECT count(*) n FROM evidence_files').first()).n,0)
 assert.deepEqual(provider.writes,[],'No provider write or sharing call was made')
 // A CSV of the view carries each reference as provider, id, name, type and link: no bytes, connection or person.
 const view=(await h.request('/api/v1/commands/view.save',{method:'POST',body:{commandId:createUlid(),expected:[],input:{view:{appId:h.appId,entityId:h.entityId,name:'Store files',display:'grid',fields:[h.nameId,fieldId],filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:h.nameId},visibility:'app',shipped:false}}}})).data.value
 const exported=(await h.request('/api/v1/records/export-csv',{method:'POST',body:{appId:h.appId,entityId:h.entityId,viewId:view.id,query:{}}})).data.csv
 for(const member of members)assert.ok(exported.includes(member.reference.itemId)&&exported.includes(member.reference.name),'The CSV names each reference')
 assert.ok(!exported.includes(members[0].reference.connectionId)&&!exported.includes(members[0].reference.attachedBy),'The CSV carries no connection or person')
 // All base exits project public metadata and exclude connection custody and transient previews.
 let storeSnapshot;for(const format of ['json','csv-set','xlsx']){const exported=(await h.request('/api/v1/records/base-export',{method:'POST',body:{appId:h.appId,format}})).data;const forbidden=Object.values(connections);if(format==='json'){assertNoStoreCredentials(exported.content,forbidden);storeSnapshot=JSON.parse(exported.content)}else if(format==='csv-set')for(const entry of csvDownloadEntries(Buffer.from(exported.content,'base64')))assertNoStoreCredentials(entry.bytes.toString('utf8'),forbidden);else for(const sheet of readWorkbook(Buffer.from(exported.content,'base64'),'synthetic-cradle-exit.xlsx'))for(const row of sheet.rows)for(const cell of row)assertNoStoreCredentials(cell.value,forbidden)}
 await storeReferenceResolution(h,provider,storeSnapshot)
 // A forged reference is refused: another person, an unlinked connection, or a link outside the store.
 const base=members[0].reference
 for(const [forged,status] of [[{...base,attachedBy:createUlid()},403],[{...base,itemId:'synthetic-cradle-forged',connectionId:createUlid()},403],[{...base,itemId:'synthetic-cradle-link',link:'https://evil.example/x'},400],[{...base,itemId:'synthetic-cradle-key',extra:true},400]])await h.patch(current,{[fieldId]:[...members,{reference:forged}]},undefined,createUlid(),status)
 assert.equal((await record()).fields[fieldId].value.length,members.length,'Forged references change nothing')
 await personalStoresJourney(h,provider,fieldId)
 // The person loses connection authority: browsing and previews are refused, the attachment keeps name and type.
 const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(h.operator,h.appId).first(),rules=JSON.parse(policy.rules_json)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules.map(r=>r.entityId===h.entityId?{...r,writableFields:r.writableFields.filter(id=>id!==fieldId)}:r)),policy.id).run()
 await h.request('/api/v1/records/file-stores/browse',{method:'POST',body:{...address,connectionId:connections['google-drive']},status:403})
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()
 // A revoked connection leaves the reference showing name and type with a reconnect state, never an error page.
 await h.request('/api/v1/commands/connection.revoke',{method:'POST',body:{commandId:createUlid(),expected:[],input:{connectionId:connections['google-drive']}}})
 const gone=await fetch(h.origin+'/api/v1/records/file-stores/thumbnail?'+new URLSearchParams({...address,recordId:created.ref.recordId,itemId:members[0].reference.itemId}),{headers:{cookie:h.cookie}})
 assert.equal(gone.status,404);assert.deepEqual(await gone.json(),{state:'reconnect'})
 assert.equal((await record()).fields[fieldId].value[0].reference.name,'synthetic-cradle-plan.png')
}

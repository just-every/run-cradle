import {importStoreSnapshot,portableStoreFixture} from './store-reference-exits.mjs'
import {fileStoreActors} from './file-stores-actors.mjs'
import {browserCookies} from './session-cookies.mjs'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {workbookDoors} from './workbook-http.mjs'
import {recordsJourney} from './records-browser-journey.mjs'
/** The attachment cell and its chooser at one width: connect, choose, attach, save, and read the reference back. */
export async function fileStoresBrowser(page,h,width,output){
 const j=recordsJourney(page,h.origin,output,width),d=await workbookDoors(h),appId=createUlid(),entityId=createUlid(),nameId=createUlid(),filesId=createUlid()
 const preview=await d.call('/api/v1/records/schema-preview',{appId,name:`Store files ${width}`,tables:[{id:entityId,label:'Files',primaryFieldId:nameId,fields:[{id:nameId,label:'Name',type:'text',required:true,unique:false},{id:filesId,label:'Attachments',type:'attachment',required:false,unique:false}]}]})
 await d.command('release.adopt',{kind:'manual_schema',previewId:preview.id})
 const entity=(await d.call(`/api/v1/apps/${appId}/entities`)).items.find(e=>e.id===entityId)
 await d.command('record.create',{appId,entityId,values:{[nameId]:'synthetic-cradle-site'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:entity.version}])
 const {people}=await fileStoreActors(h,appId)
 await page.context().addCookies(browserCookies(people.editor.cookie,h.origin))
 const edge='https://accounts.google.com/**'
 await page.route(edge,async route=>{const consent=new URL(route.request().url());await route.fulfill({status:302,headers:{location:h.origin+'/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-2',state:consent.searchParams.get('state')})}})})
 try{
 await page.goto(`${h.origin}/app/records/${appId}`);await j.table('Files')
 await j.action(page.getByRole('link',{name:'synthetic-cradle-site',exact:true}).first());await j.action(page.getByRole('button',{name:'Edit record',exact:true}))
 await j.capture('file-store-cell-empty')
 await j.action(page.getByRole('button',{name:'Choose from a file store',exact:true}))
 const returned=page.waitForResponse(response=>response.url().includes('/oauth/google/callback')&&response.status()===303)
 await j.action(page.getByRole('button',{name:'Connect Google Drive',exact:true}));await returned
 await page.waitForURL(url=>url.origin===h.origin&&url.pathname.startsWith('/app/records'),{timeout:15000})
 await page.goto(`${h.origin}/app/records/${appId}`);await j.table('Files')
 await j.action(page.getByRole('link',{name:'synthetic-cradle-site',exact:true}).first());await j.action(page.getByRole('button',{name:'Edit record',exact:true}))
 await j.action(page.getByRole('button',{name:'Choose from a file store',exact:true}))
 assert.equal(await page.getByRole('checkbox',{name:'Share previews of files I attach with people who can read this field',exact:true}).isChecked(),false,'Preview sharing starts off and is offered at attach time')
 await j.action(page.getByRole('button',{name:'Show files',exact:true}))
 await page.getByRole('button',{name:'Attach synthetic-cradle-plan.png',exact:true}).waitFor({timeout:8000}).catch(async e=>{throw new Error('Chooser state: '+await page.locator('.cr-store-chooser').innerText()+' | '+e.message)})
 await j.capture('file-store-chooser')
 await j.action(page.getByRole('button',{name:'Attach synthetic-cradle-plan.png',exact:true}))
 await j.command(page.getByRole('button',{name:'Save record',exact:true}),'record.patch')
 await page.getByRole('link',{name:/synthetic-cradle-plan\.png/}).waitFor()
 const thumb=page.locator('.cr-store-thumb');await thumb.waitFor();assert.equal(await thumb.evaluate(image=>image.complete&&image.naturalWidth>0),true,'The thumbnail loaded from the store on demand')
 assert.match(await page.locator('.cr-store-reference').innerText(),/Image · Google Drive/)
 await j.capture('file-store-cell-attached')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM evidence_files').first()).n,0,'Nothing was copied into private file custody')
 }finally{await page.unroute(edge);await page.context().addCookies(browserCookies(h.cookie,h.origin))}
 // The installation owner's provider controls are on this same attachment surface.
 await page.goto(`${h.origin}/app/records/${appId}`);await j.table('Files')
 await j.action(page.getByRole('link',{name:'synthetic-cradle-site',exact:true}).first());await j.action(page.getByRole('button',{name:'Edit record',exact:true}))
 await j.action(page.getByRole('button',{name:'Choose from a file store',exact:true}))
 await j.action(page.getByText('File store policy',{exact:true}))
 await page.getByRole('combobox',{name:/^Who may connect Google Drive/}).waitFor()
 await j.capture('file-store-owner-policy')
 // Saving a provider policy inside the open record editor stores it; writers is restored for the next width.
 for(const role of ['installation-owner','writers']){
  await page.getByRole('combobox',{name:/^Who may connect Google Drive/}).selectOption(role)
  const saved=page.waitForResponse(r=>r.url().endsWith('/file-stores/settings')&&r.request().method()==='POST')
  await j.action(page.getByRole('button',{name:'Save Google Drive policy',exact:true}));assert.equal((await saved).status(),200)
  assert.equal((await h.db.prepare("SELECT connect_role FROM file_store_policies WHERE provider='google-drive'").first()).connect_role,role)
 }
}


export async function unresolvedStoresBrowser(page,h,width,output){
 const j=recordsJourney(page,h.origin,output,width),fixture=portableStoreFixture(),{preview,job}=await importStoreSnapshot(h,fixture.snapshot)
 let thumbnails=0;const observe=request=>{if(request.url().includes('/file-stores/thumbnail'))thumbnails++};page.on('request',observe)
 try{await page.goto(`${h.origin}/app/records/${preview.identities.appId}`);await j.table('Files');await j.action(page.getByRole('link',{name:'synthetic-cradle-returned-files',exact:true}).first());await page.locator('.cr-store-reference').first().waitFor();assert.equal(await page.locator('.cr-store-reference .cr-badge').count(),5);assert.equal(await page.locator('.cr-store-thumb').count(),0);for(const reference of fixture.refs){const cell=page.locator('.cr-store-reference').filter({hasText:reference.name});assert.ok((await cell.innerText()).includes('2,048'));assert.equal(await cell.getByRole('link').getAttribute('href'),reference.link)}await j.capture('file-store-return-unresolved');assert.equal(thumbnails,0);await page.goto(`${h.origin}/app/records/?import=base&job=${job.id}&receipt=1`);await page.getByRole('heading',{name:'Unresolved store references',exact:true}).waitFor();await j.capture('file-store-return-receipt')}finally{page.off('request',observe)}
}

export async function resolvedStoresBrowser(page,h,width,output){
 const j=recordsJourney(page,h.origin,output,width),d=await workbookDoors(h),fixture=portableStoreFixture(),seed=await importStoreSnapshot(h,fixture.snapshot)
 async function connect(appId,provider){const id=(await d.command('connection.configure',{appId,adapterId:provider,name:'synthetic-cradle-browser-return-'+provider,accountId:'ignored-caller-account',scopes:[],ownership:[],credentialRef:null})).value.connectionId,consent=(await d.command('connection.begin-consent',{connectionId:id,returnTo:'/app/records'})).value,family=provider==='onedrive'?'microsoft':'google',response=await d.raw('/oauth/'+family+'/callback?'+new URLSearchParams({code:'synthetic-cradle-code-2',state:new URL(consent.authorizationUrl).searchParams.get('state')}));assert.equal(response.status,303);await response.arrayBuffer();return id}
 const seedId=seed.preview.identities.appId,seedEntity=seed.preview.identities.tables[fixture.entityId].entityId,seedField=seed.preview.identities.tables[fixture.entityId].fields[fixture.filesId],driveId=await connect(seedId,'google-drive'),graphId=await connect(seedId,'onedrive'),address={appId:seedId,entityId:seedEntity,fieldId:seedField},drive=await d.call('/api/v1/records/file-stores/browse',{...address,connectionId:driveId}),graph=await d.call('/api/v1/records/file-stores/browse',{...address,connectionId:graphId})
 const changedItem=drive.items[width===390?1:0],unverifiedItem=drive.items[2],graphItem=graph.items[2],portable=(item,provider,account,digest=item.digest)=>({kind:'store',schema:1,provider,account,itemId:item.itemId,name:item.name,type:item.mediaType,size:item.size,modified:item.modifiedAt,digest,link:item.link,attachedBy:fixture.refs[0].attachedBy,attachedAt:'2026-10-20T01:02:03.000Z'})
 fixture.snapshot.base.tables[0].records[0].values[fixture.filesId]=[portable(graphItem,'onedrive',graph.account),portable(changedItem,'google-drive',drive.account),portable(unverifiedItem,'google-drive',drive.account,null)]
 const returned=await importStoreSnapshot(h,fixture.snapshot),appId=returned.preview.identities.appId;await connect(appId,'onedrive');await connect(appId,'google-drive')
 await page.goto(`${h.origin}/app/records/${appId}`);await j.table('Files');await j.action(page.getByRole('link',{name:'synthetic-cradle-returned-files',exact:true}).first())
 async function check(item,provider,expected){const cell=page.locator('.cr-store-reference').filter({hasText:item.name}).filter({hasText:provider}),response=page.waitForResponse(r=>r.url().endsWith('/file-stores/resolve')&&r.request().method()==='POST');await j.action(cell.getByRole('button',{name:'Check my store',exact:true}));const answer=await response;assert.equal(answer.status(),200,await answer.text());assert.equal((await answer.json()).data.state,expected);return cell}
 let graphCell=await check(graphItem,'OneDrive','resolved');await graphCell.getByText('Unresolved',{exact:true}).waitFor({state:'detached'});await j.capture('file-store-return-resolved')
 const unverified=await check(unverifiedItem,'Google Drive','unverified');await unverified.getByText('Unverified',{exact:true}).waitFor();await j.capture('file-store-return-unverified')
 h.fileStoresProvider.changeDigest('google-drive',changedItem.itemId)
 const changed=await check(changedItem,'Google Drive','changed');await changed.getByRole('button',{name:'Confirm changed file '+changedItem.name,exact:true}).waitFor();assert.equal(await changed.locator('.cr-store-thumb').count(),0);await j.capture('file-store-return-changed-review')
 const confirmed=page.waitForResponse(r=>r.url().endsWith('/file-stores/resolve')&&r.request().method()==='POST');await j.action(changed.getByRole('button',{name:'Confirm changed file '+changedItem.name,exact:true}));const result=await confirmed;assert.equal(result.status(),200,await result.text());assert.equal((await result.json()).data.state,'resolved');await changed.getByText('Unresolved',{exact:true}).waitFor({state:'detached'});await j.capture('file-store-return-changed-confirmed')
 assert.deepEqual(h.fileStoresProvider.writes,[])
}

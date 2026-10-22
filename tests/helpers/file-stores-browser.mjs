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
 const connectionId=(await d.command('connection.configure',{appId,adapterId:'google-drive',name:'Synthetic Cradle Drive',accountId:'me',scopes:[],ownership:[],credentialRef:null})).value.connectionId
 const consent=(await d.command('connection.begin-consent',{connectionId,returnTo:'/app/records'})).value,callback=await d.raw('/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-2',state:new URL(consent.authorizationUrl).searchParams.get('state')}));assert.equal(callback.status,303)
 await page.goto(`${h.origin}/app/records/${appId}`);await j.table('Files')
 await j.action(page.getByRole('link',{name:'synthetic-cradle-site',exact:true}).first());await j.action(page.getByRole('button',{name:'Edit record',exact:true}))
 await j.capture('file-store-cell-empty')
 await j.action(page.getByRole('button',{name:'Choose from a file store',exact:true}))
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
}

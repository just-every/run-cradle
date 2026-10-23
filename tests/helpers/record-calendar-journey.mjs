import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import {userInfo} from 'node:os'
import {chromium} from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
import {recordsBrowserRuntime} from './records-browser-runtime.mjs'
import {recordCalendarProvider} from './record-calendar-provider.mjs'
import {browserCall,liveCommand} from './records-live-fixture.mjs'

export async function recordCalendarJourney({widths=[1440,390],output='.private/record-calendar-sync'}={}){
 process.env.HOME=userInfo().homedir
 await mkdir(output,{recursive:true})
 const provider=recordCalendarProvider(),h=await recordsBrowserRuntime(0,{networkEdge:request=>provider.fetch(request),bindings:{GOOGLE_CLIENT_ID:'synthetic-cradle-client',GOOGLE_CLIENT_SECRET:'synthetic-cradle-secret',CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),CONNECTION_ENCRYPTION_KEY_VERSION:'v1'}})
 const worker=await h.runtime.getWorker(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{for(const width of widths){const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage()
  try{await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(h.origin+'/app/records')
   const call=(path,input,status=200)=>browserCall(page,path,input,status),command=(action,input,expected=[])=>call('/api/v1/commands/'+action,liveCommand(input,expected))
   const title=newField('Calendar title'),notes=newField('Calendar details'),start=newField('Calendar date','date'),end=newField('Calendar end','date'),appId=createUlid(),entityId=createUlid()
   const preview=await call('/api/v1/records/schema-preview',{appId,name:`synthetic-cradle-calendar-${width}`,tables:[{id:entityId,label:'Calendar records',primaryFieldId:title.id,fields:[title,notes,start,end]}]})
   await command('release.adopt',{kind:'manual_schema',previewId:preview.id})
   const schema=await call(`/api/v1/apps/${appId}/entities/${entityId}`),create=async(name='synthetic-cradle-event')=>(await command('record.create',{appId,entityId,values:{[title.id]:name,[notes.id]:'synthetic-cradle-private-details',[start.id]:'2026-11-02',[end.id]:'2026-11-03'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}])).value
   const row=await create(),recordId=row.ref.recordId,recordPath=`/app/records/${appId}/${entityId}/${recordId}`,base=`/api/v1/apps/${appId}/entities/${entityId}`
   const connectionId=(await command('connection.configure',{appId,adapterId:'google-calendar',name:'synthetic-cradle-calendar-connection',accountId:provider.ownedCalendarId,scopes:[{resource:provider.ownedCalendarId,readFields:[],actions:['connection.sync']}],ownership:[],credentialRef:null})).value.connectionId
   const consent=(await command('connection.begin-consent',{connectionId,returnTo:recordPath})).value
   const response=await context.request.get(h.origin+'/oauth/google/callback?'+new URLSearchParams({code:'synthetic-cradle-code-1',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{maxRedirects:0});assert.equal(response.status(),303,await response.text())
   const deliver=async body=>{const result=await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body}]);assert.equal(result.outcome,'ok',JSON.stringify(result))}
   const drain=async()=>{const entries=(await h.db.prepare("SELECT id FROM admission_outbox WHERE state='pending' AND action IN ('connection.operation','execution.dispatch','execution.reconcile') AND not_before<=? ORDER BY created_at,id").bind(new Date().toISOString()).all()).results;for(const entry of entries)await deliver({kind:'cradle.outbox.v1',outboxId:entry.id})}
   const open=async()=>{await page.goto(h.origin+recordPath);await page.getByRole('button',{name:'Google Calendar sync',exact:true}).click();await page.getByRole('heading',{name:'Record calendar sync',exact:true}).waitFor()}
   const initial=await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`);assert.equal(initial.canConfigure,true,JSON.stringify(initial));
   await open();await page.getByLabel('Calendar connection',{exact:true}).selectOption(connectionId)
   const refresh=page.waitForResponse(r=>r.url().endsWith(`/connections/${connectionId}/refresh`)&&r.request().method()==='POST');await page.getByRole('button',{name:'Refresh owned calendars and reviews',exact:true}).click();assert.equal((await refresh).status(),200);await drain()
   await page.getByRole('button',{name:'Google Calendar sync',exact:true}).click();await page.getByRole('button',{name:'Google Calendar sync',exact:true}).click();await page.getByLabel('Owned calendar',{exact:true}).selectOption(provider.ownedCalendarId)
   await page.getByLabel('Sync date field',{exact:true}).selectOption(start.id);await page.getByLabel('Sync end date field',{exact:true}).selectOption(end.id);await page.getByLabel('Event title field',{exact:true}).selectOption(title.id)
   await page.getByRole('group',{name:'Further fields visible on the calendar',exact:true}).getByLabel('Calendar details',{exact:true}).check();await page.getByLabel('Approve calendar writes to '+provider.ownedCalendarId,{exact:true}).check()
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/record-calendar-sync'&&r.request().method()==='POST');await page.getByRole('button',{name:'Save calendar sync',exact:true}).click();const saveResponse=await saved;assert.equal(saveResponse.status(),200,await saveResponse.text())
   const definitionId=(await saveResponse.json()).data.value.id,syncPath=`/api/v1/record-calendar-sync/${definitionId}/records/${recordId}`,get=async()=>(await call(base+'/records/'+recordId)).record,patch=async changes=>{const current=await get();return command('record.patch',{appId,entityId,rows:[{recordId,changes}]},[{ref:current.ref,version:current.version}])}
   const items=async()=>(await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId).items
   const binding=()=>h.db.prepare('SELECT * FROM record_calendar_events WHERE definition_id=? AND record_id=?').bind(definitionId,recordId).first()
   await page.locator('[aria-label="Calendar sync definition"]').waitFor();await page.screenshot({path:`${output}/configured-${width}.png`,fullPage:true})
   provider.loseAckOnce('create');await call(syncPath+'/sync',{commandId:createUlid()});await drain()
   let event=await binding();assert.equal((await h.db.prepare('SELECT state FROM execution_attempts WHERE id=?').bind(event.attempt_id).first()).state,'unknown')
   const creates=provider.writes.filter(w=>w.body?.extendedProperties?.private.cradleRecord===recordId&&w.method==='POST');assert.equal(creates.length,1)
   await call(syncPath+'/reconcile',{});event=await binding();assert.equal(event.state,'synced');assert.equal(provider.writes.filter(w=>w.body?.extendedProperties?.private.cradleRecord===recordId&&w.method==='POST').length,1)
   assert.ok(provider.events.get(provider.key(provider.ownedCalendarId,event.event_id)).description.includes(recordPath))
   const move=await patch({[start.id]:'2026-11-05',[end.id]:'2026-11-06'});await deliver({kind:'cradle.records.automations.v1',commandId:move.commandId});await drain()
   event=await binding();assert.equal(provider.events.get(provider.key(provider.ownedCalendarId,event.event_id)).start.date,'2026-11-05')
   const original=await get();provider.externalEdit(provider.ownedCalendarId,event.event_id,{summary:'synthetic-cradle-external-title',start:{date:'2026-11-10'},end:{date:'2026-11-12'}})
   await call(`/api/v1/record-calendar-sync/connections/${connectionId}/refresh`,{commandId:createUlid()});await drain();assert.ok((await items())[0].review);assert.equal((await get()).version,original.version)
   await call(syncPath+'/sync',{commandId:createUlid()},409)
   await open();await page.getByRole('heading',{name:'Calendar change needs review',exact:true}).waitFor();await page.screenshot({path:`${output}/review-${width}.png`,fullPage:true})
   const applied=page.waitForResponse(r=>r.url().endsWith('/resolve')&&r.request().method()==='POST');await page.getByRole('button',{name:'Apply to record',exact:true}).click();const appliedResponse=await applied;assert.equal(appliedResponse.status(),200,await appliedResponse.text());assert.equal((await get()).fields[start.id].value,'2026-11-10')
   provider.externalEdit(provider.ownedCalendarId,event.event_id,{summary:'synthetic-cradle-second-calendar-edit',start:{date:'2026-11-15'},end:{date:'2026-11-16'}});await call(`/api/v1/record-calendar-sync/connections/${connectionId}/refresh`,{commandId:createUlid()});await drain()
   const beforeRestore=provider.writes.length;await call(syncPath+'/resolve',{commandId:createUlid(),action:'restore'});await drain();assert.equal(provider.writes.length,beforeRestore+1);assert.equal(provider.writes.at(-1).method,'PUT');assert.equal(provider.writes.at(-1).body.start.date,'2026-11-10')
   await open();await page.locator('[aria-label="Calendar sync definition"]').waitFor();await page.screenshot({path:`${output}/resolved-${width}.png`,fullPage:true})
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   assert.deepEqual((await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[])
   // Current field visibility is re-projected, rather than retained in the next event.
   const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind('00000000000000000000000981',appId).first(),rules=JSON.parse(policy.rules_json)
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules.map(r=>r.entityId===entityId?{...r,readableFields:r.readableFields.filter(f=>f!==notes.id),writableFields:r.writableFields.filter(f=>f!==notes.id)}:r)),policy.id).run()
   await patch({[start.id]:'2026-11-20',[end.id]:'2026-11-21'});await call(syncPath+'/sync',{commandId:createUlid()});await drain();assert.ok(!provider.writes.at(-1).body.description.includes('synthetic-cradle-private-details'))
   const scopes=(await h.db.prepare('SELECT scopes_json FROM provider_connections WHERE id=?').bind(connectionId).first()).scopes_json
   await h.db.prepare("UPDATE provider_connections SET scopes_json='[]',version=version+1 WHERE id=?").bind(connectionId).run();const writeCount=provider.writes.length
   await patch({[start.id]:'2026-11-22',[end.id]:'2026-11-23'});await call(syncPath+'/sync',{commandId:createUlid()},403);assert.equal(provider.writes.length,writeCount)
   assert.equal((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions[0].state,'stopped')
   await h.db.prepare('UPDATE provider_connections SET scopes_json=?,version=version+1 WHERE id=?').bind(scopes,connectionId).run()
   await patch({[start.id]:null,[end.id]:null});await call(syncPath+'/sync',{commandId:createUlid()});await drain();assert.equal(provider.writes.at(-1).method,'DELETE');assert.equal((await binding()).state,'cancelled')
   await patch({[start.id]:'2026-11-25',[end.id]:'2026-11-26'});await call(syncPath+'/sync',{commandId:createUlid()});await drain();assert.equal(provider.writes.at(-1).method,'POST');assert.notEqual((await binding()).event_id,event.event_id)
   await command('connection.revoke',{connectionId});assert.equal((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions[0].state,'stopped');await patch({[start.id]:'2026-11-27',[end.id]:'2026-11-28'});await call(syncPath+'/sync',{commandId:createUlid()},403)
   assert.ok(provider.seen.every(r=>new URL(r.url).hostname==='www.googleapis.com'||new URL(r.url).hostname==='oauth2.googleapis.com'))
  }catch(error){await page.screenshot({path:`${output}/failure-${width}.png`,fullPage:true});console.error('Calendar screen at failure:',await page.locator('body').innerText());throw error}finally{await context.close()}
 }}finally{await browser.close();await h.close()}
 return {providerWrites:provider.writes.length}
}

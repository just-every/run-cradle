import {recordCalendarProof} from './record-calendar-proof.mjs'
import {recordCalendarTrash} from './record-calendar-trash.mjs'
import {recordCalendarUpgrade} from './record-calendar-upgrade.mjs'
import {recordCalendarAuthor} from './record-calendar-author.mjs'
import {recordCalendarBulk} from './record-calendar-bulk.mjs'
import {recordCalendarRetry} from './record-calendar-retry.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {recordOutlookProvider} from './record-outlook-provider.mjs'
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

export async function recordCalendarJourney({widths=[1440,390],providerKind='google',output=`.private/record-calendar-sync-${providerKind}`}={}){
 process.env.HOME=userInfo().homedir
 await mkdir(output,{recursive:true})
 const outlook=providerKind==='outlook',provider=outlook?recordOutlookProvider():recordCalendarProvider(),body=log=>outlook?provider.body(log):log.body,eventValue=id=>outlook?provider.event(provider.ownedCalendarId,id):provider.events.get(provider.key(provider.ownedCalendarId,id)),h=await recordsBrowserRuntime(0,{networkEdge:async request=>{try{return await provider.fetch(request)}catch(error){if(error.message!=='synthetic-cradle-acknowledgement-lost')console.error('Calendar network-edge error:',error.message);throw error}},bindings:{GOOGLE_CLIENT_ID:'synthetic-cradle-client',GOOGLE_CLIENT_SECRET:'synthetic-cradle-secret',MICROSOFT_CLIENT_ID:'synthetic-cradle-client',MICROSOFT_CLIENT_SECRET:'synthetic-cradle-secret',CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),CONNECTION_ENCRYPTION_KEY_VERSION:'v1'}})
 const worker=await h.runtime.getWorker(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']})
 try{for(const width of widths){const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage()
  let writerContext
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(/hydration|did not match/i.test(message.text()))errors.push(message.text())})
  const capture=async(name,target=page)=>{await target.evaluate(()=>scrollTo(0,0));assert.equal(await target.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual((await new AxeBuilder({page:target}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);assert.deepEqual(errors,[]);await target.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true})}
  try{await context.addCookies([{name:h.cookie.split('=')[0],value:h.cookie.slice(h.cookie.indexOf('=')+1),url:h.origin}]);await page.goto(h.origin+'/app/records')
   const call=(path,input,status=200)=>browserCall(page,path,input,status),command=(action,input,expected=[])=>call('/api/v1/commands/'+action,liveCommand(input,expected))
   const title=newField('Calendar title'),notes=newField('Calendar details'),start=newField('Calendar date','date'),end=newField('Calendar end','date'),appId=createUlid(),entityId=createUlid()
   const preview=await call('/api/v1/records/schema-preview',{appId,name:`synthetic-cradle-calendar-${width}`,tables:[{id:entityId,label:'Calendar records',primaryFieldId:title.id,fields:[title,notes,start,end]}]})
   await command('release.adopt',{kind:'manual_schema',previewId:preview.id})
   const schema=await call(`/api/v1/apps/${appId}/entities/${entityId}`),create=async(name='synthetic-cradle-event')=>(await command('record.create',{appId,entityId,values:{[title.id]:name,[notes.id]:'synthetic-cradle-private-details',[start.id]:'2026-11-02',[end.id]:'2026-11-03'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}])).value
   const row=await create(),recordId=row.ref.recordId,recordPath=`/app/records/${appId}/${entityId}/${recordId}`,base=`/api/v1/apps/${appId}/entities/${entityId}`
   const connectionId=(await command('connection.configure',{appId,adapterId:outlook?'outlook':'google-calendar',name:'synthetic-cradle-calendar-connection',accountId:provider.ownedCalendarId,scopes:[{resource:provider.ownedCalendarId,readFields:[],actions:['connection.sync']}],ownership:[],credentialRef:null})).value.connectionId
   const consent=(await command('connection.begin-consent',{connectionId,returnTo:recordPath})).value
   assert.deepEqual(new URL(consent.authorizationUrl).searchParams.get('scope').split(/\s+/).sort(),(outlook?['Calendars.ReadWrite','offline_access']:['https://www.googleapis.com/auth/calendar.events.owned','https://www.googleapis.com/auth/calendar.calendarlist.readonly']).sort(),'Outgoing consent requests exactly the narrow event-write and listing scopes')
   const response=await context.request.get(h.origin+`/oauth/${outlook?'microsoft':'google'}/callback?`+new URLSearchParams({code:'synthetic-cradle-code-1',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{maxRedirects:0});assert.equal(response.status(),303,await response.text())
   const deliver=async body=>{const result=await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body}]);assert.equal(result.outcome,'ok',JSON.stringify(result))}
   const drain=async()=>{const entries=(await h.db.prepare("SELECT id FROM admission_outbox WHERE state='pending' AND action IN ('connection.operation','execution.dispatch','execution.reconcile') AND not_before<=? ORDER BY created_at,id").bind(new Date().toISOString()).all()).results;for(const entry of entries)await deliver({kind:'cradle.outbox.v1',outboxId:entry.id})}
   const open=async()=>{await page.goto(h.origin+recordPath);await page.getByRole('button',{name:'Calendar sync',exact:true}).click();await page.getByRole('heading',{name:'Record calendar sync',exact:true}).waitFor()}
   if(width===1440)await recordCalendarUpgrade({h,call,base,recordId,connectionId})
   const initial=await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`);assert.equal(initial.canConfigure,true,JSON.stringify(initial));
   await open();assert.equal(await page.getByText('Everyone who can see the chosen calendar will see the event title and the further fields you select. The record link checks each visitor’s current access.',{exact:true}).isVisible(),true,'Setup discloses who can see the selected calendar values');await page.getByLabel('Calendar connection',{exact:true}).selectOption(connectionId)
   const beforeCatalogueWrites=provider.writes.length
   const refresh=page.waitForResponse(r=>r.url().endsWith(`/connections/${connectionId}/refresh`)&&r.request().method()==='POST');await page.getByRole('button',{name:'Refresh owned calendars and reviews',exact:true}).click();assert.equal((await refresh).status(),200);await drain();assert.equal(provider.writes.length,beforeCatalogueWrites,'A connection catalogue refresh writes nothing to the calendar')
   await page.getByRole('button',{name:'Calendar sync',exact:true}).click();await page.getByRole('button',{name:'Calendar sync',exact:true}).click();await page.getByLabel('Owned calendar',{exact:true}).selectOption(provider.ownedCalendarId)
   await page.getByLabel('Sync date field',{exact:true}).selectOption(start.id);await page.getByLabel('Sync end date field',{exact:true}).selectOption(end.id);await page.getByLabel('Event title field',{exact:true}).selectOption(title.id)
   await page.getByRole('group',{name:'Further fields visible on the calendar',exact:true}).getByLabel('Calendar details',{exact:true}).check()
   const proposed={appId,entityId,startFieldId:start.id,endFieldId:end.id,titleFieldId:title.id,fieldIds:[notes.id],connectionId,calendarId:provider.ownedCalendarId,enabled:true},beforeApproval=provider.writes.length
   assert.equal(await page.getByRole('button',{name:'Save calendar sync',exact:true}).isDisabled(),true,'Saving is refused before explicit approval')
   await call('/api/v1/record-calendar-sync',{commandId:createUlid(),approveCalendar:false,definition:proposed},400)
   assert.equal((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.length,0,'An unapproved request creates no definition')
   const mismatch=await call('/api/v1/record-calendar-sync',{commandId:createUlid(),approveCalendar:true,definition:{...proposed,calendarId:provider.foreignCalendarId}},403)
   assert.match(mismatch.message,/owned calendar matching its account ID/,'A Calendar scope mismatch is refused before dispatch')
   assert.equal(provider.writes.length,beforeApproval,'Neither refused configuration writes to the provider')
   await page.getByLabel('Approve calendar writes to '+provider.ownedCalendarId,{exact:true}).check()
   const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/record-calendar-sync'&&r.request().method()==='POST');await page.getByRole('button',{name:'Save calendar sync',exact:true}).click();const saveResponse=await saved;assert.equal(saveResponse.status(),200,await saveResponse.text())
   const savedValue=(await saveResponse.json()).data.value
   const definitionId=savedValue.id,syncPath=`/api/v1/record-calendar-sync/${definitionId}/records/${recordId}`,get=async()=>(await call(base+'/records/'+recordId)).record,patch=async changes=>{const current=await get();return command('record.patch',{appId,entityId,rows:[{recordId,changes}]},[{ref:current.ref,version:current.version}])}
   const proof=recordCalendarProof({h,call,provider,outlook,appId,entityId,recordId,definitionId})
   await proof.approval(saveResponse.request().postDataJSON().commandId)
   const originalDefinition=(await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId)
   const originalSnapshot=await h.db.prepare('SELECT definition_json FROM record_calendar_versions WHERE definition_id=? AND definition_version=?').bind(definitionId,originalDefinition.version).first()
   const items=async()=>(await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId).items
   const binding=()=>h.db.prepare('SELECT * FROM record_calendar_events WHERE definition_id=? AND record_id=?').bind(definitionId,recordId).first()
   await page.locator('[aria-label="Calendar sync definition"]').waitFor();await page.getByRole('button',{name:'Edit sync',exact:true}).click();await page.getByRole('group',{name:'Further fields visible on the calendar',exact:true}).getByLabel('Calendar title',{exact:true}).check();await page.getByLabel('Approve calendar writes to '+provider.ownedCalendarId,{exact:true}).check();const edited=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/record-calendar-sync'&&r.request().method()==='POST');await page.getByRole('button',{name:'Save calendar sync',exact:true}).click();const editResponse=await edited;assert.equal(editResponse.status(),200,await editResponse.text());const editedValue=(await editResponse.json()).data.value;assert.equal(editedValue.id,definitionId);assert.equal(editedValue.version,originalDefinition.version+1,'Editing creates a new definition version');await proof.approval(editResponse.request().postDataJSON().commandId)
   const snapshots=(await h.db.prepare('SELECT definition_version,definition_json FROM record_calendar_versions WHERE definition_id=? ORDER BY definition_version').bind(definitionId).all()).results
   assert.deepEqual(snapshots.map(s=>s.definition_version),[originalDefinition.version,editedValue.version]);assert.equal(snapshots[0].definition_json,originalSnapshot.definition_json,'Editing retains the original snapshot');assert.deepEqual(JSON.parse(snapshots[0].definition_json),originalDefinition.definition);assert.ok(JSON.parse(snapshots[1].definition_json).fieldIds.includes(title.id),'The new snapshot contains the edit')
   await page.locator('[aria-label="Calendar sync definition"]').waitFor();await capture('configured')
   const beforeImport={writes:provider.writes.length,changes:(await h.db.prepare('SELECT count(*) n FROM record_calendar_changes WHERE definition_id=?').bind(definitionId).first()).n,effects:(await h.db.prepare("SELECT count(*) n FROM execution_attempts WHERE action='record.calendar.sync'").first()).n}
   const imported=await call('/api/v1/records/import-preview',{appId,entityId,csv:'Calendar title,Calendar date,Calendar end\r\nsynthetic-cradle-import-no-effect,2026-12-01,2026-12-02\r\n',mapping:[{column:'Calendar title',fieldId:title.id},{column:'Calendar date',fieldId:start.id},{column:'Calendar end',fieldId:end.id}],mergeFieldId:title.id})
   assert.equal(imported.creates,1)
   const importCommit=await command('records.import-commit',{previewId:imported.id});assert.equal(importCommit.state,'committed')
   await deliver({kind:'cradle.records.automations.v1',commandId:importCommit.commandId});await drain()
   assert.deepEqual({writes:provider.writes.length,changes:(await h.db.prepare('SELECT count(*) n FROM record_calendar_changes WHERE definition_id=?').bind(definitionId).first()).n,effects:(await h.db.prepare("SELECT count(*) n FROM execution_attempts WHERE action='record.calendar.sync'").first()).n},beforeImport,'Imported records start no calendar capture or execution effect, even when scheduled work drains')
   assert.ok((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId).notOnCalendar>=1,'The sync list counts imported records not yet on the calendar')
   const nativeSessions=await page.evaluate(async()=> (await(await fetch('/auth/sessions')).json()).sessions),originalNative=nativeSessions.find(s=>s.active).id
   const fixtureAuth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},'00000000000000000000000981'),renewedOwner=await fixtureAuth.signIn();h.cookie=renewedOwner.cookie
   await context.addCookies([{name:renewedOwner.cookie.split('=')[0],value:renewedOwner.cookie.slice(renewedOwner.cookie.indexOf('=')+1),url:h.origin}])
   await call(`/auth/sessions/${originalNative}/revoke`,{})
   const approval=JSON.parse((await h.db.prepare('SELECT actor_json FROM record_calendar_definitions WHERE id=?').bind(definitionId).first()).actor_json)
   assert.equal(approval.sessionId,null,'Definition approval does not retain its author session');assert.ok(approval.credentialId);assert.ok(Date.parse(approval.expiresAt)<=Date.now()+30*86400000)
   assert.equal((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId).state,'active','Revoking the approving native session preserves the independent bounded definition approval')
   const activeDefinition=(await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId)
   await call('/api/v1/record-calendar-sync',{commandId:createUlid(),id:definitionId,version:activeDefinition.version,approveCalendar:true,definition:activeDefinition.definition,expiresAt:new Date(Date.now()+31*86400000).toISOString()},400)
   assert.equal((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId).version,activeDefinition.version,'Over-cap approval changes nothing')
   const writerId=createUlid(),writerTime=Date.now()
   await h.db.prepare('INSERT INTO operators(id,created_at,updated_at,name,email,active) VALUES(?,?,?,?,?,1)').bind(writerId,writerTime,writerTime,'Synthetic calendar writer',`synthetic-cradle-calendar-${writerId.toLowerCase()}@example.test`).run()
   await h.db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at) VALUES(?,'human',?,'active',0,?,?)").bind(writerId,writerId,writerTime,writerTime).run()
   const writerAuth=await createFixtureAuth(h.db,{appOrigin:h.origin,sessionSecret:'test-only-records-session-secret-at-least-32-characters',mode:'development'},writerId),writerSession=await writerAuth.signIn()
   await call(`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:writerId,role:'editor',version:0})
   writerContext=await browser.newContext({viewport:{width,height:1000}});await writerContext.addCookies([{name:writerSession.cookie.split('=')[0],value:writerSession.cookie.slice(writerSession.cookie.indexOf('=')+1),url:h.origin}]);const writerPage=await writerContext.newPage(),writerCall=(path,input,status=200)=>browserCall(writerPage,path,input,status)
   const openWriter=async()=>{await writerPage.goto(h.origin+recordPath);await writerPage.getByRole('button',{name:'Calendar sync',exact:true}).click();await writerPage.getByRole('heading',{name:'Record calendar sync',exact:true}).waitFor()}
   provider.loseAckOnce('create');await call(syncPath+'/sync',{commandId:createUlid()});await drain()
   let event=await binding();assert.equal((await h.db.prepare('SELECT state FROM execution_attempts WHERE id=?').bind(event.attempt_id).first()).state,'unknown')
   const creates=provider.writes.filter(w=>body(w)?.extendedProperties?.private.cradleRecord===recordId&&w.method==='POST');assert.equal(creates.length,1)
   await open();await page.getByRole('button',{name:'Read back original effect',exact:true}).waitFor();await capture('unknown');const reconciled=page.waitForResponse(r=>r.url().endsWith('/reconcile')&&r.request().method()==='POST');await page.getByRole('button',{name:'Read back original effect',exact:true}).click();assert.equal((await reconciled).status(),200);event=await binding();assert.equal(event.state,'synced');assert.equal(provider.writes.filter(w=>body(w)?.extendedProperties?.private.cradleRecord===recordId&&w.method==='POST').length,1)
   await proof.effect(event,'create')
   assert.ok(eventValue(event.event_id).description.includes(recordPath))
   const move=await patch({[start.id]:'2026-11-05',[end.id]:'2026-11-06'});await proof.capacity();await deliver({kind:'cradle.records.automations.v1',commandId:move.commandId});await drain()
   event=await binding();await proof.effect(event,'move');assert.equal(eventValue(event.event_id).start.date,'2026-11-05');const movedWrites=provider.writes.length;await deliver({kind:'cradle.records.automations.v1',commandId:move.commandId});await drain();assert.equal(provider.writes.length,movedWrites,'Duplicate ordinary-change delivery creates no second calendar effect')
   const original=await get();provider.externalEdit(provider.ownedCalendarId,event.event_id,{summary:'synthetic-cradle-external-title',start:{date:'2026-11-10'},end:{date:'2026-11-12'}})
   const beforeReviewWrites=provider.writes.length
   await call(`/api/v1/record-calendar-sync/connections/${connectionId}/refresh`,{commandId:createUlid()});await drain();assert.equal(provider.writes.length,beforeReviewWrites,'A connection review refresh writes nothing to the calendar');assert.ok((await items())[0].review);assert.equal((await get()).version,original.version)
   await call(syncPath+'/sync',{commandId:createUlid()},409)
   await open();await page.getByRole('heading',{name:'Calendar change needs review',exact:true}).waitFor();await capture('review')
   await openWriter();await writerPage.getByRole('heading',{name:'Calendar change needs review',exact:true}).waitFor();assert.equal(await writerPage.getByRole('button',{name:'Edit sync',exact:true}).count(),0,'A date writer cannot edit another author’s definition');await capture('writer-review',writerPage)
   const syncViewName='synthetic-cradle-calendar-sync-list'
   await command('view.save',{view:{appId,entityId,name:syncViewName,display:'calendar',fields:schema.fields.map(field=>field.id),filter:{kind:'all',conditions:[]},sort:[],groupBy:[],layout:{titleFieldId:title.id,startFieldId:start.id,endFieldId:end.id},visibility:'app',shipped:false}})
   await page.goto(`${h.origin}/app/records/${appId}/${entityId}`);await page.getByRole('navigation',{name:'Saved views'}).getByRole('button',{name:syncViewName,exact:true}).click();await page.getByRole('region',{name:'month calendar',exact:true}).waitFor();await page.getByRole('button',{name:'Calendar sync',exact:true}).click();await page.getByRole('heading',{name:'Record calendar sync',exact:true}).waitFor();await page.getByRole('heading',{name:'Calendar change needs review',exact:true}).waitFor();await capture('base-sync-list');await open()
   const automation=await proof.automation(page,start.id)
   const applied=writerPage.waitForResponse(r=>r.url().endsWith('/resolve')&&r.request().method()==='POST');await writerPage.getByRole('button',{name:'Apply to record',exact:true}).click();const appliedResponse=await applied;assert.equal(appliedResponse.status(),200,await appliedResponse.text());assert.equal((await get()).fields[start.id].value,'2026-11-10');const applyCommandId=appliedResponse.request().postDataJSON().commandId;await deliver({kind:'cradle.records.automations.v1',commandId:applyCommandId});await proof.applied(automation,applyCommandId);await call(`/api/user-automations/${automation.id}/disable`,{commandId:createUlid(),version:automation.version})
   provider.externalEdit(provider.ownedCalendarId,event.event_id,{summary:'synthetic-cradle-second-calendar-edit',start:{date:'2026-11-15'},end:{date:'2026-11-16'}});await call(`/api/v1/record-calendar-sync/connections/${connectionId}/refresh`,{commandId:createUlid()});await drain()
   const beforeRestore=provider.writes.length;assert.equal(beforeRestore,beforeReviewWrites,'Neither refresh nor the unresolved review writes to the provider');await call(syncPath+'/resolve',{commandId:createUlid(),action:'restore'});assert.equal(provider.writes.length,beforeRestore,'Explicit Restore prepares an effect before provider dispatch');const restoreEffect=await proof.effect(await binding(),'move');assert.equal(restoreEffect.request.calendarBinding.operation,'move','Restore calendar from record uses a move execution operation');await drain();assert.equal(provider.writes.length,beforeRestore+1);assert.equal(provider.writes.at(-1).method,outlook?'PATCH':'PUT');assert.equal(body(provider.writes.at(-1)).start.date,'2026-11-10')
   await open();await page.locator('[aria-label="Calendar sync definition"]').waitFor();await capture('resolved')
   event=await binding();const deletedEventId=event.event_id
   provider.externalDelete(provider.ownedCalendarId,deletedEventId)
   await call(`/api/v1/record-calendar-sync/connections/${connectionId}/refresh`,{commandId:createUlid()});await drain()
   assert.equal((await items())[0].review.deleted,true,'An external deletion opens a review')
   const deletedVersion=(await get()).version,deletedWrites=provider.writes.length
   await call(`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:writerId,role:'read-only',version:1})
   await writerCall(syncPath+'/resolve',{commandId:createUlid(),action:'restore'},403)
   assert.equal(provider.writes.length,deletedWrites,'A reader cannot restore the calendar')
   await call(`/api/v1/records/bases/${appId}/collaborators`,{commandId:createUlid(),principalId:writerId,role:'editor',version:2})
   const linkedRecord=eventValue(event.event_id).description.split('\n')[0]
   assert.equal(new URL(linkedRecord).pathname,recordPath)
   const writerPolicy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(writerId,appId).first()
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(JSON.parse(writerPolicy.rules_json).map(rule=>rule.entityId===entityId?{...rule,rows:{kind:'condition',fieldId:title.id,op:'eq',value:'synthetic-cradle-no-record-access'}}:rule)),writerPolicy.id).run()
   await writerCall(new URL(linkedRecord).pathname.replace('/app/records/','/api/v1/apps/').replace(`/${entityId}/`,`/entities/${entityId}/records/`),undefined,404)
   const deniedLink=await writerPage.goto(linkedRecord);assert.equal(deniedLink.status(),404,'The event link refuses a reader who lost record authority');await writerPage.getByRole('heading',{name:'Page not found',exact:true}).waitFor();assert.ok(!(await writerPage.locator('body').innerText()).includes('synthetic-cradle-private-details'),'The event record link discloses no record after its visitor loses authority')
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(JSON.parse(writerPolicy.rules_json).map(rule=>rule.entityId===entityId?{...rule,purposes:rule.purposes.filter(p=>p!=='export'),readableFields:rule.readableFields.filter(id=>id!==title.id&&id!==notes.id)}:rule)),writerPolicy.id).run()
   await openWriter();await writerPage.getByRole('heading',{name:'Calendar change needs review',exact:true}).waitFor();await capture('deleted-review',writerPage)
   const restoredDeletion=writerPage.waitForResponse(r=>r.url().endsWith('/resolve')&&r.request().method()==='POST');await writerPage.getByRole('button',{name:'Restore calendar from record',exact:true}).click();const restoredDeletionResponse=await restoredDeletion;assert.equal(restoredDeletionResponse.status(),200,await restoredDeletionResponse.text());await drain()
   event=await binding();assert.equal(event.state,'synced');assert.notEqual(event.event_id,deletedEventId,'Restore of an externally deleted event creates a new generation')
   assert.equal(provider.writes.length,deletedWrites+1);assert.equal(provider.writes.at(-1).method,'POST')
   assert.equal((await get()).version,deletedVersion,'Calendar restoration never edits the record')
   assert.equal(body(provider.writes.at(-1)).summary,'synthetic-cradle-external-title','A date writer without export rights restores the author-approved title')
   assert.ok(body(provider.writes.at(-1)).description.includes('synthetic-cradle-private-details'),'A writer’s hidden fields do not blank the author-approved calendar projection')
   const restoredAttempt=await h.db.prepare('SELECT run_id,receipt_id FROM execution_attempts WHERE id=?').bind(event.attempt_id).first()
   await writerCall('/api/v1/runs/'+restoredAttempt.run_id,undefined,403);await writerCall('/api/v1/attempts/'+event.attempt_id+'/review',undefined,403);await writerCall('/api/v1/receipts/'+restoredAttempt.receipt_id,undefined,403)
   assert.ok(!(await writerPage.locator('body').innerText()).includes('synthetic-cradle-private-details')&&!(await writerPage.locator('body').innerText()).includes('synthetic-cradle-external-title'),'The clicking writer never receives hidden author title or details')

   assert.equal((await items())[0].review,null,'The explicit restoration resolves its review')
   await open();await page.locator('[aria-label="Calendar sync definition"]').waitFor();await capture('deleted-restored')

   if(width===1440)await recordCalendarAuthor({h,provider,outlook,call,writerCall,writerContext,writerId,deliver,drain,appId,entityId,recordId:imported.rows[0].id,title:title.id,start:start.id,end:end.id})
   if(width===1440)await recordCalendarRetry({h,worker,provider,call,patch,drain,binding,syncPath,start:start.id,end:end.id})
   // Current field visibility is re-projected, rather than retained in the next event.
   const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind('00000000000000000000000981',appId).first(),rules=JSON.parse(policy.rules_json)
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules.map(r=>r.entityId===entityId?{...r,readableFields:r.readableFields.filter(f=>f!==notes.id),writableFields:r.writableFields.filter(f=>f!==notes.id)}:r)),policy.id).run()
   await patch({[start.id]:'2026-11-20',[end.id]:'2026-11-21'});await call(syncPath+'/sync',{commandId:createUlid()});await drain();assert.ok(!body(provider.writes.at(-1)).description.includes('synthetic-cradle-private-details'))
   const scopes=(await h.db.prepare('SELECT scopes_json FROM provider_connections WHERE id=?').bind(connectionId).first()).scopes_json
   await h.db.prepare("UPDATE provider_connections SET scopes_json='[]',version=version+1 WHERE id=?").bind(connectionId).run();const writeCount=provider.writes.length
   await patch({[start.id]:'2026-11-22',[end.id]:'2026-11-23'});await call(syncPath+'/sync',{commandId:createUlid()},403);assert.equal(provider.writes.length,writeCount)
   assert.equal((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId).state,'stopped')
   await open();await page.getByRole('heading').filter({hasText:/^Calendar date · stopped · version /}).waitFor();await capture('stopped')
   await h.db.prepare('UPDATE provider_connections SET scopes_json=?,version=version+1 WHERE id=?').bind(scopes,connectionId).run()
   await patch({[start.id]:null,[end.id]:null});await call(syncPath+'/sync',{commandId:createUlid()});await drain();await proof.effect(await binding(),'cancel');assert.equal(provider.writes.at(-1).method,'DELETE');assert.equal((await binding()).state,'cancelled',JSON.stringify({lastWrite:{method:provider.writes.at(-1).method,applied:provider.writes.at(-1).applied,outcome:provider.writes.at(-1).outcome}}))
   await open();await page.getByText('cancelled',{exact:true}).waitFor();await capture('cancelled')
   await patch({[start.id]:'2026-11-25',[end.id]:'2026-11-26'});await call(syncPath+'/sync',{commandId:createUlid()});await drain();assert.equal(provider.writes.at(-1).method,'POST');assert.notEqual((await binding()).event_id,event.event_id)
   if(width===1440)await recordCalendarBulk({h,worker,provider,body,call,command,deliver,drain,definitionId,appId,entityId,title:title.id,start:start.id,end:end.id})
   if(width===1440)await recordCalendarTrash({call,command,deliver,drain,get,binding,provider,appId,entityId,recordId})
   const mismatchRecord=(await command('record.create',{appId,entityId,values:{[title.id]:'synthetic-cradle-calendar-account-drift',[start.id]:'2026-11-29',[end.id]:'2026-11-30'}},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:schema.version}])).value
   await proof.scopeMismatch({connectionId,otherRecordId:mismatchRecord.ref.recordId,deliver})
   await command('connection.revoke',{connectionId});assert.equal((await call(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`)).definitions.find(d=>d.id===definitionId).state,'stopped');await patch({[start.id]:'2026-11-27',[end.id]:'2026-11-28'});await call(syncPath+'/sync',{commandId:createUlid()},403)
   assert.ok(provider.seen.every(r=>(outlook?['graph.microsoft.com','login.microsoftonline.com']:['www.googleapis.com','oauth2.googleapis.com']).includes(new URL(r.url).hostname)))
  }catch(error){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${output}/failure-${width}.png`,fullPage:true});console.error('Calendar screen at failure:',await page.locator('body').innerText());throw error}finally{await writerContext?.close();await context.close()}
 }}finally{await browser.close();await h.close()}
 return {providerWrites:provider.writes.length}
}

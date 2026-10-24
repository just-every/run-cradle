import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {liveCommand} from './records-live-fixture.mjs'
/** The creator owns and consents to their connection through the same native doors as the base owner. */
export async function recordCalendarAuthor({h,provider,outlook,call,writerCall,writerContext,writerId,deliver,drain,appId,entityId,recordId,title,start,end}){
 const roles=`/api/v1/records/bases/${appId}/collaborators`,writerCommand=(action,input,expected=[],status=200)=>writerCall('/api/v1/commands/'+action,liveCommand(input,expected),status)
 await call(roles,{commandId:createUlid(),principalId:writerId,role:'creator',version:3})
 const connectionId=(await writerCommand('connection.configure',{appId,adapterId:outlook?'outlook':'google-calendar',name:'synthetic-cradle-creator-calendar',accountId:provider.ownedCalendarId,scopes:[{resource:provider.ownedCalendarId,readFields:[],actions:['connection.sync']}],ownership:[],credentialRef:null})).value.connectionId
 const consent=(await writerCommand('connection.begin-consent',{connectionId,returnTo:'/app/records'})).value
 const exchanged=await writerContext.request.get(h.origin+`/oauth/${outlook?'microsoft':'google'}/callback?`+new URLSearchParams({code:'synthetic-cradle-code-creator',state:new URL(consent.authorizationUrl).searchParams.get('state')}),{maxRedirects:0});assert.equal(exchanged.status(),303,await exchanged.text())
 await writerCall(`/api/v1/record-calendar-sync/connections/${connectionId}/refresh`,{commandId:createUlid()});await drain()
 const definition={appId,entityId,startFieldId:end,titleFieldId:title,fieldIds:[],connectionId,calendarId:provider.ownedCalendarId,enabled:true}
 const configured=await writerCall('/api/v1/record-calendar-sync',{commandId:createUlid(),approveCalendar:true,definition}),id=configured.value.id,syncPath=`/api/v1/record-calendar-sync/${id}/records/${recordId}`
 await writerCall(syncPath+'/sync',{commandId:createUlid()});await drain()
 const event=await h.db.prepare('SELECT state FROM record_calendar_events WHERE definition_id=? AND record_id=?').bind(id,recordId).first();assert.equal(event.state,'synced','A base creator can approve and dispatch their calendar definition')
 await call(roles,{commandId:createUlid(),principalId:writerId,role:'editor',version:4})
 const original=(await call(`/api/v1/apps/${appId}/entities/${entityId}/records/${recordId}`)).record
 const changed=await call('/api/v1/commands/record.patch',liveCommand({appId,entityId,rows:[{recordId,changes:{[title]:'synthetic-cradle-demoted-author'}}]},[{ref:original.ref,version:original.version}]))
 const before=provider.writes.length
 await writerCall(syncPath+'/sync',{commandId:createUlid()},403)
 assert.equal(provider.writes.length,before,'A demoted author cannot start a new effect')
 const listed=await writerCall(`/api/v1/record-calendar-sync?appId=${appId}&entityId=${entityId}`);assert.equal(listed.definitions.find(d=>d.id===id).state,'stopped')
 await deliver({kind:'cradle.records.automations.v1',commandId:changed.commandId});await drain()
 assert.equal((await h.db.prepare("SELECT count(*) n FROM execution_runs WHERE json_extract(request_json,'$.calendarBinding.definitionId')=?").bind(id).first()).n,1,'Scheduled capture starts no further effect for a demoted author')
 await call(roles,{commandId:createUlid(),principalId:writerId,role:'creator',version:5})
 await writerCall('/api/v1/record-calendar-sync',{commandId:createUlid(),id,version:configured.value.version,approveCalendar:true,definition:{...definition,enabled:false}})
}

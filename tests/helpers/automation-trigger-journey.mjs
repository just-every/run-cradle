import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {automationScheduleBoundaries} from './automation-schedule-boundaries.mjs'
export async function automationTriggerJourney(h){
 const base={name:'synthetic-cradle-141 trigger',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'update',fieldId:h.statusId,value:'triggered'}]},expiresAt=new Date(Date.now()+29*86400000).toISOString()
 const csrfToken=(await (await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 const save=async(definition)=>{const response=await fetch(h.origin+'/api/user-automations',{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({commandId:createUlid(),expiresAt,definition})}),reply=await response.json();assert.equal(response.status,201,JSON.stringify(reply.error));return reply.data.result.value}
 const disable=saved=>h.request(`/api/user-automations/${saved.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:saved.version}})
 const runs=saved=>h.request(`/api/user-automations/${saved.id}/runs`).then(reply=>reply.data.runs.filter(run=>run.state!=='Suppressed'))
 const tick=async at=>{const worker=await h.runtime.getWorker();await worker.scheduled({scheduledTime:Date.parse(at),cron:'* * * * *'})}
 const record=await h.create('synthetic-cradle-142 selected fields'),fields=await save({...base,name:'synthetic-cradle-142 selected fields',event:'updated',trigger:{kind:'fields_updated',fieldIds:[h.nameId]}})
 const untracked=await h.patch(record.record,{[h.statusId]:'untracked'});let current=untracked.data.value
 await h.tick(untracked.data.commandId);await tick('2026-10-23T12:17:00Z');assert.equal((await runs(fields)).length,0)
 const named=await h.patch(current,{[h.nameId]:'synthetic-cradle-143 changed name'});await h.tick(named.data.commandId);await tick('2026-10-23T12:17:00Z')
 assert.equal((await runs(fields)).length,1);assert.equal((await runs(fields))[0].state,'Complete')
 current=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${record.record.id}`)).data.record
 assert.equal(current.fields[h.statusId].value,'triggered')
 const unchanged=await h.patch(current,{[h.nameId]:current.fields[h.nameId].value});await h.tick(unchanged.data.commandId);assert.equal((await runs(fields)).length,1,'An unchanged named value does not fire')
 await disable(fields)
 const settings=await h.request('/api/v1/settings')
 await h.request('/api/v1/commands/settings.update',{method:'POST',body:{commandId:createUlid(),expected:[],input:{version:settings.data.version,changes:{timezone:'America/New_York',quietHoursStart:'00:00',quietHoursEnd:'00:00'}}}})
 const cases=[
  {unit:'minutes',schedule:{unit:'minutes',every:15},startsAt:'2026-10-23T13:00:00Z',before:'2026-10-23T12:59:00Z',due:'2026-10-23T13:00:00Z',next:'2026-10-23T13:15:00Z',outage:'2026-10-23T17:17:00Z'},
  {unit:'hourly',schedule:{unit:'hourly',minute:17},startsAt:'2026-10-23T13:17:00Z',before:'2026-10-23T13:16:00Z',due:'2026-10-23T13:17:00Z',next:'2026-10-23T14:17:00Z',outage:'2026-10-23T20:18:00Z'},
  {unit:'daily',schedule:{unit:'daily',time:'09:17'},startsAt:'2026-10-23T13:17:00Z',before:'2026-10-23T13:16:00Z',due:'2026-10-23T13:17:00Z',next:'2026-10-24T13:17:00Z',outage:'2026-10-27T14:17:00Z'},
  {unit:'weekly',schedule:{unit:'weekly',weekday:5,time:'09:17'},startsAt:'2026-10-23T13:17:00Z',before:'2026-10-23T13:16:00Z',due:'2026-10-23T13:17:00Z',next:'2026-10-30T13:17:00Z',outage:'2026-11-13T15:17:00Z'},
  {unit:'monthly',schedule:{unit:'monthly',day:1,time:'09:17'},startsAt:'2026-08-01T13:17:00Z',before:'2026-08-01T13:16:00Z',due:'2026-08-01T13:17:00Z',next:'2026-09-01T13:17:00Z',outage:'2026-11-01T15:17:00Z'},
 ]
 for(const fixture of cases){
  const anchor=(await h.create(`synthetic-cradle-144 ${fixture.unit}`)).record
  const saved=await save({...base,name:`synthetic-cradle-144 ${fixture.unit}`,trigger:{kind:'schedule',recordId:anchor.id,startsAt:fixture.startsAt,schedule:fixture.schedule}})
  await tick(fixture.before);assert.equal((await runs(saved)).length,0,`${fixture.unit}: before first slot`)
  await tick(fixture.due);assert.equal((await runs(saved)).length,1);assert.equal((await runs(saved))[0].state,'Complete')
  await h.restart();await tick(fixture.due);assert.equal((await runs(saved)).length,1,`${fixture.unit}: restart dedupe`)
  const beforeNext={minutes:'2026-10-23T13:14:00Z',hourly:'2026-10-23T14:16:00Z',daily:'2026-10-24T13:16:00Z',weekly:'2026-10-30T13:16:00Z',monthly:'2026-09-01T13:16:00Z'}
  await tick(beforeNext[fixture.unit]);assert.equal((await runs(saved)).length,1,`${fixture.unit}: next boundary not reached`)
  await tick(fixture.next);assert.equal((await runs(saved)).length,2)
  await tick(fixture.outage);assert.equal((await runs(saved)).length,3,`${fixture.unit}: outage coalesces to one run`)
  await tick(fixture.outage);assert.equal((await runs(saved)).length,3)
  await disable(saved)
 }
 await automationScheduleBoundaries(h,{base,save,disable,runs,tick})
 const anchor=(await h.create('synthetic-cradle-145 minimum interval')).record
 for(const every of [0,14,20])await h.request('/api/user-automations',{method:'POST',status:400,body:{commandId:createUlid(),expiresAt,definition:{...base,trigger:{kind:'schedule',recordId:anchor.id,startsAt:'2026-10-23T13:17:00Z',schedule:{unit:'minutes',every}}}}})
 const dateId=createUlid(),draft=(await h.request(`/api/v1/records/bases/${h.appId}`)).data
 const table=draft.tables.find(table=>table.id===h.entityId)
 assert.equal(table.fields.find(field=>field.id===h.phoneLookupId).readOnly,true,'Editing schema preserves the authored phone lookup protection')
 table.fields.push({id:dateId,label:'Due',type:'date',required:false,unique:false})
 const csrf=(await (await fetch(h.origin+'/auth/csrf',{headers:{cookie:h.cookie}})).json()).csrfToken
 const previewResponse=await fetch(h.origin+'/api/v1/records/schema-preview',{method:'POST',headers:{cookie:h.cookie,origin:h.origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(draft)}),previewEnvelope=await previewResponse.json()
 assert.equal(previewResponse.status,200,JSON.stringify(previewEnvelope.error));const preview=previewEnvelope.data
 await h.request('/api/v1/commands/release.adopt',{method:'POST',body:{commandId:createUlid(),expected:[],input:{kind:'manual_schema',previewId:preview.id}}})
 Object.assign(h.entity,(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}`)).data)
 const visible=(await h.create('synthetic-cradle-146 visible due')).record,hidden=(await h.create('synthetic-cradle-147 hidden due')).record
 await h.patch(visible,{[dateId]:'2026-10-26'});await h.patch(hidden,{[dateId]:'2026-10-26',[h.statusId]:'hidden'})
 const ownerPolicy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email=?))').bind(h.appId,'import-owner@example.test').first()
 const rules=JSON.parse(ownerPolicy.rules_json).map(rule=>rule.entityId===h.entityId?{...rule,rows:{kind:'condition',fieldId:h.statusId,op:'ne',value:'hidden'}}:rule)
 await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),ownerPolicy.id).run()
 let dates
 try{
  dates=await save({...base,name:'synthetic-cradle-148 three days before Due',actions:[{kind:'notify',operatorId:h.operator,title:'synthetic-cradle-148 due soon'}],trigger:{kind:'date_offset',fieldId:dateId,offsetDays:-3}})
  await tick('2026-10-22T16:17:00Z');assert.equal((await runs(dates)).length,0)
  await tick('2026-10-23T16:17:00Z');let dated=await runs(dates);assert.equal(dated.length,1);assert.equal(dated[0].recordId,visible.id);assert.equal(dated[0].state,'Complete')
  await h.restart();await tick('2026-10-23T20:17:00Z');assert.equal((await runs(dates)).length,1,'The same record/offset date does not fire again')
  assert.equal((await h.request('/api/v1/notifications')).data.items.filter(item=>item.title==='synthetic-cradle-148 due soon').length,1)
  await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${hidden.id}`,{status:404})
  await disable(dates)
 }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(ownerPolicy.rules_json,ownerPolicy.id).run()}
 assert.ok(!(await runs(dates)).some(run=>run.recordId===hidden.id),'An unreadable date-offset record never starts a run')
 const updated=(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${hidden.id}`)).data.record
 assert.equal(updated.fields[h.statusId].value,'hidden','A hidden date-offset record has no effect')
 const reset=await h.request('/api/v1/settings');await h.request('/api/v1/commands/settings.update',{method:'POST',body:{commandId:createUlid(),expected:[],input:{version:reset.data.version,changes:{timezone:'UTC'}}}})
}

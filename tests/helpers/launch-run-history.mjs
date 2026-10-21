import assert from 'node:assert/strict'
import {value,expected} from './launch-installed.mjs'
const {launchEntities}=await import('../../src/apps/launch/contracts.ts')

// AUTO-006 through the emitted Worker: one automation's Cancelled, Succeeded and Failed runs, read
// back through run history and Automation Monitor. Scheduled ticks set each run's clock, as in
// tests/launch-installed-schedules.mjs; the only fake is the mail provider at the network edge.
const day=86400000,iso=at=>new Date(at).toISOString()
const count=async(h,sql,...values)=>Number((await h.db.prepare(sql).bind(...values).first()).n)

export function historyMailEdge(){
 const edge={refuse:false,subjects:[],async fetch(request){
  assert.equal(request.url,'https://api.sendgrid.com/v3/mail/send')
  const body=await request.json();edge.subjects.push(body.subject)
  const refused=edge.refuse&&body.subject==='Run history mail'
  return new Response(refused?JSON.stringify({errors:[{message:'Refused at the test network edge'}]}):null,{status:refused?400:202,headers:refused?{'content-type':'application/json'}:{'x-message-id':`<history-${edge.subjects.length}@network-edge.example.test>`}})
 }}
 return edge
}

export async function verifyRunHistory(h,{campaign,owner,risk,mail}){
 const worker=await h.runtime.getWorker()
 const settings=(await h.read('/api/v1/settings')).data
 await h.command('settings.update',{version:settings.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}})
 const current=id=>h.db.prepare('SELECT id,version FROM automations WHERE id=?').bind(id).first()
 const patch=async signal=>h.command('launch.risk.patch',{id:risk.id,changes:{signal}},expected(launchEntities.risk,await h.db.prepare('SELECT id,version FROM risks WHERE id=?').bind(risk.id).first()))
 const eventOf=async response=>(await h.db.prepare("SELECT id FROM admission_events WHERE command_id=? AND name='risk.updated'").bind(response.data.commandId).first()).id
 const automation=value(await h.command('launch.automation.save',{definition:{name:'Run history mail',enabled:true,trigger:{kind:'event',event:'risk.updated.v1'},actions:[
  {command:'add-activity',input:{campaignId:campaign.id,message:'Run history activity'}},
  {command:'send-email',input:{operatorId:owner,subjectId:campaign.id,title:'Run history mail',body:'Run history body'}},
 ]}}))
 // Cancelled: disabling cancels the queued run before any action; enabling again versions the definition.
 const queued=await patch('Queued, then cancelled')
 await worker.queue('cradle-work',[{id:'history-cancelled',timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:queued.data.commandId}}])
 await h.command('launch.automation.disable',{id:automation.id},expected(launchEntities.automation,await current(automation.id)))
 await h.command('launch.automation.enable',{id:automation.id},expected(launchEntities.automation,await current(automation.id)))
 // Succeeded, then Failed on a provider refusal, each run on its own scheduler clock (one tick per action).
 const first=Date.now()+60000,second=first+2*3600000
 const delivered=await patch('Delivered');await h.tick(first);await h.tick(first+1000)
 mail.refuse=true
 const refused=await patch('Refused');await h.tick(second);await h.tick(second+1000)
 mail.refuse=false

 const history=await h.read(`/api/automations/${automation.id}/runs`)
 assert.deepEqual({total:history.total,label:history.totalLabel,shown:history.shown,cursor:history.cursor},{total:3,label:'3',shown:3,cursor:null})
 const [failed,succeeded,cancelled]=history.runs
 const fields=run=>({automationId:run.automationId,state:run.state,definitionVersion:run.definitionVersion,trigger:run.trigger,subjectId:run.subjectId,subjectIds:run.subjectIds,queuedAt:run.queuedAt,startedAt:run.startedAt,finishedAt:run.finishedAt,affectedCount:run.affectedCount,errorCode:run.errorCode,errorMessage:run.errorMessage,retryOf:run.retryOf})
 const trigger=async response=>({kind:'event',key:await eventOf(response),event:'risk.updated.v1'})
 const common={automationId:automation.id,subjectId:risk.id,subjectIds:[risk.id],affectedCount:0,retryOf:null}
 assert.deepEqual(fields(succeeded),{...common,state:'Succeeded',definitionVersion:3,trigger:await trigger(delivered),queuedAt:iso(first),startedAt:iso(first),finishedAt:iso(first+1000),errorCode:null,errorMessage:null})
 assert.deepEqual(fields(failed),{...common,state:'Failed',definitionVersion:3,trigger:await trigger(refused),queuedAt:iso(second),startedAt:iso(second),finishedAt:iso(second+1000),errorCode:'provider_refused',errorMessage:'Mail provider rejected'})
 assert.equal(cancelled.finishedAt>=cancelled.queuedAt,true,'A cancelled run records when it was cancelled')
 assert.deepEqual(fields(cancelled),{...common,state:'Cancelled',definitionVersion:1,trigger:await trigger(queued),queuedAt:cancelled.queuedAt,startedAt:null,finishedAt:cancelled.finishedAt,errorCode:null,errorMessage:null})
 // Each attempted action in position order with its state, result and error.
 const step=action=>({position:action.position,command:action.command,state:action.state,errorCode:action.errorCode})
 assert.deepEqual(succeeded.actions.map(step),[{position:0,command:'add-activity',state:'Complete',errorCode:null},{position:1,command:'send-email',state:'Complete',errorCode:null}])
 assert.deepEqual(succeeded.actions[0].result,{activity:true});assert.equal(succeeded.actions[1].result.status,'accepted')
 assert.deepEqual(failed.actions.map(step),[{position:0,command:'add-activity',state:'Complete',errorCode:null},{position:1,command:'send-email',state:'Failed',errorCode:'provider_refused'}])
 assert.deepEqual(failed.actions[0].result,{activity:true});assert.deepEqual({result:failed.actions[1].result,message:failed.actions[1].errorMessage},{result:null,message:'Mail provider rejected'})
 assert.deepEqual(cancelled.actions.map(step),[{position:0,command:'add-activity',state:'Pending',errorCode:null},{position:1,command:'send-email',state:'Pending',errorCode:null}],'A cancelled run attempted no action')

 // Success rate: finished successful runs over finished runs in the trailing 30 days, stating that window.
 const monitor=async windowEnd=>{const body=await h.read(`/api/automations?windowEnd=${windowEnd}`),item=body.automations.find(entry=>entry.id===automation.id);return{window:body.successWindow,rate:item.successRate30Days,finished:item.runCount30Days,succeeded:item.succeededCount30Days}}
 const both=await monitor(iso(second+60000))
 assert.deepEqual(both,{window:{days:30,from:iso(second+60000-30*day),to:iso(second+60000),finishedStates:['Succeeded','Failed','Unknown']},rate:0.5,finished:2,succeeded:1},'The cancelled run is not a finished run')
 assert.deepEqual(await monitor(iso(first+1000+30*day+3600000)),{window:{days:30,from:iso(first+1000+3600000),to:iso(first+1000+30*day+3600000),finishedStates:['Succeeded','Failed','Unknown']},rate:0,finished:1,succeeded:0},'A run older than 30 days is outside the window')
 assert.deepEqual((await monitor(iso(second+1000+30*day+3600000))).rate,null)
 assert.equal((await h.request('/api/automations?windowEnd=next-month',{headers:{cookie:h.owner.cookie}})).status,400)

 // VIEW-007 paging of the retained history: newest queued first, then run ID, at most 200 a page.
 const page=(path,cursor,limit)=>h.read(`${path}?limit=${limit}${cursor?`&cursor=${cursor}`:''}`)
 async function walk(path,start,limit){
  const ids=[]
  for(let next=start?await page(path,start,limit):await page(path,undefined,limit);;next=await page(path,next.cursor,limit)){
   assert.equal(next.shown,next.runs.length);assert.ok(next.shown<=limit);ids.push(...next.runs.map(run=>run.id));if(!next.cursor)break
  }
  return ids
 }
 const retained=await count(h,'SELECT count(*) n FROM automation_runs WHERE NOT EXISTS(SELECT 1 FROM record_automation_bindings WHERE automation_id=automation_runs.automation_id)')
 const everything=(await h.read('/api/automations/runs')).runs.map(run=>run.id)
 const opening=await page('/api/automations/runs',undefined,2)
 assert.deepEqual({ids:opening.runs.map(run=>run.id),total:opening.total,label:opening.totalLabel,shown:opening.shown,more:Boolean(opening.cursor)},{ids:everything.slice(0,2),total:retained,label:String(retained),shown:2,more:true})
 assert.equal(everything.length,retained,'Every retained run is listed')
 const added=await patch('Added between pages');await h.tick(second+3600000);await h.tick(second+3601000)
 assert.deepEqual([...opening.runs.map(run=>run.id),...await walk('/api/automations/runs',opening.cursor,2)],everything,'A run added between pages neither repeats nor skips the others')
 const latest=await h.read('/api/automations/runs')
 assert.deepEqual({total:latest.total,newest:latest.runs[0].trigger.key},{total:retained+1,newest:await eventOf(added)})
 assert.deepEqual(await walk(`/api/automations/${automation.id}/runs`,undefined,1),(await h.read(`/api/automations/${automation.id}/runs`)).runs.map(run=>run.id))
 for(const query of ['limit=201','limit=0','cursor=not-a-cursor'])assert.equal((await h.request(`/api/automations/runs?${query}`,{headers:{cookie:h.owner.cookie}})).status,400,query)
}

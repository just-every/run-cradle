import assert from 'node:assert/strict'
import {createUlid,LAUNCH_APP_ID,launchEntities} from './launch-authority-runtime.mjs'

export async function verifyNotificationInAppClauses({h,page,capture}){
 const width=page.viewportSize().width
 const actor=await h.addPerson({legacy:true,name:`Notification initiator ${width}`,change:rules=>rules.map(rule=>rule.effect==='allow'?{...rule,rows:{kind:'all',conditions:[]}}:rule)})
 const other=await h.addPerson({legacy:true,name:`Notification target ${width}`,change:rules=>rules.map(rule=>rule.effect==='allow'?{...rule,rows:{kind:'all',conditions:[]}}:rule)})
 const request=async(session,action,input,expected=[])=>{
  const response=await h.request(session,'/api/v1/commands/'+action,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected})})
  assert.equal(response.status,200,`${action}: ${await response.clone().text()}`)
  const data=(await response.json()).data;assert.equal(data.state,'committed');return data.value
 }
 const settings=await(await h.request(h.ownerSession,'/api/v1/settings')).json(),original=settings.data
 await request(h.ownerSession,'settings.update',{version:original.version,changes:{timezone:'UTC'}})
 const command=(action,input,expected=[])=>request(actor.session,'launch.'+action,input,expected)
 const ref=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]
 const row=(table,id)=>h.db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first()
 const tick=async at=>(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:at??Date.now()})
 const c=await command('campaign.create',{fields:{code:`synthetic-cradle-notify001-${width}`,name:'Named notification recipients',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2027-12-01',objective:'Prove each named event recipient',statusSummary:'Ready',phase:'Planning',status:'On track',health:60,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const notices=async(kind,subject)=>(await h.db.prepare('SELECT id,operator_id FROM notifications WHERE kind=? AND subject_id=?').bind(kind,subject).all()).results
 const check=async(kind,subject,ids)=>{
  const actual=await notices(kind,subject)
  assert.deepEqual(actual.map(n=>n.operator_id).sort(),[...ids].sort(),`NOTIFY-001 ${kind}: exactly the named recipients and nobody else`)
  for(const id of ids){const session=id===h.owner?h.ownerSession:id===actor.id?actor.session:id===other.id?other.session:await h.signIn(id);const response=await h.request(session,'/api/notifications');assert.equal(response.status,200);const inbox=(await response.json()).notifications;assert.ok(inbox.some(n=>actual.some(a=>a.operator_id===id&&a.id===n.id)),`NOTIFY-001 ${kind}: retained in recipient public inbox`)}
  return actual
 }
 const d=await command('decision.create',{fields:{campaignId:c.id,riskId:null,supersedesId:null,title:'Assign to the target, not the requester or campaign owner',requesterId:actor.id,assigneeId:null,priority:'High',dueAt:'2099-01-01T12:00:00.000Z',recommendation:'Review',impact:'Recipient isolation'}})
 await command('decision.assign',{id:d.id,assigneeId:other.id},ref('decision',d));await check('decision-assigned',d.id,[other.id])
 const comment=await command('comment.create',{campaignId:c.id,body:'Mention only the target',mentions:[other.id]},ref('campaign',c));await check('comment-mentioned',comment.id,[other.id])
 const risk=await command('risk.create',{fields:{campaignId:c.id,title:'Escalate to the campaign owner, not the risk owner',ownerId:other.id,severity:'Critical',dueDate:null,signal:'Synthetic risk',mitigation:'Review'}})
 await command('risk.escalate',{id:risk.id,reason:'Named campaign owner'},ref('risk',risk));const riskNotices=await check('critical-risk-escalated',risk.id,[h.owner])
 await page.goto(h.origin+'/app/notifications');await page.locator(`#notification-${riskNotices[0].id}`).waitFor();await capture('notify001-campaign-owner')
 const readiness=await h.db.prepare("SELECT id,version,enabled,trigger_config_json FROM automations WHERE shipped_key='launch-readiness'").first()
 if(!readiness.enabled)await command('automation.enable',{id:readiness.id},ref('automation',readiness))
 const date=new Date(Date.now()+(60+(width===390?14:0))*86400000).toISOString().slice(0,10),hour=JSON.parse(readiness.trigger_config_json).hour
 const milestone=await command('milestone.create',{fields:{campaignId:c.id,title:'Readiness for its target, not the campaign owner',ownerId:other.id,type:'Launch',status:'Not started',startDate:date,endDate:null,conflictReason:null}})
 await tick(Date.parse(date+`T${String(hour).padStart(2,'0')}:00:00Z`));await check('readiness',milestone.id,[other.id])
 if(!readiness.enabled)await command('automation.disable',{id:readiness.id},ref('automation',await row('automations',readiness.id)))
 const failure=await command('automation.save',{definition:{name:`Named failure ${width}`,enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'request-ai-analysis',input:{campaignId:c.id}}]}})
 await command('campaign.patch',{id:c.id,changes:{statusSummary:'Fail with disabled AI'}},ref('campaign',c));await tick()
 const failed=await h.db.prepare("SELECT * FROM automation_runs WHERE automation_id=? AND state='Failed'").bind(failure.id).first();assert.ok(failed,'NOTIFY-001 actual event run failed');assert.equal(failed.initiated_by_id,null)
 await check('automation-failed',failed.id,[h.owner])
 const retry=await command('automation.retry',{runId:failed.id,version:failed.version});await tick()
 const retried=await row('automation_runs',retry.runId);assert.equal(retried.state,'Failed');assert.equal(retried.initiated_by_id,actor.id)
 await check('automation-failed',retry.runId,[actor.id])
 await command('automation.disable',{id:failure.id},ref('automation',await row('automations',failure.id)))
 // The separate full probe found missing notices for active operators without
 // Launch membership on subjectless failures; NOTIFY-001 remains partial.
 await command('campaign.archive',{id:c.id},ref('campaign',await row('campaigns',c.id)))
 await command('campaign.delete',{id:c.id,confirmationCode:c.code},ref('campaign',await row('campaigns',c.id)))
 const current=(await(await h.request(h.ownerSession,'/api/v1/settings')).json()).data
 await request(h.ownerSession,'settings.update',{version:current.version,changes:{timezone:original.timezone}})
 console.log(`NOTIFY-001 ${width}: five events, starter and campaign-owner failure recipients; subjectless all-operator delivery remains a Gap`)
}

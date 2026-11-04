import assert from 'node:assert/strict'

// Native commands author every record and definition. The emitted cron executes
// the real send-email action; only the provider edge refuses its request.
export async function populateDigestSections({command,expected,h,tick,owner,campaign,archived,monday,addDays}) {
 const settings=await h.db.prepare('SELECT version FROM workspace_settings').first()
 await command('settings.update',{version:settings.version,changes:{quietHoursStart:'00:00',quietHoursEnd:'00:00'}})
 // Keep Critical records Watching so the independent digest fixture has no
 // escalation-created decision. This changes the real shipped definition.
 const escalation=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='critical-risk'").first()
 await command('launch.automation.disable',{id:escalation.id},expected('automation',escalation))
 const risk=async(title,severity,parent=campaign)=>command('launch.risk.create',{fields:{campaignId:parent.id,title,ownerId:owner,severity,dueDate:null,signal:'Digest fixture',mitigation:'Review evidence'}})
 await risk('Digest open High risk','High')
 await risk('Digest open Critical risk','Critical')
 const resolved=await risk('Digest resolved Critical control','Critical')
 await command('launch.risk.resolve',{id:resolved.id,resolutionNote:'Addressed before digest'},expected('risk',resolved))
 await risk('Digest Low risk control','Low')
 await risk('Digest Medium risk control','Medium')
 await risk('Digest archived High risk control','High',archived)
 const decision=async(title,parent=campaign)=>command('launch.decision.create',{fields:{campaignId:parent.id,riskId:null,supersedesId:null,title,requesterId:owner,assigneeId:null,priority:'High',dueAt:addDays(monday,40)+'T12:00:00.000Z',recommendation:'Review digest evidence',impact:'Digest fixture'}})
 await decision('Digest awaiting approval')
 const review=await decision('Digest in review')
 await command('launch.decision.request-change',{id:review.id,rationale:'Attach current evidence'},expected('decision',review))
 for(const outcome of ['Approved','Rejected','Cancelled']) {
  const row=await decision(`Digest ${outcome} decision control`)
  await command('launch.decision.outcome',{id:row.id,outcome,rationale:'Conclude before digest'},expected('decision',row))
 }
 await decision('Digest archived decision control',archived)
 const proof=[]
 for(const fixture of [
  {name:'Digest old failed control',date:addDays(monday,-8),time:'09:00',state:'Failed'},
  {name:'Digest seven-day boundary failure',date:addDays(monday,-7),time:'09:00',state:'Failed'},
  {name:'Digest recent failure',date:addDays(monday,-7),time:'09:01',state:'Failed'},
  {name:'Digest successful run control',date:addDays(monday,-7),time:'09:02',state:'Succeeded'},
 ]) {
  // 09:00 in Kathmandu is the independent seven-day cutoff, inclusive.
  // Author a daily definition and disable it after the controlled occurrence.
  const local=fixture.date+'T'+fixture.time+':00.000+05:45',at=new Date(local).toISOString()
  const definition=await command('launch.automation.save',{definition:{name:fixture.name,enabled:true,trigger:{kind:'schedule',localRule:`daily ${fixture.time}`,timezone:'Asia/Kathmandu'},actions:fixture.state==='Failed'?
   [{command:'send-email',input:{operatorId:owner,subjectId:campaign.id,title:'synthetic-cradle-130 refused automation',body:'Definitive network-edge refusal'}}]:
   [{command:'add-activity',input:{campaignId:campaign.id,message:'Digest successful run control completed'}}]}})
  // Tick accepts a local wall time and supplies the corresponding UTC instant.
  const scheduled=await tick(fixture.date+'T'+fixture.time+':00.000Z')
  assert.equal(scheduled.outcome,'ok',fixture.name+' emitted cron completes')
  const response=await fetch(h.origin+`/api/automations/${definition.id}/runs`,{headers:{cookie:h.cookie}})
  assert.equal(response.status,200)
  const {runs}=await response.json()
  assert.equal(runs.length,1,fixture.name+' must have one actual execution')
  const run=runs[0]
  assert.equal(run.state,fixture.state,fixture.name)
  assert.equal(run.finishedAt,at,fixture.name+' finishes on the supplied scheduler clock')
  if(fixture.state==='Failed')assert.equal(run.errorCode,'provider_refused',fixture.name+' fails at the transport edge')
  await command('launch.automation.disable',{id:definition.id},expected('automation',definition))
  proof.push({name:fixture.name,id:run.id,state:run.state,finishedAt:run.finishedAt})
 }
 const activity=await fetch(h.origin+`/api/campaigns/${campaign.id}`,{headers:{cookie:h.cookie}})
 assert.equal(activity.status,200)
 assert.ok((await activity.json()).activity.some(row=>row.description==='Digest successful run control completed'))
 return proof
}

// Expected message lines are authored separately from production queries and
// readbacks. Exact section equality also detects leaked exclusion controls.
export function assertDigestSections(text,date,recent=true) {
 // The mail transport prepends its subject before the projected digest title.
 const sections=text.split('\n\n').slice(1)
 // The fixture's launch dates stay fixed while later weekly mail is observed.
 const original=new Date(Date.parse(date+'T00:00:00Z')-(recent?0:21)*86400000).toISOString().slice(0,10)
 const day30=new Date(Date.parse(original+'T00:00:00Z')+30*86400000).toISOString().slice(0,10)
 const day31=new Date(Date.parse(original+'T00:00:00Z')+31*86400000).toISOString().slice(0,10)
 const expected=[
  ['Active campaigns',`Scheduled held-out campaign: ${original}`,`Included at thirty days: ${day30}`,`Outside thirty days: ${day31}`],
  ['Launches in the next 30 days',...(recent?[`Scheduled held-out campaign: ${original}`,`Included at thirty days: ${day30}`]:[`Included at thirty days: ${day30}`,`Outside thirty days: ${day31}`])],
  ['Open High and Critical risks','Digest open High risk: High','Digest open Critical risk: Critical'],
  ['Unresolved decisions','Digest awaiting approval: Awaiting approval','Digest in review: In review'],
  ['Runs failed in the previous 7 days',...(recent?['Digest seven-day boundary failure: Failed','Digest recent failure: Failed']:['None'])],
 ]
 assert.equal(sections.length,expected.length,'All five digest sections must be delivered')
 for(const [index,lines]of expected.entries()) {
  const [heading,...items]=sections[index].split('\n')
  assert.equal(heading,lines[0])
  assert.deepEqual(items.sort(),lines.slice(1).sort(),heading+' exact delivered items')
 }
}

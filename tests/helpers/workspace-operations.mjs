import './typescript-loader.mjs'
import assert from 'node:assert/strict'
const {createUlid}=await import('../../src/core/shared/ids.ts')
const {LAUNCH_APP_ID,launchEntities}=await import('../../src/apps/launch/contracts.ts')
const {parseCsv}=await import('../../src/domains/portability/csv.ts')

/** Workspace changes through admitted HTTP; scheduled effects use the emitted Worker. */
export async function workspaceOperations(h,cookie){
 const headers={cookie},csrf=(await(await h.request('/auth/csrf',{headers})).json()).csrfToken
 const read=async path=>{const response=await h.request(path,{headers});assert.equal(response.status,200,await response.clone().text());return response.json()}
 const command=async(action,input,expected=[],status=200)=>{const response=await h.post('/api/v1/commands/'+action,{commandId:createUlid(),input,expected},{cookie,'x-csrf-token':csrf});assert.equal(response.status,status,await response.clone().text());const reply=await response.json();if(status===200){assert.equal(reply.data.state,'committed');return reply.data.value}return reply}
 const change=async changes=>command('settings.update',{version:(await read('/api/v1/settings')).data.version,changes})
 const initial=(await read('/api/settings')).settings
 for(const changes of [{timezone:'Mars/Olympus'},{timezone:'+05:45'},{currency:'ZZZ'},{currency:'usd'}]){
  await command('settings.update',{version:initial.version,changes},[],400)
  assert.deepEqual((await read('/api/settings')).settings.workspace,initial.workspace,'Rejected settings must not change the workspace')
 }
 const owner=(await h.db.prepare('SELECT id FROM operators WHERE active=1 ORDER BY created_at LIMIT 1').first()).id
 const monday=new Date(Date.now()+14*86400000);monday.setUTCHours(0,0,0,0);while(monday.getUTCDay()!==1)monday.setUTCDate(monday.getUTCDate()+1)
 const day=monday.toISOString().slice(0,10),previous=new Date(monday.getTime()-7*86400000).toISOString().slice(0,10)
 const campaigns=[]
 for(const [code,budgetMinor,spendMinor]of [['MONEY-A',123456,34567],['MONEY-B',98765,12000]])campaigns.push(await command('launch.campaign.create',{fields:{code,name:code,ownerId:owner,startDate:previous,launchDate:day,objective:'Workspace operations proof',statusSummary:'Ready',phase:'Planning',status:'On track',health:50,budgetMinor,spendMinor,tags:[],customFields:{}}}))
 const lens=await command('launch.lens.save',{definition:{name:'Workspace amounts',description:'Budget and spend',recordType:'Campaign',conditions:[],sort:{field:'code',direction:'asc'},fields:['code','budgetMinor','spendMinor'],display:'Grid'}})
 const stored=async()=> (await h.db.prepare('SELECT id,created_at,updated_at,budget_minor,spend_minor FROM campaigns ORDER BY code').all()).results
 const original=await stored()
 for(const [currency,scale]of [['AUD',2],['USD',2],['JPY',0],['KWD',3]]){
  await change({currency})
  assert.equal((await read('/api/settings')).settings.workspace.currency,currency)
  const rows=(await read('/api/campaigns')).items
  assert.deepEqual(rows.map(row=>[row.code,row.budgetMinor,row.spendMinor]).sort(),[['MONEY-A',123456,34567],['MONEY-B',98765,12000]])
  assert.equal(rows.reduce((sum,row)=>sum+row.budgetMinor,0),222221)
  assert.equal(rows.reduce((sum,row)=>sum+row.spendMinor,0),46567)
  const exported=await read('/api/exports/csv?source=lens&lensId='+lens.id),csv=parseCsv(new TextEncoder().encode(exported.csv))
  assert.equal(exported.currency,currency);assert.ok(exported.filename.includes(currency))
  assert.deepEqual(csv.headers.slice(1),[`Budget (${currency})`,`Spend (${currency})`])
  const minor=value=>BigInt(value.replace('.',''))
  assert.deepEqual(csv.rows.map(row=>row.slice(1).map(minor)),[[123456n,34567n],[98765n,12000n]])
  assert.ok(csv.rows.every(row=>row.slice(1).every(value=>scale?new RegExp('^\\d+\\.\\d{'+scale+'}$').test(value):/^\d+$/.test(value))))
  assert.equal(csv.rows.reduce((sum,row)=>sum+minor(row[1]),0n),222221n)
  assert.equal(csv.rows.reduce((sum,row)=>sum+minor(row[2]),0n),46567n)
  const grid=await read('/api/exports/csv?source=grid&view=all')
  assert.equal(grid.currency,currency);assert.deepEqual(parseCsv(new TextEncoder().encode(grid.csv)).rows.map(row=>minor(row[4])).sort(),[98765n,123456n].sort())
  assert.deepEqual(await stored(),original,'Currency relabel must preserve all stored amounts and UTC timestamps')
 }
 await change({timezone:'UTC',quietHoursStart:'00:00',quietHoursEnd:'00:00'})
 const automations=(await h.db.prepare("SELECT id,version,shipped_key FROM automations WHERE shipped_key IN ('launch-readiness','weekly-digest') ORDER BY shipped_key").all()).results
 const expected=row=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities.automation,recordId:row.id},version:row.version}]
 const digest=automations.find(row=>row.shipped_key==='weekly-digest')
 await command('launch.automation.enable',{id:digest.id},expected(digest))
 await command('launch.milestone.create',{fields:{campaignId:campaigns[0].id,title:'Timezone launch',ownerId:owner,type:'Launch',status:'Not started',startDate:day,endDate:null,conflictReason:null}})
 const tick=async at=>(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.parse(at)})
 // A real accepted digest provides immutable sent history before the timezone edit.
 await tick(previous+'T09:00:00.000Z')
 const sent=(await h.db.prepare("SELECT * FROM channel_deliveries WHERE state='accepted' ORDER BY id").all()).results
 assert.ok(sent.length,'The emitted schedule must send a digest before the workspace change')
 const ownerSchedules=[]
 for(const localRule of ['daily 08:00','weekly 1 08:00'])ownerSchedules.push(await command('launch.automation.save',{definition:{name:`Workspace schedule ${localRule}`,enabled:true,trigger:{kind:'schedule',localRule,timezone:'UTC'},actions:[{command:'add-activity',input:{campaignId:campaigns[0].id,message:'Owner-authored workspace schedule'}}]}}))
 const ownerRuns=async id=>(await h.db.prepare('SELECT * FROM automation_runs WHERE automation_id=? ORDER BY id').bind(id).all()).results
 const definitionsBefore=(await h.db.prepare('SELECT * FROM automations ORDER BY id').all()).results
 await tick(previous+'T08:00:00.000Z')
 for(const schedule of ownerSchedules)assert.equal((await ownerRuns(schedule.id)).length,1,'Owner schedule initially fires at 08:00 UTC')
 const runs=async()=> (await h.db.prepare('SELECT * FROM automation_runs ORDER BY id').all()).results
 const priorRuns=await runs(),mailCount=h.deliveries.length
 await tick(day+'T02:15:00.000Z')
 assert.deepEqual(await runs(),priorRuns,'08:00 UTC readiness has not fired at 02:15 UTC')
 const queuedCommand=createUlid(),risk=await h.post('/api/v1/commands/launch.risk.create',{commandId:queuedCommand,expected:[],input:{fields:{campaignId:campaigns[0].id,ownerId:owner,title:'Queued supplier escalation',severity:'Critical',signal:'Supplier confirmation is late',mitigation:'Owner review',dueDate:null}}},{cookie,'x-csrf-token':csrf})
 assert.equal(risk.status,200,await risk.clone().text())
 const riskId=(await risk.json()).data.value.id
 await(await h.runtime.getWorker()).queue('cradle-work',[{id:'timezone-queued-event',timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId:queuedCommand}}])
 const existingRuns=await runs()
 assert.ok(existingRuns.some(run=>run.subject_id===riskId&&run.state==='Queued'),'OPS-003 preservation fixture has a real queued run')
 const queueBefore=(await h.db.prepare('SELECT * FROM admission_outbox ORDER BY id').all()).results
 assert.ok(queueBefore.some(entry=>entry.action==='launch.automation.execute'&&entry.state==='pending'),'OPS-003 preservation fixture has admitted pending work')
 await change({timezone:'Asia/Kathmandu'})
 assert.deepEqual(await stored(),original,'Timezone changes leave persisted UTC timestamps untouched')
 assert.deepEqual((await h.db.prepare("SELECT * FROM channel_deliveries WHERE state='accepted' ORDER BY id").all()).results,sent,'Sent email history is byte-identical')
 for(const row of existingRuns)assert.deepEqual((await runs()).find(current=>current.id===row.id),row,'Existing runs are not rescheduled')
 for(const row of queueBefore)assert.deepEqual(await h.db.prepare('SELECT * FROM admission_outbox WHERE id=?').bind(row.id).first(),row,'Already queued work is unchanged')
 assert.equal(h.deliveries.length,mailCount,'Changing a timezone sends no email')
 assert.deepEqual((await h.db.prepare('SELECT * FROM automations ORDER BY id').all()).results,definitionsBefore,'Workspace timezone edits leave saved definitions and their UTC timestamps byte-identical')
 const monitor=(await read('/api/automations')).automations
 for(const schedule of ownerSchedules)assert.ok(monitor.find(row=>row.id===schedule.id).trigger.includes('Asia/Kathmandu'),'Owner schedule monitor names its effective workspace timezone')
 await tick(day+'T02:15:00.000Z')
 const readiness=(await h.db.prepare("SELECT * FROM automation_runs WHERE automation_id=(SELECT id FROM automations WHERE shipped_key='launch-readiness') AND trigger_key=?").bind('schedule:'+day).all()).results
 assert.equal(readiness.length,1,'Readiness next fire moves to 08:00 in the new workspace timezone')
 for(const schedule of ownerSchedules){const shifted=await ownerRuns(schedule.id);assert.equal(shifted.length,2,'Owner-authored daily and weekly next fire moves to 08:00 in the new workspace timezone');assert.equal(shifted.filter(run=>run.trigger_key==='schedule:'+day).length,1)}
 const countDigest=async()=>Number((await h.db.prepare("SELECT count(*) n FROM channel_deliveries WHERE kind='weekly-digest'").first()).n)
 const oldDigests=await countDigest()
 await tick(day+'T03:14:59.000Z');assert.equal(await countDigest(),oldDigests)
 await tick(day+'T03:15:00.000Z');assert.equal(await countDigest(),oldDigests+1,'Digest next fire moves to Monday 09:00 in the new workspace timezone')
 await tick(day+'T08:00:00.000Z')
 for(const schedule of ownerSchedules)assert.equal((await ownerRuns(schedule.id)).length,2,'The old explicit-zone fire time creates no extra owner-authored run')
 await tick(day+'T09:00:00.000Z');assert.equal(await countDigest(),oldDigests+1,'The old workspace fire time creates no extra digest')
 assert.deepEqual((await h.db.prepare("SELECT * FROM channel_deliveries WHERE id IN ("+sent.map(()=>'?').join(',')+") ORDER BY id").bind(...sent.map(row=>row.id)).all()).results,sent)
 await change({currency:initial.workspace.currency,timezone:initial.workspace.timezone})
}

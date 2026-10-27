import assert from 'node:assert/strict'
import { createUlid,LAUNCH_APP_ID,launchEntities } from './launch-authority-runtime.mjs'

const tables=['campaigns','deliverables','milestones','risks','decisions','evidence_comments','lenses','launch_custom_fields','launch_custom_values','campaign_tags','milestone_dependencies','automations','automation_runs','launch_automation_actions','workspace','workspace_settings','sample_installations','launch_sample_records','notifications','channel_notifications','channel_deliveries','channel_events','activity_entries','admission_audit','admission_events','admission_outbox','command_admissions']
async function snapshot(db){const rows=await db.batch(tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY 1`)));return rows.map(row=>row.results)}
const expected=(kind,row)=>[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[kind],recordId:row.id},version:row.version}]

/** VIEW-006: real HTTP admissions, including stale composite commands and competing writers. */
export async function verifyConcurrencyClauses(h) {
 const raw=async(action,input,revisions=[])=>{
  const response=await h.request(h.ownerSession,`/api/v1/commands/${action}`,{method:'POST',body:JSON.stringify({commandId:createUlid(),input,expected:revisions})})
  return {status:response.status,body:await response.json()}
 }
 const command=async(action,input,revisions=[])=>{const r=await raw(action,input,revisions);assert.equal(r.status,200,`${action}: ${JSON.stringify(r.body)}`);assert.equal(r.body.data.state,'committed');return r.body.data.value}
 const read=async route=>{const response=await h.request(h.ownerSession,route);assert.equal(response.status,200,route);return response.json()}
 const stale=async(action,input,revisions,version)=>{
  const before=await snapshot(h.db),result=await raw(action,input,revisions)
  assert.equal(result.status,409,`${action}: ${JSON.stringify(result.body)}`)
  assert.equal(result.body.error.code,'version_conflict')
  assert.match(result.body.error.message,new RegExp(`current version ${version}(?:\\D|$)`))
  assert.equal(result.body.error.currentVersion,version)
  assert.deepEqual(await snapshot(h.db),before,`${action} stale admission changes no product, audit, event or outbox row`)
 }
 const campaignFields={code:'CONCURRENT-'+createUlid().slice(-6),name:'Concurrent operations',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2026-12-01',objective:'Versioned edits',statusSummary:'',phase:'Planning',status:'On track',health:70,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}
 let campaign=await command('launch.campaign.create',{fields:campaignFields})
 for(const [kind,fields,changes] of [
  ['campaign',null,{statusSummary:'Current campaign'}],
  ['deliverable',{campaignId:campaign.id,title:'Versioned deliverable',ownerId:h.owner,dueDate:null},{title:'Current deliverable'}],
  ['milestone',{campaignId:campaign.id,title:'Versioned milestone',ownerId:h.owner,type:'Review',status:'Not started',startDate:'2026-12-01',endDate:null,conflictReason:null},{title:'Current milestone'}],
  ['risk',{campaignId:campaign.id,title:'Versioned risk',ownerId:h.owner,severity:'Low',dueDate:null,signal:'Known risk',mitigation:'Review'},{title:'Current risk'}],
  ['decision',{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Versioned decision',requesterId:h.owner,assigneeId:null,priority:'Low',dueAt:'2026-12-01T00:00:00.000Z',recommendation:'Review',impact:''},{title:'Current decision'}],
 ]) {
  const old=fields?await command(`launch.${kind}.create`,{fields}):campaign
  const updated=await command(`launch.${kind}.patch`,{id:old.id,changes},expected(kind,old))
  await stale(`launch.${kind}.patch`,{id:old.id,changes},expected(kind,old),updated.version)
  if(kind==='campaign')campaign=updated
 }
 const field=await command('launch.custom-field.save',{field:{name:'Concurrent field',type:'text'}})
 const updatedField=await command('launch.custom-field.save',{id:field.id,field:{name:'Current field',type:'text'}},expected('customField',field))
 await stale('launch.custom-field.delete',{id:field.id,confirmedAffectedCount:0},expected('customField',field),updatedField.version)
 const lensDefinition={name:'Concurrent lens',description:'Versioned definition',recordType:'Campaign',conditions:[],sort:{field:'name',direction:'asc'},fields:['name'],display:'Grid'}
 const lens=await command('launch.lens.save',{definition:lensDefinition})
 const updatedLens=await command('launch.lens.save',{id:lens.id,definition:{...lensDefinition,name:'Current concurrent lens'}},expected('lens',lens))
 await stale('launch.lens.delete',{id:lens.id},expected('lens',lens),updatedLens.version)
 const definition={name:'Concurrent automation',enabled:false,trigger:{kind:'event',event:'comment.created.v1'},actions:[{command:'add-activity',input:{campaignId:campaign.id,message:'Versioned automation'}}]}
 const automation=await command('launch.automation.save',{definition})
 const updatedAutomation=await command('launch.automation.save',{id:automation.id,definition:{...definition,name:'Current automation'}},expected('automation',automation))
 await stale('launch.automation.disable',{id:automation.id},expected('automation',automation),updatedAutomation.version)

 const settings=(await read('/api/v1/settings')).data
 const updatedSettings=await command('settings.update',{version:settings.version,changes:{workspaceName:'Concurrent workspace'}})
 await stale('settings.update',{version:settings.version,changes:{workspaceName:'Stale workspace'}},[],updatedSettings.version)
 // Changing the readiness definition does not advance workspace_settings.version.
 const beforeReadiness=(await read('/api/v1/settings')).data
 const readiness=await h.db.prepare("SELECT id,version FROM automations WHERE shipped_key='launch-readiness'").first()
 assert.ok(readiness,'The installed readiness definition supplies the independently versioned configuration')
 const paused=await command('launch.automation.disable',{id:readiness.id},expected('automation',readiness))
 await stale('settings.update',{version:beforeReadiness.version,changes:{readinessVersion:beforeReadiness.readinessVersion,readinessLeadDays:6}},[],paused.version)
 await command('settings.update',{version:beforeReadiness.version,changes:{readinessVersion:paused.version,readinessLeadDays:6}})

 const install=await command('launch.samples.install',{})
 const listed=(await read('/api/v1/launch/samples')).data.items.find(item=>item.id===install.installationId)
 assert.ok(listed.revisions.length>0)
 const sample=listed.revisions.find(revision=>revision.ref.entityId===launchEntities.campaign)
 const changed=await command('launch.campaign.patch',{id:sample.ref.recordId,changes:{statusSummary:'Edited sample'}},[sample])
 await stale('launch.samples.remove',{installationId:install.installationId},listed.revisions,changed.version)
 const currentSamples=(await read('/api/v1/launch/samples')).data.items.find(item=>item.id===install.installationId)
 const before=await snapshot(h.db),edited=await raw('launch.samples.remove',{installationId:install.installationId},currentSamples.revisions)
 assert.equal(edited.status,400);assert.match(edited.body.error.message,/Sample data was edited/);assert.deepEqual(await snapshot(h.db),before)
 const clean=await command('launch.samples.install',{}),review=(await read('/api/v1/launch/samples')).data.items.find(item=>item.id===clean.installationId)
 await stale('launch.samples.remove',{installationId:clean.installationId},[],review.revisions[0].version)
 await command('launch.samples.remove',{installationId:clean.installationId},review.revisions)

 const bulk=await command('launch.bulk.apply',{recordType:'Campaign',ids:[campaign.id],change:{kind:'field',field:'status',value:'At risk'}},expected('campaign',campaign))
 const afterBulk=(await read(`/api/campaigns/${campaign.id}`)).campaign
 await stale('launch.bulk.apply',{recordType:'Campaign',ids:[campaign.id],change:{kind:'field',field:'status',value:'Blocked'}},expected('campaign',campaign),afterBulk.version)
 campaign=await command('launch.campaign.patch',{id:campaign.id,changes:{statusSummary:'Later than bulk'}},expected('campaign',afterBulk))
 await stale('launch.bulk.undo',{bulkId:bulk.bulkId},[],campaign.version)
 const reversible=await command('launch.bulk.apply',{recordType:'Campaign',ids:[campaign.id],change:{kind:'field',field:'status',value:'On track'}},expected('campaign',campaign))
 await command('launch.bulk.undo',{bulkId:reversible.bulkId})
 campaign=(await read(`/api/campaigns/${campaign.id}`)).campaign

 // A real pair of HTTP writes competes for the same revision. Exactly one succeeds.
 const raced=await Promise.all(['First concurrent edit','Second concurrent edit'].map(statusSummary=>raw('launch.campaign.patch',{id:campaign.id,changes:{statusSummary}},expected('campaign',campaign))))
 assert.deepEqual(raced.map(result=>result.status).sort(),[200,409])
 const winner=raced.find(result=>result.status===200).body.data.value,loser=raced.find(result=>result.status===409)
 assert.equal(loser.body.error.currentVersion,winner.version)
 assert.match(loser.body.error.message,new RegExp(`current version ${winner.version}`))
 assert.equal((await read(`/api/campaigns/${campaign.id}`)).campaign.summary,winner.statusSummary)

 await verifyRetryVersions(h,{command,raw,read,stale,campaign:winner})
}

async function verifyRetryVersions(h,{command,read,stale,campaign}) {
 // A saved action whose referenced campaign was deleted fails without a network call.
 const target=await command('launch.campaign.create',{fields:{code:'RETRY-TARGET-'+createUlid().slice(-6),name:'Temporary action target',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2026-12-01',objective:'Retry evidence',statusSummary:'',phase:'Planning',status:'On track',health:70,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const automation=await command('launch.automation.save',{definition:{name:'Retry version evidence',enabled:true,trigger:{kind:'event',event:'campaign.updated.v1'},actions:[{command:'add-activity',input:{campaignId:target.id,message:'Action target must still exist'}}]}})
 await command('launch.campaign.delete',{id:target.id,confirmationCode:target.code},expected('campaign',target))
 const commandId=createUlid(),response=await h.request(h.ownerSession,'/api/v1/commands/launch.campaign.patch',{method:'POST',body:JSON.stringify({commandId,expected:expected('campaign',campaign),input:{id:campaign.id,changes:{statusSummary:'Trigger failed step'}}})})
 assert.equal(response.status,200)
 const worker=await h.runtime.getWorker()
 await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.launch.events.v1',commandId}}])
 const queued=(await read(`/api/automations/${automation.id}/runs`)).runs
 assert.equal(queued.length,1)
 const outbox=await h.db.prepare("SELECT id FROM admission_outbox WHERE action='launch.automation.execute' AND json_extract(input_json,'$.runId')=?").bind(queued[0].id).first()
 assert.ok(outbox)
 await worker.queue('cradle-work',[{id:createUlid(),timestamp:Date.now(),attempts:1,body:{kind:'cradle.outbox.v1',outboxId:outbox.id}}])
 const runs=(await read(`/api/automations/${automation.id}/runs`)).runs
 assert.equal(runs.length,1);const failed=runs[0];assert.equal(failed.state,'Failed')
 assert.ok(failed.version>1)
 await stale('launch.automation.retry',{runId:failed.id,version:failed.version-1},[],failed.version)
 const original=await h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(failed.id).first()
 const retry=await command('launch.automation.retry',{runId:failed.id,version:failed.version})
 assert.equal(retry.retryOf,failed.id)
 assert.deepEqual(await h.db.prepare('SELECT * FROM automation_runs WHERE id=?').bind(failed.id).first(),original,'Retry preserves original run history')
}

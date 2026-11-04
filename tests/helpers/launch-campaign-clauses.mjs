import {recordComment,recordThread} from './record-comment-command.mjs'
import assert from 'node:assert/strict'
import { mutationSnapshot } from './launch-write-context.mjs'
import { LAUNCH_APP_ID, launchEntities, launchFieldIds } from './launch-authority-runtime.mjs'

// Exercise the emitted Worker's command and query doors independently of the
// retained handler matrix below. Every patch uses the version just read over HTTP.
export async function verifyPublicCampaignValidation(h) {
 const read = async route => {
  const response = await h.request(h.ownerSession, route), body = await response.json()
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
  return body
 }
 const command = async (action, input, expected = []) => {
  const commandId = h.r.createUlid()
  const response = await h.request(h.ownerSession, `/api/v1/commands/launch.${action}`, {
   method: 'POST', body: JSON.stringify({ commandId, input, expected }),
  })
  return { response, body: await response.json(), commandId }
 }
 const commit = async (action, input, expected = []) => {
  const { response, body } = await command(action, input, expected)
  assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`)
  assert.equal(body.data.state, 'committed')
  return body.data.value
 }
 const fields = code => ({ code, name: 'Native validation campaign', ownerId: h.actor,
  startDate: '2026-10-01', launchDate: '2026-12-01', objective: 'Validate before committing',
  statusSummary: '', phase: 'Planning', status: 'On track', health: 50,
  budgetMinor: 100, spendMinor: 25, tags: [], customFields: {} })
 const campaign = await commit('campaign.create', { fields: fields('synthetic-cradle-149a') })
 const other = await commit('campaign.create', { fields: fields('synthetic-cradle-149b') })
 const detail = id => read(`/api/campaigns/${id}`)
 const snapshot = () => mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 const refuse = async (action, input, id, field) => {
  const before = await detail(id), control = await detail(other.id)
  assert.ok((await read('/api/campaigns?limit=200')).items.some(row => row.id === id), 'Required-field refusals concern a listed active campaign')
  assert.ok(before.campaign.version > campaign.version, 'Refusals use the current version after accepted edits')
  const { response, body } = await command(action, input,
   action === 'campaign.patch' ? h.expected('campaign', before.campaign) : [])
  assert.equal(response.status, 400, `${field}: ${JSON.stringify(body)}`)
  assert.equal(body.error.code, 'validation', 'A current version must reach validation, not a conflict shortcut')
  assert.ok(body.error.issues?.some(issue => issue.path.split('.').at(-1) === field)
   || new RegExp(`\\b${field}\\b`, 'i').test(body.error.message), `${field} must be named in the public validation error`)
  assert.deepEqual(await detail(id), before, `${field} refusal preserves public records, versions and activity`)
  assert.deepEqual(await detail(other.id), control, `${field} refusal preserves the unrelated campaign`)
  assert.deepEqual(await snapshot(), persisted, `${field} refusal admits no persisted effects`)
 }
 for (const health of [0, 100]) {
  const before = await detail(campaign.id)
  await commit('campaign.patch', { id: campaign.id, changes: { health, budgetMinor: 0, spendMinor: 0 } }, h.expected('campaign', before.campaign))
  const after = await detail(campaign.id)
  assert.equal(after.campaign.health, health)
  assert.equal(after.campaign.budgetMinor, 0); assert.equal(after.campaign.spendMinor, 0)
  assert.equal(after.campaign.version, before.campaign.version + 1)
 }
 // Each refusal must preserve this same admitted state; comparing after every
 // attempt also catches any earlier refusal that erroneously admitted an effect.
 const persisted = await snapshot()
 for (const [changes, field] of [
  [{ launchDate: '2026-09-30' }, 'launchDate'],
  [{ health: -1 }, 'health'], [{ health: 101 }, 'health'], [{ health: 1.5 }, 'health'],
  [{ budgetMinor: -1 }, 'budgetMinor'], [{ spendMinor: -1 }, 'spendMinor'],
  [{ ownerId: null }, 'ownerId'], [{ startDate: null }, 'startDate'], [{ launchDate: null }, 'launchDate'],
  [{ code: '  SYNTHETIC-cradle-149B  ' }, 'code'],
 ]) await refuse('campaign.patch', { id: campaign.id, changes }, campaign.id, field)
 await refuse('campaign.create', { fields: fields('  SYNTHETIC-cradle-149B  ') }, campaign.id, 'code')

 const before = await detail(campaign.id)
 await commit('campaign.patch', { id: campaign.id, changes: { code: '  synthetic-cradle-149c  ' } }, h.expected('campaign', before.campaign))
 const after = await detail(campaign.id)
 assert.equal(after.campaign.code, 'synthetic-cradle-149c')
 assert.equal(after.campaign.version, before.campaign.version + 1)
 const listed = (await read('/api/campaigns?limit=200')).items.find(row => row.id === campaign.id)
 assert.equal(listed.code, 'synthetic-cradle-149c'); assert.equal(listed.health, 100)
 assert.equal(listed.budgetMinor, 0); assert.equal(listed.spendMinor, 0)
}

// Exercise the emitted Worker's command and query doors independently of the
// retained handler matrix below. Every patch uses the version just read over HTTP.
export async function verifyPublicCampaignValidation(h) {
 const read = async route => {
  const response = await h.request(h.ownerSession, route), body = await response.json()
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(body)}`)
  return body
 }
 const command = async (action, input, expected = []) => {
  const commandId = h.r.createUlid()
  const response = await h.request(h.ownerSession, `/api/v1/commands/launch.${action}`, {
   method: 'POST', body: JSON.stringify({ commandId, input, expected }),
  })
  return { response, body: await response.json(), commandId }
 }
 const commit = async (action, input, expected = []) => {
  const { response, body } = await command(action, input, expected)
  assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`)
  assert.equal(body.data.state, 'committed')
  return body.data.value
 }
 const fields = code => ({ code, name: 'Native validation campaign', ownerId: h.actor,
  startDate: '2026-10-01', launchDate: '2026-12-01', objective: 'Validate before committing',
  statusSummary: '', phase: 'Planning', status: 'On track', health: 50,
  budgetMinor: 100, spendMinor: 25, tags: [], customFields: {} })
 const campaign = await commit('campaign.create', { fields: fields('synthetic-cradle-149a') })
 const other = await commit('campaign.create', { fields: fields('synthetic-cradle-149b') })
 const detail = id => read(`/api/campaigns/${id}`)
 const snapshot = () => mutationSnapshot(h.db, { omitSessionReadTimestamp: true })
 const refuse = async (action, input, id, field) => {
  const before = await detail(id), control = await detail(other.id)
  assert.ok((await read('/api/campaigns?limit=200')).items.some(row => row.id === id), 'Required-field refusals concern a listed active campaign')
  assert.ok(before.campaign.version > campaign.version, 'Refusals use the current version after accepted edits')
  const { response, body } = await command(action, input,
   action === 'campaign.patch' ? h.expected('campaign', before.campaign) : [])
  assert.equal(response.status, 400, `${field}: ${JSON.stringify(body)}`)
  assert.equal(body.error.code, 'validation', 'A current version must reach validation, not a conflict shortcut')
  assert.ok(body.error.issues?.some(issue => issue.path.split('.').at(-1) === field)
   || new RegExp(`\\b${field}\\b`, 'i').test(body.error.message), `${field} must be named in the public validation error`)
  assert.deepEqual(await detail(id), before, `${field} refusal preserves public records, versions and activity`)
  assert.deepEqual(await detail(other.id), control, `${field} refusal preserves the unrelated campaign`)
  assert.deepEqual(await snapshot(), persisted, `${field} refusal admits no persisted effects`)
 }
 for (const health of [0, 100]) {
  const before = await detail(campaign.id)
  await commit('campaign.patch', { id: campaign.id, changes: { health, budgetMinor: 0, spendMinor: 0 } }, h.expected('campaign', before.campaign))
  const after = await detail(campaign.id)
  assert.equal(after.campaign.health, health)
  assert.equal(after.campaign.budgetMinor, 0); assert.equal(after.campaign.spendMinor, 0)
  assert.equal(after.campaign.version, before.campaign.version + 1)
 }
 // Each refusal must preserve this same admitted state; comparing after every
 // attempt also catches any earlier refusal that erroneously admitted an effect.
 const persisted = await snapshot()
 for (const [changes, field] of [
  [{ launchDate: '2026-09-30' }, 'launchDate'],
  [{ health: -1 }, 'health'], [{ health: 101 }, 'health'], [{ health: 1.5 }, 'health'],
  [{ budgetMinor: -1 }, 'budgetMinor'], [{ spendMinor: -1 }, 'spendMinor'],
  [{ ownerId: null }, 'ownerId'], [{ startDate: null }, 'startDate'], [{ launchDate: null }, 'launchDate'],
  [{ code: '  SYNTHETIC-cradle-149B  ' }, 'code'],
 ]) await refuse('campaign.patch', { id: campaign.id, changes }, campaign.id, field)
 await refuse('campaign.create', { fields: fields('  SYNTHETIC-cradle-149B  ') }, campaign.id, 'code')

 const before = await detail(campaign.id)
 await commit('campaign.patch', { id: campaign.id, changes: { code: '  synthetic-cradle-149c  ' } }, h.expected('campaign', before.campaign))
 const after = await detail(campaign.id)
 assert.equal(after.campaign.code, 'synthetic-cradle-149c')
 assert.equal(after.campaign.version, before.campaign.version + 1)
 const listed = (await read('/api/campaigns?limit=200')).items.find(row => row.id === campaign.id)
 assert.equal(listed.code, 'synthetic-cradle-149c'); assert.equal(listed.health, 100)
 assert.equal(listed.budgetMinor, 0); assert.equal(listed.spendMinor, 0)
}

export async function verifyCampaignClauses(h) {
 await verifyPublicCampaignValidation(h)
 const {db,commit,prepare,expected,actor,r,ctx}=h
 const reader=r.createLaunchReader(db,h.policy)
 const read=async(path,session=h.ownerSession)=>{const response=await h.request(session,path);assert.equal(response.status,200,await response.clone().text());return response.json()}
 const command=async(action,input,revisions=[],session=h.ownerSession)=>{
  const response=await h.request(session,`/api/v1/commands/launch.${action}`,{method:'POST',body:JSON.stringify({commandId:r.createUlid(),input,expected:revisions})})
  assert.equal(response.status,200,await response.clone().text())
  const receipt=await response.json();assert.equal(receipt.data.state,'committed');return receipt.data.value
 }
 let campaign=await h.campaign('CLAUSE-CAMPAIGN')
 const unchanged=async(action,input,revisions,field)=>{
  const before=await mutationSnapshot(db)
  await assert.rejects(async()=>commit(action,input,revisions),error=>{
   if(error.issues)assert.ok(error.issues.some(issue=>issue.path.includes(field)),`${field} must be named in validation`)
   else assert.match(error.message,new RegExp(field,'i'))
   return true
  })
  assert.deepEqual(await mutationSnapshot(db),before,`${field} validation changes nothing`)
 }
 for(const [changes,field] of [
  [{launchDate:'2025-12-31'},'launchDate'],[{health:-1},'health'],[{health:101},'health'],[{health:1.5},'health'],
  [{budgetMinor:-1},'budgetMinor'],[{spendMinor:-1},'spendMinor'],[{ownerId:null},'ownerId'],
  [{startDate:null},'startDate'],[{launchDate:null},'launchDate'],
 ])await unchanged('campaign.patch',{id:campaign.id,changes},expected('campaign',campaign),field)
 for(const health of [0,100])campaign=await commit('campaign.patch',{id:campaign.id,changes:{health,budgetMinor:0,spendMinor:0}},expected('campaign',campaign))
 campaign=await commit('campaign.patch',{id:campaign.id,changes:{code:'  Clause-Campaign  '}},expected('campaign',campaign))
 assert.equal(campaign.code,'Clause-Campaign')
 const other=await h.campaign('CLAUSE-OTHER')
 await unchanged('campaign.patch',{id:other.id,changes:{code:'  cLaUsE-cAmPaIgN  '}},expected('campaign',other),'code')
 await unchanged('campaign.create',{fields:{...Object.fromEntries(Object.keys(r.campaignFields.shape).map(key=>[key,key==='tags'?[]:key==='customFields'?{}:campaign[key]]))}},[],'code')

 const operator=await h.addPerson({name:'Deliverable operator'})
 let deliverable=await command('deliverable.create',{fields:{campaignId:campaign.id,title:'Prepare release notes',ownerId:actor,dueDate:null}},[],operator.session)
 assert.equal(deliverable.state,'Open');assert.equal(deliverable.campaignId,campaign.id);assert.equal(deliverable.dueDate,null)
 const created=(await read(`/api/campaigns/${campaign.id}`)).deliverables.find(row=>row.id===deliverable.id)
 assert.ok(created);assert.equal(created.title,'Prepare release notes');assert.equal(created.owner.id,actor);assert.equal(created.dueDate,null);assert.equal(created.state,'Open')
 for(const [changes,field] of [[{title:'  '},'title'],[{ownerId:null},'ownerId'],[{campaignId:null},'campaignId']])await unchanged('deliverable.patch',{id:deliverable.id,changes},expected('deliverable',deliverable),field)
 deliverable=await command('deliverable.patch',{id:deliverable.id,changes:{title:'Publish release notes',dueDate:'2026-10-21'}},expected('deliverable',created),operator.session)
 assert.equal(deliverable.title,'Publish release notes');assert.equal(deliverable.dueDate,'2026-10-21')
 const edited=(await read(`/api/campaigns/${campaign.id}`)).deliverables.find(row=>row.id===deliverable.id)
 assert.equal(edited.title,'Publish release notes');assert.equal(edited.dueDate,'2026-10-21');assert.equal(edited.version,created.version+1)
 const rollup=async(complete,total)=>{const value=await reader.get(ctx,'campaign',campaign.id);assert.equal(value.deliverableComplete,complete);assert.equal(value.deliverableTotal,total)}
 await rollup(0,1)
 for(const [action,state,complete]of [['complete','Complete',1],['reopen','Open',0]]){
  const plan=await prepare(`deliverable.${action}`,{id:deliverable.id},expected('deliverable',deliverable))
  await rollup(action==='complete'?0:1,1)
  deliverable=(await h.admission.commit(ctx,plan)).result.value
  assert.equal(deliverable.state,state)
  await rollup(complete,1)
  const activity=(await db.prepare("SELECT * FROM activity_entries WHERE subject_id=? AND field_name='state' ORDER BY rowid DESC LIMIT 1").bind(deliverable.id).first())
  assert.equal(activity.actor_id,actor);assert.equal(activity.created_at,Date.parse(ctx.now));assert.equal(activity.next_value,state)
  if(action==='complete'){assert.equal(deliverable.completedById,actor);assert.equal(deliverable.completedAt,ctx.now)}
 }
 const milestone=await commit('milestone.create',{fields:{campaignId:campaign.id,title:'Review launch notes',ownerId:actor,type:'Review',status:'Not started',startDate:'2026-10-21',endDate:null,conflictReason:null}})
 const risk=await commit('risk.create',{fields:{campaignId:campaign.id,title:'Translation delay',ownerId:actor,severity:'High',dueDate:null,signal:'Review pending',mitigation:'Book a reviewer'}})
 const decision=await commit('decision.create',{fields:{campaignId:campaign.id,riskId:null,supersedesId:null,title:'Choose launch language',requesterId:actor,assigneeId:null,priority:'High',dueAt:'2026-10-21T12:00:00.000Z',recommendation:'English first',impact:'Release scope'}})
 await recordComment(h,'comment.add',{campaignId:campaign.id,body:'Reviewer booked',mentions:[]},expected('campaign',campaign))
 const response=await h.request(h.ownerSession,`/api/campaigns/${campaign.id}`)
 assert.equal(response.status,200)
 const detail=await response.json()
 assert.equal(detail.campaign.code,campaign.code)
 assert.equal(detail.campaign.deliverableComplete,0);assert.equal(detail.campaign.deliverableTotal,1)
 assert.ok(JSON.stringify(detail).includes(milestone.id));assert.ok(JSON.stringify(detail).includes(risk.id));assert.ok(JSON.stringify(detail).includes(decision.id))
 assert.ok(JSON.stringify(await recordThread(h,expected('campaign',campaign)[0].ref)).includes('Reviewer booked'));assert.ok(JSON.stringify(detail).includes(deliverable.id))
 const activities=await db.prepare('SELECT id FROM activity_entries WHERE campaign_id=?').bind(campaign.id).all()
 for(const activity of activities.results)assert.ok(JSON.stringify(detail).includes(activity.id),'Detail contains committed campaign activity')
 const sibling=await command('deliverable.create',{fields:{campaignId:campaign.id,title:'Keep release checklist',ownerId:actor,dueDate:null}})
 const otherDeliverable=await command('deliverable.create',{fields:{campaignId:other.id,title:'Keep other campaign work',ownerId:actor,dueDate:'2026-12-01'}})
 const otherBefore=await read(`/api/campaigns/${other.id}`)
 assert.ok(otherBefore.deliverables.some(row=>row.id===otherDeliverable.id))
 // The same operator's current policy loses deletion authority while retaining
 // reads. Use a fresh public version so a stale-write refusal cannot pass this.
 const narrowed=operator.rules.map(rule=>rule.entityId===launchEntities.deliverable?{...rule,writableFields:rule.writableFields.filter(id=>id!==launchFieldIds.deliverable.title)}:rule)
 await db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(narrowed),operator.policyId).run()
 const beforeDelete=await read(`/api/campaigns/${campaign.id}`,operator.session)
 const current=beforeDelete.deliverables.find(row=>row.id===deliverable.id)
 assert.ok(current);assert.equal(current.version,deliverable.version)
 assert.equal(beforeDelete.campaign.deliverableTotal,2);assert.equal(beforeDelete.campaign.deliverableComplete,0)
 const recordPath=`/api/v1/apps/${LAUNCH_APP_ID}/entities/${launchEntities.deliverable}/records/${deliverable.id}`
 const recordBefore=await read(recordPath,operator.session)
 assert.equal(recordBefore.data.record.id,deliverable.id);assert.equal(recordBefore.data.record.version,current.version)
 const snapshot=await mutationSnapshot(db,{omitSessionReadTimestamp:true})
 const refused=await h.request(operator.session,'/api/v1/commands/launch.deliverable.delete',{method:'POST',body:JSON.stringify({commandId:r.createUlid(),input:{id:deliverable.id},expected:expected('deliverable',current)})})
 assert.equal(refused.status,403,await refused.clone().text());assert.equal((await refused.json()).error.code,'forbidden')
 assert.deepEqual(await mutationSnapshot(db,{omitSessionReadTimestamp:true}),snapshot,'Forbidden deletion changes no stored product, authority, activity, audit, admission, event or outbox row')
 assert.deepEqual((await read(recordPath,operator.session)).data.record,recordBefore.data.record,'Refused deletion preserves the publicly readable populated record')
 assert.deepEqual(await read(`/api/campaigns/${campaign.id}`),beforeDelete,'Refused deletion preserves campaign detail and counts')
 assert.deepEqual(await read(`/api/campaigns/${other.id}`),otherBefore)
 const deleted=await command('deliverable.delete',{id:deliverable.id},expected('deliverable',current))
 assert.equal(deleted.deletedId,deliverable.id)
 const absent=await h.request(h.ownerSession,recordPath)
 assert.equal(absent.status,404);assert.equal((await absent.json()).error.code,'not_found')
 const afterDelete=await read(`/api/campaigns/${campaign.id}`)
 assert.equal(afterDelete.deliverables.some(row=>row.id===deliverable.id),false)
 assert.equal(afterDelete.campaign.deliverableTotal,beforeDelete.campaign.deliverableTotal-1)
 assert.equal(afterDelete.campaign.deliverableComplete,beforeDelete.campaign.deliverableComplete)
 assert.deepEqual(afterDelete.deliverables,beforeDelete.deliverables.filter(row=>row.id!==deliverable.id),'Deletion preserves the populated sibling deliverable')
 assert.ok(afterDelete.deliverables.some(row=>row.id===sibling.id))
 for(const part of ['milestones','risks','decisions','customFields'])assert.deepEqual(afterDelete[part],beforeDelete[part],`Deletion preserves unrelated ${part}`)
 for(const activity of beforeDelete.activity)assert.deepEqual(afterDelete.activity.find(row=>row.id===activity.id),activity,'Deletion preserves prior campaign activity')
 assert.deepEqual(await read(`/api/campaigns/${other.id}`),otherBefore,'Deletion preserves the other campaign and its work')
 assert.ok(JSON.stringify(await recordThread(h,expected('campaign',campaign)[0].ref)).includes('Reviewer booked'))
 await rollup(0,1)
 assert.equal(await db.prepare('SELECT id FROM deliverables WHERE id=?').bind(deliverable.id).first(),null)
}

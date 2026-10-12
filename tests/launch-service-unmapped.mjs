import test from 'node:test'
import assert from 'node:assert/strict'
import { environment } from './launch-support.mjs'

test('[AUTO-008 APP-SCOPE-001] an initially unmapped campaign owner never receives shipped decision or notification authority',async()=>{
 const e=await environment()
 try {
  const {r,db,actor,context}=e,other=r.createUlid(),now=Date.now()
  await db.prepare('INSERT INTO operators VALUES(?,?,?,1,?,?,1)').bind(other,now,now,'Unmapped owner','unmapped@example.test').run()
  await db.prepare("INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)").bind(other,other,now,now).run()
  await db.batch(await r.prepareLaunchSetup(db,actor))
  const campaign=await e.campaign('UNMAPPED',other)
  const risk=await e.commit('risk.create',{fields:{campaignId:campaign.id,title:'Critical unscoped owner',ownerId:actor,severity:'Critical',dueDate:null,signal:'Verified',mitigation:'Review'}})
  const before=await db.prepare('SELECT * FROM risks WHERE id=?').bind(risk.id).first()
  const event=await db.prepare("SELECT id FROM admission_events WHERE name='risk.created' AND json_extract(subject_json,'$.recordId')=?").bind(risk.id).first()
  const definition=await db.prepare("SELECT * FROM automations WHERE shipped_key='critical-risk'").first()
  const service=r.createLegacyAutomationAuthority(context),admission=r.createAdmissionService(db,{authorizeReplay:service.authorizeReplay})
  const runtime=r.createLegacyAutomationRuntime(context,admission,{releaseId:r.createUlid(),authority:service.authority,context:service.context})
  const runId=await runtime.trigger(service.eventContext(event.id),definition,event.id,[risk.id])
  await assert.rejects(runtime.execute(service.dispatchContext(runId),runId),/Campaign owner no longer has access/)
  assert.deepEqual(await db.prepare('SELECT * FROM risks WHERE id=?').bind(risk.id).first(),before)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM decisions WHERE risk_id=?').bind(risk.id).first()).n,0)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM notifications WHERE operator_id=?').bind(other).first()).n,0)
  assert.equal((await db.prepare('SELECT count(*) AS n FROM authority_memberships WHERE principal_id=?').bind(other).first()).n,0)
 }finally{await e.close()}
})

import assert from 'node:assert/strict'
import {report,openInput,openReport,noManualEffects} from './repair-outcome-manual.mjs'

export async function historicalReports(h){
 const {source,intake}=await report(h),id=intake.value.id
 await h.db.prepare("UPDATE repair_intakes SET version=7,created_at='2026-09-01T00:00:00.000Z',updated_at='2026-09-30T00:00:00.000Z' WHERE id=?").bind(id).run()
 const retained=()=>h.db.prepare('SELECT fingerprint,payload_hash,text,source_ids,created_at FROM repair_intakes WHERE id=?').bind(id).first(),before=await retained(),stale=await openInput(h,id)
 const cases=(await h.db.prepare('SELECT count(*) n FROM operation_cases').first()).n
 await h.db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) SELECT ?,source_id,2,sha256,content,file_ids,known_at FROM evidence_source_versions WHERE source_id=? AND version=1').bind(h.id(),source.sourceId).run()
 await h.db.prepare('UPDATE evidence_sources SET current_version=2 WHERE id=?').bind(source.sourceId).run()
 assert.equal((await h.post('repair.open',stale.input,stale.expected,{status:409})).body.error.code,'stale_evidence')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM operation_cases').first()).n,cases)
 const opened=await openReport(h,id);assert.deepEqual(await retained(),before)
 assert.equal((await h.db.prepare('SELECT version FROM repair_intakes WHERE id=?').bind(id).first()).version,8)
 const prior=await h.db.prepare('SELECT * FROM operation_cases WHERE id=?').bind(opened.value.case.id).first(),next=await report(h)
 // With two ready reports the explicit list limit still applies.
 const extra=await report(h);assert.equal((await h.read('/api/v1/intakes?state=ready&limit=1')).items.length,1)
 await openReport(h,next.intake.value.id)
 assert.deepEqual(await h.db.prepare('SELECT * FROM operation_cases WHERE id=?').bind(prior.id).first(),prior)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM operation_cases').first()).n,cases+2)
 await noManualEffects(h)
 return extra.intake.value.id
}
export async function manualControls(h,intakeId){
 const opened=await openReport(h,intakeId),workId=opened.value.workOrder.id
 let value=opened.value.case
 for(const action of ['case.pause','case.resume','case.takeover','case.resume','case.cancel']){
  const input={caseId:value.id,caseVersion:value.version,reason:'Explicit synthetic manual control'},options={controlEpoch:value.controlEpoch}
  const result=await h.post(action,input,[],options),next=result.value
  assert.equal(next.version,value.version+1);assert.equal(next.controlEpoch,value.controlEpoch+1);assert.equal(next.nextWakeAt,null)
  assert.equal(next.state,{'case.pause':'paused','case.resume':'active','case.takeover':'taken_over','case.cancel':'cancelled'}[action])
  assert.deepEqual((await h.post(action,input,[],{...options,commandId:result.commandId})).body.data,result.body.data)
  const current=await h.read(`/api/v1/cases/${value.id}`);assert.equal(current.version,next.version);assert.equal(current.controlEpoch,next.controlEpoch)
  if(action==='case.pause'){
   const picker=await h.read(`/api/v1/repairs/${workId}/contractors`),chosen=picker.items[0]
   const denied=await h.post('repair.assign-contractor',{workOrder:picker.workOrder,contractor:chosen.contractor,eligibilityEvidence:chosen.evidence},[picker.workOrder,chosen.contractor],{controlEpoch:next.controlEpoch,status:409})
   assert.equal(denied.body.error.code,'invalid_transition')
  }
  value=next;await noManualEffects(h)
 }
 assert.equal((await h.post('case.resume',{caseId:value.id,caseVersion:value.version,reason:'Cannot resume cancelled work'},[],{controlEpoch:value.controlEpoch,status:409})).body.error.code,'invalid_transition')
 await noManualEffects(h)
}
export async function contractorSelection(h,repair){
 const workId=repair.workOrder.id,picker=await h.read(`/api/v1/repairs/${workId}/contractors`)
 assert.equal(picker.items.length,1)
 const chosen=picker.items[0],contractor=await h.db.prepare("SELECT id FROM repair_contractors WHERE payee_id='SYNTHETIC-UI-SUPPLIER'").first()
 assert.equal(chosen.contractor.ref.recordId,contractor.id)
 const input={workOrder:picker.workOrder,contractor:chosen.contractor,eligibilityEvidence:chosen.evidence},expected=[picker.workOrder,chosen.contractor],options={controlEpoch:picker.controlEpoch}
 const assigned=await h.post('repair.assign-contractor',input,expected,options);assert.equal(assigned.value.stage,'quotes')
 assert.deepEqual((await h.post('repair.assign-contractor',input,expected,{...options,commandId:assigned.commandId})).body.data,assigned.body.data)
 const other=await report(h),opened=await openReport(h,other.intake.value.id),otherPicker=await h.read(`/api/v1/repairs/${opened.value.workOrder.id}/contractors`),candidate=otherPicker.items[0]
 await h.db.prepare('UPDATE repair_credentials SET active=0,version=version+1 WHERE contractor_id=?').bind(contractor.id).run()
 const denied=await h.post('repair.assign-contractor',{workOrder:otherPicker.workOrder,contractor:candidate.contractor,eligibilityEvidence:candidate.evidence},[otherPicker.workOrder,candidate.contractor],{controlEpoch:otherPicker.controlEpoch,status:409})
 assert.equal(denied.body.error.code,'invalid_transition');assert.equal((await h.read(`/api/v1/repairs/${opened.value.workOrder.id}/contractors`)).items.length,0)
 assert.equal((await h.read(`/api/v1/repairs/${opened.value.workOrder.id}`)).stage,'triage')
 await noManualEffects(h)
 await h.db.prepare('UPDATE repair_credentials SET active=1,version=version+1 WHERE contractor_id=?').bind(contractor.id).run()
 return workId
}

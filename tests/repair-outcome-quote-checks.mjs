import assert from 'node:assert/strict'
import {expectRead,noManualEffects,report,openReport} from './repair-outcome-manual.mjs'

export async function captureQuote(h,workId,minor='200001'){
 const current=await h.read(`/api/v1/repairs/${workId}/quotes`),evidence=await h.source(`Supplier quoted AUD ${minor} cents for full cooling repair`)
 const total={minor,currency:'AUD',scale:2},slot={start:'2090-01-01T01:00:00.000Z',end:'2090-01-01T02:00:00.000Z',expiresAt:'2089-01-01T00:00:00.000Z',state:'offered'}
 const input={workOrder:current.workOrder,contractor:current.contractor,scopeHash:current.scopeHash,total,taxIncluded:true,lineItems:[{description:'Restore cooling',total}],exclusions:[],expiresAt:'2099-01-01T00:00:00.000Z',evidence:[evidence],offeredSlot:slot},expected=[current.workOrder,current.contractor]
 const result=await h.post('repair.record-quote',input,expected,{controlEpoch:current.controlEpoch})
 return {workId,quoteId:result.value.id,evidence,slot,total,scopeHash:current.scopeHash,contractor:current.contractor,input,expected,result,controlEpoch:current.controlEpoch}
}
export async function selectQuote(h,q,options={}){return h.post('repair.select-quote',{quoteId:q.quoteId},[await h.ref('workOrders',q.workId),await h.ref('quotes',q.quoteId)],{controlEpoch:q.controlEpoch,...options})}
export async function manualQuotes(h,workId){
 const before=await h.db.prepare('SELECT * FROM repair_work_orders WHERE id=?').bind(workId).first(),first=await captureQuote(h,workId,'200000')
 assert.equal(first.result.value.total.minor,'200000')
 assert.deepEqual((await h.post('repair.record-quote',first.input,first.expected,{commandId:first.result.commandId,controlEpoch:first.controlEpoch})).body.data,first.result.body.data)
 await captureQuote(h,workId,'200001')
 const {response,body}=await expectRead(h,`/api/v1/repairs/${workId}/quotes`,200),review=body.data
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(review.items.length,2)
 assert.deepEqual(review.items.map(item=>[item.quote.total.minor,item.approvalRequired]).sort(),[['200000',false],['200001',true]])
 assert.ok(review.items.every(item=>item.issues.length===0))
 assert.deepEqual(await h.db.prepare('SELECT * FROM repair_work_orders WHERE id=?').bind(workId).first(),before)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM business_decisions').first()).n,0)
 await noManualEffects(h)
}
export async function quoteFaults(h,flow){
 const submitted=await report(h),opened=await openReport(h,submitted.intake.value.id),workId=opened.value.workOrder.id,picker=await h.read(`/api/v1/repairs/${workId}/contractors`),chosen=picker.items[0]
 await h.post('repair.assign-contractor',{workOrder:picker.workOrder,contractor:chosen.contractor,eligibilityEvidence:chosen.evidence},[picker.workOrder,chosen.contractor],{controlEpoch:picker.controlEpoch})
 const q=await captureQuote(h,workId),before=await effectCounts(h)
 async function denied(status,code){const result=await selectQuote(h,q,{status});assert.equal(result.body.error.code,code);assert.deepEqual(await effectCounts(h),before);assert.equal((await h.db.prepare('SELECT lifecycle FROM repair_quotes WHERE id=?').bind(q.quoteId).first()).lifecycle,'received')}
 await h.db.prepare("UPDATE repair_quotes SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").bind(q.quoteId).run();await denied(409,'stale_evidence')
 await h.db.prepare("UPDATE repair_quotes SET expires_at='2099-01-01T00:00:00.000Z',tax_included=0 WHERE id=?").bind(q.quoteId).run();await denied(400,'validation')
 await h.db.prepare('UPDATE repair_quotes SET tax_included=1 WHERE id=?').bind(q.quoteId).run()
 await h.db.prepare("UPDATE repair_credentials SET valid_until='2000-01-01T00:00:00.000Z' WHERE contractor_id=? AND kind='licence'").bind(q.contractor.ref.recordId).run();await denied(409,'invalid_transition')
 await h.db.prepare("UPDATE repair_credentials SET valid_until='2099-01-01T00:00:00.000Z' WHERE contractor_id=? AND kind='licence'").bind(q.contractor.ref.recordId).run()
 await h.db.prepare('INSERT INTO evidence_source_versions(id,source_id,version,sha256,content,file_ids,known_at) SELECT ?,source_id,2,sha256,content,file_ids,known_at FROM evidence_source_versions WHERE source_id=? AND version=1').bind(h.id(),q.evidence.sourceId).run()
 await h.db.prepare('UPDATE evidence_sources SET current_version=2 WHERE id=?').bind(q.evidence.sourceId).run();await denied(409,'stale_evidence')
 await h.db.prepare('UPDATE evidence_sources SET current_version=1 WHERE id=?').bind(q.evidence.sourceId).run()
 const selected=await selectQuote(h,q);q.decision=selected.value.decision;assert.equal(selected.value.quote.state,'selected');assert.ok(q.decision)
 await flow.approve(q);await flow.agreement(q)
 const workOrder=await h.ref('workOrders',workId),revised=await h.post('repair.revise-scope',{workOrder,description:'Replace compressor rather than thermostat',evidence:[q.evidence]},[workOrder])
 assert.equal(revised.value.stage,'quotes');assert.equal((await h.db.prepare('SELECT lifecycle FROM repair_quotes WHERE id=?').bind(q.quoteId).first()).lifecycle,'superseded')
 assert.equal((await h.read(`/api/v1/decisions/${q.decision.id}`)).state,'stale')
 const refused=await flow.book(q,{status:409});assert.equal(refused.body.error.code,'invalid_transition')
 assert.deepEqual(await effectCounts(h),before)
}
async function effectCounts(h){const result={requests:h.edge.calls.length};for(const table of ['execution_runs','execution_attempts','repair_visits','admission_outbox'])result[table]=(await h.db.prepare(`SELECT count(*) n FROM ${table}`).first()).n;return result}

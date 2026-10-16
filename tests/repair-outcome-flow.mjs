import assert from 'node:assert/strict'
export function repairFlow(h){
 async function quoted(minor='200001'){
  const source=await h.source('Synthetic original report '+h.id()),intake=await h.post('intake.submit',{appId:h.REPAIRS_APP_ID,formId:h.REPAIRS_FORM_ID,values:{},text:'Cooling fault '+h.id(),fileIds:[],sourceId:source.sourceId})
  const context=await h.read(`/api/v1/intakes/${intake.value.id}/open-context`)
  const opened=await h.post('repair.open',{intakeId:intake.value.id,asset:context.asset,store:context.store,sourceVersions:context.sourceVersions,mandate:{id:context.mandates[0].id,version:context.mandates[0].version}},[context.intake])
  const workId=opened.value.workOrder.id,picker=await h.read(`/api/v1/repairs/${workId}/contractors`),chosen=picker.items[0]
  assert.ok(chosen,'Current licensed/insured contractor must be eligible')
  await h.post('repair.assign-contractor',{workOrder:picker.workOrder,contractor:chosen.contractor,eligibilityEvidence:chosen.evidence},[picker.workOrder,chosen.contractor])
  const current=await h.read(`/api/v1/repairs/${workId}/quotes`),evidence=await h.source(`Supplier quoted AUD ${minor} cents for full cooling repair`),total={minor,currency:'AUD',scale:2},slot={start:'2090-01-01T01:00:00.000Z',end:'2090-01-01T02:00:00.000Z',expiresAt:'2089-01-01T00:00:00.000Z',state:'offered'}
  const quote=await h.post('repair.record-quote',{workOrder:current.workOrder,contractor:current.contractor,scopeHash:current.scopeHash,total,taxIncluded:true,lineItems:[{description:'Restore cooling',total}],exclusions:[],expiresAt:'2099-01-01T00:00:00.000Z',evidence:[evidence],offeredSlot:slot},[current.workOrder,current.contractor])
  const selected=await h.post('repair.select-quote',{quoteId:quote.value.id},[await h.ref('workOrders',workId),await h.ref('quotes',quote.value.id)])
  return {workId,quoteId:quote.value.id,decision:selected.value.decision,evidence,slot,total,scopeHash:current.scopeHash,contractor:current.contractor}
 }
 async function approve(q){const review=await h.read(`/api/v1/decisions/${q.decision.id}/review`,h.managerSession);return h.post('decision.outcome',{decisionId:q.decision.id,outcome:'approve',rationale:'Reviewed exact supplier scope',confirmedInputHash:review.decision.exactInputHash},review.expected,{session:h.managerSession,controlEpoch:review.controlEpoch})}
 async function agreement(q){return h.post('repair.record-slot-agreement',{quoteId:q.quoteId,slot:{start:q.slot.start,end:q.slot.end},timezone:'Australia/Brisbane',evidence:[q.evidence]},[await h.ref('quotes',q.quoteId)])}
 async function book(q,options={}){return h.post('repair.book-visit',{quoteId:q.quoteId,slot:{start:q.slot.start,end:q.slot.end},connectionId:h.connections.calendar,approvalId:q.decision?.id??null},[await h.ref('quotes',q.quoteId),await h.ref('workOrders',q.workId)],options)}
 async function claim(q,visitId,text='Contractor reports completed cooling repair'){
  const evidence=await h.source(text),workOrder=await h.ref('workOrders',q.workId)
  const current=await h.read(`/api/v1/repairs/${q.workId}/operations`)
  return h.post('repair.record-completion',{workOrder,visitId,...(current.acceptanceId?{reopensAcceptanceId:current.acceptanceId}:{}),sourceIds:[evidence.sourceId],evidence:[evidence]},[workOrder])
 }
 async function acceptance(q,accepted=true){const review=await h.read(`/api/v1/repairs/${q.workId}/completion-review`),evidence=await h.source(accepted?'Store inspected and equipment works':'Store inspected: still warm; rework required')
  return {input:{workOrder:review.workOrder,claimId:review.claim.id,claimVersion:review.claim.version,accepted,reason:accepted?'Physical cooling checked':'Still faulty',evidence:[evidence]},expected:[review.workOrder,{ref:h.repairRef('completionClaims',review.claim.id),version:review.claim.version}],review}
 }
 async function invoice(q,overrides={}){const source=await h.source('Synthetic supplier invoice '+h.id()),workOrder=await h.ref('workOrders',q.workId),amount=(Number(q.total.minor)/100).toFixed(2),input={workOrder,sourceId:source.sourceId,sourceVersion:source.sourceVersion,invoiceNumber:h.id(),invoiceDate:'2026-10-15',dueDate:'2026-11-15',lineAmountTypes:'Inclusive',lines:[{description:'Restore cooling',quantity:'1',unitAmount:amount,lineAmount:amount,accountCode:'400',taxType:'INPUT'}],payeeId:'SYNTHETIC-UI-SUPPLIER',total:q.total,scopeHash:q.scopeHash,evidence:[source],...overrides}
  const result=await h.post('repair.record-invoice',input,[workOrder]);return {input,...result}}
 async function handoff(q,invoice,options={}){const workOrder=await h.ref('workOrders',q.workId),operations=await h.read(`/api/v1/repairs/${q.workId}/operations`);return h.post('repair.handoff-invoice',{workOrder,invoiceSourceId:invoice.input.sourceId,quoteId:q.quoteId,acceptanceId:operations.acceptanceId??h.id(),connectionId:h.connections.xero},[workOrder],options)}
 return {quoted,approve,agreement,book,claim,acceptance,invoice,handoff}
}

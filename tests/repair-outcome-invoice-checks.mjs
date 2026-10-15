import assert from 'node:assert/strict'

export async function invoiceConstraints(h,flow,q,wrongPayee){
 const total={...q.total,minor:String(BigInt(q.total.minor)+1n)},amount=(Number(total.minor)/100).toFixed(2)
 const wrongAmount=await flow.invoice(q,{total,lines:[{description:'Restore cooling',quantity:'1',unitAmount:amount,lineAmount:amount,accountCode:'400',taxType:'INPUT'}]})
 const before=h.edge.calls.length,denied=await flow.handoff(q,wrongAmount,{status:400})
 assert.equal(denied.body.error.code,'validation');assert.equal(h.edge.calls.length,before)
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_handoffs WHERE work_order_id=?').bind(q.workId).first()).n,0,'Neither wrong payee nor amount-only mismatch creates a handoff')
 // Vary the payee from the earlier rejected bill and supply new evidence, while
 // retaining the existing supplier/number identity of the amount-mismatch bill.
 const source=await h.source('Duplicate supplier invoice with changed evidence and payee'),workOrder=await h.ref('workOrders',q.workId)
 const duplicate=await h.post('repair.record-invoice',{...wrongPayee.input,workOrder,invoiceNumber:wrongAmount.input.invoiceNumber,payeeId:wrongAmount.input.payeeId,sourceId:source.sourceId,sourceVersion:source.sourceVersion,evidence:[source]},[workOrder],{status:400})
 assert.equal(duplicate.body.error.code,'validation')
 assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_invoices WHERE payee_id=? AND invoice_number=?').bind(wrongAmount.input.payeeId,wrongAmount.input.invoiceNumber).first()).n,1)
 assert.equal(h.edge.calls.length,before)
}

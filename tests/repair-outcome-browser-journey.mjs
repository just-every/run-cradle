import assert from 'node:assert/strict'
import {repairOutcomeFixture} from './repair-outcome-fixture.mjs'
import {auditAccessibility} from './helpers/accessibility-evidence.mjs'
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlYQAAAAASUVORK5CYII=','base64')
/** Every business transition uses the rendered controls on one report, in two distinct human sessions. */
export async function browserRepairJourney(browser,width,output){
 const h=await repairOutcomeFixture(),contexts=[],trace={width,commands:[],screens:[]}
 async function session(credentials){const context=await browser.newContext({viewport:{width,height:width===390?844:900},locale:'en-AU',timezoneId:'Australia/Brisbane'});contexts.push(context);await context.addCookies([{name:credentials.cookie.split('=')[0],value:credentials.cookie.slice(credentials.cookie.indexOf('=')+1),url:h.origin}]);return {context,page:await context.newPage()}}
 async function command(page,action,click){const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/commands/'+action);await click();const result=await response,body=await result.json();assert.equal(result.status(),200,`${action}: ${JSON.stringify(body)}`);assert.equal(body.data.state,'committed');trace.commands.push({action,commandId:body.data.commandId,value:body.data.value});return body.data.value}
 async function audit(page,name){await page.waitForLoadState('networkidle');const result=await auditAccessibility(page,{screen:`journey-${name}`,width,output});assert.equal(result.layout.pageOverflow,false);assert.deepEqual([...result.axe.wcag22aa,...result.axe.targetSize].map(v=>v.id),[]);trace.screens.push(name)}
 try{
  await h.issuedGrant()
  const {context,page}=await session(h.ownerSession),manager=await session(h.managerSession)
  await page.goto(h.origin+'/app/repairs/new');await page.getByLabel('Describe the problem',{exact:true}).waitFor()
  await context.setOffline(true)
  await page.getByLabel('Describe the problem',{exact:true}).fill(`Cooling repair journey at ${width} pixels`)
  await page.getByLabel('Photo (optional)',{exact:true}).setInputFiles({name:'cooling-fault.png',mimeType:'image/png',buffer:photo})
  await page.getByText(/Local draft — not submitted/).waitFor()
  assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_intakes').first()).n,0)
  await context.setOffline(false);await page.getByText(/Current details have been checked/).waitFor()
  assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_intakes').first()).n,0)
  const intake=await command(page,'intake.submit',()=>page.getByRole('button',{name:'Submit problem',exact:true}).click())
  trace.intakeId=intake.id
  await page.getByRole('link',{name:'Open report',exact:true}).click()
  await page.getByRole('radio').first().check()
  const opened=await command(page,'repair.open',()=>page.getByRole('button',{name:'Open repair work',exact:true}).click())
  trace.workOrderId=opened.workOrder.id;trace.caseId=opened.case.id
  await page.getByRole('link',{name:'Open current work',exact:true}).click()
  await page.getByRole('link',{name:'Review repair →',exact:true}).click()
  assert.equal(new URL(page.url()).pathname,`/app/repairs/${trace.workOrderId}`)
  await page.getByRole('radio',{name:'UI test licensed refrigeration',exact:true}).check()
  await command(page,'repair.assign-contractor',()=>page.getByRole('button',{name:'Select contractor',exact:true}).click())
  await page.getByLabel('Work item 1',{exact:true}).fill('Restore cooling')
  await page.getByLabel('Line 1 amount (AUD)',{exact:true}).fill('2000.01')
  await page.getByLabel('Total (AUD)',{exact:true}).fill('2000.01')
  await page.getByLabel('Tax is included in this total',{exact:true}).check()
  await page.getByLabel('Quote expires (UTC)',{exact:true}).fill('2099-01-01T00:00')
  await page.getByLabel('Offered visit start (UTC, optional)',{exact:true}).fill('2090-01-01T01:00')
  await page.getByLabel('Offered visit end (UTC, optional)',{exact:true}).fill('2090-01-01T02:00')
  await page.getByLabel('Original quote evidence',{exact:true}).fill('Supplier offers full cooling repair, tax included, for AUD 2000.01 and the stated visit.')
  const quote=await command(page,'repair.record-quote',()=>page.getByRole('button',{name:'Record quote evidence',exact:true}).click())
  trace.quoteId=quote.id
  const selected=await command(page,'repair.select-quote',()=>page.getByRole('button',{name:/Select exact quote/}).click())
  trace.decisionId=selected.decision.id
  await manager.page.goto(h.origin+'/app/approvals')
  await manager.page.getByRole('link',{name:'Review decision',exact:true}).click()
  assert.equal(new URL(manager.page.url()).pathname,`/app/approvals/${trace.decisionId}`)
  await audit(manager.page,'designated-approval')
  await command(manager.page,'decision.outcome',()=>manager.page.getByRole('button',{name:/^Approve /}).click())
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  await page.getByLabel('Contractor agreement evidence',{exact:true}).fill('Contractor confirms the exact offered visit and accepted scope.')
  await command(page,'repair.record-slot-agreement',()=>page.getByRole('button',{name:'Record contractor agreement',exact:true}).click())
  await page.getByLabel('Provider connection',{exact:true}).selectOption(h.connections.calendar)
  const booking=await command(page,'repair.book-visit',()=>page.getByRole('button',{name:'Book visit',exact:true}).click())
  trace.booking=booking
  assert.equal((await h.waitAttempt(booking.attemptId)).state,'confirmed')
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  const visit=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Contractor visit',exact:true})})
  await command(page,'repair.reconcile-effect',()=>visit.getByRole('button',{name:'Apply observed receipt',exact:true}).click())
  await audit(page,'booked-receipt')
  await page.getByLabel('Contractor completion report',{exact:true}).fill('Contractor reports completed cooling repair; store must independently test.')
  const claim=await command(page,'repair.record-completion',()=>page.getByRole('button',{name:'Record contractor completion claim',exact:true}).click())
  trace.claimId=claim.id
  await page.getByLabel('The repair works',{exact:true}).check()
  await page.getByLabel('Your observation',{exact:true}).fill('I independently tested cooling and inspected the repair against this claim.')
  await page.getByLabel('I checked the physical result against this completion claim.').check()
  await audit(page,'physical-acceptance')
  await command(page,'repair.store-acceptance',()=>page.getByRole('button',{name:'Accept physical repair',exact:true}).click())
  await page.getByText('Record supplier invoice',{exact:true}).click()
  await page.getByLabel('Invoice number',{exact:true}).fill(`BROWSER-${width}`)
  await page.getByLabel('Invoice total (AUD)',{exact:true}).fill(width===390?'2000.02':'2000.01')
  await page.getByLabel('Invoice date',{exact:true}).fill('2026-10-15')
  await page.getByLabel('Due date',{exact:true}).fill(width===390?'2026-10-01':'2026-11-15')
  await page.getByLabel('Invoice item 1',{exact:true}).fill('Restore cooling')
  await page.getByLabel('Quantity 1',{exact:true}).fill('1')
  await page.getByLabel('Unit amount 1 (AUD)',{exact:true}).fill(width===390?'2000.02':'2000.01')
  await page.getByLabel('Invoice line 1 amount (AUD)',{exact:true}).fill(width===390?'2000.02':'2000.01')
  await page.getByLabel('Account code 1',{exact:true}).fill('400')
  await page.getByLabel('Tax type 1',{exact:true}).fill('INPUT')
  await page.getByLabel('Original supplier invoice evidence',{exact:true}).fill('Supplier invoice for completed cooling repair, AUD 2000.01 tax inclusive, payable to the exact quoted supplier.')
  if(width===390){
   const refused=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/repair.record-invoice'))
   await page.getByRole('button',{name:'Record evidenced invoice',exact:true}).click()
   const response=await refused;assert.equal(response.status(),400)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_invoices').first()).n,0)
   await page.getByRole('button',{name:'Review and correct invoice',exact:true}).click()
   await page.getByLabel('Due date',{exact:true}).fill('2026-11-15')
  }
  const invoice=await command(page,'repair.record-invoice',()=>page.getByRole('button',{name:'Record evidenced invoice',exact:true}).click())
  trace.invoiceId=invoice.invoiceId
  await page.getByLabel('Provider connection',{exact:true}).selectOption(h.connections.xero)
  await page.getByText('Accountant mappings · owner setup',{exact:true}).click()
  await page.getByLabel('Supplier payee identity 1',{exact:true}).fill('SYNTHETIC-UI-SUPPLIER')
  await page.getByLabel('Xero contact identity 1',{exact:true}).fill('00000000-0000-4000-8000-000000000002')
  await page.getByLabel('Approved account codes (one per line)',{exact:true}).fill('400')
  await page.getByLabel('Approved tax types (one per line)',{exact:true}).fill('INPUT')
  await command(page,'repair.configure-accounting',()=>page.getByRole('button',{name:'Save accountant mappings',exact:true}).click())
  if(width===390){
   const calls=h.edge.calls.length,refused=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/commands/repair.handoff-invoice'))
   await page.getByRole('button',{name:'Hand invoice to accounting',exact:true}).click()
   const response=await refused;assert.equal(response.status(),400)
   assert.equal(h.edge.calls.length,calls,'Mismatched recorded invoice cannot call accounting')
   assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_handoffs').first()).n,0)
   const correction=page.locator('details').filter({has:page.getByText('Correct recorded invoice',{exact:true})})
   await correction.locator('summary').click()
   await correction.getByLabel('Invoice total (AUD)',{exact:true}).fill('2000.01')
   await correction.getByLabel('Unit amount 1 (AUD)',{exact:true}).fill('2000.01')
   await correction.getByLabel('Invoice line 1 amount (AUD)',{exact:true}).fill('2000.01')
   await correction.getByLabel('Corrected supplier invoice evidence',{exact:true}).fill('Supplier corrected the same invoice to AUD 2000.01, tax inclusive, matching the accepted cooling repair and original supplier.')
   const corrected=await command(page,'repair.record-invoice',()=>correction.getByRole('button',{name:'Save corrected invoice',exact:true}).click())
   assert.equal(corrected.invoiceId,trace.invoiceId)
   assert.equal((await h.db.prepare('SELECT count(*) n FROM repair_invoices').first()).n,1)
   assert.equal((await h.db.prepare('SELECT version FROM repair_invoices WHERE id=?').bind(trace.invoiceId).first()).version,2)
  }
  // A known refusal is recoverable through the same business binding and provider key.
  if(width===390)h.edge.setAccounting('refused')
  let handoff=await command(page,'repair.handoff-invoice',()=>page.getByRole('button',{name:'Hand invoice to accounting',exact:true}).click())
  trace.handoff=handoff
  assert.equal((await h.waitAttempt(handoff.attemptId)).state,width===390?'refused':'confirmed')
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  const accounting=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Accounting handoff',exact:true})})
  if(width===390){
   const original=await h.db.prepare('SELECT idempotency_key FROM execution_attempts WHERE id=?').bind(handoff.attemptId).first()
   h.edge.setAccounting('confirmed')
   const retry=await command(page,'run.retry',()=>accounting.getByRole('button',{name:'Retry known failed request',exact:true}).click())
   assert.equal((await h.waitAttempt(retry.attemptId)).state,'confirmed')
   assert.equal((await h.db.prepare('SELECT idempotency_key FROM execution_attempts WHERE id=?').bind(retry.attemptId).first()).idempotency_key,original.idempotency_key)
   trace.retry=retry
   await page.getByRole('button',{name:'Refresh',exact:true}).click()
  }
  await command(page,'repair.reconcile-effect',()=>accounting.getByRole('button',{name:'Apply observed receipt',exact:true}).click())
  await page.getByText('Handed off to accounting. This is not a payment confirmation.',{exact:true}).waitFor()
  await page.reload()
  await page.getByText('Handed off to accounting. This is not a payment confirmation.',{exact:true}).waitFor()
  await audit(page,'durable-accounting-receipt')
  const state=await h.read(`/api/v1/repairs/${trace.workOrderId}`)
  assert.equal(state.accounting.state,'handed_off');assert.ok(state.accounting.receiptId);assert.equal(h.edge.invoices.size,1)
  const persisted=await h.db.prepare('SELECT i.id intake_id,w.id work_id,w.case_id FROM repair_intakes i JOIN repair_work_orders w ON w.intake_id=i.id WHERE i.id=?').bind(trace.intakeId).first()
  assert.equal(persisted.work_id,trace.workOrderId);assert.equal(persisted.case_id,trace.caseId)
  assert.equal((await h.db.prepare('SELECT count(*) n FROM evidence_files').first()).n,1)
  trace.receiptId=state.accounting.receiptId
  return trace
 }finally{for(const context of contexts)await context.close();await h.close()}
}

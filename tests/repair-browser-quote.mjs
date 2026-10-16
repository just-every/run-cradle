import assert from 'node:assert/strict'
/** Repeated exact-quote review remains a rendered interaction by both distinct humans. */
export async function quoteApproveAndAgree({page,manager,h,command,audit,rescheduled=false}){
 const day=rescheduled?'2090-01-02':'2090-01-01'
 if(rescheduled)await page.getByText('Add another quote',{exact:true}).click()
  await page.getByLabel('Work item 1',{exact:true}).fill('Restore cooling')
  await page.getByLabel('Line 1 amount (AUD)',{exact:true}).fill('2000.01')
  await page.getByLabel('Total (AUD)',{exact:true}).fill('2000.01')
  await page.getByLabel('Tax is included in this total',{exact:true}).check()
  await page.getByLabel('Quote expires (UTC)',{exact:true}).fill('2099-01-01T00:00')
  await page.getByLabel('Offered visit start (UTC, optional)',{exact:true}).fill(`${day}T01:00`)
  await page.getByLabel('Offered visit end (UTC, optional)',{exact:true}).fill(`${day}T02:00`)
  await page.getByLabel('Original quote evidence',{exact:true}).fill('Supplier offers full cooling repair, tax included, for AUD 2000.01 and the stated visit.')
  const quote=await command(page,'repair.record-quote',()=>page.getByRole('button',{name:'Record quote evidence',exact:true}).click())
  const quoteId=quote.id
  const selected=await command(page,'repair.select-quote',()=>page.getByRole('button',{name:/Select exact quote/}).click())
  const decisionId=selected.decision.id
  await manager.page.goto(h.origin+'/app/approvals')
  await manager.page.locator(`a[href="/app/approvals/${decisionId}"]`).click()
  assert.equal(new URL(manager.page.url()).pathname,`/app/approvals/${decisionId}`)
  await audit(manager.page,rescheduled?'renewed-designated-approval':'designated-approval')
  await command(manager.page,'decision.outcome',()=>manager.page.getByRole('button',{name:/^Approve /}).click())
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  await page.getByLabel('Contractor agreement evidence',{exact:true}).fill('Contractor confirms the exact offered visit and accepted scope.')
  await command(page,'repair.record-slot-agreement',()=>page.getByRole('button',{name:'Record contractor agreement',exact:true}).click())
  return {quoteId,decisionId}
}

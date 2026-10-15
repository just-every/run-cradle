import { useState } from 'react'
import type { RepairOperations } from '../../apps/repairs/operation-read.server'
import type { Source } from '../../domains/evidence/contracts'
import { decimalMinor } from '../../apps/repairs/money'
import { REPAIRS_APP_ID } from '../../apps/repairs/model'
import { readApi, useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
export function InvoiceCapture({data,onChanged}:{data:RepairOperations;onChanged:()=>void}){
 const capture=useCommand<{id:string}>(`repair-invoice-source:${data.workOrder.ref.recordId}`),command=useCommand(`repair-invoice:${data.workOrder.ref.recordId}`)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const blocked=busy||[capture.result.state,command.result.state].some(s=>['pending','unknown','submitting','committed'].includes(s))
 async function submit(form:HTMLFormElement){if(blocked||!navigator.onLine)return;setBusy(true);setError('');try{
  const fields=new FormData(form),text=String(fields.get('evidence')),total={minor:decimalMinor(String(fields.get('total')),2).toString(),currency:'AUD',scale:2}
  const lines=JSON.parse(String(fields.get('lines')))
  const saved=await capture.submit('/api/v1/commands/source.capture',{appId:REPAIRS_APP_ID,kind:'form',subject:data.store.ref,fileIds:[],text},[]);if(!saved)return
  const {data:source}=await readApi<Source>(`/api/v1/sources/${saved.id}`)
  await command.submit('/api/v1/commands/repair.record-invoice',{workOrder:data.workOrder,sourceId:source.id,sourceVersion:source.version,invoiceNumber:String(fields.get('number')),invoiceDate:String(fields.get('date')),dueDate:String(fields.get('due')),lineAmountTypes:String(fields.get('tax')),lines,payeeId:String(fields.get('payee')),total,scopeHash:data.scopeHash,evidence:[{sourceId:source.id,sourceVersion:source.version,locator:{kind:'text',start:0,end:text.length},observedAt:source.knownAt}]},[data.workOrder],data.controlEpoch)
  onChanged()
 }catch(cause){setError(cause instanceof Error?cause.message:'The invoice was not confirmed')}finally{setBusy(false)}}
 return <details className="cr-detail"><summary>Record supplier invoice</summary><form className="cr-card cr-form" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget)}}><fieldset disabled={blocked}><label className="cr-field">Invoice number<input name="number" required /></label><label className="cr-field">Supplier payee identity<input name="payee" required defaultValue={data.selectedQuote?.payeeId} /></label><label className="cr-field">Invoice total (AUD)<input name="total" inputMode="decimal" required /></label><label className="cr-field">Invoice date<input name="date" type="date" required /></label><label className="cr-field">Due date<input name="due" type="date" required /></label><label className="cr-field">Tax treatment<select name="tax"><option value="Inclusive">Tax inclusive</option><option value="NoTax">No tax</option></select></label><label className="cr-field">Exact invoice lines (JSON)<textarea name="lines" required aria-describedby="invoice-lines-help" /></label><p id="invoice-lines-help" className="cr-muted">Each line needs description, quantity, unitAmount, lineAmount, accountCode and taxType. Use the accountant’s approved codes and the supplier’s exact amounts.</p><label className="cr-field">Original supplier invoice evidence<textarea name="evidence" required /></label></fieldset><button className="cr-button" disabled={blocked}>Record evidenced invoice</button>{error&&<p role="alert" className="cr-notice">{error}</p>}<CommandFeedback {...capture}/><CommandFeedback {...command}/>{command.result.state==='committed'&&<p>Invoice recorded. Review it against accepted work before handoff.</p>}</form></details>
}

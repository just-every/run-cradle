import {useEffect,useState} from 'react'
import type {EntitySchema,RecordRow} from '../../domains/records/contracts'
import {readApi} from '../shared/api'
import {AutomationTestStep} from './test-step'
import {createUlid} from '../../core/shared/ids'
type Effect={position:number;kind:string;destination:string}
type Result={id:string;mode:string;state:string;trigger:{matches:boolean;reason:string};steps:{position:number;kind:string;state:string;input:unknown;output:unknown}[];confirmationEffects:Effect[]}
export function AutomationTestPanel({id,entity,event}:{id:string;entity:EntitySchema;event:'created'|'updated'}){
 const [records,setRecords]=useState<RecordRow[]>([]),[recordId,setRecordId]=useState(''),[testEvent,setEvent]=useState(event),[result,setResult]=useState<Result|null>(null),[confirmed,setConfirmed]=useState<number[]>([]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 useEffect(()=>{let active=true;void readApi<{items:RecordRow[]}>(`/api/v1/apps/${entity.appId}/entities/${entity.id}/query`,{method:'POST',body:JSON.stringify({limit:100})}).then(reply=>{if(active)setRecords(reply.data.items)},error=>{if(active)setError(error instanceof Error?error.message:'Records could not be loaded.')});return()=>{active=false}},[entity.appId,entity.id])
 async function run(live=false){setError(null);setBusy(true);try{const response=await readApi<Result>(`/api/user-automations/${id}/test`,{method:'POST',body:JSON.stringify({commandId:createUlid(),recordId,event:testEvent,...(live&&result?{live:{previewId:result.id,effects:result.confirmationEffects}}:{})})});setResult(response.data);setConfirmed([])}catch(error){setError(error instanceof Error?error.message:'The test could not be completed.')}finally{setBusy(false)}}
 const label=(record:RecordRow)=>{const cell=record.fields[entity.primaryFieldId??entity.fields[0].id];return cell?.state==='value'?String(cell.value??record.id):record.id}
 return <section className="cr-card cr-stack" aria-label="Test automation"><h3>Test automation</h3><p>Choose a real record. A test previews record creation, updates and notifications, holds webhooks and Slack, and sends email only to you. Save changes before testing the saved definition.</p>
  <label className="cr-field">Test record<select value={recordId} onChange={event=>{setRecordId(event.target.value);setResult(null)}}><option value="">Choose a record</option>{records.map(record=><option key={record.id} value={record.id}>{label(record)}</option>)}</select></label>
  <label className="cr-field">Simulated event<select value={testEvent} onChange={event=>{setEvent(event.target.value as 'created'|'updated');setResult(null)}}><option value="created">Record created</option><option value="updated">Record updated</option></select></label>
  <button type="button" className="cr-button cr-button--quiet" disabled={!recordId||busy} onClick={()=>void run()}>{busy?'Testing…':'Run test'}</button>{error&&<p className="cr-error" role="alert">{error}</p>}
  {result&&<div className="cr-stack" aria-live="polite"><p><strong>{result.mode==='live'?'Live test':'Test'} · {result.state}</strong></p><p>Trigger: {result.trigger.matches?'Matches':'Does not match'}. {result.trigger.reason}</p><ol className="cr-stack">{result.steps.map(step=><AutomationTestStep key={step.position} step={step} entity={entity}/>)}</ol>
   {result.mode==='dry'&&result.trigger.matches&&result.state==='Complete'&&<fieldset className="cr-stack"><legend>Confirm a live test</legend><p>A live test applies record changes and sends to the destinations below.</p>{result.confirmationEffects.map(effect=><label key={effect.position} style={{overflowWrap:'anywhere'}}><input type="checkbox" checked={confirmed.includes(effect.position)} onChange={event=>setConfirmed(event.target.checked?[...confirmed,effect.position]:confirmed.filter(position=>position!==effect.position))}/> Action {effect.position+1}: {effect.kind} to {effect.destination}</label>)}<button type="button" className="cr-button cr-button--quiet" disabled={busy||confirmed.length!==result.confirmationEffects.length} onClick={()=>void run(true)}>Run confirmed live test</button></fieldset>}
   {result.state==='Unknown'&&<p>The receiver may have accepted this test. Check its receipt. This test will never be resent automatically.</p>}
  </div>}
 </section>
}

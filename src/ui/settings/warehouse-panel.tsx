import {useEffect, useState, type FormEvent} from 'react'
import {createUlid} from '../../core/shared/ids'
import {sessionFetch} from '../shared/session-fetch'
import {describeSchedule, parseSchedule} from '../../apps/launch/schedule'

type Export={id:string;name:string;bases:string[];mode:'full'|'incremental';localRule:string;timezone:string;state:string;version:number}
type Inventory={bases:{id:string;name:string}[];exports:Export[]}
type Draft=Omit<Export,'state'>
const empty=():Draft=>({id:'',name:'',bases:[],mode:'incremental',localRule:'hourly',timezone:'UTC',version:0})
async function request(path:string,input?:unknown){
 const response=await sessionFetch(path,{...(input?{method:'POST',body:JSON.stringify(input)}:{}),headers:{accept:'application/json','content-type':'application/json'}})
 const payload:unknown=await response.json().catch(()=>null)
 if(!response.ok){
  const problem=payload&&typeof payload==='object'&&'error'in payload?payload.error:null
  const message=problem&&typeof problem==='object'&&'message'in problem&&typeof problem.message==='string'?problem.message:`Export request returned ${response.status}.`
  throw new Error(message)
 }
 if(!payload||typeof payload!=='object'||!('data'in payload))throw new Error('Export request returned an unreadable response.')
 const data=payload.data
 if(data&&typeof data==='object'&&'state'in data&&data.state!=='committed')throw new Error('The export change is not confirmed. Refresh before trying again.')
 return data
}

/** Owner controls use the same session and command doors as other settings. */
export function WarehousePanel(){
 const [data,setData]=useState<Inventory|null>(null),[draft,setDraft]=useState<Draft>(empty),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
 async function refresh(){setError('');try{setData(await request('/api/v1/warehouse-exports') as Inventory)}catch(caught){setError(caught instanceof Error?caught.message:'Could not read exports.')}}
 useEffect(()=>{let active=true;request('/api/v1/warehouse-exports').then(value=>{if(active)setData(value as Inventory)},caught=>{if(active)setError(caught instanceof Error?caught.message:'Could not read exports.')});return()=>{active=false}},[])
 const parsed=parseSchedule(draft.localRule),frequency=parsed?.frequency??'hourly'
 function schedule(next:string,time=parsed?.time||'09:00',day=parsed?.weekday??1){setDraft(value=>({...value,localRule:next==='hourly'?'hourly':next==='daily'?`daily ${time}`:`weekly ${day} ${time}`}))}
 async function save(event:FormEvent){
  event.preventDefault();setError('');setNotice('');setBusy(true)
  const input={...draft,id:draft.id||createUlid()};setDraft(input)
  try{await request('/api/v1/commands/warehouse.save',{commandId:createUlid(),expected:[],input});setDraft(empty());setNotice('Export schedule saved.');await refresh()}
  catch(caught){setError(caught instanceof Error?caught.message:'Could not save the export.')}finally{setBusy(false)}
 }
 async function remove(item:Export){
  setError('');setNotice('');setBusy(true)
  try{await request('/api/v1/commands/warehouse.remove',{commandId:createUlid(),expected:[],input:{id:item.id,version:item.version}});if(draft.id===item.id)setDraft(empty());setNotice('Export schedule removed.');await refresh()}
  catch(caught){setError(caught instanceof Error?caught.message:'Could not remove the export.')}finally{setBusy(false)}
 }
 return <section className="cr-stack" aria-labelledby="warehouse-export-heading">
  <h3 id="warehouse-export-heading">Export to your own bucket</h3>
  <p>Write CSV files to your installation's export R2 bucket for analysis. Exports use the configuring owner's current access. Erasure removes managed export copies before it is confirmed.</p>
  {error&&<p className="cr-error" role="alert">{error}</p>}
  {notice&&<p className="cr-notice" role="status">{notice}</p>}
  {!data?<><p role="status">{error?'Export settings are unavailable.':'Loading export settings…'}</p><button className="cr-button cr-button--quiet" type="button" onClick={()=>void refresh()}>Read export settings again</button></>:<>
   <form className="cr-stack" onSubmit={event=>void save(event)}>
    <h4>{draft.version?'Edit export schedule':'New export schedule'}</h4>
    <fieldset className="cr-stack" disabled={busy}>
     <legend>Export settings</legend>
     <label className="cr-field">Export name<input required maxLength={100} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
     <fieldset className="cr-stack"><legend>Bases to export</legend>{data.bases.length?data.bases.map(base=><label className="cr-choice" key={base.id}><input type="checkbox" checked={draft.bases.includes(base.id)} onChange={event=>setDraft({...draft,bases:event.target.checked?[...draft.bases,base.id]:draft.bases.filter(id=>id!==base.id)})}/><span>{base.name}</span></label>):<p>No bases are available to export.</p>}</fieldset>
     <label className="cr-field">Export mode<select value={draft.mode} onChange={event=>setDraft({...draft,mode:event.target.value as Draft['mode']})}><option value="incremental">Incremental — changes since the last successful run</option><option value="full">Full — all currently readable records</option></select></label>
     <label className="cr-field">Schedule<select value={frequency} onChange={event=>schedule(event.target.value)}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
     {frequency==='weekly'&&<label className="cr-field">Day of week<select value={parsed?.weekday??1} onChange={event=>schedule('weekly',parsed?.time||'09:00',Number(event.target.value))}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,index)=><option value={index} key={day}>{day}</option>)}</select></label>}
     {frequency!=='hourly'&&<label className="cr-field">Run time<input type="time" required value={parsed?.time||'09:00'} onChange={event=>schedule(frequency,event.target.value)}/></label>}
     <label className="cr-field">Time zone<input required maxLength={100} placeholder="Europe/London" value={draft.timezone} onChange={event=>setDraft({...draft,timezone:event.target.value})}/></label>
     <p>Schedules run at most once per hour. A first incremental run includes all currently readable records; later runs include changes and deletion tombstones.</p>
     <div className="cr-actions"><button className="cr-button" disabled={!draft.bases.length}>{busy?'Saving…':'Save export schedule'}</button>{draft.id&&<button className="cr-button cr-button--quiet" type="button" onClick={()=>{setDraft(empty());setError('')}}>Cancel editing</button>}</div>
    </fieldset>
   </form>
   <div className="cr-stack" aria-label="Configured exports">{data.exports.length?data.exports.map(item=><article className="cr-card" key={item.id}><h4>{item.name}</h4><p>{item.state} · {item.mode==='full'?'Full':'Incremental'} · {describeSchedule(item.localRule,item.timezone)}</p><p>{item.bases.map(id=>data.bases.find(base=>base.id===id)?.name??'Unavailable base').join(', ')}</p><div className="cr-actions"><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>{setDraft({id:item.id,name:item.name,bases:[...item.bases],mode:item.mode,localRule:item.localRule,timezone:item.timezone,version:item.version});setError('');setNotice('')}}>Edit {item.name}</button><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void remove(item)}>Remove {item.name}</button></div></article>):<p>No export schedules yet.</p>}</div>
  </>}
 </section>
}

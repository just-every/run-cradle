import {useState,useEffect} from 'react'
import {Timestamp} from '../shared/presentation'
import {readApi} from '../shared/api'
type Settings={replies:{id:string;receivedAt:string;from:string;body:string;event:string}[];configured:boolean;accountSid?:string;from?:string;a2pStatus?:string;inboundUrl?:string}
export function SmsPanel(){
 const [settings,setSettings]=useState<Settings|null>(null),[accountSid,setAccountSid]=useState(''),[authToken,setAuthToken]=useState(''),[from,setFrom]=useState('')
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false)
 const route='/api/user-automations/sms/settings'
 useEffect(()=>{let active=true;void readApi<Settings>(route).then(result=>{if(active){setSettings(result.data);setAccountSid(result.data.accountSid??'');setFrom(result.data.from??'')}},e=>{if(active)setError(e instanceof Error?e.message:'Could not load SMS settings.')});return()=>{active=false}},[])
 async function save(remove=false){setBusy(true);setError(null);try{const result=await readApi<Settings>(route,{method:remove?'DELETE':'PUT',...(remove?{}:{body:JSON.stringify({accountSid,authToken,from})})});setSettings(result.data);setAuthToken('');if(remove){setAccountSid('');setFrom('')}}catch(e){setError(e instanceof Error?e.message:'Could not save SMS settings.')}finally{setBusy(false)}}
 return <section className="cr-stack" aria-label="Twilio SMS settings"><h3>Twilio SMS</h3>
 {settings&&<p role="status">{settings.configured?`Connected · A2P 10DLC: ${settings.a2pStatus??'Unavailable'}`:'Not connected'}</p>}
 {settings?.inboundUrl&&<label className="cr-field">Twilio incoming message webhook<input type="url" readOnly value={settings.inboundUrl}/></label>}
 <p>Set this webhook on the sending number in Twilio to record STOP, START and HELP replies.</p>
 <form className="cr-form" onSubmit={event=>{event.preventDefault();void save()}}>
 <label className="cr-field">Twilio Account SID<input disabled={!settings||busy} required value={accountSid} onChange={event=>setAccountSid(event.target.value)} autoComplete="off" spellCheck={false}/></label>
 <label className="cr-field">Twilio Auth Token<input disabled={!settings||busy} required type="password" value={authToken} onChange={event=>setAuthToken(event.target.value)} autoComplete="new-password"/></label>
 <label className="cr-field">Sending number or Messaging Service<input disabled={!settings||busy} required value={from} onChange={event=>setFrom(event.target.value)} autoComplete="off" spellCheck={false}/></label>
 <p>The token is encrypted and never shown again. Saving replaces it. Twilio enforces messaging registration.</p>
 <div className="cr-actions"><button className="cr-button" disabled={busy||!settings}>{busy?'Saving…':settings?.configured?'Replace Twilio credentials':'Connect Twilio'}</button>{settings?.configured&&<button className="cr-button cr-button--quiet" type="button" disabled={busy||!settings} onClick={()=>void save(true)}>Remove Twilio</button>}</div>
 </form>
 <section className="cr-stack" aria-label="Unattributed SMS replies"><h4>Unattributed replies</h4><p>These replies have no unique record match. STOP and START still update installation consent. Latest 100 replies.</p>
 {settings?.replies.length?<ul>{settings.replies.map(reply=><li key={reply.id}><p><Timestamp value={reply.receivedAt}/> · {reply.from} · {reply.event}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{reply.body}</p></li>)}</ul>:<p>No unattributed replies.</p>}</section>
 {error&&<p className="cr-error" role="alert">{error}</p>}
 </section>
}

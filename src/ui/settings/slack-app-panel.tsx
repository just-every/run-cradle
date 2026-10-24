import {useState} from 'react'
import {readApi,useResource} from '../shared/api'
import {ResourceState} from '../shared/presentation'
import {SlackUnfurlFields} from './slack-unfurl-fields'
type Settings={configured:boolean;installed:boolean;teamName?:string;clientId?:string;linked:boolean;canConfigure:boolean;oauthCallbackUrl?:string;interactionUrl?:string;eventsUrl?:string;linkCommandUrl?:string}
const root='/api/user-automations/slack'
function SlackAppConfiguration({settings,refresh}:{settings:Settings;refresh:()=>void}){
 const [clientId,setClientId]=useState(settings.clientId??''),[clientSecret,setClientSecret]=useState(''),[signingSecret,setSigningSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 async function change(remove=false){setBusy(true);setError(null);try{await readApi(root+'/settings',{method:remove?'DELETE':'PUT',...(remove?{}:{body:JSON.stringify({clientId,clientSecret,signingSecret})})});setClientSecret('');setSigningSecret('');refresh()}catch(e){setError(e instanceof Error?e.message:'Could not save Slack configuration.')}finally{setBusy(false)}}
 async function install(){setBusy(true);setError(null);try{const result=await readApi<{authorizeUrl:string}>(root+'/install',{method:'POST',body:JSON.stringify({})});window.location.assign(result.data.authorizeUrl)}catch(e){setError(e instanceof Error?e.message:'Could not start Slack installation.');setBusy(false)}}
 return <section className="cr-stack" aria-label="Slack app configuration"><h4>App configuration</h4>
  <form className="cr-stack" onSubmit={event=>{event.preventDefault();void change()}}><fieldset className="cr-stack" disabled={busy}><legend>Private app credentials</legend>
   <label className="cr-field">Slack client ID<input required autoComplete="off" value={clientId} onChange={event=>setClientId(event.target.value)}/></label>
   <label className="cr-field">Slack client secret<input required type="password" autoComplete="new-password" value={clientSecret} onChange={event=>setClientSecret(event.target.value)}/></label>
   <label className="cr-field">Slack signing secret<input required type="password" autoComplete="new-password" value={signingSecret} onChange={event=>setSigningSecret(event.target.value)}/></label>
   <p>Secrets are encrypted and never shown again. Replacing credentials requires installing the app again.</p>
   <button className="cr-button" disabled={busy}>{settings.configured?'Replace Slack credentials':'Save Slack credentials'}</button>
   {settings.configured&&<><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void install()}>{settings.installed?'Reinstall Slack app':'Install Slack app'}</button><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void change(true)}>Remove Slack connection</button></>}
  </fieldset></form>
  {settings.configured&&<fieldset className="cr-stack"><legend>Slack app request URLs</legend>{([['OAuth callback URL',settings.oauthCallbackUrl],['Interaction request URL',settings.interactionUrl],['Event request URL',settings.eventsUrl],['Link command URL',settings.linkCommandUrl]] as const).map(([label,url])=>url&&<label className="cr-field" key={label}>{label}<input type="url" readOnly value={url}/></label>)}<p>Use these URLs for the app’s OAuth redirect, interactivity, link_shared event subscription and /cradle-link command.</p></fieldset>}
  {error&&<p className="cr-error" role="alert">{error}</p>}
 </section>
}
export function SlackAppPanel(){
 const resource=useResource<Settings>(root+'/settings'),[code,setCode]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 async function link(remove=false){setBusy(true);setError(null);try{if(remove){await readApi(root+'/link',{method:'DELETE'});setCode(null);resource.refresh()}else{const result=await readApi<{code:string}>(root+'/link',{method:'POST',body:JSON.stringify({})});setCode(result.data.code)}}catch(e){setError(e instanceof Error?e.message:'Could not update your Slack link.')}finally{setBusy(false)}}
 return <section className="cr-stack" aria-label="Slack app settings"><h3>Slack app</h3><ResourceState resource={resource.resource} operation="Slack settings" retry={resource.refresh}>{settings=><>
  <p role="status">{settings.installed?`Connected to ${settings.teamName??'your Slack workspace'}`:settings.configured?'Ready to install in Slack':'Not configured'}</p>
  {settings.canConfigure&&<SlackAppConfiguration settings={settings} refresh={resource.refresh}/>}
  <section className="cr-stack" aria-label="Your Slack account"><h4>Your Slack account</h4><p>{settings.linked?'Your Slack account is linked to this Cradle account.':'Link your own account before approving records or sharing record previews in Slack.'}</p>
   {settings.linked?<button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void link(true)}>Unlink your Slack account</button>:<button className="cr-button" type="button" disabled={busy||!settings.installed} onClick={()=>void link()}>Link your Slack account</button>}
   {code&&<><label className="cr-field">One-time Slack link command<input readOnly value={'/cradle-link '+code}/></label><p>Run this command in the connected Slack workspace, then refresh your link.</p><button className="cr-button cr-button--quiet" type="button" onClick={()=>{setCode(null);resource.refresh()}}>Refresh Slack link</button></>}
  </section>
  {settings.installed&&<SlackUnfurlFields/>}
 </>}</ResourceState>{error&&<p className="cr-error" role="alert">{error}</p>}</section>
}

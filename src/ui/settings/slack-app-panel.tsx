import {useState} from 'react'
import {readApi,useResource} from '../shared/api'
import {ResourceState} from '../shared/presentation'
import {SlackUnfurlFields} from './slack-unfurl-fields'
type Provider='slack'|'nook'|'teams'
type Settings={provider:Provider;nookOrigin:string;configured:boolean;installed:boolean;teamName?:string;clientId?:string;linked:boolean;canConfigure:boolean;oauthCallbackUrl?:string;interactionUrl?:string;eventsUrl?:string;linkCommandUrl?:string}
const root='/api/user-automations/slack',labels={slack:'Slack',nook:'Nook',teams:'Teams'}
function SlackAppConfiguration({settings,refresh}:{settings:Settings;refresh:()=>void}){
 const [provider,setProvider]=useState<Provider>(settings.provider),[nookOrigin,setNookOrigin]=useState(settings.nookOrigin),[tenantId,setTenantId]=useState(''),[appToken,setAppToken]=useState('')
 const [clientId,setClientId]=useState(settings.clientId??''),[clientSecret,setClientSecret]=useState(''),[signingSecret,setSigningSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),label=labels[provider]
 async function change(remove=false){setBusy(true);setError(null);try{await readApi(root+'/settings',{method:remove?'DELETE':'PUT',...(remove?{}:{body:JSON.stringify({provider,clientId,...(provider==='nook'?{nookOrigin,appToken,signingSecret}:provider==='teams'?{clientSecret,tenantId}:{clientSecret,signingSecret})})})});setClientSecret('');setSigningSecret('');setAppToken('');refresh()}catch(e){setError(e instanceof Error?e.message:'Could not save chat configuration.')}finally{setBusy(false)}}
 async function install(){setBusy(true);setError(null);try{const result=await readApi<{authorizeUrl?:string;installed?:boolean}>(root+'/install',{method:'POST',body:JSON.stringify({})});if(result.data.installed){refresh();setBusy(false)}else if(result.data.authorizeUrl)window.location.assign(result.data.authorizeUrl);else throw new Error('The provider omitted its installation result.')}catch(e){setError(e instanceof Error?e.message:'Could not start installation.');setBusy(false)}}
 return <section className="cr-stack" aria-label="Chat app configuration"><h4>App configuration</h4>
  <form className="cr-stack" onSubmit={event=>{event.preventDefault();void change()}}><fieldset className="cr-stack" disabled={busy}><legend>Private app credentials</legend>
   <label className="cr-field">Chat provider<select value={provider} onChange={event=>setProvider(event.target.value as Provider)}><option value="slack">Slack</option><option value="teams">Microsoft Teams</option><option value="nook">Nook</option></select></label>
   <label className="cr-field">{label} client ID<input required autoComplete="off" value={clientId} onChange={event=>setClientId(event.target.value)}/></label>
   {provider==='nook'?<><label className="cr-field">Nook origin<input required type="url" autoComplete="off" value={nookOrigin} onChange={event=>setNookOrigin(event.target.value)}/></label><label className="cr-field">Nook scoped app token<input required type="password" autoComplete="new-password" value={appToken} onChange={event=>setAppToken(event.target.value)}/></label></>:<label className="cr-field">{label} client secret<input required type="password" autoComplete="new-password" value={clientSecret} onChange={event=>setClientSecret(event.target.value)}/></label>}
   {provider==='teams'?<label className="cr-field">Microsoft tenant ID<input required autoComplete="off" value={tenantId} onChange={event=>setTenantId(event.target.value)}/></label>:<label className="cr-field">{label} signing secret<input required type="password" autoComplete="new-password" value={signingSecret} onChange={event=>setSigningSecret(event.target.value)}/></label>}
   <p>One chat provider is active at a time. Switching stops old approval actions until you review them for the new provider. Secrets are encrypted and never shown again. Replacing credentials requires installing again.</p>
   <button className="cr-button" disabled={busy}>{settings.configured?'Replace '+label+' credentials':'Save '+label+' credentials'}</button>
   {settings.configured&&<><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void install()}>{settings.installed?'Reinstall '+labels[settings.provider]+' app':'Install '+labels[settings.provider]+' app'}</button><button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void change(true)}>Remove chat connection</button></>}
  </fieldset></form>
  {settings.configured&&<fieldset className="cr-stack"><legend>App request URLs</legend>{([['OAuth callback URL',settings.provider==='nook'?undefined:settings.oauthCallbackUrl],['Interaction request URL',settings.interactionUrl],['Event request URL',settings.eventsUrl],['Link command URL',settings.linkCommandUrl]] as const).map(([name,url])=>url&&<label className="cr-field" key={name}>{name}<input type="url" readOnly value={url}/></label>)}<p>{settings.provider==='teams'?'Use the interaction URL as the Bot Framework messaging endpoint; it accepts linking commands, card decisions and link-preview invokes.':'Use these URLs for interactivity, link_shared events and the /cradle-link command. Slack also needs the OAuth redirect.'}</p></fieldset>}
  {error&&<p className="cr-error" role="alert">{error}</p>}
 </section>
}
export function SlackAppPanel(){
 const resource=useResource<Settings>(root+'/settings'),[code,setCode]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 async function link(remove=false){setBusy(true);setError(null);try{if(remove){await readApi(root+'/link',{method:'DELETE'});setCode(null);resource.refresh()}else{const result=await readApi<{code:string}>(root+'/link',{method:'POST',body:JSON.stringify({})});setCode(result.data.code)}}catch(e){setError(e instanceof Error?e.message:'Could not update your chat link.')}finally{setBusy(false)}}
 return <section className="cr-stack" aria-label="Chat app settings"><h3>Chat app</h3><ResourceState resource={resource.resource} operation="Chat settings" retry={resource.refresh}>{settings=>{const label=labels[settings.provider];return <>
  <p role="status">{settings.installed?`Connected to ${settings.teamName??'your '+label+' workspace'}`:settings.configured?'Ready to install in '+label:'Not configured'}</p>
  {settings.canConfigure&&<SlackAppConfiguration key={settings.provider} settings={settings} refresh={resource.refresh}/>}
  <section className="cr-stack" aria-label={'Your '+label+' account'}><h4>Your {label} account</h4><p>{settings.linked?'Your '+label+' account is linked to this Cradle account.':'Link your own account before approving records or sharing record previews in '+label+'.'}</p>
   {settings.linked?<button className="cr-button cr-button--quiet" type="button" disabled={busy} onClick={()=>void link(true)}>Unlink your {label} account</button>:<button className="cr-button" type="button" disabled={busy||!settings.installed} onClick={()=>void link()}>Link your {label} account</button>}
   {code&&<><label className="cr-field">One-time {label} link command<input readOnly value={'/cradle-link '+code}/></label><p>Run this command in the connected {label} workspace, then refresh your link.</p><button className="cr-button cr-button--quiet" type="button" onClick={()=>{setCode(null);resource.refresh()}}>Refresh {label} link</button></>}
  </section>
  {settings.installed&&<SlackUnfurlFields/>}
 </>}}</ResourceState>{error&&<p className="cr-error" role="alert">{error}</p>}</section>
}

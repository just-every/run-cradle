import { useCommand } from '../shared/api'
import { CommandFeedback } from '../shared/presentation'
import { storeLabels } from './store-reference-view'
type Provider='google-drive'|'onedrive'|'dropbox'|'box'
export function StoreConnect({appId,provider,preview=false}:{appId:string;provider:Provider;preview?:boolean}){
 const configure=useCommand<{connectionId:string}>(`store-configure:${appId}:${provider}`),consent=useCommand<{authorizationUrl:string}>(`store-consent:${appId}:${provider}`)
 async function connect(){
  const saved=await configure.submit('/api/v1/commands/connection.configure',{appId,adapterId:provider,name:`My ${storeLabels[provider]}`,accountId:'me',scopes:[],ownership:[],credentialRef:null},[])
  if(!saved)return
  const result=await consent.submit('/api/v1/commands/connection.begin-consent',{connectionId:saved.connectionId,returnTo:`${location.pathname}${location.search}`},[])
  if(result)window.location.assign(result.authorizationUrl)
 }
 return <span><button type="button" className="cr-button cr-button--quiet" disabled={[configure.result.state,consent.result.state].includes('submitting')} onClick={()=>void connect()}>Connect {storeLabels[provider]}{preview?' to preview':''}</button><CommandFeedback {...configure}/><CommandFeedback {...consent}/></span>
}

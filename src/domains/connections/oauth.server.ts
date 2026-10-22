import { z } from 'zod';
import { base64, bytes, base64url } from '../../adapters/crypto.server';
import { ProviderTransport } from '../../adapters/transport.server';
import type { Endpoint } from '../../adapters/transport.server';
export type OAuthProvider='gmail'|'google-sheets'|'google-calendar'|'google-drive'|'onedrive'|'dropbox'|'box'|'xero';
export type OAuthConfiguration={clientId:string;clientSecret:string;redirectUri:string};
export type FileStoreProvider='google-drive'|'onedrive'|'dropbox'|'box';
export const fileStoreProviders:readonly FileStoreProvider[]=['google-drive','onedrive','dropbox','box'];
/** The route segment and env pair one provider family shares: every Google service uses one client. */
export type OAuthFamily='google'|'xero'|'microsoft'|'dropbox'|'box';
export const oauthFamily=(provider:OAuthProvider):OAuthFamily=>provider==='xero'?'xero':provider==='onedrive'?'microsoft':provider==='dropbox'?'dropbox':provider==='box'?'box':'google';
const families:Record<OAuthFamily,{authorize:string;token:Endpoint;revoke:Endpoint|null;basicToken:boolean;extra:Record<string,string>}>={
 google:{authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'google.token',revoke:'google.revoke',basicToken:false,extra:{access_type:'offline',prompt:'consent'}},
 xero:{authorize:'https://login.xero.com/identity/connect/authorize',token:'xero.token',revoke:'xero.revoke',basicToken:true,extra:{}},
 microsoft:{authorize:'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:'microsoft.token',revoke:null,basicToken:false,extra:{prompt:'consent'}},
 dropbox:{authorize:'https://www.dropbox.com/oauth2/authorize',token:'dropbox.token',revoke:'dropbox.revoke',basicToken:false,extra:{token_access_type:'offline'}},
 box:{authorize:'https://account.box.com/api/oauth2/authorize',token:'box.token',revoke:'box.revoke',basicToken:false,extra:{}},
};
/** Narrowest read scopes that serve each chooser: names, thumbnails and the store's own link; Cradle never asks to write. */
export const oauthScopes=(provider:OAuthProvider)=>provider==='gmail'?['https://www.googleapis.com/auth/gmail.readonly']:provider==='google-sheets'?['https://www.googleapis.com/auth/spreadsheets.readonly']:provider==='google-calendar'?['https://www.googleapis.com/auth/calendar.events.owned']:provider==='google-drive'?['https://www.googleapis.com/auth/drive.metadata.readonly']:provider==='onedrive'?['Files.Read','offline_access']:provider==='dropbox'?['files.metadata.read','files.content.read']:provider==='box'?['root_readonly']:['accounting.invoices','offline_access'];
export function consentURL(provider:OAuthProvider,config:OAuthConfiguration,state:string,challenge:string){const family=families[oauthFamily(provider)],url=new URL(family.authorize);url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:oauthScopes(provider).join(' '),state,code_challenge:challenge,code_challenge_method:'S256',...family.extra}).toString();return url.toString();}
export const pkceChallenge=async(verifier:string)=>base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(verifier))));
export type Tokens={accessToken:string;refreshToken:string|null;expiresAt:string;scopes:string[]};
export function oauthTransport(transport=new ProviderTransport()) {
 async function token(provider:OAuthProvider,config:OAuthConfiguration,form:URLSearchParams,previousRefresh:string|null):Promise<Tokens>{
  const family=families[oauthFamily(provider)],headers:Record<string,string>={};form.set('client_id',config.clientId);if(family.basicToken)headers.authorization=`Basic ${base64(bytes(`${config.clientId}:${config.clientSecret}`))}`;else form.set('client_secret',config.clientSecret);
  const r=await transport.request(family.token,{headers,form,deadline:new Date(Date.now()+30_000).toISOString()});
  // Box states its scopes in the application, not in the token response.
  const parsed=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1).optional(),expires_in:z.number().int().positive(),scope:z.string().min(1).optional(),token_type:z.string().refine(s=>s.toLowerCase()==='bearer')}).safeParse(r.body);
  if(r.status!==200||!parsed.success||!parsed.data.scope&&provider!=='box')throw new Error('OAuth token exchange failed; connection needs authorization');
  const granted=parsed.data.scope?parsed.data.scope.split(/\s+/):[...oauthScopes(provider)];if(oauthScopes(provider).filter(s=>s!=='offline_access').some(s=>!granted.includes(s)))throw new Error('Provider did not grant requested scopes');
  return {accessToken:parsed.data.access_token,refreshToken:parsed.data.refresh_token??previousRefresh,expiresAt:new Date(Date.now()+parsed.data.expires_in*1000).toISOString(),scopes:granted};
 }
 return {exchange:(p:OAuthProvider,c:OAuthConfiguration,code:string,verifier:string)=>token(p,c,new URLSearchParams({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:c.redirectUri}),null),refresh:(p:OAuthProvider,c:OAuthConfiguration,refresh:string)=>token(p,c,new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}),refresh),async revoke(p:OAuthProvider,c:OAuthConfiguration,refresh:string){const family=families[oauthFamily(p)];if(!family.revoke)throw new Error('Provider has no remote revocation; the person removes access in the provider account');const headers:Record<string,string>=p==='xero'?{authorization:`Basic ${base64(bytes(`${c.clientId}:${c.clientSecret}`))}`}:p==='dropbox'?{authorization:`Bearer ${refresh}`}:{ };const form=p==='dropbox'?undefined:new URLSearchParams({token:refresh,...(p==='box'?{client_id:c.clientId,client_secret:c.clientSecret}:{})});const r=await transport.request(family.revoke,{headers,...(form?{form}:{}),deadline:new Date(Date.now()+30_000).toISOString()});if(r.status!==200)throw new Error('Remote revocation unconfirmed');}};
}

import { z } from 'zod';
import { base64, bytes, base64url } from '../../adapters/crypto.server';
import { ProviderTransport } from '../../adapters/transport.server';
export type OAuthProvider='gmail'|'google-calendar'|'xero';
export type OAuthConfiguration={clientId:string;clientSecret:string;redirectUri:string};
export const oauthScopes=(provider:OAuthProvider)=>provider==='gmail'?['https://www.googleapis.com/auth/gmail.readonly']:provider==='google-calendar'?['https://www.googleapis.com/auth/calendar.events.owned']:['accounting.invoices','offline_access'];
export function consentURL(provider:OAuthProvider,config:OAuthConfiguration,state:string,challenge:string){const url=new URL(provider==='xero'?'https://login.xero.com/identity/connect/authorize':'https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:oauthScopes(provider).join(' '),state,code_challenge:challenge,code_challenge_method:'S256',...(provider==='xero'?{}:{access_type:'offline',prompt:'consent'})}).toString();return url.toString();}
export const pkceChallenge=async(verifier:string)=>base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(verifier))));
export type Tokens={accessToken:string;refreshToken:string|null;expiresAt:string;scopes:string[]};
export function oauthTransport(transport=new ProviderTransport()) {
 async function token(provider:OAuthProvider,config:OAuthConfiguration,form:URLSearchParams,previousRefresh:string|null):Promise<Tokens>{
  const headers:Record<string,string>={};form.set('client_id',config.clientId);if(provider==='xero')headers.authorization=`Basic ${base64(bytes(`${config.clientId}:${config.clientSecret}`))}`;else form.set('client_secret',config.clientSecret);
  const r=await transport.request(provider==='xero'?'xero.token':'google.token',{headers,form,deadline:new Date(Date.now()+30_000).toISOString()});
  const parsed=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1).optional(),expires_in:z.number().int().positive(),scope:z.string().min(1),token_type:z.string().refine(s=>s.toLowerCase()==='bearer')}).safeParse(r.body);
  if(r.status!==200||!parsed.success)throw new Error('OAuth token exchange failed; connection needs authorization');
  const granted=parsed.data.scope.split(/\s+/);if(oauthScopes(provider).filter(s=>s!=='offline_access').some(s=>!granted.includes(s)))throw new Error('Provider did not grant requested scopes');
  return {accessToken:parsed.data.access_token,refreshToken:parsed.data.refresh_token??previousRefresh,expiresAt:new Date(Date.now()+parsed.data.expires_in*1000).toISOString(),scopes:granted};
 }
 return {exchange:(p:OAuthProvider,c:OAuthConfiguration,code:string,verifier:string)=>token(p,c,new URLSearchParams({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:c.redirectUri}),null),refresh:(p:OAuthProvider,c:OAuthConfiguration,refresh:string)=>token(p,c,new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}),refresh),async revoke(p:OAuthProvider,c:OAuthConfiguration,refresh:string){const headers:Record<string,string>=p==='xero'?{authorization:`Basic ${base64(bytes(`${c.clientId}:${c.clientSecret}`))}`}:{ };const r=await transport.request(p==='xero'?'xero.revoke':'google.revoke',{headers,form:new URLSearchParams({token:refresh}),deadline:new Date(Date.now()+30_000).toISOString()});if(r.status!==200)throw new Error('Remote revocation unconfirmed');}};
}

import type {PlatformBindings} from '../../core/platform/bindings'
import {RelayTransport} from '../integrations/relay-transport.server'
import {AuthorityError} from '../authority/errors'
export type TwilioCredentials={accountSid:string;authToken:string;from:string}
export function normalizePhone(value:unknown):string {
 if(Array.isArray(value)&&value.length===1)value=value[0]
 if(typeof value!=='string')throw new AuthorityError('validation','Choose a text phone value.',400)
 const raw=value.trim(),digits=raw.replace(/[\s().-]/g,'')
 const number=digits.startsWith('+')?digits:/^\d{10}$/.test(digits)?'+1'+digits:/^1\d{10}$/.test(digits)?'+'+digits:''
 if(!/^\+[1-9]\d{7,14}$/.test(number))throw new AuthorityError('validation','Phone value must normalize to E.164; US numbers may omit +1.',400)
 return number
}
export function twilioTransport(env:PlatformBindings){
 if(!env.EGRESS_RELAY_URL||!env.EGRESS_RELAY_SECRET)throw new AuthorityError('unconfigured','Configure the trusted HTTPS egress relay for Twilio.',503)
 return new RelayTransport(env.EGRESS_RELAY_URL,env.EGRESS_RELAY_SECRET)
}
export async function twilioRequest(env:PlatformBindings,credentials:TwilioCredentials,url:string,body?:URLSearchParams,id?:string){
 const result=await twilioTransport(env).send({url,method:body?'POST':'GET',headers:{authorization:'Basic '+btoa(credentials.accountSid+':'+credentials.authToken),...(body?{'content-type':'application/x-www-form-urlencoded'}:{}),...(id?{'I-Twilio-Idempotency-Token':id}:{})},body:body?.toString()??''})
 return result
}
export function messagesUrl(credentials:TwilioCredentials){return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Messages`}
export async function a2pRegistration(env:PlatformBindings,credentials:TwilioCredentials):Promise<string>{
 async function get(url:string){const response=await twilioRequest(env,credentials,url);if(response.status!==200)throw new AuthorityError('unconfigured','Twilio registration status is unavailable; check the account credentials.',503);try{const value=JSON.parse(response.body);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value}catch{throw new AuthorityError('unconfigured','Twilio registration status returned an invalid response.',503)}}
 let services:string[]=[]
 if(credentials.from.startsWith('MG'))services=[credentials.from]
 else{
  const list=await get('https://messaging.twilio.com/v1/Services?PageSize=100')
  if(list.meta?.next_page_url)throw new AuthorityError('unconfigured','Too many Messaging Services to resolve this number; configure its Messaging Service instead.',503)
  for(const service of list.services??[]){
   const phones=await get(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(service.sid)}/PhoneNumbers?PageSize=100`)
   if(phones.meta?.next_page_url)throw new AuthorityError('unconfigured','Too many numbers in a Messaging Service; configure its Messaging Service instead.',503)
   if((phones.phone_numbers??[]).some((phone:{phone_number:string})=>phone.phone_number===credentials.from))services.push(service.sid)
  }
 }
 const statuses:string[]=[]
 for(const service of services){
  const result=await get(`https://messaging.twilio.com/v1/Services/${encodeURIComponent(service)}/Compliance/Usa2p`)
  for(const campaign of result.compliance??[]){
   if(typeof campaign.campaign_status==='string')statuses.push('Campaign: '+campaign.campaign_status)
   if(typeof campaign.brand_registration_sid==='string'){
    const brand=await get('https://messaging.twilio.com/v1/a2p/BrandRegistrations/'+encodeURIComponent(campaign.brand_registration_sid))
    statuses.push('Brand: '+(typeof brand.status==='string'?brand.status:'Status unavailable')+(typeof brand.identity_status==='string'?' ('+brand.identity_status+')':''))
   }
  }
 }
 return statuses.length?[...new Set(statuses)].join(', '):'No registered US A2P campaign found'
}
export async function verifyTwilio(request:Request,origin:string,params:URLSearchParams,secret:string){
 const url=new URL(request.url),external=origin+url.pathname+url.search
 const keys=[...new Set(params.keys())].sort()
 let payload=external
 for(const key of keys)for(const value of [...new Set(params.getAll(key))].sort())payload+=key+value
 let signature:Uint8Array
 try{signature=Uint8Array.from(atob(request.headers.get('x-twilio-signature')??''),c=>c.charCodeAt(0))}catch{return false}
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['verify'])
 return crypto.subtle.verify('HMAC',key,signature as Uint8Array<ArrayBuffer>,new TextEncoder().encode(payload))
}

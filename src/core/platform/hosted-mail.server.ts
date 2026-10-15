import type {PlatformBindings} from './bindings'
import {createMailSender} from '../../../vendor/base/modules/mail/index.mjs'

/** Provider credentials stay separate: Managed never needs a provider account. */
export function hostedMailConfig(env:PlatformBindings) {
 if(env.MAIL_PROVIDER==='rer')return {provider:'rer' as const,mode:'production' as const,apiKey:env.MAIL_API_KEY,relayUrl:env.MAIL_RELAY_URL}
 if(env.MAIL_PROVIDER==='sendgrid'||env.MAIL_PROVIDER==='resend')return {provider:env.MAIL_PROVIDER,mode:'production' as const,apiKey:env.MAIL_PROVIDER_API_KEY}
 return undefined
}
export function hostedMailFaults(env:PlatformBindings):string[] {
 const faults:string[]=[]
 if(!env.MAIL_FROM?.trim())faults.push('MAIL_FROM')
 const config=hostedMailConfig(env)
 if(!config)return [...faults,'MAIL_PROVIDER (rer, sendgrid or resend)']
 if(!config.apiKey?.trim())faults.push(env.MAIL_PROVIDER==='rer'?'MAIL_API_KEY':'MAIL_PROVIDER_API_KEY')
 if(env.MAIL_PROVIDER==='rer'&&!env.MAIL_RELAY_URL?.trim())faults.push('MAIL_RELAY_URL')
 if(!faults.length)try{createMailSender(config)}catch{faults.push(env.MAIL_PROVIDER==='rer'?'MAIL_RELAY_URL or MAIL_API_KEY':'MAIL_PROVIDER_API_KEY')}
 return faults
}
export const hostedMailConfigured=(env:PlatformBindings)=>hostedMailFaults(env).length===0

import type {PlatformBindings} from '../../core/platform/bindings'
import {createMailSender,MailValidationError} from '../../../vendor/base/modules/mail/index.mjs'
import {hostedMailConfigured,hostedMailConfig} from '../../core/platform/hosted-mail.server'
import {localMailEnabled} from '../../core/platform/local-auth.server'
import {AuthorityError} from '../authority/errors'
export async function sendBuilderTestMail(env:PlatformBindings,input:{id:string;email:string;subject:string;text:string},authorize:()=>Promise<void>){
 const local=env.RER_DEMO==='1'||localMailEnabled(env)
 if(!(env.MAIL_PROVIDER==='development'&&local&&env.MAIL_FROM)&&!hostedMailConfigured(env))throw new AuthorityError('unconfigured','Configure the installation mail sender before testing an email action.',503)
 const mail=env.MAIL_PROVIDER==='development'?createMailSender({provider:'development',mode:'development'}):createMailSender(hostedMailConfig(env)!)
 await authorize()
 try{const result=await mail.send({deliveryId:input.id,from:env.MAIL_FROM!,to:[input.email],subject:input.subject,text:input.text});return {state:['accepted','development'].includes(result.status)?'Complete':result.status==='uncertain'?'Unknown':'Failed',status:result.status,providerMessageId:result.providerMessageId??null}}
 catch(error){if(error instanceof MailValidationError)return {state:'Failed',status:error.code,providerMessageId:null};return {state:'Unknown',status:'acknowledgement_unknown',providerMessageId:null}}
}

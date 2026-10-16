import assert from 'node:assert/strict'
import {completeFirstRun} from './complete-first-run.mjs'
import {fixtureMessages} from './fixture-mail.mjs'

/** Request actual Base email, capture only at the provider edge, then confirm. */
export async function baseHttpSession(origin,email='maya@northstar.example',send=fetch){
 const post=(route,body)=>send(origin+route,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
 const before=(await fixtureMessages(origin)).length
 const asked=await post('/auth/magic-link',{email,returnTo:'/app'});assert.equal(asked.status,202)
 await asked.arrayBuffer()
 const messages=(await fixtureMessages(origin)).slice(before)
 const message=messages.find(message=>message.personalizations?.some(group=>group.to?.some(recipient=>recipient.email?.toLowerCase()===email.toLowerCase())))
 assert.ok(message,'The real provider request includes the requested recipient')
 const text=message.content?.find(part=>part.type==='text/plain')?.value??''
 const href=(text.match(/https?:\/\/[^\s<>"']+/g)??[]).find(value=>URL.canParse(value)&&new URL(value).origin===origin&&new URL(value).pathname==='/auth/confirm')
 assert.ok(href,'The real provider message contains a confirmation link for this installation')
 const token=new URL(href).searchParams.get('token')
 assert.ok(token,'The provider message contains a confirmation token')
 const confirmed=await post('/auth/confirm',{token});assert.equal(confirmed.status,303)
 const cookie=confirmed.headers.get('set-cookie').split(';')[0]
 await completeFirstRun(origin,cookie,send)
 const csrf=await send(origin+'/auth/csrf',{headers:{cookie}});assert.equal(csrf.status,200)
 return {cookie,csrfToken:(await csrf.json()).csrfToken,token}
}

import assert from 'node:assert/strict'
import {completeFirstRun} from './complete-first-run.mjs'
import {withDevKey} from './dev-gate.mjs'
/** Sign in through the same local HTTP/outbox/confirmation flow the owner uses. */
export async function baseHttpSession(origin,email='maya@northstar.example',send=fetch){
 const post=(route,body)=>send(origin+route,{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
 const asked=await post('/auth/magic-link',{email,returnTo:'/app'});assert.equal(asked.status,202)
 const listing=await send(origin+'/__dev/outbox',withDevKey());assert.equal(listing.status,200)
 const listingHtml=await listing.text(),messagePath=listingHtml.match(/href="([^"<>]+\?message=[^"<>]+)"/)?.[1];assert.ok(messagePath)
 const detail=await send(new URL(messagePath.replaceAll('&amp;','&'),origin),withDevKey());assert.equal(detail.status,200)
 const html=await detail.text(),href=html.match(/href="(https?:\/\/[^"<>]+\/auth\/confirm\?token=[^"<>]+)"/)?.[1];assert.ok(href)
 const link=new URL(href.replaceAll('&amp;','&'))
 const confirmed=await post('/auth/confirm',{token:link.searchParams.get('token')});assert.equal(confirmed.status,303)
 const cookie=confirmed.headers.get('set-cookie').split(';')[0]
 await completeFirstRun(origin,cookie,send)
 const csrf=await send(origin+'/auth/csrf',{headers:{cookie}});assert.equal(csrf.status,200)
 return {cookie,csrfToken:(await csrf.json()).csrfToken}
}

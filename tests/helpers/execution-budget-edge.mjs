import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

/** Only fetch is doubled. Requests and response bytes still cross ProviderTransport. */
export function executionBudgetEdge(){
 const bindings=new Map(),reads=[],writes=[]
 let readback='unknown',duringRead=()=>{},dispatching=false
 const requestId='calendar-budget-readback'
 function register(a,input){
  const eventId=createHash('sha256').update(a.idempotencyKey).digest('hex')
  const url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events/${eventId}`
  const body=JSON.stringify({id:eventId,status:'confirmed',summary:input.summary,etag:'original-calendar-etag',start:{dateTime:input.start,timeZone:input.timezone},end:{dateTime:input.end,timeZone:input.timezone},extendedProperties:{private:{cradleHash:a.inputHash,cradleCommand:a.commandId}}})
  const binding={...a,input,eventId,url,body,receiptHash:createHash('sha256').update(body).digest('hex'),requestId}
  bindings.set(url,binding);return binding
 }
 async function fetch(url,init){
  assert.equal(init.headers.get('authorization'),'Bearer test-only-budget-calendar-token')
  assert.equal(init.redirect,'manual')
  if(init.method!=='GET'){
   writes.push({url,method:init.method,body:init.body})
   assert.ok(dispatching,'Public readback/replay must never send a provider write')
   assert.equal(init.method,'POST')
   const body=JSON.parse(init.body),binding=[...bindings.values()].find(b=>b.eventId===body.id)
   assert.ok(binding,'Dispatch must use the original deterministic event ID')
   assert.equal(url,binding.url.slice(0,binding.url.lastIndexOf('/'))+'?sendUpdates=none')
   assert.deepEqual(body.extendedProperties.private,{cradleHash:binding.inputHash,cradleCommand:binding.commandId})
   return Response.json({error:{code:400,message:'Calendar refused the original dispatch'}},{status:400})
  }
  const binding=bindings.get(url)
  assert.ok(binding,'Readback must target an original calendar/event binding')
  assert.equal(init.body,undefined)
  reads.push({url,method:init.method,body:init.body})
  await duringRead()
  return readback==='confirmed'?new Response(binding.body,{status:200,headers:{'content-type':'application/json','x-request-id':requestId}}):Response.json({error:{code:503,message:'Readback temporarily unavailable'}},{status:503})
 }
 return {fetch,register,counts:()=>({reads:[...reads],writes:writes.length}),setReadback(state,callback=()=>{}){assert.ok(['unknown','confirmed'].includes(state));readback=state;duringRead=callback},async originalDispatch(work){assert.equal(dispatching,false);dispatching=true;try{return await work()}finally{dispatching=false}}}
}

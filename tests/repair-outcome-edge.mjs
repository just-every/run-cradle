/** Network-edge double only: real calendar/Xero adapters validate these wire responses. */
export function repairProviderEdge(){
 const events=new Map(),invoices=new Map(),calls=[]
 let booking='confirmed',cancellation='confirmed',accounting='confirmed'
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
 async function fetch(request){const url=new URL(request.url),call={method:request.method,path:url.pathname,key:request.headers.get('idempotency-key')};calls.push(call)
  if(url.hostname==='www.googleapis.com'&&url.pathname.includes('/calendar/v3/calendars/')){
   if(request.method==='POST'){const body=await request.json();call.eventId=body.id;if(booking==='rate-limited')return response({error:{message:'Rate limit prevented booking'}},429);if(booking==='refused')return response({error:{message:'Slot unavailable'}},400);events.set(body.id,{...body,status:'confirmed',etag:'fixture-etag'});if(booking==='unknown')return response({error:'response lost'},503);return response(events.get(body.id))}
   if(request.method==='DELETE'){if(cancellation==='rate-limited')return response({error:{message:'Rate limit prevented cancellation'}},429);if(cancellation==='refused')return response({error:'Cannot cancel'},400);const id=url.pathname.split('/').at(-1),item=events.get(id);if(item)events.set(id,{...item,status:'cancelled'});return cancellation==='unknown'?response({},503):new Response(null,{status:204})}
   const id=url.pathname.split('/').at(-1);return events.has(id)?response(events.get(id)):response({items:[...events.values()]})
  }
  if(url.hostname==='api.xero.com'&&url.pathname==='/connections')return response([{tenantId:'00000000-0000-4000-8000-000000000001'}])
  if(url.hostname==='api.xero.com'&&url.pathname.includes('/Invoices')){
   if(request.method==='POST'||request.method==='PUT'){const body=await request.json(),bill=body.Invoices[0],key=request.headers.get('idempotency-key');if(accounting==='refused')return response({Message:'Invoice rejected'},400);if(!invoices.has(key))invoices.set(key,{...bill,InvoiceID:crypto.randomUUID(),DateString:bill.Date,DueDateString:bill.DueDate,Total:bill.LineItems.reduce((sum,line)=>sum+line.LineAmount,0)});if(accounting==='unknown')return response({},503);return response({Invoices:[invoices.get(key)]})}
   const id=url.pathname.split('/').at(-1);return response({Invoices:[...invoices.values()].filter(v=>id==='Invoices'||v.InvoiceID===id)})
  }
  throw new Error(`Unexpected external call blocked: ${request.method} ${url.hostname}${url.pathname}`)
 }
 return {fetch,calls,events,invoices,setBooking:value=>booking=value,setCancellation:value=>cancellation=value,setAccounting:value=>accounting=value}
}

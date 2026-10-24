import assert from 'node:assert/strict'
const copy=value=>structuredClone(value)
const property=name=>`String {b9f59dd2-e833-49ea-a393-c3260f9de033} Name ${name}`
const marker=(event,name)=>event?.singleValueExtendedProperties?.find(p=>p.id===property(name))?.value
const response=(body,status=200,headers={})=>Response.json(body,{status,headers})
/** Recorded Microsoft Graph shapes, with actual transaction and private-property checks. */
export function recordOutlookProvider(){
 const ownedCalendarId='synthetic-cradle-calendar-owned',foreignCalendarId='synthetic-cradle-calendar-foreign',key=(calendar,id)=>`${calendar}:${id}`
 const events=new Map(),seen=[],reads=[],writes=[],lost=new Set(),limited=new Set(),denied=new Set();let version=0,identity=0
 const changeKey=()=>`synthetic-cradle-change-${++version}`
 const calendars=[{id:ownedCalendarId,name:'Synthetic Cradle owned calendar',canEdit:true,isSharedWithMe:false},{id:foreignCalendarId,name:'Synthetic shared calendar',canEdit:true,isSharedWithMe:true}]
 const projection=event=>({id:event.id,etag:event.changeKey,status:event.deleted?'cancelled':'confirmed',summary:event.subject,description:event.body.content,start:event.isAllDay?{date:event.start.dateTime.slice(0,10)}:{dateTime:event.start.dateTime+'Z'},end:event.isAllDay?{date:event.end.dateTime.slice(0,10)}:{dateTime:event.end.dateTime+'Z'},extendedProperties:{private:{cradleRecord:marker(event,'CradleRecord'),cradleDefinition:marker(event,'CradleDefinition'),cradleHash:marker(event,'CradleHash')}}})
 return {ownedCalendarId,foreignCalendarId,events,seen,reads,writes,denied,key,
  loseAckOnce(operation='create'){lost.add(operation)},rateLimitOnce(operation='create'){limited.add(operation)},
  externalEdit(calendar,id,patch){const event=events.get(key(calendar,id));assert.ok(event);if(patch.summary!==undefined)event.subject=patch.summary;for(const part of ['start','end'])if(patch[part])event[part]={dateTime:patch[part].date?patch[part].date+'T00:00:00':patch[part].dateTime.replace(/Z$/,''),timeZone:'UTC'};event.changeKey=changeKey()},
  externalDelete(calendar,id){const event=events.get(key(calendar,id));assert.ok(event);event.deleted=true;event.changeKey=changeKey()},
  event(calendar,id){return projection(events.get(key(calendar,id)))},
  body(log){return log.body?projection({...log.body,id:log.eventId,changeKey:''}):null},
  async fetch(request){
   const url=new URL(request.url),method=request.method,log={url:url.toString(),method,headers:Object.fromEntries(request.headers),calendarId:null,eventId:null,body:null,applied:false,outcome:null};seen.push(log)
   if(url.hostname==='login.microsoftonline.com'){
    assert.equal(url.pathname,'/common/oauth2/v2.0/token');assert.equal(method,'POST');const form=new URLSearchParams(await request.text());assert.ok(['authorization_code','refresh_token'].includes(form.get('grant_type')));assert.equal(form.get('client_id'),'synthetic-cradle-client');assert.ok(form.get('client_secret'))
    return response({access_token:'synthetic-cradle-access-1',refresh_token:'synthetic-cradle-refresh-1',token_type:'Bearer',expires_in:3600,scope:'Calendars.ReadWrite offline_access'})
   }
   assert.equal(url.hostname,'graph.microsoft.com');assert.match(request.headers.get('authorization')??'',/^Bearer synthetic-cradle-access-/)
   if(url.pathname==='/v1.0/me/calendars'){assert.equal(method,'GET');reads.push(log);return response({'@odata.context':'synthetic-cradle-context',value:copy(calendars)})}
   const match=/^\/v1\.0\/me\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);assert.ok(match,`Unhandled Graph route ${method} ${url.pathname}`)
   const calendar=decodeURIComponent(match[1]),id=match[2]?decodeURIComponent(match[2]):null;log.calendarId=calendar;log.eventId=id
   assert.equal(calendar,ownedCalendarId,'Shared calendars are not selectable')
   ;(method==='GET'?reads:writes).push(log)
   if(method==='GET'){
    assert.equal(request.headers.get('prefer'),'outlook.timezone="UTC", outlook.body-content-type="text"')
    assert.ok(url.searchParams.get('$expand')?.includes(property('CradleEffect')),'Graph readback expands the private properties')
    if(id){const value=events.get(key(calendar,id));return value&&!value.deleted?response(copy(value)):response({error:{code:'ErrorItemNotFound'}},404)}
    const filter=url.searchParams.get('$filter');assert.ok(filter,'Readback is bound to an effect or definition')
    const name=filter.includes(property('CradleEffect'))?'CradleEffect':'CradleDefinition',value=/ep\/value eq '([^']+)'/.exec(filter)?.[1];assert.ok(value)
    return response({'@odata.context':'synthetic-cradle-context',value:[...events.values()].filter(e=>!e.deleted&&marker(e,name)===value).map(copy)})
   }
   const raw=await request.text();log.body=raw?JSON.parse(raw):null;const operation=method==='POST'?'create':method==='DELETE'?'cancel':'move'
   if(limited.delete(operation)){log.outcome=429;return response({error:{code:'TooManyRequests'}},429,{'retry-after':'0'})}
   const body=log.body
   if(operation!=='cancel'){
    assert.equal(body.body.contentType,'text');assert.equal(body.start.timeZone,'UTC');assert.equal(body.end.timeZone,'UTC');for(const name of ['CradleEffect','CradleHash','CradleRecord','CradleDefinition'])assert.equal(typeof marker(body,name),'string')
   }
   let event
   if(operation==='create'){
    assert.equal(id,null);assert.equal(body.transactionId,marker(body,'CradleEffect'),'Graph transactionId uses the effect key')
    event=[...events.values()].find(e=>e.transactionId===body.transactionId)
    if(!event){event={...copy(body),id:`synthetic-cradle-graph-${++identity}`,changeKey:changeKey()};events.set(key(calendar,event.id),event)}
   }else{
    event=events.get(key(calendar,id));if(!event||event.deleted)return response({error:{code:'ErrorItemNotFound'}},404)
    assert.equal(request.headers.get('if-match'),`W/"${event.changeKey}"`,'Graph updates and deletes fence the last change key')
    if(operation==='cancel')event.deleted=true;else{assert.equal(method,'PATCH');Object.assign(event,copy(body))}event.changeKey=changeKey()
   }
   log.eventId=event.id;log.applied=true
   if(lost.delete(operation)){log.outcome='acknowledgement-lost';throw Error('synthetic-cradle-acknowledgement-lost')}
   log.outcome=operation==='cancel'?204:operation==='create'?201:200
   return operation==='cancel'?new Response(null,{status:204}):response(copy(event),log.outcome)
  }
 }
}

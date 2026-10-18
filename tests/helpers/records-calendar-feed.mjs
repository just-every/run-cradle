import './typescript-loader.mjs'
import assert from 'node:assert/strict'
import {harness,add} from './records-manual-harness.mjs'
import {createFixtureAuth} from './base-fixture-auth.mjs'
import {createRequestContextFactory} from '../../src/domains/authority/context.server.ts'
import {createCalendarFeeds} from '../../src/domains/records/calendar-feed.server.ts'
import {calendarFeedHttp} from '../../src/domains/records/calendar-feed-http.server.ts'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

export async function calendarFeedJourney(){
 const h=await harness(),origin='http://127.0.0.1:18841'
 try {
  await h.db.prepare("INSERT OR REPLACE INTO workspace_settings(id,created_at,updated_at,workspace_name,timezone,currency,quiet_hours_start,quiet_hours_end) VALUES('workspace',1,1,'Calendar','America/New_York','USD','18:00','08:00')").run()
  const title=newField('Title'),start=newField('Start','date'),end=newField('End','date'),instantStart=newField('Instant start','instant'),instantEnd=newField('Instant end','instant'),appId=createUlid(),entityId=createUlid()
  const {r}=await h.create({appId,name:'Calendar',tables:[{id:entityId,label:'Events',primaryFieldId:title.id,fields:[title,start,end,instantStart,instantEnd]}]})
  const table=r.registry.get(appId,entityId).schema
  await add(h,r,table,{[title.id]:'Private, event; 北',[start.id]:'2026-10-19',[end.id]:'2026-10-21',[instantStart.id]:'2026-11-01T05:30:00.000Z',[instantEnd.id]:'2026-11-01T07:30:00.000Z'})
  await add(h,r,table,{[title.id]:'Excluded',[start.id]:'2026-10-20'})
  for(let index=0;index<204;index++) await add(h,r,table,{[title.id]:`Paged event ${index}`,[start.id]:'2026-10-19'})
  const saved=await r.commands.get('view.save').execute(h.ctx,{commandId:createUlid(),expected:[],input:{view:{appId,entityId,name:'Calendar',display:'calendar',fields:[title.id,start.id,end.id],filter:{kind:'condition',fieldId:title.id,op:'ne',value:'Excluded'},sort:[],groupBy:[],layout:{titleFieldId:title.id,startFieldId:start.id,endFieldId:end.id},visibility:'private',shipped:false}}})
  const view=saved.result.value
  await assert.rejects(r.commands.get('view.save').execute(h.ctx,{commandId:createUlid(),expected:[],input:{view:{...Object.fromEntries(Object.entries(view).filter(([key])=>!['id','version','createdAt','updatedAt'].includes(key))),layout:{...view.layout,endFieldId:title.id}}}}),/same date type/)
  const config={appOrigin:origin,sessionSecret:'calendar-fixture-secret-at-least-32-characters',mode:'development'},auth=await createFixtureAuth(h.db,config,h.owner),login=await auth.signIn(),authenticate=createRequestContextFactory(h.db,config)
  const http=calendarFeedHttp(createCalendarFeeds(h.db,r.services.metadata,r.policy,origin),authenticate),path=`/api/v1/views/${view.id}/calendar-feed`
  async function request(path,method='GET',native=true){return http.fetch(new Request(origin+path,{method,headers:native?{host:new URL(origin).host,cookie:login.cookie,origin,'x-csrf-token':login.csrf}:{host:new URL(origin).host}}))}
  assert.equal((await request(path,'POST',false)).status,401)
  const issued=await request(path,'POST');assert.equal(issued.status,200,await issued.clone().text());const {data:feed}=await issued.json(),feedPath=new URL(feed.url).pathname
  const calendar=await request(feedPath,'GET',false);assert.equal(calendar.status,200);assert.match(calendar.headers.get('content-type'),/text\/calendar/);assert.equal(calendar.headers.get('cache-control'),'no-store')
  const text=await calendar.text();assert.match(text,/SUMMARY:Private\\, event\\; 北/);assert.match(text,/DTSTART;VALUE=DATE:20261019/);assert.match(text,/DTEND;VALUE=DATE:20261022/);assert.doesNotMatch(text,/Excluded/);assert.equal((text.match(/BEGIN:VEVENT/g)||[]).length,205)
  const bearer=feed.url.match(/([a-f0-9]{64})\.ics$/)[1]
  await assert.rejects(authenticate(new Request(origin+'/api/v1/apps',{headers:{host:new URL(origin).host,authorization:`Bearer ${bearer}`}})),/credential|token/i)
  const instantSaved=await r.commands.get('view.save').execute(h.ctx,{commandId:createUlid(),expected:[],input:{view:{...Object.fromEntries(Object.entries(view).filter(([key])=>!['id','version','createdAt','updatedAt'].includes(key))),layout:{titleFieldId:title.id,startFieldId:instantStart.id,endFieldId:instantEnd.id}}}})
  const instantIssued=await request(`/api/v1/views/${instantSaved.result.value.id}/calendar-feed`,'POST'),instantFeed=(await instantIssued.json()).data
  const instantText=await (await request(new URL(instantFeed.url).pathname,'GET',false)).text();assert.match(instantText,/X-WR-TIMEZONE:America\/New_York/);assert.match(instantText,/DTSTART:20261101T053000Z/);assert.match(instantText,/DTEND:20261101T073000Z/)
  const stored=await h.db.prepare('SELECT token_hash FROM authority_credentials WHERE id=?').bind(feed.id).first();assert.ok(stored.token_hash);assert.ok(!feed.url.includes(stored.token_hash))
  assert.equal((await request(path+'/'+feed.id,'DELETE')).status,200);assert.equal((await request(feedPath,'GET',false)).status,404)
  const {data:next}=await (await request(path,'POST')).json(),nextPath=new URL(next.url).pathname
  await h.db.prepare("UPDATE authority_memberships SET state='revoked',version=version+1 WHERE principal_id=? AND app_id=?").bind(h.owner,appId).run()
  assert.notEqual((await request(nextPath,'GET',false)).status,200)
  await h.db.prepare("UPDATE authority_memberships SET state='active',version=version+1 WHERE principal_id=? AND app_id=?").bind(h.owner,appId).run()
  await h.db.prepare("UPDATE record_views SET visibility='deleted',version=version+1 WHERE id=?").bind(view.id).run()
  assert.notEqual((await request(nextPath,'GET',false)).status,200)
  await h.db.prepare("UPDATE record_views SET visibility='private',version=version+1 WHERE id=?").bind(view.id).run()
  await h.db.prepare("UPDATE oa_operators SET version=version+1 WHERE id IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?)").bind(h.owner).run()
  assert.equal((await request(nextPath,'GET',false)).status,404)
 }finally{h.close()}
}

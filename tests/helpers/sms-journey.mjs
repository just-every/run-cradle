import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createHmac,randomBytes,createHash} from 'node:crypto'
import {once} from 'node:events'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {createUlid} from '../../src/core/shared/ids.ts'

export const accountSid='synthetic-cradle-106-account',authToken='synthetic-cradle-106-auth-token'
export const sendingNumber='+15550100100',phone='+15550100101'
export const relay='https://relay.example.com/v1/deliver',relaySecret='synthetic-cradle-106-relay-secret-0000000000'

/** Only the provider network edge is fake. Requests originate in the emitted Worker. */
export async function twilioEdge(config={}){
 const calls=[],incoming=new Map();let uncertain=false,refusal=null,currentToken=authToken
 const server=createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part
  const url=new URL(req.url,'http://localhost'),form=new URLSearchParams(raw)
  calls.push({method:req.method,path:url.pathname,headers:req.headers,form,body:raw})
  assert.equal(req.headers.authorization,'Basic '+Buffer.from(accountSid+':'+currentToken).toString('base64'))
  res.setHeader('content-type','application/json')
  if(req.method==='POST'&&url.pathname.endsWith('/Messages.json')){
   if(refusal){res.statusCode=400;res.end(JSON.stringify(refusal));return}
   if(uncertain){res.statusCode=503;res.end('{}');return}
   res.statusCode=201;res.end(JSON.stringify({sid:'synthetic-cradle-106-message-'+calls.filter(c=>c.method==='POST').length,status:'queued'}));return
  }
  if(url.pathname.includes('/a2p/BrandRegistrations/')){res.end(JSON.stringify({status:'APPROVED',identity_status:'VERIFIED'}));return}
  if(url.pathname.endsWith('/Services')){res.end(JSON.stringify({services:[{sid:'synthetic-cradle-106-service'}],meta:{next_page_url:null}}));return}
  if(url.pathname.endsWith('/PhoneNumbers')){res.end(JSON.stringify({phone_numbers:[{phone_number:sendingNumber}],meta:{next_page_url:null}}));return}
  if(url.pathname.endsWith('/Compliance/Usa2p')){res.end(JSON.stringify({compliance:[{campaign_status:'VERIFIED',brand_registration_sid:'synthetic-cradle-106-brand'}]}));return}
  const sid=decodeURIComponent(url.pathname.split('/').at(-1).replace(/\.json$/,''))
  if(incoming.has(sid)){res.end(JSON.stringify(incoming.get(sid)));return}
  res.statusCode=404;res.end('{}')
 })
 server.listen(0,'127.0.0.1');await once(server,'listening')
 const local='http://127.0.0.1:'+server.address().port
 return {calls,incoming,setRefusal(value){refusal=value},setUncertain(value){uncertain=value},setToken(value){currentToken=value},async outbound(request){
  assert.equal(request.url,config.relayUrl??relay);assert.equal(request.headers.get('authorization'),'Bearer '+(config.secret??relaySecret))
  const wire=await request.json(),url=new URL(wire.url)
  assert.ok(['api.twilio.com','messaging.twilio.com'].includes(url.hostname),'Only declared Twilio hosts reach the fake')
  const response=await fetch(local+url.pathname+url.search,{method:wire.method,headers:wire.headers,...(wire.method==='GET'?{}:{body:wire.body})})
  return Response.json({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})
 },async close(){server.close();server.closeAllConnections();await once(server,'close')}}
}
function signature(url,form){return createHmac('sha1',authToken).update(url+[...form.keys()].sort().map(key=>key+form.get(key)).join('')).digest('base64')}
async function callback(url,body,{forged=false,status=200}={}){
 const form=new URLSearchParams(body),response=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':forged?'synthetic-cradle-106-forged':signature(url,form)},body:form})
 assert.equal(response.status,status,await response.text())
}

export async function smsJourney(){
 const edge=await twilioEdge();let h
 try{
  h=await userAutomationRuntime(0,{bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:relay,EGRESS_RELAY_SECRET:relaySecret},outbound:request=>edge.outbound(request)})
  const settings='/api/user-automations/sms/settings'
  assert.equal((await h.request(settings)).data.configured,false)
  await h.request(settings,{method:'PUT',body:{accountSid,authToken,from:sendingNumber}})
  const configured=(await h.request(settings)).data
  assert.equal(configured.configured,true);assert.equal(configured.from,sendingNumber)
  assert.ok(JSON.stringify(configured).includes('VERIFIED'),'A2P registration is read from Twilio')
  assert.ok(!JSON.stringify(configured).includes(authToken),'Credential is write-only')
  const sealed=(await h.db.prepare("SELECT sealed_json FROM sms_installation WHERE id='installation'").first()).sealed_json
  const archive=(await h.request('/api/v1/commands/export.start',{method:'POST',body:{scope:'installation',format:'archive'}})).data
  let archiveStatus
  for(let step=0;step<100;step++){archiveStatus=(await h.request(`/api/v1/archive-jobs/${archive.id}/advance`,{method:'POST',body:{}})).data;if(archiveStatus.phase==='complete')break}
  assert.equal(archiveStatus.phase,'complete')
  const content=await fetch(h.origin+`/api/v1/archive-jobs/${archive.id}/content`,{headers:{cookie:h.cookie}})
  assert.equal(content.status,200);const archiveText=await content.text()
  assert.ok(!archiveText.includes(authToken)&&!archiveText.includes(JSON.parse(sealed).ciphertext),'Neither plaintext nor encrypted Twilio credentials transfer in an archive')
  const automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-106-sms',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'sms',fieldId:h.phoneId,text:'Status {{'+h.statusId+'}} for {{'+h.nameId+'}}'}]}}})).data.result.value
  async function create(to=phone){const created=await h.create(to,undefined,to);await h.tick(created.commandId);const runs=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs;return {created,run:runs.find(run=>run.recordId===created.record.ref.recordId)}}
  const first=await create('(555) 010-0101'),sent=edge.calls.filter(c=>c.method==='POST')
  assert.equal(first.run.state,'Complete');assert.equal(sent.length,1)
  assert.equal(sent[0].form.get('To'),phone);assert.equal(sent[0].form.get('From'),sendingNumber)
  assert.equal(sent[0].form.get('Body'),'Status  for (555) 010-0101')
  assert.ok(sent[0].headers['i-twilio-idempotency-token'],'The durable action identity is sent to Twilio')
  const statusUrl=sent[0].form.get('StatusCallback')
  assert.equal(sent[0].headers['i-twilio-idempotency-token'],new URL(statusUrl).searchParams.get('delivery'),'Twilio uses the exact durable delivery identity')
  const delivery={MessageSid:'synthetic-cradle-106-message-1',MessageStatus:'delivered',AccountSid:accountSid,To:phone}
  await callback(statusUrl,delivery,{forged:true,status:401})
  const historyRoute='/api/v1/history?'+new URLSearchParams(first.created.record.ref)
  assert.ok(!(await h.request(historyRoute)).data.items.some(item=>item.action==='sms.delivered'),'Forged callback changes no record history')
  await callback(statusUrl,delivery)
  assert.ok((await h.request(historyRoute)).data.items.some(item=>item.action==='sms.delivered'),'Delivery is recorded on the triggering record')
  const delivered=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.find(run=>run.id===first.run.id)
  assert.ok(JSON.stringify(delivered).includes('delivered'),'Delivery is visible in run history')
  const stale=new URL(statusUrl);stale.searchParams.set('expires',String(Date.now()-1))
  await callback(stale.href,{...delivery,MessageStatus:'failed'},{status:401})
  async function inbound(word,index,{stale=false}={}){
   const sid='synthetic-cradle-106-inbound-'+index,body={AccountSid:accountSid,MessageSid:sid,From:phone,To:sendingNumber,Body:word}
   edge.incoming.set(sid,{sid,account_sid:accountSid,from:phone,to:sendingNumber,body:word,direction:'inbound',date_created:new Date(Date.now()-(stale?600000:0)).toUTCString()})
   return callback(configured.inboundUrl??h.origin+'/webhooks/twilio/inbound',body,{status:stale?401:200})
  }
  const callsBeforeForgery=edge.calls.length
  await callback(configured.inboundUrl??h.origin+'/webhooks/twilio/inbound',{AccountSid:accountSid,MessageSid:'synthetic-cradle-106-forged-inbound',From:phone,To:sendingNumber,Body:'STOP'},{forged:true,status:401})
  assert.equal(edge.calls.length,callsBeforeForgery,'A forged inbound message does not access the provider or change suppression')
  assert.ok(!(await h.request(historyRoute)).data.items.some(item=>item.action==='sms.stop'))
  await inbound('STOP',1)
  assert.ok((await h.request(historyRoute)).data.items.some(item=>item.action==='sms.stop'),'STOP is recorded on the record whose message it answered')
  const count=edge.calls.filter(c=>c.method==='POST').length,stopped=await create()
  assert.equal(edge.calls.filter(c=>c.method==='POST').length,count,'STOP prevents any later provider request')
  assert.ok(JSON.stringify(stopped.run).includes('suppressed'),'The suppression skip is visible in run history')
  await inbound('START',2,{stale:true});await create()
  assert.equal(edge.calls.filter(c=>c.method==='POST').length,count,'A stale START cannot remove suppression')
  await inbound('HELP',3)
  assert.ok((await h.request(historyRoute)).data.items.some(item=>item.action==='sms.help'),'HELP is recorded')
  await inbound('START',4);const restored=await create()
  assert.equal(restored.run.state,'Complete');assert.equal(edge.calls.filter(c=>c.method==='POST').length,count+1)
  edge.setUncertain(true);const uncertain=await create(),before=edge.calls.filter(c=>c.method==='POST').length
  assert.equal(uncertain.run.state,'Unknown');await h.tick(uncertain.created.commandId)
  await h.restart();await h.tick(uncertain.created.commandId)
  assert.equal(edge.calls.filter(c=>c.method==='POST').length,before,'An uncertain acknowledgement survives restart without resend')
  edge.setUncertain(false)
  const invalid=await h.request('/api/v1/commands/record.create',{method:'POST',status:400,body:{commandId:createUlid(),expected:[{ref:{appId:h.appId,entityId:'00000000000000000000000001',recordId:h.entityId},version:h.entity.version}],input:{appId:h.appId,entityId:h.entityId,values:{[h.nameId]:'Invalid phone',[h.phoneId]:'synthetic-cradle-106-invalid-phone'}}}})
  assert.match(invalid.error.message,/Phone/);assert.equal(edge.calls.filter(c=>c.method==='POST').length,before,'Invalid typed phone is refused before any automation or provider request')
  const firstStops=(await h.request(historyRoute)).data.items.filter(item=>item.action==='sms.stop').length
  const restoredHistory='/api/v1/history?'+new URLSearchParams(restored.created.record.ref)
  await inbound('STOP',5)
  assert.equal((await h.request(historyRoute)).data.items.filter(item=>item.action==='sms.stop').length,firstStops,'An ambiguous shared phone does not add an opt-out to an arbitrary previous record')
  assert.ok(!(await h.request(restoredHistory)).data.items.some(item=>item.action==='sms.stop'),'An ambiguous reply is not guessed onto the latest record')
  const ambiguous=await create();assert.ok(JSON.stringify(ambiguous.run).includes('suppressed'))
  assert.equal(edge.calls.filter(c=>c.method==='POST').length,before,'Ambiguous replies still suppress the installation number')
  await h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:automation.version}})
  const blankAutomation=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-106-blank-phone',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'sms',fieldId:h.phoneId,text:'synthetic-cradle-106-message'}]}}})).data.result.value
  const blank=await h.create('synthetic-cradle-106-no-phone');await h.tick(blank.commandId)
  const blankRun=(await h.request(`/api/user-automations/${blankAutomation.id}/runs`)).data.runs.find(run=>run.recordId===blank.record.ref.recordId)
  assert.equal(blankRun.state,'Failed');assert.equal(edge.calls.filter(c=>c.method==='POST').length,before)
  assert.ok(JSON.stringify(blankRun).includes(h.phoneId)&&JSON.stringify(blankRun).includes(blank.record.ref.recordId),'Blank destination names the field and record')
  await smsRiderJourney(h,edge)
  const replacement=authToken+'-replacement';edge.setToken(replacement)
  await h.request(settings,{method:'PUT',body:{accountSid,authToken:replacement,from:sendingNumber}})
  assert.ok(!JSON.stringify((await h.request(settings)).data).includes(replacement),'A replaced token remains write-only')
  await h.request(settings,{method:'DELETE',body:{}})
  assert.equal((await h.request(settings)).data.configured,false)
 }finally{await h?.close();await edge.close()}
}


/** Provider refusals and ambiguous replies use only the actual public doors. */
export async function smsRiderJourney(h,edge){
 const riderPhone='+15550100107'
 const name='synthetic-cradle-107-sms-'+createUlid(),refusal={code:30034,message:`US A2P 10DLC - Message to ${riderPhone} from an Unregistered Number. Register this number before sending.`}
 const automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name,appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'sms',fieldId:h.nameId,text:'synthetic-cradle-107'}]}}})).data.result.value
 const created=[]
 try{
  edge.setRefusal(refusal)
  for(let i=0;i<2;i++){const row=await h.create(riderPhone);await h.tick(row.commandId);created.push(row)}
  const runs=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs,run=runs.find(item=>item.recordId===created[0].record.ref.recordId)
  assert.equal(run.state,'Failed');assert.equal(run.retryable,false)
  assert.deepEqual(run.actions[0].smsError,refusal,'The Twilio code and message are retained verbatim in public run history')
  const before=edge.calls.filter(call=>call.method==='POST').length
  await h.tick(created[0].commandId)
  await h.request(`/api/user-automations/${automation.id}/runs/${run.id}/retry`,{method:'POST',status:403,body:{commandId:createUlid()}})
  assert.equal(edge.calls.filter(call=>call.method==='POST').length,before,'A registration refusal is never retried')
  // A stored provider message may quote the private destination. Historical
  // copies must narrow with the current record field policy, too.
  const principal=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=(SELECT id FROM oa_operators WHERE email=?)').bind('import-owner@example.test').first()).principal_id
  const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.app_id=? AND m.principal_id=?').bind(h.appId,principal).first()
  const restricted=JSON.parse(policy.rules_json).map(rule=>({...rule,readableFields:rule.readableFields.filter(id=>id!==h.nameId)}))
  await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(restricted),policy.id).run()
  try{
   const hidden=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs
   assert.ok(!JSON.stringify(hidden).includes(riderPhone),'Provider errors cannot disclose a currently hidden phone value')
   assert.ok(hidden.every(item=>item.actions.every(action=>!action.smsError)),'A copied provider message requires current phone-field read authority')
  }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
  const visible=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.find(item=>item.id===run.id)
  assert.deepEqual(visible.actions[0].smsError,refusal,'Restored field authority shows the same verbatim provider refusal')
  const replies=[]
  for(const body of ['Please call about the delivery.','STOP','HELP','START']){
   const sid='synthetic-cradle-107-'+createUlid()
   edge.incoming.set(sid,{sid,account_sid:accountSid,from:riderPhone,to:sendingNumber,body,direction:'inbound',date_created:new Date().toUTCString()})
   const url=h.origin+'/webhooks/twilio/inbound',value={AccountSid:accountSid,MessageSid:sid,From:riderPhone,To:sendingNumber,Body:body}
   await callback(url,value)
   await callback(url,value,{status:401})
   const listed=(await h.request('/api/user-automations/sms/settings')).data.replies.filter(item=>item.id==='inbound:'+sid)
   assert.equal(listed.length,1,'Each ambiguous reply is retained once despite webhook replay')
   assert.equal(listed[0].body,body);assert.equal(listed[0].from,'••• '+riderPhone.slice(-4));assert.ok(Number.isFinite(Date.parse(listed[0].receivedAt)))
   assert.ok(!JSON.stringify(listed).includes(riderPhone),'Owner review masks the sending number')
   replies.push(listed[0])
   const stopped=await h.db.prepare('SELECT count(*) n FROM sms_suppressions WHERE recipient_hash=?').bind(createHash('sha256').update(riderPhone).digest('hex')).first()
   if(body==='STOP')assert.ok(stopped.n>0,'Ambiguous STOP changes installation consent')
   if(body==='START')assert.equal(stopped.n,0,'Ambiguous START removes installation suppression')
   for(const row of created){const history=(await h.request('/api/v1/history?'+new URLSearchParams(row.record.ref))).data.items;assert.ok(!history.some(item=>['sms.inbound','sms.stop','sms.help','sms.start'].includes(item.action)),'An ambiguous reply is never attached to either record')}
  }
  return {name,run,refusal,replies}
 }finally{
  edge.setRefusal(null)
  await h.request(`/api/user-automations/${automation.id}/disable`,{method:'POST',body:{commandId:createUlid(),version:automation.version}})
 }
}

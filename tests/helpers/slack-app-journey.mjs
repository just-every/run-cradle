import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {readArchive} from '@runeditrun/rer/modules/portability'
import {createUlid} from '../../src/core/shared/ids.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {baseHttpSession} from './base-http-session.mjs'
import {slackAppNetworkEdge,slackAppFixture} from './slack-app-network-edge.mjs'
import {teamsAppNetworkEdge} from './teams-app-network-edge.mjs'

export async function signedSlack(origin,path,body,{json=false,stale=false,forged=false,status=200,timestamp}={}){
 const raw=json?JSON.stringify(body):new URLSearchParams(body).toString(),time=timestamp??String(Math.floor(Date.now()/1000)-(stale?600:0))
 const signature='v0='+createHmac('sha256',slackAppFixture.signingSecret).update('v0:'+time+':'+raw).digest('hex')
 const response=await fetch(origin+path,{method:'POST',headers:{'content-type':json?'application/json':'application/x-www-form-urlencoded','x-slack-request-timestamp':time,'x-slack-signature':forged?'v0=synthetic-cradle-120-forged':signature},body:raw}).catch(error=>{console.error('CHAT_CALLBACK_TRANSPORT_FAILURE '+JSON.stringify({path,cause:error.cause?.code??error.cause?.name??'unknown',name:error.name}));throw error})
 const value=await response.json().catch(()=>null)
 assert.equal(response.status,status,`${path}: ${value?.error?.message??JSON.stringify(value)}`)
 return value
}

/** [INTEG-001] Native sessions and admitted record commands remain real; Slack
 * OAuth, API responses and signed incoming traffic are the only fake boundary. */
export const chatRoute=(route,provider)=>route.startsWith('/api/user-automations/slack/')?route+(route.includes('?')?'&':'?')+'provider='+provider:route
export async function slackAppJourney(provider='slack'){
 const edge=provider==='teams'?await teamsAppNetworkEdge():await slackAppNetworkEdge({provider}),fixture=edge.fixture;let h
 const callbackRequest=async(origin,state,stage)=>{
  try{return await fetch(origin+'/oauth/'+provider+'/callback?'+new URLSearchParams({state,code:fixture.code}),{redirect:'manual',headers:{cookie:h.cookie}})}
  catch(error){console.error('CHAT_OAUTH_TRANSPORT_FAILURE '+JSON.stringify({provider,stage,name:error.name,cause:{name:error.cause?.name,code:error.cause?.code,syscall:error.cause?.syscall},transportErrors:edge.transportErrors,networkErrors:edge.networkErrors}));throw error}
 }
 const incoming=(origin,path,body,options)=>provider==='teams'?edge.signed(origin,path,body,options):signedSlack(origin,provider==='nook'?path.replace('/slack/','/nook/'):path,body,options)
 const configuration={provider,clientId:fixture.clientId,clientSecret:fixture.clientSecret,signingSecret:fixture.signingSecret,...(provider==='nook'?{appToken:fixture.botToken,nookOrigin:fixture.providerOrigin}:{}),...(provider==='teams'?{tenantId:fixture.tenantId}:{})}
 const longTitle='synthetic-cradle-120-primary'+('🙂'.repeat(1600)),longText='synthetic-cradle-120-review'+('x'.repeat(3200)),longApproval='synthetic-cradle-120-approved'+('y'.repeat(3200)),longRejection='synthetic-cradle-120-rejected'+('z'.repeat(3200))
 try{
  h=await userAutomationRuntime(0,{bindings:edge.bindings,outbound:request=>edge.outbound(request)});edge.setOrigin(h.origin)
  const request=h.request;h.request=(route,options)=>request(chatRoute(route,provider),options)
  const root='/api/user-automations/slack',settings=root+'/settings'
  assert.equal((await h.request(settings)).data.configured,false)
  await h.request(settings,{method:'PUT',body:configuration})
  const configured=(await h.request(settings)).data
  assert.equal(configured.configured,true);assert.equal(configured.installed,false)
  for(const secret of [fixture.clientSecret,fixture.signingSecret,fixture.botToken])assert.ok(!JSON.stringify(configured).includes(secret),'Slack credentials are write-only')
  if(provider==='nook'){edge.setAppScopes(['chat:write']);await h.request(root+'/install',{method:'POST',body:{},status:503});assert.equal((await h.request(settings)).data.installed,false,'A Nook token missing channel, command or unfurl scope cannot install');edge.setAppScopes()}
  const installed=(await h.request(root+'/install',{method:'POST',body:{}})).data
  if(provider==='nook'){assert.equal(installed.installed,true);assert.equal(edge.oauthRequests.length,0,'Nook validates the explicitly configured scoped app token')}
  else{
   const authorization=new URL(installed.authorizeUrl)
   assert.equal(authorization.origin,provider==='teams'?'https://login.microsoftonline.com':'https://slack.com')
   assert.equal(authorization.pathname,provider==='teams'?'/'+fixture.tenantId+'/oauth2/v2.0/authorize':'/oauth/v2/authorize')
   assert.equal(authorization.searchParams.get('client_id'),fixture.clientId);assert.equal(authorization.searchParams.get('redirect_uri'),h.origin+'/oauth/'+provider+'/callback')
   assert.ok(authorization.searchParams.get('state'))
   const callback=state=>callbackRequest(h.origin,state,'initial-install')
   const invalid=await callback('synthetic-cradle-120-forged-state');assert.equal(invalid.status,409);await invalid.arrayBuffer()
   assert.equal(edge.oauthRequests.length,0,'A forged OAuth state never exchanges a code')
   const accepted=await callback(authorization.searchParams.get('state'));assert.equal(accepted.status,303);await accepted.arrayBuffer()
   assert.equal(edge.oauthRequests.length,1)
   const replayed=await callback(authorization.searchParams.get('state'));assert.equal(replayed.status,409);await replayed.arrayBuffer();assert.equal(edge.oauthRequests.length,1,'OAuth state is one-use')
  }
  const installedSettings=(await h.request(settings)).data;assert.equal(installedSettings.installed,true);assert.equal(installedSettings.provider,provider)
  for(const secret of [fixture.clientSecret,fixture.signingSecret,fixture.botToken])assert.ok(!JSON.stringify(installedSettings).includes(secret),'Installed credentials remain write-only')
  const staleOAuthState=provider==='nook'?null:new URL((await h.request(root+'/install',{method:'POST',body:{}})).data.authorizeUrl).searchParams.get('state')
  const channels=(await h.request(root+'/channels')).data.channels
  assert.deepEqual(channels.map(channel=>({id:channel.id,name:channel.name})),edge.channels.map(channel=>({id:channel.id,name:channel.name})))
  const sealed=await h.db.prepare("SELECT sealed_json,bot_sealed_json FROM slack_app_installation WHERE id=?").bind(provider).first()
  assert.ok(sealed?.sealed_json)
  for(const secret of [fixture.clientSecret,fixture.signingSecret,fixture.botToken])assert.ok(!JSON.stringify(sealed).includes(secret),'Slack credentials and OAuth token are sealed at rest')
  async function person(number){
   const baseId=createUlid(),email=`synthetic-cradle-${number}@example.test`
   await h.db.prepare("INSERT INTO oa_operators(id,email,display_name,role,status,created_at) VALUES(?,?,?,'member','active',?)").bind(baseId,email,'synthetic-cradle-'+number,Date.now()).run()
   const principalId=(await h.db.prepare('SELECT principal_id FROM cradle_base_operators WHERE base_id=?').bind(baseId).first()).principal_id
   const signed=await baseHttpSession(h.origin,email)
   const request=async(route,{method='GET',body,status=200}={})=>{
    const response=await fetch(h.origin+chatRoute(route,provider),{method,redirect:'manual',headers:{cookie:signed.cookie,...(body?{origin:h.origin,'content-type':'application/json','x-csrf-token':signed.csrfToken}:{})},...(body?{body:JSON.stringify(body)}:{})}).catch(error=>{console.error('CHAT_PERSON_TRANSPORT_FAILURE '+JSON.stringify({method,path:route.split('?')[0],cause:error.cause?.code??error.cause?.name??'unknown',name:error.name}));throw error})
    const value=await response.json().catch(()=>null);assert.equal(response.status,status,`${route}: ${value?.error?.message??JSON.stringify(value)}`);return value
   }
   return {principalId,request}
  }
  const editor=await person(121),denied=await person(122)
  await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:editor.principalId,role:'editor',version:0}})
  await denied.request(settings,{method:'PUT',status:403,body:{clientId:'synthetic-cradle-122-client',clientSecret:'synthetic-cradle-122-client-secret',signingSecret:'synthetic-cradle-122-signing-secret'}})
  async function link(request,userId){
   const issued=(await request(root+'/link',{method:'POST',body:{}})).data
   assert.ok(issued.code&&issued.expiresAt)
   await incoming(h.origin,'/webhooks/slack/link',{team_id:fixture.teamId,user_id:userId,command:'/cradle-link',text:issued.code})
   assert.equal((await request(settings)).data.linked,true);assert.equal((await request(settings)).data.slackUserId,userId)
   await incoming(h.origin,'/webhooks/slack/link',{team_id:fixture.teamId,user_id:userId,command:'/cradle-link',text:issued.code},{status:409})
  }
  await link(h.request,fixture.ownerUserId);await link(editor.request,fixture.editorUserId);await link(denied.request,fixture.deniedUserId)
  const staleLinkCode=(await h.request(root+'/link',{method:'POST',body:{}})).data.code
  const replacedCode=(await editor.request(root+'/link',{method:'POST',body:{}})).data.code
  const revokedCode=(await editor.request(root+'/link',{method:'POST',body:{}})).data.code
  await incoming(h.origin,'/webhooks/slack/link',{team_id:fixture.teamId,user_id:fixture.editorUserId,command:'/cradle-link',text:replacedCode},{status:409})
  await editor.request(root+'/link',{method:'DELETE',body:{}})
  assert.equal((await editor.request(settings)).data.linked,false)
  await incoming(h.origin,'/webhooks/slack/link',{team_id:fixture.teamId,user_id:fixture.editorUserId,command:'/cradle-link',text:revokedCode},{status:409})
  assert.equal((await editor.request(settings)).data.linked,false,'Unlinking revokes outstanding codes instead of allowing a later re-link')
  await link(editor.request,fixture.editorUserId)
  if(provider!=='teams'){const challenge=await incoming(h.origin,'/webhooks/slack/events',{type:'url_verification',challenge:'synthetic-cradle-120-challenge'},{json:true});assert.equal(challenge.challenge,'synthetic-cradle-120-challenge')}
  const automation=(await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-120-approval',appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'slack-app',provider,channelId:fixture.channelId,text:longText,fieldId:h.statusId,approveValue:longApproval,rejectValue:longRejection}]}}})).data.result.value
  async function create(label){const created=await h.create(label);await h.tick(created.commandId);return created}
  const first=await create(longTitle),message=edge.messages.at(-1)
  const sections=message.body.blocks.filter(block=>block.type==='section'&&block.text.type==='plain_text')
  assert.equal(sections.map(block=>block.text.text).join(''),longTitle+longText+'Approve → Status: '+longApproval+'\nReject → Status: '+longRejection,'Multi-block title, body and choices preserve every character and Unicode pair')
  assert.ok(sections.length>3&&sections.every(block=>block.text.text.length<=3000),'Every Slack section fits the provider limit')
  const visibleMessage=message.body.blocks.flatMap(block=>[block.text?.text,...(block.fields??[]).map(field=>field.text)]).filter(Boolean).join('\n')
  assert.ok(visibleMessage.includes('synthetic-cradle-120-primary')&&visibleMessage.includes('synthetic-cradle-120-review'),'The rich record message contains the primary field and composed message')
  assert.ok(visibleMessage.includes('Status')&&visibleMessage.includes('synthetic-cradle-120-approved')&&visibleMessage.includes('synthetic-cradle-120-rejected'),'People see the field and both proposed write values before choosing a decision')
  assert.equal(message.body.channel,fixture.channelId);assert.ok(JSON.stringify(message.body).includes(first.record.ref.recordId),'The rich message links the real record')
  const buttons=message.body.blocks.flatMap(block=>block.elements??[]).filter(element=>element.type==='button')
  assert.deepEqual(buttons.map(button=>button.action_id).sort(),['cradle_approve','cradle_reject']);assert.ok(buttons.every(button=>button.value))
  const record=async created=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.record.ref.recordId}`)).data.record
  const before=await record(first)
  const payload=(posted,userId,choice='cradle_approve')=>({type:'block_actions',team:{id:fixture.teamId},user:{id:userId},channel:{id:fixture.channelId},container:{message_ts:posted.ts},actions:[{action_id:choice,value:posted.body.blocks.flatMap(block=>block.elements??[]).find(button=>button.action_id===choice).value}]})
  async function click(body,options){return incoming(h.origin,'/webhooks/slack/actions',{payload:JSON.stringify(body)},options)}
  for(const [user,options] of [[fixture.editorUserId,{forged:true,status:401}],[fixture.editorUserId,{stale:true,status:401}],[fixture.unlinkedUserId,{status:403}],[fixture.deniedUserId,{status:403}]]){
   await click(payload(message,user),options);assert.deepEqual(await record(first),before,'Refused clicks change no record values or version')
  }
  const validPayload=payload(message,fixture.editorUserId),timestamp=String(Math.floor(Date.now()/1000))
  await click(validPayload,{timestamp})
  const approved=await record(first);assert.equal(approved.fields[h.statusId].value,longApproval);assert.equal(approved.version,before.version+1)
  const history='/api/v1/history?'+new URLSearchParams(first.record.ref)
  const writes=(await h.request(history)).data.items.filter(item=>item.action==='record.patch')
  assert.ok(writes.some(item=>item.actor.id===editor.principalId&&item.actor.kind==='human'),'A Slack click writes as the linked native person')
  await click(validPayload,{timestamp,status:409});assert.deepEqual(await record(first),approved,'Signed replay is refused without another write')
  await click(payload(message,fixture.ownerUserId,'cradle_reject'),{status:409});assert.deepEqual(await record(first),approved,'An old message cannot overwrite a newer record version')
  const second=await create('synthetic-cradle-120-second'),secondMessage=edge.messages.at(-1)
  await click(payload(secondMessage,fixture.ownerUserId,'cradle_reject'))
  assert.equal((await record(second)).fields[h.statusId].value,longRejection,'The other legitimate decision uses the same native version guard')
  const url=h.origin+'/app/records/'+h.appId+'/'+h.entityId+'/'+first.record.ref.recordId
  let event=0
  async function unfurl(user){
   const start=edge.unfurls.length
   await incoming(h.origin,'/webhooks/slack/events',{type:'event_callback',team_id:fixture.teamId,event_id:'synthetic-cradle-120-event-'+(++event),event:{type:'link_shared',user,channel:fixture.channelId,message_ts:'1700000000.000001',links:[{url}]}},{json:true})
   return JSON.stringify(edge.unfurls.slice(start))
  }
  const safeFields={appId:h.appId,entityId:h.entityId,fieldIds:[h.statusId]}
  await editor.request(root+'/unfurl-fields',{method:'PUT',body:safeFields,status:403})
  async function baseRole(role){
   const current=(await h.request(`/api/v1/records/bases/${h.appId}/collaborators`)).data.items.find(item=>item.id===editor.principalId)
   await h.request(`/api/v1/records/bases/${h.appId}/collaborators`,{method:'POST',body:{commandId:createUlid(),principalId:editor.principalId,role,version:current.version}})
  }
  await baseRole('owner')
  await editor.request(root+'/unfurl-fields',{method:'PUT',body:safeFields})
  const baseOwnerSettings=(await editor.request(settings+'?'+new URLSearchParams({appId:h.appId,entityId:h.entityId}))).data
  assert.equal(baseOwnerSettings.canManageUnfurls,true);assert.equal(baseOwnerSettings.canConfigure,false,'Base ownership does not grant installation configuration')
  assert.equal(baseOwnerSettings.linked,true,'Changing a base role preserves the native person’s Slack account link')
  const baseOwnerUnfurl=await unfurl(fixture.editorUserId)
  assert.ok(baseOwnerUnfurl.includes('synthetic-cradle-120-primary')&&baseOwnerUnfurl.includes('synthetic-cradle-120-approved'),'The actual base owner can choose safe unfurl fields without installation ownership')
  await baseRole('editor')
  assert.equal((await editor.request(settings)).data.linked,true)
  const formerOwnerMarks=await unfurl(fixture.editorUserId)
  assert.ok(formerOwnerMarks.includes('synthetic-cradle-120-primary')&&!formerOwnerMarks.includes('synthetic-cradle-120-approved'),'A former base owner’s safe-field marks are rechecked after demotion')
  await h.request(root+'/unfurl-fields',{method:'PUT',body:{appId:h.appId,entityId:h.entityId,fieldIds:[]}})
  const primaryOnly=await unfurl(fixture.editorUserId)
  assert.ok(primaryOnly.includes('synthetic-cradle-120-primary'));assert.ok(!primaryOnly.includes('synthetic-cradle-120-approved'),'Unmarked fields do not unfurl')
  await h.request(root+'/unfurl-fields',{method:'PUT',body:{appId:h.appId,entityId:h.entityId,fieldIds:[h.statusId]}})
  assert.deepEqual((await h.request(settings+'?'+new URLSearchParams({appId:h.appId,entityId:h.entityId}))).data.unfurlSafeFieldIds,[h.statusId])
  const readable=await unfurl(fixture.editorUserId);assert.ok(readable.includes('synthetic-cradle-120-primary')&&readable.includes('synthetic-cradle-120-approved'))
  const unfurlBlocks=edge.unfurls.at(-1).unfurls[url].blocks
  assert.ok(unfurlBlocks.length>1&&unfurlBlocks.every(block=>block.text.text.length<=3000),'Allowed projections larger than one block split across provider-valid blocks')
  assert.equal(unfurlBlocks.map(block=>block.text.text).join(''),'Name: '+longTitle+'\nStatus: '+longApproval,'Unfurls preserve all allowed values without truncation')
  for(const user of [fixture.unlinkedUserId,fixture.deniedUserId]){const hidden=await unfurl(user);assert.ok(!hidden.includes('synthetic-cradle-120-primary')&&!hidden.includes('synthetic-cradle-120-approved'),'Unlinked or unauthorized posters expose no record values')}
  const policy=await h.db.prepare('SELECT p.id,p.rules_json FROM authority_policies p JOIN authority_memberships m ON m.policy_id=p.id WHERE m.principal_id=? AND m.app_id=?').bind(editor.principalId,h.appId).first()
  assert.ok(policy)
  const rules=JSON.parse(policy.rules_json).map(rule=>({...rule,readableFields:rule.readableFields.filter(field=>field!==h.statusId),writableFields:rule.writableFields.filter(field=>field!==h.statusId)}))
  let pendingActionId,pendingMessage,pendingCreated
  try{
   await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(JSON.stringify(rules),policy.id).run()
   const narrowed=await unfurl(fixture.editorUserId);assert.ok(narrowed.includes('synthetic-cradle-120-primary'));assert.ok(!narrowed.includes('synthetic-cradle-120-approved'),'Current poster field policy narrows owner-safe fields')
   const third=await create('synthetic-cradle-120-policy'),thirdMessage=edge.messages.at(-1),thirdBefore=await record(third)
   pendingActionId=payload(thirdMessage,fixture.editorUserId).actions[0].value;pendingMessage=thirdMessage;pendingCreated=third
   await click(payload(thirdMessage,fixture.editorUserId),{status:403});assert.deepEqual(await record(third),thirdBefore,'A linked person losing field authority cannot click a cached approval')
  }finally{await h.db.prepare('UPDATE authority_policies SET rules_json=?,version=version+1 WHERE id=?').bind(policy.rules_json,policy.id).run()}
  const legacy=await create('synthetic-cradle-120-legacy'),legacyMessage=edge.messages.at(-1),legacyBefore=await record(legacy),legacyId=payload(legacyMessage,fixture.ownerUserId).actions[0].value
  await h.db.prepare('UPDATE slack_app_actions SET installation_instance=NULL WHERE id=?').bind(legacyId).run()
  await click(payload(legacyMessage,fixture.ownerUserId),{status:403})
  assert.deepEqual(await record(legacy),legacyBefore,'A legacy card with no installation binding refuses even when workspace and numeric version match')
  const pendingBefore=await h.db.prepare('SELECT * FROM slack_app_actions WHERE id=?').bind(pendingActionId).first()
  assert.equal(pendingBefore.choice_state,'pending')
  const archive=(await h.request('/api/v1/commands/export.start',{method:'POST',body:{scope:'installation',format:'archive'}})).data
  let archiveStatus
  for(let step=0;step<100;step++){archiveStatus=(await h.request(`/api/v1/archive-jobs/${archive.id}/advance`,{method:'POST',body:{}})).data;if(archiveStatus.phase==='complete')break}
  assert.equal(archiveStatus.phase,'complete')
  const content=await fetch(h.origin+`/api/v1/archive-jobs/${archive.id}/content`,{headers:{cookie:h.cookie}})
  assert.equal(content.status,200);const archiveText=await content.text(),archiveRecords=[]
  for(const secret of [fixture.clientSecret,fixture.signingSecret,fixture.botToken,JSON.parse(sealed.sealed_json).ciphertext,JSON.parse(sealed.bot_sealed_json).ciphertext])assert.ok(!archiveText.includes(secret),'Neither plaintext nor encrypted Slack credentials transfer through the public archive door')
  for await(const item of readArchive(new Response(archiveText).body))archiveRecords.push(item)
  const credentialTables=['slack_app_installation','slack_app_oauth_states','slack_app_link_codes','slack_app_links']
  assert.ok(credentialTables.every(name=>!archiveRecords[0].tables.some(table=>table.name===name)),'Slack OAuth and account-link credentials are excluded from the archive manifest')
  const archivedRows=archiveRecords.filter(item=>item.kind==='part').flatMap(part=>part.items).filter(item=>item.kind==='row')
  assert.ok(!archivedRows.some(item=>credentialTables.includes(item.table)))
  const archivedPending=archivedRows.find(item=>item.table==='slack_app_actions'&&item.row.id===pendingActionId)
  assert.ok(archivedPending);assert.equal(archivedPending.row.choice_state,'retired','The exported copy retires a pending Slack decision')
  assert.deepEqual(await h.db.prepare('SELECT * FROM slack_app_actions WHERE id=?').bind(pendingActionId).first(),pendingBefore,'Archiving does not retire the live pending decision')
  edge.setPostUncertain(true)
  const unknown=await create('synthetic-cradle-120-uncertain'),count=edge.postRequests.length
  const run=(await h.request(`/api/user-automations/${automation.id}/runs`)).data.runs.find(run=>run.recordId===unknown.record.ref.recordId)
  assert.equal(run.state,'Unknown');await h.tick(unknown.commandId);await h.restart();await h.tick(unknown.commandId)
  assert.equal(edge.postRequests.length,count,'Uncertain Slack messages are never resent after queue replay or restart')
  await editor.request(root+'/link',{method:'DELETE',body:{}});assert.equal((await editor.request(settings)).data.linked,false)
  const replacement={...configuration,clientId:fixture.clientId,clientSecret:'synthetic-cradle-123-replacement-client-secret',signingSecret:'synthetic-cradle-123-replacement-signing-secret'}
  await h.request(settings,{method:'PUT',body:replacement})
  const replaced=(await h.request(settings)).data;assert.equal(replaced.configured,true);assert.equal(replaced.installed,false,'Replacing app credentials requires fresh OAuth consent')
  assert.ok(!JSON.stringify(replaced).includes(replacement.clientSecret)&&!JSON.stringify(replaced).includes(replacement.signingSecret))
  await h.request(settings,{method:'DELETE',body:{}});assert.equal((await h.request(settings)).data.configured,false)
  await h.request(settings,{method:'PUT',body:configuration})
  const reinstall=(await h.request(root+'/install',{method:'POST',body:{}})).data
  if(provider!=='nook'){const authorization=new URL(reinstall.authorizeUrl),response=await callbackRequest(h.origin,authorization.searchParams.get('state'),'reinstall-after-restart');assert.equal(response.status,303);await response.arrayBuffer()}
  const beforeStale=await record(pendingCreated)
  await click(payload(pendingMessage,fixture.ownerUserId),{status:403})
  assert.deepEqual(await record(pendingCreated),beforeStale,'Removing and reinstalling the same workspace never revives an old card')
  if(staleOAuthState){const staleCallback=await callbackRequest(h.origin,staleOAuthState,'stale-after-restart');assert.equal(staleCallback.status,409,'An old OAuth state cannot revive after the installation version repeats');await staleCallback.arrayBuffer()}
  await incoming(h.origin,'/webhooks/slack/link',{team_id:fixture.teamId,user_id:'synthetic-cradle-120-stale-link-user',command:'/cradle-link',text:staleLinkCode},{status:409})
  assert.equal((await h.request(settings)).data.slackUserId,null,'Removing a provider revokes its linked people; an old code cannot restore them')
  console.log('CHAT_APP_JOURNEY_PASS '+provider)
 }finally{await h?.close();await edge.close()}
}

import assert from 'node:assert/strict'
import {chatInstallationUpgrade} from './chat-installation-upgrade.mjs'
import {randomBytes} from 'node:crypto'
import {createUlid} from '../../src/core/shared/ids.ts'
import {userAutomationRuntime} from './user-automation-runtime.mjs'
import {slackAppNetworkEdge} from './slack-app-network-edge.mjs'
import {teamsAppNetworkEdge} from './teams-app-network-edge.mjs'
import {signedSlack,chatRoute} from './slack-app-journey.mjs'
const providers=['slack','teams','nook']
export async function parallelChatRuntime(){
 const sharedSecret=randomBytes(32).toString('base64url'),edges={};let h
 try{
  edges.slack=await slackAppNetworkEdge({sharedSecret})
  edges.teams=await teamsAppNetworkEdge({sharedSecret})
  edges.nook=await slackAppNetworkEdge({provider:'nook',sharedSecret})
  h=await userAutomationRuntime(0,{bindings:edges.slack.bindings,installMigrations:chatInstallationUpgrade,outbound:async request=>{
   const wire=await request.clone().json(),host=new URL(wire.url).hostname
   const provider=host==='slack.com'?'slack':host==='nook.example.com'?'nook':['login.microsoftonline.com','graph.microsoft.com','login.botframework.com'].includes(host)?'teams':null
   assert.ok(provider,'Only declared provider network hosts are reached')
   return edges[provider].outbound(request)
  }})
  for(const edge of Object.values(edges))edge.setOrigin(h.origin)
  return {h,edges,async close(){await h.close();for(const provider of [...providers].reverse())await edges[provider].close()}}
 }catch(error){await h?.close();for(const provider of [...providers].reverse())await edges[provider]?.close();throw error}
}
export async function installChat(h,edge){
 const f=edge.fixture,provider=f.provider,request=(path,options)=>h.request(chatRoute('/api/user-automations/slack'+path,provider),options)
 await request('/settings',{method:'PUT',body:{provider,clientId:f.clientId,...(provider==='nook'?{nookOrigin:f.providerOrigin,appToken:f.botToken,signingSecret:f.signingSecret}:provider==='teams'?{clientSecret:f.clientSecret,tenantId:f.tenantId}:{clientSecret:f.clientSecret,signingSecret:f.signingSecret})}})
 const result=(await request('/install',{method:'POST',body:{}})).data
 if(provider==='nook')assert.equal(result.installed,true)
 else{
  const state=new URL(result.authorizeUrl).searchParams.get('state'),response=await fetch(h.origin+'/oauth/'+provider+'/callback?'+new URLSearchParams({state,code:f.code}),{redirect:'manual',headers:{cookie:h.cookie}})
  assert.equal(response.status,303);await response.arrayBuffer()
 }
 assert.equal((await request('/settings')).data.installed,true)
}
/** One installation, three concurrently active app providers; no new registration. */
export async function parallelChatJourney(){
 const runtime=await parallelChatRuntime(),{h,edges}=runtime,root='/api/user-automations/slack'
 const request=(provider,path,options)=>h.request(chatRoute(root+path,provider),options)
 const incoming=(provider,kind,body,options={})=>provider==='teams'?edges.teams.signed(h.origin,'/webhooks/teams/'+kind,body,options):signedSlack(h.origin,'/webhooks/'+provider+'/'+kind,body,options)
 const payload=(provider,message,user,choice)=>({type:'block_actions',team:{id:edges[provider].fixture.teamId},user:{id:user},channel:{id:edges[provider].fixture.channelId},container:{message_ts:message.ts},actions:[{action_id:'cradle_'+choice,value:message.body.blocks.flatMap(block=>block.elements??[]).find(button=>button.action_id==='cradle_'+choice).value}]})
 const click=(provider,message,user,choice='approve',status=200)=>incoming(provider,'actions',{payload:JSON.stringify(payload(provider,message,user,choice))},{status})
 const record=async created=>(await h.request(`/api/v1/apps/${h.appId}/entities/${h.entityId}/records/${created.record.ref.recordId}`)).data.record
 try{
  const owner=(await h.db.prepare("SELECT m.principal_id FROM cradle_base_operators m JOIN oa_operators o ON o.id=m.base_id WHERE o.email='import-owner@example.test'").first()).principal_id
  const original=[]
  for(const provider of providers){
   await installChat(h,edges[provider])
   const row=await h.db.prepare('SELECT * FROM slack_app_installation WHERE id=?').bind(provider).first();original.push(row)
   const code=(await request(provider,'/link',{method:'POST',body:{}})).data.code,f=edges[provider].fixture
   await incoming(provider,'link',{team_id:f.teamId,user_id:f.ownerUserId,command:'/cradle-link',text:code})
   await h.request('/api/user-automations',{method:'POST',status:201,body:{commandId:createUlid(),expiresAt:new Date(Date.now()+86400000).toISOString(),definition:{name:'synthetic-cradle-126-'+provider,appId:h.appId,entityId:h.entityId,event:'created',enabled:true,actions:[{kind:'slack-app',provider,channelId:f.channelId,text:'Review {{'+h.statusId+'}}',fieldId:h.statusId,approveValue:'approved-'+provider,rejectValue:'rejected-'+provider}]}}})
  }
  for(const [index,provider] of providers.entries()){
   assert.deepEqual(await h.db.prepare('SELECT * FROM slack_app_installation WHERE id=?').bind(provider).first(),original[index],'Adding another provider preserves credentials, instance and installed workspace')
   assert.equal((await request(provider,'/settings')).data.linked,true,'Linking another provider preserves this person association')
  }
  for(const provider of providers)for(const choice of ['approve','reject']){
   const created=await h.create('synthetic-cradle-126-'+provider+'-'+choice);await h.tick(created.commandId)
   for(const target of providers)assert.ok(JSON.stringify(edges[target].messages.at(-1).body).includes(created.record.ref.recordId),'Each installed provider receives its named approval')
   const message=edges[provider].messages.at(-1),before=await record(created),f=edges[provider].fixture
   await click(provider,message,f.unlinkedUserId,choice,403);assert.deepEqual(await record(created),before)
   await click(provider,message,f.ownerUserId,choice)
   assert.equal((await record(created)).fields[h.statusId].value,(choice==='approve'?'approved-':'rejected-')+provider)
   const history=(await h.request('/api/v1/history?'+new URLSearchParams(created.record.ref))).data.items
   assert.ok(history.some(item=>item.action==='record.patch'&&item.actor.id===owner&&item.actor.kind==='human'),'Each provider click writes as the linked person')
  }
  const preview=await h.create('synthetic-cradle-126-safe-preview');await h.tick(preview.commandId)
  const url=h.origin+'/app/records/'+h.appId+'/'+h.entityId+'/'+preview.record.ref.recordId
  await request('slack','/unfurl-fields',{method:'PUT',body:{appId:h.appId,entityId:h.entityId,fieldIds:[h.statusId]}})
  let event=0
  for(const provider of providers)for(const linked of [true,false]){
   const f=edges[provider].fixture,start=edges[provider].unfurls.length
   await incoming(provider,'events',{type:'event_callback',team_id:f.teamId,event_id:'synthetic-cradle-126-'+(++event),event:{type:'link_shared',user:linked?f.ownerUserId:f.unlinkedUserId,channel:f.channelId,message_ts:'1700000000.000001',links:[{url}]}},{json:true})
   const shown=JSON.stringify(edges[provider].unfurls.slice(start))
   assert.equal(shown.includes('synthetic-cradle-126-safe-preview'),linked,'Only linked readers see safe preview values for each concurrently installed provider')
  }
  const oldMessage=edges.slack.messages.at(-1),oldCode=(await request('slack','/link',{method:'POST',body:{}})).data.code
  const oldState=new URL((await request('slack','/install',{method:'POST',body:{}})).data.authorizeUrl).searchParams.get('state')
  const before=Object.fromEntries(providers.map(provider=>[provider,edges[provider].messages.length]))
  await request('slack','/settings',{method:'DELETE',body:{}})
  const next=await h.create('synthetic-cradle-126-after-removal');await h.tick(next.commandId)
  assert.equal(edges.slack.messages.length,before.slack)
  for(const provider of ['teams','nook']){assert.equal(edges[provider].messages.length,before[provider]+1);assert.equal((await request(provider,'/settings')).data.linked,true)}
  await installChat(h,edges.slack)
  await click('slack',oldMessage,edges.slack.fixture.ownerUserId,'approve',403)
  await incoming('slack','link',{team_id:edges.slack.fixture.teamId,user_id:edges.slack.fixture.ownerUserId,command:'/cradle-link',text:oldCode},{status:409})
  const callback=await fetch(h.origin+'/oauth/slack/callback?'+new URLSearchParams({state:oldState,code:edges.slack.fixture.code}),{redirect:'manual',headers:{cookie:h.cookie}});assert.equal(callback.status,409);await callback.arrayBuffer()
  assert.equal((await request('slack','/settings')).data.linked,false)
  console.log('PARALLEL_CHAT_JOURNEY_PASS slack teams nook')
 }finally{await runtime.close()}
}

import assert from 'node:assert/strict'
import {generateKeyPairSync,sign,randomBytes} from 'node:crypto'
import {automationNetworkEdge} from './automation-network-edge.mjs'
import {slackAppFixture} from './slack-app-network-edge.mjs'
const unescape=value=>value.replace(/\\([\\`*_{}\[\]()#+.!<>-])/g,'$1')
/** Bot Framework/Graph are the fake network edge; native sessions, signatures,
 * RSA/JWK verification, policy, record commands and relay sockets remain real. */
export async function teamsAppNetworkEdge({sharedSecret}={}){
 const fixture={...slackAppFixture,provider:'teams',tenantId:'00000000-0000-4000-8000-000000000120',channelId:'synthetic-cradle-120-team/synthetic-cradle-120-channel'}
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),kid='synthetic-cradle-120-key',jwk={...publicKey.export({format:'jwk'}),kid,use:'sig',alg:'RS256'}
 const messages=[],unfurls=[],oauthRequests=[],apiCalls=[],postRequests=[],graphPosts=[]
 let origin,uncertain=false
 const channels=[{id:fixture.channelId,name:'synthetic-cradle-120-workspace · synthetic-cradle-120-review',is_member:true},{id:'synthetic-cradle-120-team/synthetic-cradle-120-private-channel',name:'synthetic-cradle-120-workspace · synthetic-cradle-120-private',is_member:true}]
 const edge=await automationNetworkEdge({sharedSecret,extraHosts:['login.microsoftonline.com','graph.microsoft.com','login.botframework.com'],async receive(req,res,raw){
  const host=req.headers.host,url=new URL(req.url,'https://'+host);apiCalls.push({method:req.method,path:req.url,host})
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))}
  if(host==='login.botframework.com'){
   assert.equal(req.method,'GET');assert.equal(req.headers.authorization,undefined)
   if(url.pathname==='/v1/.well-known/openidconfiguration')json({issuer:'https://api.botframework.com',jwks_uri:'https://login.botframework.com/v1/.well-known/keys'})
   else{assert.equal(url.pathname,'/v1/.well-known/keys');json({keys:[jwk]})}return true
  }
  if(host==='login.microsoftonline.com'){
   assert.equal(url.pathname,'/'+fixture.tenantId+'/oauth2/v2.0/token');assert.equal(req.method,'POST')
   const form=new URLSearchParams(raw.toString());oauthRequests.push(Object.fromEntries(form));assert.equal(form.get('client_id'),fixture.clientId);assert.equal(form.get('client_secret'),fixture.clientSecret);assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('redirect_uri'),origin+'/oauth/teams/callback');assert.deepEqual(form.get('scope').split(' ').sort(),['Channel.ReadBasic.All','ChannelMessage.Send','Chat.Create','ChatMessage.Send','Team.ReadBasic.All','User.Read'])
   if(form.get('code')!==fixture.code){json({error:'invalid_grant'},400);return true}
   json({access_token:fixture.botToken,scope:'Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Send Chat.Create ChatMessage.Send User.Read',expires_in:3600,token_type:'Bearer'});return true
  }
  assert.equal(host,'graph.microsoft.com');assert.equal(req.headers.authorization,'Bearer '+fixture.botToken)
  if(url.pathname==='/v1.0/me/joinedTeams'){assert.equal(req.method,'GET');json({value:[{id:'synthetic-cradle-120-team',displayName:'synthetic-cradle-120-workspace'}]});return true}
  if(url.pathname==='/v1.0/teams/synthetic-cradle-120-team/channels'){assert.equal(req.method,'GET');json({value:[{id:'synthetic-cradle-120-channel',displayName:'synthetic-cradle-120-review'},{id:'synthetic-cradle-120-private-channel',displayName:'synthetic-cradle-120-private'}]});return true}
  if(url.pathname==='/v1.0/me'){assert.equal(req.method,'GET');json({id:'synthetic-cradle-120-consenting-owner'});return true}
  if(url.pathname==='/v1.0/chats'){assert.equal(req.method,'POST');const body=JSON.parse(raw.toString());assert.equal(body.chatType,'oneOnOne');assert.equal(body.members.length,2);assert.ok(body.members.some(member=>member['user@odata.bind'].includes(fixture.ownerUserId)||member['user@odata.bind'].includes(fixture.editorUserId)));json({id:'synthetic-cradle-120-direct'},201);return true}
  if(url.pathname==='/v1.0/chats/synthetic-cradle-120-direct/messages'){assert.equal(req.method,'POST');const wire=JSON.parse(raw.toString()),card=JSON.parse(wire.attachments[0].content);assert.equal(card.type,'AdaptiveCard');assert.equal(card.actions.length,0);assert.ok(card.body.every(block=>block.type==='TextBlock'&&block.wrap===true));postRequests.push(wire);graphPosts.push(wire);if(uncertain){json({error:{code:'ServiceUnavailable'}},503);return true}const ts='synthetic-cradle-120-direct-'+(messages.length+1);messages.push({ts,body:{channel:'synthetic-cradle-120-direct',text:card.body.map(block=>unescape(block.text)).join('\n')},card,wire});json({id:ts},201);return true}
  assert.equal(url.pathname,'/v1.0/teams/synthetic-cradle-120-team/channels/synthetic-cradle-120-channel/messages');assert.equal(req.method,'POST')
  const wire=JSON.parse(raw.toString());graphPosts.push(wire);postRequests.push(wire);assert.equal(wire.body.contentType,'html');assert.equal(wire.attachments[0].contentType,'application/vnd.microsoft.card.adaptive')
  const card=JSON.parse(wire.attachments[0].content);assert.equal(card.type,'AdaptiveCard');assert.equal(card.version,'1.4');assert.ok(card.body.every(block=>block.type==='TextBlock'&&block.wrap===true));assert.deepEqual(card.actions.map(action=>action.title),['Approve','Reject'])
  if(uncertain){json({error:{code:'ServiceUnavailable'}},503);return true}
  const ts='synthetic-cradle-120-message-'+(messages.length+1),blocks=[...card.body.map(block=>({type:'section',text:{type:block.text.startsWith('[Open record]')?'mrkdwn':'plain_text',text:unescape(block.text)}})),{type:'actions',elements:card.actions.map(action=>({type:'button',action_id:action.data.action_id,value:action.data.value,text:{type:'plain_text',text:action.title}}))}]
  messages.push({ts,body:{channel:fixture.channelId,text:'Cradle record approval',blocks},card,wire});json({id:ts},201);return true
 }})
 async function signed(origin,path,body,{json=false,stale=false,forged=false,status=200}={}){
  const source=json?body:new URLSearchParams(body),kind=path.split('/').at(-1),channel=fixture.channelId.split('/')
  const base={id:'synthetic-cradle-120-activity',channelId:'msteams',channelData:{tenant:{id:fixture.tenantId},team:{id:channel[0]},channel:{id:channel[1]}},serviceUrl:'https://smba.trafficmanager.net/teams/'}
  let activity
  if(kind==='link')activity={...base,type:'message',from:{aadObjectId:source.get('user_id')},text:'/cradle-link '+source.get('text')}
  else if(kind==='actions'){const payload=JSON.parse(source.get('payload'));activity={...base,type:'invoke',name:'adaptiveCard/action',from:{aadObjectId:payload.user.id},replyToId:payload.container.message_ts,value:{action:{data:payload.actions[0]}}}}
  else activity={...base,id:body.event_id,type:'invoke',name:'composeExtension/queryLink',from:{aadObjectId:body.event.user},replyToId:body.event.message_ts,value:{url:body.event.links[0].url}}
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),head=encode({alg:'RS256',kid}),claims=encode({iss:'https://api.botframework.com',aud:fixture.clientId,nbf:now-60,exp:now+(stale?-600:3600),serviceurl:base.serviceUrl}),input=head+'.'+claims
  const signature=forged?Buffer.from('synthetic-cradle-120-invalid').toString('base64url'):sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')
  const response=await fetch(origin+'/webhooks/teams/actions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+input+'.'+signature},body:JSON.stringify(activity)}),value=await response.json().catch(()=>null)
  assert.equal(response.status,status,`${path}: ${value?.error?.message??JSON.stringify(value)}`)
  if(kind==='events'&&response.status===200){const card=value.composeExtension?.attachments?.[0]?.content;assert.equal(card?.type,'AdaptiveCard');unfurls.push({channel:fixture.channelId,unfurls:{[body.event.links[0].url]:{blocks:card.body.map(block=>({type:'section',text:{type:'plain_text',text:unescape(block.text)}}))}}})}
  return value
 }
 return {...edge,fixture,channels,messages,unfurls,oauthRequests,apiCalls,postRequests,graphPosts,signed,bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},setOrigin(value){origin=value},setPostUncertain(value){uncertain=value}}
}

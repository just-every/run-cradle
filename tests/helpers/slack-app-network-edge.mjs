import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {automationNetworkEdge} from './automation-network-edge.mjs'

export const slackAppFixture={clientId:'synthetic-cradle-120-client',clientSecret:'synthetic-cradle-120-client-secret',signingSecret:'synthetic-cradle-120-signing-secret',botToken:'synthetic-cradle-120-bot-token',teamId:'synthetic-cradle-120-team',channelId:'synthetic-cradle-120-channel',ownerUserId:'synthetic-cradle-120-owner',editorUserId:'synthetic-cradle-120-editor',deniedUserId:'synthetic-cradle-120-denied',unlinkedUserId:'synthetic-cradle-120-unlinked',code:'synthetic-cradle-120-code'}

/** Only Slack's network boundary is fake. OAuth and authenticated API calls
 * traverse the real TLS receiver, public-DNS checks and maintained relay. */
export async function slackAppNetworkEdge({provider='slack'}={}){
 const fixture={...slackAppFixture,provider,providerOrigin:provider==='nook'?'https://nook.example.com':'https://slack.com'},messages=[],unfurls=[],oauthRequests=[],apiCalls=[],postRequests=[]
 let origin,uncertain=false
 const channels=[{id:fixture.channelId,name:'synthetic-cradle-120-review',is_member:true,is_archived:false,is_private:false},{id:'synthetic-cradle-120-private-channel',name:'synthetic-cradle-120-private',is_member:true,is_archived:false,is_private:true}]
 const edge=await automationNetworkEdge({extraHosts:[new URL(fixture.providerOrigin).hostname],async receive(req,res,raw){
  if(req.headers.host!==new URL(fixture.providerOrigin).hostname)return false
  const url=new URL(req.url,fixture.providerOrigin);if(provider==='nook'){assert.ok(url.pathname.startsWith('/api/slack/'));url.pathname=url.pathname.replace('/api/slack/','/api/')}apiCalls.push({method:req.method,path:req.url})
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))}
  if(url.pathname==='/api/oauth.v2.access'){
   assert.equal(req.method,'POST')
   const form=new URLSearchParams(raw.toString());oauthRequests.push(Object.fromEntries(form))
   assert.equal(form.get('client_id'),fixture.clientId);assert.equal(form.get('client_secret'),fixture.clientSecret)
   if(origin)assert.equal(form.get('redirect_uri'),origin+'/oauth/'+provider+'/callback')
   if(form.get('code')!==fixture.code){json({ok:false,error:'invalid_code'});return true}
   json({ok:true,access_token:fixture.botToken,token_type:'bot',scope:'chat:write,channels:read,groups:read,links:read,links:write,commands',team:{id:fixture.teamId,name:'synthetic-cradle-120-workspace'},bot_user_id:'synthetic-cradle-120-bot',authed_user:{id:fixture.ownerUserId}});return true
  }
  assert.equal(req.headers.authorization,'Bearer '+fixture.botToken,'Slack APIs authenticate with the sealed OAuth token')
  if(url.pathname==='/api/conversations.list'){
   assert.equal(req.method,'GET');json({ok:true,channels,response_metadata:{next_cursor:''}});return true
  }
  if(url.pathname==='/api/auth.test'){json({ok:true,team_id:fixture.teamId,team:'synthetic-cradle-120-workspace',user_id:'synthetic-cradle-120-bot',scopes:['chat:write','channels:read','groups:read','links:read','links:write','commands']});return true}
  assert.equal(req.method,'POST')
  const body=JSON.parse(raw.toString())
  if(url.pathname==='/api/chat.postMessage'){
   assert.ok(channels.some(channel=>channel.id===body.channel));assert.equal(typeof body.text,'string');assert.ok(Array.isArray(body.blocks))
   assert.ok(body.blocks.length<=50)
   for(const block of body.blocks)if(block.type==='section')assert.ok(block.text.text.length>0&&block.text.text.length<=3000,'Slack sections respect the remote block budget')
   postRequests.push(body)
   if(uncertain){json({ok:false,error:'internal_error'},503);return true}
   const ts=String(Math.floor(Date.now()/1000))+'.'+String(messages.length+1).padStart(6,'0')
   messages.push({body,ts});json({ok:true,channel:body.channel,ts,message:body});return true
  }
  if(url.pathname==='/api/chat.unfurl'){
   assert.equal(body.channel,fixture.channelId);assert.ok(body.unfurls&&typeof body.unfurls==='object')
   for(const unfurl of Object.values(body.unfurls)){assert.ok(unfurl.blocks.length<=50);for(const block of unfurl.blocks)assert.ok(block.text.text.length>0&&block.text.text.length<=3000)}
   unfurls.push(body);json({ok:true});return true
  }
  throw new Error('Unexpected Slack network request: '+url.pathname)
 }})
 return {...edge,fixture,channels,messages,unfurls,oauthRequests,apiCalls,postRequests,
  bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},
  setOrigin(value){origin=value},setPostUncertain(value){uncertain=value},
 }
}

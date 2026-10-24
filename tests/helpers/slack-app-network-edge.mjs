import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {automationNetworkEdge} from './automation-network-edge.mjs'

export const slackAppFixture={clientId:'synthetic-cradle-120-client',clientSecret:'synthetic-cradle-120-client-secret',signingSecret:'synthetic-cradle-120-signing-secret',botToken:'synthetic-cradle-120-bot-token',teamId:'synthetic-cradle-120-team',channelId:'synthetic-cradle-120-channel',ownerUserId:'synthetic-cradle-120-owner',editorUserId:'synthetic-cradle-120-editor',deniedUserId:'synthetic-cradle-120-denied',unlinkedUserId:'synthetic-cradle-120-unlinked',code:'synthetic-cradle-120-code'}

/** Only Slack's network boundary is fake. OAuth and authenticated API calls
 * traverse the real TLS receiver, public-DNS checks and maintained relay. */
export async function slackAppNetworkEdge(){
 const fixture=slackAppFixture,messages=[],unfurls=[],oauthRequests=[],apiCalls=[],postRequests=[]
 let origin,uncertain=false
 const channels=[{id:fixture.channelId,name:'synthetic-cradle-120-review',is_member:true,is_archived:false,is_private:false},{id:'synthetic-cradle-120-private-channel',name:'synthetic-cradle-120-private',is_member:true,is_archived:false,is_private:true}]
 const edge=await automationNetworkEdge({extraHosts:['slack.com'],async receive(req,res,raw){
  if(req.headers.host!=='slack.com')return false
  const url=new URL(req.url,'https://slack.com');apiCalls.push({method:req.method,path:req.url})
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value))}
  if(url.pathname==='/api/oauth.v2.access'){
   assert.equal(req.method,'POST')
   const form=new URLSearchParams(raw.toString());oauthRequests.push(Object.fromEntries(form))
   assert.equal(form.get('client_id'),fixture.clientId);assert.equal(form.get('client_secret'),fixture.clientSecret)
   if(origin)assert.equal(form.get('redirect_uri'),origin+'/oauth/slack/callback')
   if(form.get('code')!==fixture.code){json({ok:false,error:'invalid_code'});return true}
   json({ok:true,access_token:fixture.botToken,token_type:'bot',scope:'chat:write,channels:read,groups:read,links:read,links:write,commands',team:{id:fixture.teamId,name:'synthetic-cradle-120-workspace'},bot_user_id:'synthetic-cradle-120-bot',authed_user:{id:fixture.ownerUserId}});return true
  }
  assert.equal(req.headers.authorization,'Bearer '+fixture.botToken,'Slack APIs authenticate with the sealed OAuth token')
  if(url.pathname==='/api/conversations.list'){
   assert.equal(req.method,'GET');json({ok:true,channels,response_metadata:{next_cursor:''}});return true
  }
  if(url.pathname==='/api/auth.test'){json({ok:true,team_id:fixture.teamId,user_id:'synthetic-cradle-120-bot'});return true}
  assert.equal(req.method,'POST')
  const body=JSON.parse(raw.toString())
  if(url.pathname==='/api/chat.postMessage'){
   assert.ok(channels.some(channel=>channel.id===body.channel));assert.equal(typeof body.text,'string');assert.ok(Array.isArray(body.blocks))
   postRequests.push(body)
   if(uncertain){json({ok:false,error:'internal_error'},503);return true}
   const ts=String(Math.floor(Date.now()/1000))+'.'+String(messages.length+1).padStart(6,'0')
   messages.push({body,ts});json({ok:true,channel:body.channel,ts,message:body});return true
  }
  if(url.pathname==='/api/chat.unfurl'){
   assert.equal(body.channel,fixture.channelId);assert.ok(body.unfurls&&typeof body.unfurls==='object')
   unfurls.push(body);json({ok:true});return true
  }
  throw new Error('Unexpected Slack network request: '+url.pathname)
 }})
 return {...edge,fixture,channels,messages,unfurls,oauthRequests,apiCalls,postRequests,
  bindings:{CONNECTION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EGRESS_RELAY_URL:'https://relay.egress.example.com/v1/deliver',EGRESS_RELAY_SECRET:edge.secret},
  setOrigin(value){origin=value},setPostUncertain(value){uncertain=value},
 }
}

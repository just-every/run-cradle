import {errorResponse} from '../../core/registry/errors.server'
import {Hono} from 'hono'
import {z} from 'zod'
import type {RequestContext} from '../authority/ports'
import type {PlatformBindings} from '../../core/platform/bindings'
import type {ServerFoundation} from '../../core/app/foundation.server'
import type {createRecordServices} from '../records/service.server'
import {createUlid} from '../../core/shared/ids'
import {readBoundedJson} from '../authority/http.server'
import {ownerDelegationSnapshot} from '../authority/delegation.server'
import {LAUNCH_APP_ID} from '../../apps/launch/contracts'
import {idSchema} from '../authority/validators'
import {slackSettings,type ChatProvider} from './settings.server'
import {slackTransport} from './transport.server'
import {slackOAuth} from './oauth.server'
import {slackIdentity} from './identity.server'
import {slackAppEffects} from './effects.server'
import {slackCallbacks} from './callbacks.server'
export function createSlackApp(env:PlatformBindings,foundation:ServerFoundation,records:ReturnType<typeof createRecordServices>,origin:string){
 function providerApp(provider:ChatProvider){
  const settings=slackSettings(env,foundation,origin,provider),api=slackTransport(env,settings),oauth=slackOAuth(env.DB,settings,api,origin),identity=slackIdentity(env.DB,settings)
  return {settings,oauth,identity,effects:slackAppEffects(env,foundation,records,settings,oauth,api,origin),webhook:slackCallbacks(env,foundation,records,settings,identity,api,origin)}
 }
 const providers={slack:providerApp('slack'),teams:providerApp('teams'),nook:providerApp('nook')},http=new Hono()
 const provider=(value:unknown)=>z.enum(['slack','teams','nook']).parse(value??'slack')
 const selected=(c:{req:{query:(key:string)=>string|undefined}})=>providers[provider(c.req.query('provider'))]
 http.onError((error,c)=>errorResponse(error,createUlid(),c.req.method+' '+c.req.path))
 const authenticate=(request:Request)=>foundation.authenticate(request,'http',createUlid())
 const reply=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}})
 http.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()})
 http.get('/settings',async c=>{const ctx=await authenticate(c.req.raw),appId=c.req.query('appId'),entityId=c.req.query('entityId');if(appId)idSchema.parse(appId);if(entityId)idSchema.parse(entityId);return c.json(reply(ctx,await selected(c).settings.read(ctx,appId,entityId)))})
 http.put('/settings',async c=>{const ctx=await authenticate(c.req.raw),body=await readBoundedJson(c.req.raw,8192),parsed=z.object({provider:z.enum(['slack','teams','nook']).default('slack')}).passthrough().parse(body);return c.json(reply(ctx,await providers[parsed.provider].settings.save(ctx,body)))})
 http.delete('/settings',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await selected(c).settings.remove(ctx)))})
 http.post('/install',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await selected(c).oauth.start(ctx)))})
 http.get('/channels',async c=>{const ctx=await authenticate(c.req.raw);await ownerDelegationSnapshot(env.DB,ctx,LAUNCH_APP_ID);return c.json(reply(ctx,await selected(c).oauth.channels()))})
 http.post('/link',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await selected(c).identity.code(ctx)))})
 http.delete('/link',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await selected(c).identity.unlink(ctx)))})
 http.put('/unfurl-fields',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await selected(c).settings.fields(ctx,await readBoundedJson(c.req.raw,16384))))})
 return {http,
  validate:(...args:Parameters<typeof providers.slack.effects.validate>)=>providers[args[3].provider??'slack'].effects.validate(...args),
  dispatch:(...args:Parameters<typeof providers.slack.effects.dispatch>)=>providers[args[3].provider??'slack'].effects.dispatch(...args),
  recover:providers.slack.effects.recover,
  webhook:(request:Request,kind:'link'|'actions'|'events')=>providers[provider(new URL(request.url).pathname.split('/')[2])].webhook(request,kind),
  async callback(request:Request){const ctx=await authenticate(request),url=new URL(request.url),app=providers[provider(url.pathname.split('/')[2])];return app.oauth.callback(ctx,z.string().min(1).max(512).parse(url.searchParams.get('state')),z.string().min(1).max(4096).parse(url.searchParams.get('code')))}
 }
}

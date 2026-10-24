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
import {slackSettings} from './settings.server'
import {slackTransport} from './transport.server'
import {slackOAuth} from './oauth.server'
import {slackIdentity} from './identity.server'
import {slackAppEffects} from './effects.server'
import {slackCallbacks} from './callbacks.server'
export function createSlackApp(env:PlatformBindings,foundation:ServerFoundation,records:ReturnType<typeof createRecordServices>,origin:string){
 const settings=slackSettings(env,foundation,origin),api=slackTransport(env),oauth=slackOAuth(env.DB,settings,api,origin),identity=slackIdentity(env.DB,settings)
 const effects=slackAppEffects(env,foundation,records,settings,oauth,api,origin),http=new Hono()
 http.onError((error,c)=>errorResponse(error,createUlid(),c.req.method+' '+c.req.path))
 const authenticate=(request:Request)=>foundation.authenticate(request,'http',createUlid())
 const reply=(ctx:RequestContext,data:unknown)=>({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}})
 http.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next()})
 http.get('/settings',async c=>{const ctx=await authenticate(c.req.raw),appId=c.req.query('appId'),entityId=c.req.query('entityId');if(appId)idSchema.parse(appId);if(entityId)idSchema.parse(entityId);return c.json(reply(ctx,await settings.read(ctx,appId,entityId)))})
 http.put('/settings',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await settings.save(ctx,await readBoundedJson(c.req.raw,8192))))})
 http.delete('/settings',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await settings.remove(ctx)))})
 http.post('/install',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await oauth.start(ctx)))})
 http.get('/channels',async c=>{const ctx=await authenticate(c.req.raw);await ownerDelegationSnapshot(env.DB,ctx,LAUNCH_APP_ID);return c.json(reply(ctx,await oauth.channels()))})
 http.post('/link',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await identity.code(ctx)))})
 http.delete('/link',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await identity.unlink(ctx)))})
 http.put('/unfurl-fields',async c=>{const ctx=await authenticate(c.req.raw);return c.json(reply(ctx,await settings.fields(ctx,await readBoundedJson(c.req.raw,16384))))})
 return {http,...effects,webhook:slackCallbacks(env,foundation,records,settings,identity,api,origin),async callback(request:Request){const ctx=await authenticate(request),url=new URL(request.url);return oauth.callback(ctx,z.string().min(1).max(512).parse(url.searchParams.get('state')),z.string().min(1).max(4096).parse(url.searchParams.get('code')))}}
}

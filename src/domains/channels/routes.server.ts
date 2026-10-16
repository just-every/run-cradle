import { Hono } from 'hono'
import type { RequestContext } from '../authority/ports'
import type { SettingsDependencies } from './settings.server'
import type { CommandRegistry } from '../../core/registry/commands'
import { createChannelSettings } from './settings.server'
import { createChannelInbox } from './inbox.server'
import { createUlid } from '../../core/shared/ids'
import { errorResponse } from '../../core/registry/errors.server'
import { readJsonBody } from '../../core/registry/body'
import { z } from 'zod'
export function createChannelHttp(d:SettingsDependencies & {commands:CommandRegistry;authenticate(request:Request):Promise<RequestContext>;access?:Parameters<typeof createChannelInbox>[2]}){const app=new Hono(),settings=createChannelSettings(d),inbox=createChannelInbox(d.db,d.policy,d.access)
 async function legacySettings(ctx:RequestContext){const s=await settings.get(ctx),email=s.capabilities.find(c=>c.id==='mail.sender.v1'),ai=s.capabilities.find(c=>c.id==='ai.provider.v1'),deliveries=(await d.db.prepare("SELECT id,state,error_code,error_message,receipt_id,due_at FROM channel_deliveries WHERE operator_id=? AND state IN ('failed','unknown') ORDER BY created_at DESC LIMIT 200").bind(ctx.principal.humanId).all()).results;return {...s,workspace:{name:s.workspaceName,timezone:s.timezone,currency:s.currency,quietHoursStart:s.quietHours.start,quietHoursEnd:s.quietHours.end},notifications:s.preferences,ai:{dailyCeiling:s.aiDailyCeiling,enabled:s.aiEnabled,configured:ai?.state==='ready',status:s.aiEnabled?(ai?.state??'unconfigured'):'disabled',missing:ai?.missing??['ai.provider.v1'],checkedAt:ai?.checkedAt??null,usage:{purposes:s.usage}},mail:{status:email?.state==='ready'?'ready':'unavailable',unavailableReason:email?.reason??'mail.sender.v1 is not configured.'},email:{configured:email?.state==='ready',status:email?.state??'unconfigured',missing:email?.missing??['mail.sender.v1'],checkedAt:email?.checkedAt??null,deliveries:{items:deliveries}}}}
 const paths=['/api/notifications','/api/notifications/read-all','/api/notifications/:id/read','/api/settings','/api/workspace','/api/v1/notifications','/api/v1/settings','/api/v1/preferences','/api/v1/deliveries']
 for(const path of paths)app.all(path,async c=>{const requestId=createUlid();try{const ctx=await d.authenticate(c.req.raw),url=new URL(c.req.url),legacy=!url.pathname.startsWith('/api/v1'),meta={requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''};
  if(c.req.method==='GET'){
   if(url.pathname.endsWith('/notifications')){const cursor=c.req.query('cursor'),before=cursor?z.object({at:z.number().int(),id:z.string()}).strict().parse(JSON.parse(cursor)):undefined,result=await inbox.list(ctx,Number(c.req.query('limit')??200),before);return c.json(legacy?{notifications:result.items,items:result.items,unreadCount:result.unreadCount,cursor:result.nextCursor,total:result.total.value,totalLabel:result.total.kind==='at_least'?'10,000+':String(result.total.value)}:{data:result,meta})}
   if(url.pathname.endsWith('/preferences'))return c.json({data:await settings.prefs(ctx),meta})
   if(url.pathname.endsWith('/deliveries')){await settings.get(ctx);const rows=(await d.db.prepare('SELECT id,notification_id AS notificationId,state,receipt_id AS receiptId,error_code AS errorCode,error_message AS errorMessage,due_at AS dueAt FROM channel_deliveries WHERE operator_id=? ORDER BY created_at DESC,id DESC LIMIT 200').bind(ctx.principal.humanId).all()).results;return c.json({data:{items:rows,nextCursor:null,total:{kind:'exact',value:rows.length},evaluatedAt:ctx.now},meta})}
   if(url.pathname.endsWith('/workspace')){await settings.get(ctx);const w=await d.db.prepare("SELECT * FROM workspace WHERE id='workspace'").first<{id:string;name:string;timezone:string;currency:string;version:number;created_at:number;updated_at:number}>();if(!w)throw new Error('Workspace is not configured');return c.json({workspace:{id:w.id,name:w.name,timezone:w.timezone,currency:w.currency,version:w.version,createdAt:new Date(w.created_at).toISOString(),updatedAt:new Date(w.updated_at).toISOString()}})}
   return c.json(legacy?{settings:await legacySettings(ctx)}:{data:await settings.get(ctx),meta})
  }
  if(!legacy)return c.body(null,405)
  let action:string,input:unknown
  if(c.req.method==='PATCH'&&url.pathname==='/api/settings'){const raw=z.record(z.string(),z.unknown()).parse(await readJsonBody(c.req.raw)),version=z.number().int().positive().parse(raw.version);delete raw.version;action='settings.update';input={version,changes:raw}}
  else if(c.req.method==='POST'&&url.pathname==='/api/notifications/read-all'){action='notification.read-all';input={through:ctx.now}}
  else if(c.req.method==='POST'&&c.req.param('id')){action='notification.read';input={notificationId:c.req.param('id')}}else return c.body(null,405)
  const command=d.commands.get(action);if(!command)throw new Error(`Required channel command ${action} is not registered`);await command.execute(ctx,{commandId:c.req.header('idempotency-key')??createUlid(),expected:[],input});return action==='settings.update'?c.json({settings:await legacySettings(ctx)}):c.body(null,204)
 }catch(error){return errorResponse(error,requestId,'channels')}})
 return app
}

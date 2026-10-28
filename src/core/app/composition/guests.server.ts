import {z} from 'zod'
import { Hono } from 'hono'
import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import { createUlid } from '../../shared/ids'
import { createGuestInvitations, guestOwnerGuards, guestInvitation } from '../../../domains/authority/guests.server'
import { readBoundedJson } from '../../../domains/authority/http.server'
import { AuthorityError } from '../../../domains/authority/errors'
import { and } from '../../../domains/admission/sql.server'

export function guestRoutes(platform:Platform,foundation:ServerFoundation){
 const db=platform.bindings.DB,router=new Hono(),invite=createGuestInvitations(db,foundation.policy,foundation.admission,foundation.descriptors)
 router.get('/api/v1/guests',async c=>{
  const ctx=await foundation.authenticate(c.req.raw,'http',createUlid()),guards=and(...await guestOwnerGuards(db,ctx))
  const rows=await db.prepare(`SELECT p.id,o.name,o.email,p.state,p.version,g.app_id AS appId FROM authority_guests g JOIN authority_principals p ON p.id=g.principal_id JOIN operators o ON o.id=p.human_id WHERE p.state<>'erased' AND (${guards.sql}) ORDER BY g.created_at DESC,p.id`).bind(...guards.values).all()
  return c.json({data:{items:rows.results.map(row=>({...row,licenseCount:0})),licenseCount:0},meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.requestId}},200,{'cache-control':'no-store'})
 })
 router.post('/api/v1/guests/invite',async c=>{
  const ctx=await foundation.authenticate(c.req.raw,'http',createUlid())
  const body=z.object({commandId:guestInvitation.shape.commandId,expected:z.array(z.unknown()).length(0),input:guestInvitation.omit({commandId:true})}).strict().parse(await readBoundedJson(c.req.raw))
  const receipt=await invite(ctx,{commandId:body.commandId,...body.input})
  if(receipt.result.state==='committed'){
   const person=await db.prepare(`SELECT o.email,o.name,g.app_id,g.invitation_delivered FROM authority_guests g JOIN authority_principals p ON p.id=g.principal_id JOIN operators o ON o.id=p.human_id JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators b ON b.id=m.base_id WHERE p.id=? AND p.state='invited' AND b.status='invited'`).bind(receipt.result.value.id).first<{email:string;name:string;app_id:string;invitation_delivered:number}>()
   if(person&&!person.invitation_delivered){
    if(!platform.auth.configuration.base)throw new AuthorityError('unconfigured','Base authentication is required.',503)
    await platform.auth.configuration.base.invite(c.req.raw,{email:person.email,displayName:person.name,role:'member',returnTo:`/app/records/${person.app_id}`})
    await db.prepare('UPDATE authority_guests SET invitation_delivered=1 WHERE principal_id=?').bind(receipt.result.value.id).run()
   }
  }
  return c.json({data:receipt.result,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:receipt.consistencyToken}},200,{'cache-control':'no-store'})
 })
 return router
}

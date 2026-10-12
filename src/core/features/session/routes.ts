import type { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { createSessionService } from './service'
import { readBoundedJson } from '../../../domains/authority/http.server'
export const registerSessionRoutes=(app:Hono<AppEnv>,platform:Platform)=>{
  const service=createSessionService(platform),native=service.native
  app.get('/auth/capabilities',async context=>{await native.rate(`cap:${context.req.header('cf-connecting-ip')??'local'}`,60,60000);return context.json(native.capabilities)})
  app.post('/auth/request',async context=>{
    const input=z.object({email:z.email().max(254),returnTo:z.string().max(2048).default('/app')}).strict().parse(await readBoundedJson(context.req.raw))
    await native.requestLink(context.req.raw,input);return context.json({status:'accepted'})
  })
  app.post('/auth/sign-out',async context=>{const result=await native.signOut(context.req.raw);context.header('Set-Cookie',result.cookie);return context.json({status:'signed_out'})})
  app.get('/auth/csrf',async context=>{context.header('Cache-Control','no-store');return context.json({csrfToken:await native.csrf(context.req.raw)})})
  app.get('/auth/sessions',async context=>{context.header('Cache-Control','no-store');return context.json({sessions:await native.sessions(context.req.raw)})})
  app.post('/auth/sessions/:id/revoke',async context=>{const id=z.union([z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),z.uuid()]).parse(context.req.param('id'));await native.revokeSession(context.req.raw,id);return context.json({revoked:true})})
  return service
}

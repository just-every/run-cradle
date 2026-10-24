import type { ConnectionSetupCatalogue } from './contracts';
import { Hono } from 'hono';
import type { RequestContext } from '../authority/ports';
import { ApiError,errorResponse } from '../../core/registry/errors.server';
import { createUlid } from '../../core/shared/ids';
import type { createApiKeyWriter } from './api-keys.server';
export const providerSetupCatalogue={providers:[
 {id:'resend',label:'Resend email',authentication:'api_key',accountLabel:'Verified sender email',resourceLabel:'Verified sender email',actions:['repair.request-quote','notification.email.send'],readbackSecret:true},
 {id:'google-sheets',label:'Google Sheets',authentication:'oauth',accountLabel:'Spreadsheet ID',resourceLabel:'Spreadsheet ID',actions:['connection.sync'],readbackSecret:false},
 {id:'gmail',label:'Gmail inbox',authentication:'oauth',accountLabel:'Mailbox email address',resourceLabel:'Approved Gmail label',actions:['connection.sync'],readbackSecret:false},
 {id:'outlook',label:'Outlook',authentication:'oauth',accountLabel:'Calendar account',resourceLabel:'Owned calendar ID',actions:['record.calendar.sync'],readbackSecret:false},
 {id:'google-calendar',label:'Google Calendar',authentication:'oauth',accountLabel:'Calendar account',resourceLabel:'Owned calendar ID',actions:['repair.book-visit','repair.cancel-visit','record.calendar.sync'],readbackSecret:false},
 {id:'xero',label:'Xero draft bills',authentication:'oauth',accountLabel:'Xero organisation ID',resourceLabel:'Approved Xero organisation ID',actions:['repair.handoff-invoice'],readbackSecret:false},
 {id:'openai',label:'OpenAI generation',authentication:'api_key',accountLabel:'Account label',resourceLabel:'Model',actions:['model.generate'],readbackSecret:false},
],models:[{id:'gpt-6-luna',label:'GPT-6 Luna'},{id:'gpt-6-astra',label:'GPT-6 Astra'}],profileDefaults:{adapterId:'openai',state:'unconfigured',requestTimeoutSeconds:60,evaluationIds:[],credentialRef:null},profileRequirements:['purpose','allowedFields','dailyCallCeiling','maximumCost','independentEvaluation','explicitCallerGrant'] } as const satisfies ConnectionSetupCatalogue;
export function createConnectionSetupHttp(d:{authenticate(request:Request):Promise<RequestContext>;writeCredentials:ReturnType<typeof createApiKeyWriter>}){const app=new Hono();
 app.get('/api/v1/connections/setup',async c=>{const requestId=createUlid();try{const ctx=await d.authenticate(c.req.raw);if(ctx.principal.kind!=='human')throw new ApiError('forbidden','Connection setup requires a human administrator.');return c.json({data:providerSetupCatalogue,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now}});}catch(e){return errorResponse(e,requestId,'connection.setup');}});
 app.post('/api/v1/connections/:id/credentials',async c=>{const requestId=createUlid();try{const ctx=await d.authenticate(c.req.raw);const length=Number(c.req.header('content-length')??0);if(length>12000)throw new ApiError('upload_rejected','Credential submission exceeds limit.');const raw=await c.req.text();if(raw.length>12000)throw new ApiError('upload_rejected','Credential submission exceeds limit.');const result=await d.writeCredentials(ctx,c.req.param('id'),JSON.parse(raw));return c.json({data:result.result,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now}});}catch(e){return errorResponse(e,requestId,'connection.credentials.configure');}});return app;}

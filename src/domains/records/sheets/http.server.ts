import {Hono} from 'hono'
import {z} from 'zod'
import {createUlid} from '../../../core/shared/ids'
import {readJsonBody} from '../../../core/registry/body'
import {ApiError,errorResponse} from '../../../core/registry/errors.server'
import type {ServerFoundation} from '../../../core/app/foundation.server'
import type {createSheetsImport} from './import.server'
import type {createSheetSchedules} from './schedules.server'
import {idSchema} from '../validators'
export function sheetsHttp(foundation:ServerFoundation,source:ReturnType<typeof createSheetsImport>,schedules:ReturnType<typeof createSheetSchedules>){const app=new Hono();app.all('*',async c=>{const request=c.req.raw,id=createUlid();try{
 const ctx=await foundation.authenticate(request,'http',id);await source.owner(ctx)
 if(request.method!=='POST'||request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('forbidden','A same-origin owner request is required.')
 const input=await readJsonBody(request),data=c.req.path.endsWith('/sheets-source')?await source.read(ctx,z.object({connectionId:idSchema}).strict().parse(input).connectionId):await schedules.configure(ctx,input)
 return c.json({data,meta:{requestId:id,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now}},200,{'cache-control':'no-store'})
 }catch(error){return errorResponse(error,id,'Sheets import')}});return app}

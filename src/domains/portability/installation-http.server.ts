import {Hono} from 'hono'
import {z} from 'zod'
import {createPortability, PortabilityError} from '@runeditrun/rer/modules/portability'
import {installationPortabilityPolicy} from './installation-policy.mjs'
import {installationBucket} from './installation-bucket.mjs'
import {derivedSearch} from './derived-search.mjs'
import type {Platform} from '../../core/platform'
import type {ServerFoundation} from '../../core/app/foundation.server'
import {ApiError, errorResponse} from '../../core/registry/errors.server'
import {createUlid} from '../../core/shared/ids'
import {readBoundedJson} from '../authority/http.server'

/** The same portable format, privacy policy and file checks as rer export. */
export function installationArchiveHttp(platform:Platform, foundation:ServerFoundation) {
  const app=new Hono(),db=platform.bindings.DB
  app.onError((error,c)=>{
    if(error instanceof PortabilityError)return c.json({error:{code:error.code,message:`Archive could not be prepared (${error.code}). Correct the reported installation data and try again.`}},error.status as 400)
    return errorResponse(error,createUlid(),c.req.method+' '+c.req.path)
  })
  app.all('*',async c=>{
    const request=c.req.raw,ctx=await foundation.authenticate(request,'http',createUlid())
    // An installation archive contains every base; a base membership is insufficient.
    const owner=ctx.principal.kind==='human'&&await db.prepare("SELECT 1 FROM authority_principals WHERE id=? AND state='active' AND initial_owner=1").bind(ctx.principal.id).first()
    if(!owner)throw new ApiError('forbidden','Only the current installation owner can export the whole installation.')
    if(request.method!=='GET'&&request.headers.get('origin')!==platform.auth.configuration.appOrigin)throw new ApiError('forbidden','A same-origin request is required.')
    if(await db.prepare('SELECT 1 FROM lifecycle_file_writes LIMIT 1').first())throw new ApiError('version_conflict','A file is still being saved. Wait for it to finish, then prepare the archive again.')
    if(await db.prepare("SELECT 1 FROM lifecycle_erasures WHERE state='pending' LIMIT 1").first())throw new ApiError('version_conflict','Privacy erasure is still running. Wait for it to finish, then prepare the archive again.')
    const service=await createPortability({db,buckets:{FILES:installationBucket(db,platform.bindings.FILES),WAREHOUSE:platform.bindings.WAREHOUSE},policy:{...installationPortabilityPolicy(platform.bindings.WAREHOUSE),derivedTables:await derivedSearch(db)}})
    const respond=(data:unknown)=>c.json({data,meta:{requestId:ctx.requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:''}},200,{'cache-control':'no-store'})
    if(request.method==='POST'&&c.req.path==='/api/v1/commands/export.start'){
      z.object({scope:z.literal('installation'),format:z.literal('archive')}).strict().parse(await readBoundedJson(request,1024))
      const id=await service.exports.create(ctx.principal.id)
      return respond({id})
    }
    const match=c.req.path.match(/^\/api\/v1\/archive-jobs\/([^/]+)(?:\/(advance|content))?$/)
    if(!match)throw new ApiError('not_found','Unknown archive route.')
    const id=z.string().min(1).max(100).parse(match[1])
    if(await service.actor(id)!==ctx.principal.id)throw new ApiError('not_found','Archive not found.')
    if(request.method==='GET'&&match[2]==='content')return new Response(await service.exports.download(id),{headers:{'content-type':'application/x-ndjson','content-disposition':`attachment; filename="cradle-installation-${id}.rer"`,'cache-control':'private, no-store'}})
    if(request.method==='POST'&&match[2]==='advance')return respond(await service.exports.advance(id,{maxParts:10}))
    if(request.method==='GET'&&!match[2])return respond(await service.exports.status(id))
    return c.body(null,405,{'allow':match[2]==='advance'?'POST':'GET'})
  })
  return app
}

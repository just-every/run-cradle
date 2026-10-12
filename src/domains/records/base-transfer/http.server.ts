import { retainCsvMapping } from './csv-mapping-custody'
import { attachCorrespondence } from './correspondence'
import { Hono } from 'hono'
import { z } from 'zod'
import { createUlid } from '../../../core/shared/ids'
import { readJsonBody } from '../../../core/registry/body'
import { errorResponse, ApiError } from '../../../core/registry/errors.server'
import type { RequestContext } from '../../authority/ports'
import type { BasePreview, PreparedSource, UploadedArtifact, ImportOptions, ImportIdentities } from './contracts'
import type { createBaseImportService } from './service.server'
import { idSchema } from '../validators'
import { sourceKinds } from './source-kinds'
import { ImportInputError } from './input-error'
const types=z.enum(['text','number','date','instant','money','boolean','select','multi_select','url','person','relation','attachment','computed'])
const overrides=z.object({sourceKind:z.enum(sourceKinds).optional(),sourceChoices:z.array(z.string().min(1).max(200)).max(10000).optional(),lookup:z.object({relationColumnKey:z.string(),valueColumnKey:z.string()}).strict().optional(),type:types.optional(),label:z.string().max(200).optional(),options:z.array(z.string().max(200)).max(10000).optional(),dateConvention:z.enum(['iso','day-first','month-first']).optional(),relationTableKey:z.string().max(500).optional(),cardinality:z.enum(['one','many']).optional(),onDelete:z.literal('restrict').optional(),reciprocal:z.object({tableKey:z.string(),columnKey:z.string()}).strict().optional(),derivedFrom:z.object({tableKey:z.string(),columnKey:z.string()}).strict().optional(),skip:z.boolean().optional()}).strict()
const optionsSchema=z.object({correspondenceAcceptedFingerprint:z.string().regex(/^[a-f0-9]{64}$/).optional(),referenceChoices:z.record(z.string().max(2000),z.string().max(500)).optional(),name:z.string().max(120),tables:z.record(z.string(),z.object({label:z.string().min(1).max(120).optional(),primaryColumnKey:z.string().optional(),columns:z.record(z.string(),overrides).optional()}).strict()).optional()}).strict()
const identitiesSchema=z.object({views:z.record(z.string(),idSchema).optional(),forms:z.record(z.string(),idSchema).optional(),incomingRelations:z.record(z.string(),idSchema).optional(),appId:idSchema,tables:z.record(z.string(),z.object({entityId:idSchema,fields:z.record(z.string(),idSchema),records:z.record(z.string(),idSchema),options:z.record(z.string(),z.record(z.string(),idSchema))}).strict())}).strict()
export type SourcePreparation={prepare:(artifacts:UploadedArtifact[],namespace?:string)=>PreparedSource|Promise<PreparedSource>;identities:(source:PreparedSource)=>ImportIdentities|Promise<ImportIdentities>;validateIdentities?:(source:PreparedSource,ids:ImportIdentities)=>void|Promise<void>}
export function baseImportHttp(service:ReturnType<typeof createBaseImportService>,source:SourcePreparation,authenticate:(request:Request,ingress:RequestContext['ingress'],id:string)=>Promise<RequestContext>,authenticatePreview:typeof authenticate){
 const app=new Hono(),prefix='/api/v1/records/base-import'
 async function previewInput(ctx:RequestContext,request:Request,requireAck:boolean){
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new ApiError('validation','Use a multipart CSV file set or one Cradle base JSON file.')
  const maximum=20*10485760+1048576
  if(Number(request.headers.get('content-length')??0)>maximum)throw new ApiError('upload_rejected',`multipartBytes limit ${maximum} exceeded`)
  let read=0
  if(!request.body)throw new ApiError('validation','A multipart body is required.')
  const bounded=request.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){read+=chunk.byteLength;if(read>maximum)throw new ApiError('upload_rejected',`multipartBytes limit ${maximum}; current ${read}`);controller.enqueue(chunk)}}))
  const form=await new Response(bounded,{headers:request.headers}).formData(),files=form.getAll('files')
  const allowed=new Set(['files','options','identities','fingerprint','acceptLoss','correspondence','mappingFile']);for(const key of form.keys())if(!allowed.has(key)||key!=='files'&&form.getAll(key).length!==1)throw new ApiError('validation','Unexpected or repeated import option.')
  if(files.length<1||files.length>20)throw new ApiError('validation',`tables limit 20; current ${files.length}`)
  const artifacts:UploadedArtifact[]=[]
  for(const file of files){if(typeof file==='string')throw new ApiError('validation','Each file must include exact uploaded bytes.');const limit=files.length===1&&file.name.toLowerCase().endsWith('.json')?200*1048576:10485760;if(file.size>limit)throw new ApiError('upload_rejected',`fileBytes limit ${limit}; current ${file.size}`);artifacts.push({filename:file.name,bytes:new Uint8Array(await file.arrayBuffer())})}
  let options:ImportOptions,identities:ImportIdentities|undefined
  try{options=optionsSchema.parse(JSON.parse(String(form.get('options')??'')));identities=form.has('identities')?identitiesSchema.parse(JSON.parse(String(form.get('identities')))):undefined}catch(error){if(error instanceof z.ZodError)throw error;throw new ApiError('validation','Options and identities must be valid JSON.')}
  let preview:BasePreview
  try {
   let prepared=await source.prepare(artifacts)
   const mappingFile=form.get('mappingFile')
   if(mappingFile){
    if(typeof mappingFile==='string')throw new ImportInputError('Mapping file must include exact uploaded bytes')
    const bytes=new Uint8Array(await mappingFile.arrayBuffer())
    prepared=retainCsvMapping(prepared,{filename:mappingFile.name,bytes})
    optionsSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))
   }
   const metadata=form.get('correspondence')
   if(metadata){if(typeof metadata==='string')throw new ImportInputError('Correspondence must include exact uploaded bytes');prepared=attachCorrespondence(prepared,{filename:metadata.name,bytes:new Uint8Array(await metadata.arrayBuffer())})}
   const ids=identities??await source.identities(prepared)
   await source.validateIdentities?.(prepared,ids)
   preview=await service.uploadPreview(ctx,prepared,options,ids)
  }catch(error){if(error instanceof ImportInputError)throw new ApiError('validation',error.message);throw error}
  return {preview,ack:{fingerprint:requireAck?z.string().regex(/^[a-f0-9]{64}$/).parse(form.get('fingerprint')):preview.fingerprint,acceptLoss:form.get('acceptLoss')==='true'}}
 }
 app.all('*',async c=>{const request=c.req.raw,url=new URL(request.url),requestId=createUlid();try{
  const ctx=await (url.pathname===prefix+'/preview'?authenticatePreview:authenticate)(request,'http',requestId)
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)throw new ApiError('forbidden','A same-origin owner request is required.')
  let data:unknown
  if(request.method==='POST'&&(url.pathname===prefix+'/preview'||url.pathname===prefix+'/review')){
   // Initial previews have no acknowledgment; use the same strict parser but only require it for review.
   const isReview=url.pathname.endsWith('/review'),parsed=await previewInput(ctx,request,isReview);data=isReview?await service.review(ctx,parsed.preview,parsed.ack):parsed.preview
  }else if(request.method==='POST'&&url.pathname===prefix+'/adopt'){
   const input=z.object({reviewId:idSchema,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),physicalFingerprint:z.string().regex(/^[a-f0-9]{64}$/),acceptLoss:z.boolean()}).strict().parse(await readJsonBody(request));data=await service.adopt(ctx,input.reviewId,input)
  }else{
   const match=url.pathname.match(/^\/api\/v1\/records\/base-import\/jobs\/([^/]+)(?:\/(resume|undo|rollback|report\.json|receipt\.json|attachment-manifest\.csv))?$/)
   if(!match)throw new ApiError('not_found','Import route not found.')
   const id=z.uuid().parse(match[1]),action=match[2]
   const download=(body:string,type:string,filename:string)=>new Response(body,{headers:{'content-type':type,'content-disposition':`attachment; filename="${filename.replace(/[^A-Za-z0-9._ -]/g,'_')}"`,'cache-control':'no-store'}})
   if(request.method==='GET'&&action==='receipt.json'){data=await service.receipt(ctx,id);if(url.searchParams.get('download')==='1')return download(JSON.stringify(data,null,2),'application/json','base-import-receipt.json')}
   else if(request.method==='GET'&&action==='attachment-manifest.csv'){const manifest=await service.attachmentManifest(ctx,id,z.string().min(1).max(500).parse(url.searchParams.get('table')),z.string().min(1).max(500).parse(url.searchParams.get('column')));return download(manifest.csv,'text/csv; charset=utf-8',manifest.filename)}
   else if(request.method==='GET'&&(!action||action==='report.json')){data=await service.status(ctx,id);if(action)return new Response(JSON.stringify(data,null,2),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="base-import-report.json"','cache-control':'no-store'}})}
   else if(request.method==='POST'&&['resume','undo','rollback'].includes(action??'')){z.object({}).strict().parse(await readJsonBody(request));data=await service[action as 'resume'|'undo'|'rollback'](ctx,id)}
   else throw new ApiError('not_found','Import operation not found.')
  }
  return c.json({data,meta:{requestId,apiVersion:'cradle.api.v1',evaluatedAt:ctx.now,consistencyToken:ctx.consistencyToken??''}},200,{'cache-control':'no-store'})
 }catch(error){if(error instanceof Error&&/NATIVE_EDIT_CONFLICT|IMPORT_NATIVE_ATTRIBUTION_CHANGED|IMPORT_ATOMIC_GUARD|STORED_PLAN_CHANGED|ORIGINAL_CUSTODY|JOB_BINDING|IMPORT_ALREADY_REVERSING|TARGET_REVISION_CONFLICT|REVERSAL_POLICY/.test(error.message))error=new ApiError('version_conflict','The import cannot advance because native data, retained source, plan or current authority changed. No rejected batch was applied. Review the job report.');return errorResponse(error,requestId,request.method+' '+url.pathname)}})
 return app
}

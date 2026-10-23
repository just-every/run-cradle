import {readInput} from '../../../vendor/base/modules/operator-auth/input.mjs'
import {requirePost} from '../../../vendor/base/modules/operator-auth/http.mjs'
import {AuthError,securityHeaders} from '../../../vendor/base/modules/operator-auth/index.mjs'
import {localMailEnabled} from './local-auth.server'
import type {PlatformBindings} from './bindings'

/** Installation setup names the first owner on every seed admission path. */
export function configuredOwnerName(env:PlatformBindings):string{
 return env.OWNER_NAME?.trim()||'Owner'
}

export async function configuredOwnerClaimRequest(request:Request,env:PlatformBindings):Promise<Request|Response>{
 const url=new URL(request.url)
 if(request.method!=='POST'||url.search||url.hash)return request
 // Base owns origin and method refusal; do not consume those requests first.
 try{requirePost(request,{origin:env.APP_ORIGIN??'',local:localMailEnabled(env)})}catch{return request}
 try{
  // Parse once: cancelling an oversized cloned stream can wait on its unread
  // original branch. Base's bounded parser also refuses duplicate fields.
  const input=await readInput(request)
  const headers=new Headers(request.headers)
  headers.set('content-type','application/json')
  headers.delete('content-length')
  return new Request(request.url,{method:request.method,headers,body:JSON.stringify({...input,displayName:configuredOwnerName(env)})})
 }catch(error){
  if(error instanceof AuthError)return Response.json({error:error.code},{status:error.status,headers:securityHeaders()})
  throw error
 }
}

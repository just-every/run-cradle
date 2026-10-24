import {pageResponse} from '../../../vendor/base/modules/operator-auth/page.mjs'
import type {PlatformBindings} from '../../core/platform/bindings'
import type {OperatorAuth} from '../../../vendor/base/modules/operator-auth/index.mjs'
import {samlResponse,configuration} from './saml.server'
import {createBaseAuth,createAuthHandler} from '../../core/platform/base-auth.server'
import {settingsResponse} from './settings.server'
import {scimResponse} from './scim.server'
import {headers} from './shared.server'
export const isCompanyRequest=(path:string)=>path==='/scim/v2'||path.startsWith('/scim/v2/')||path.startsWith('/auth/saml/')||['/auth/settings/company','/auth/settings/scim'].includes(path)
export async function companyResponse(request:Request,env:PlatformBindings,auth:OperatorAuth):Promise<Response|null>{
 const path=new URL(request.url).pathname
 if(!isCompanyRequest(path)&&path!=='/auth/settings/identity')return null
 try{
  const saml=await configuration(env.DB)
  if(saml?.enabled){
   // Base's provider-readiness registry accepts HTTPS identifiers. Register the
   // configured SAML HTTP entry point; this adapter still verifies the actual
   // SAML issuer, certificate and generation before admitting any principal.
   const entry=new URL(saml.sso_url);entry.search=''
   auth=createBaseAuth(env,[entry.href])
  }
  if(path==='/auth/settings/identity'&&request.method==='POST')return await createAuthHandler(auth)(request)??null
  if(path.startsWith('/scim/v2'))return scimResponse(request,env)
  if(path.startsWith('/auth/saml/'))return await samlResponse(request,env,auth)
  return await settingsResponse(request,env,auth)
 }catch(error){const e=error as {status?:number;message?:string;name?:string};if((e.status===401||e.status===403)&&request.headers.get('accept')?.includes('text/html'))return pageResponse({branding:auth.presentation,title:'Owner access required',heading:'Owner access required',status:e.status,content:'<p>Sign in as the current installation owner to manage company identity.</p><p class="secondary-link"><a href="/signin">Sign in</a></p>'});return Response.json({error:e.status||e.name==='ZodError'?e.message:'Company identity request failed'},{status:e.status??(e.name==='ZodError'?400:400),headers})}
}

import type { Platform } from '../../core/platform'
import { createProductSessionReader } from './product-auth.server'
import { guestScope } from './guests.server'

/** Guests enter the existing records UI; unrelated installation doors are absent. */
export async function guestBoundary(request:Request,platform:Platform):Promise<Response|undefined>{
 const session=await createProductSessionReader(platform.bindings.DB,platform.auth.configuration)(request)
 if(!session)return
 const guest=await guestScope(platform.bindings.DB,session.principal.id)
 if(!guest)return
 const url=new URL(request.url),path=url.pathname
 const refused=()=>new Response('Not found',{status:404,headers:{'cache-control':'no-store'}})
 const ownSession=['/api/session','/api/v1/session','/auth/capabilities','/auth/csrf','/auth/sign-out','/auth/sessions'].includes(path)||/^\/auth\/sessions\/[^/]+\/revoke$/.test(path)
 if(ownSession)return
 const active=await platform.bindings.DB.prepare("SELECT 1 FROM authority_memberships WHERE principal_id=? AND app_id=? AND state='active'").bind(session.principal.id,guest.appId).first()
 if(!active)return refused()
 if(path==='/app')return Response.redirect(new URL(`/app/records/${guest.appId}`,url).href,303)
 const query=path.startsWith(`/api/v1/apps/${guest.appId}/entities/`)&&/^\/api\/v1\/apps\/[0-9A-HJKMNP-TV-Z]{26}\/entities\/[0-9A-HJKMNP-TV-Z]{26}\/(query|presence)$/.test(path)
 const viewRead=/^\/api\/v1\/views\/[0-9A-HJKMNP-TV-Z]{26}\/(query|presence)$/.test(path)
 if(request.method==='POST'&&(query||viewRead))return
 if(!['GET','HEAD'].includes(request.method))return refused()
 if(path==='/app/search'||path==='/app/records'||path==='/app/records/'||path===`/app/records/${guest.appId}`||path.startsWith(`/app/records/${guest.appId}/`))return
 if(path==='/api/search'||path==='/api/v1/apps'||path.startsWith(`/api/v1/apps/${guest.appId}/`)||path===`/api/v1/apps/${guest.appId}`||/^\/api\/v1\/views\/[0-9A-HJKMNP-TV-Z]{26}$/.test(path))return
 // Generated read transport repeats document admission and the resource's own policy.
 if(path.startsWith('/_serverFn/'))return
 return refused()
}

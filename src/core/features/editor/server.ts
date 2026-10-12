import type {PlatformBindings} from '../../platform/bindings'
import {createBaseAuth} from '../../platform/base-auth.server'
import {localMailEnabled} from '../../platform/local-auth.server'
import {parseConfig,type EditorConfig} from '../../../editor/config'

export function editorConfiguration(env:PlatformBindings):EditorConfig|undefined{
 if(!env.RER_MANAGEMENT_ORIGIN||!env.RER_INSTALLATION_ID)return undefined
 try{
  const config=parseConfig({enabled:env.RER_EDITOR_ENABLED!=='false',managementOrigin:env.RER_MANAGEMENT_ORIGIN,installationId:env.RER_INSTALLATION_ID})
  if(new URL(config.managementOrigin).protocol!=='https:'&&!localMailEnabled(env))return undefined
  return config
 }catch{return undefined}
}
export async function isEditorOwner(request:Request,env:PlatformBindings){
 const session=await createBaseAuth(env).getSession(request)
 if(!session)return false
 return Boolean(await env.DB.prepare(`SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
  JOIN cradle_base_operators m ON m.base_id=o.id JOIN authority_principals p ON p.id=m.principal_id
  JOIN operators native ON native.id=p.human_id
  JOIN cradle_base_sessions cs ON cs.base_id=s.id
  JOIN authority_sessions ns ON ns.id=cs.session_id AND ns.principal_id=p.id
  WHERE s.id=? AND s.revoked_at IS NULL
  AND s.expires_at>unixepoch('subsec')*1000 AND s.operator_version=o.version AND o.status='active'
  AND o.role='owner' AND native.active=1 AND p.state='active' AND p.initial_owner=1
  AND ns.revoked_at IS NULL AND ns.expires_at>unixepoch('subsec')*1000
  AND ns.authentication_epoch=p.authentication_epoch`)
  .bind(session.id).first())
}
export async function editorConfigResponse(request:Request,env:PlatformBindings){
 const headers={'cache-control':'no-store, private','vary':'Cookie','content-type':'application/json'}
 if(!await isEditorOwner(request,env))return Response.json({error:'owner_required'},{status:403,headers})
 const config=editorConfiguration(env)
 if(!config)return Response.json({error:'editor_unconfigured'},{status:503,headers})
 return Response.json({config,expiresAt:Date.now()+30000},{headers})
}
export function editorDocumentHeaders(response:Response,env:PlatformBindings){
 if(!response.headers.get('content-type')?.includes('text/html'))return response
 const headers=new Headers(response.headers),config=editorConfiguration(env)
 const directives=(headers.get('content-security-policy')??'').split(';').map(s=>s.trim()).filter(Boolean)
 const frame=directives.find(s=>/^frame-src(?:\s|$)/i.test(s))
 const origins=new Set([...(frame?.split(/\s+/).slice(1)??["'self'"]),...(config?.enabled?[config.managementOrigin]:[])])
 if(origins.size>1)origins.delete("'none'")
 const retained=directives.filter(s=>!/^frame-src(?:\s|$)/i.test(s))
 retained.push('frame-src '+[...origins].join(' '))
 if(!retained.some(s=>/^frame-ancestors(?:\s|$)/i.test(s)))retained.push("frame-ancestors 'self'")
 headers.set('content-security-policy',retained.join('; '))
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers})
}

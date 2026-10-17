import {isEditorOwner,editorConfiguration} from '../editor/server'
import { launchInUse } from './launch-use.server'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { toInitials } from '../../shared/people'
import type { CurrentSession, DocumentSessionState } from '../../shared/session'
import { createProductAuth, createProductSessionReader } from '../../../domains/authority/product-auth.server'
import type { AuthConfiguration, Principal } from '../../../domains/authority/ports'
export const createSessionReader = (platform: Platform) => {
  const readPrincipal = createProductSessionReader(platform.database.$client,platform.auth.configuration)
  const readIdentity=async(request:Request,fresh=false)=>{
    const authenticated=await readPrincipal(request,fresh)
    if(!authenticated)return undefined
    const current=await platform.database.$client.prepare(`SELECT o.id AS operatorId,o.name,o.email,w.id AS workspaceId,w.name AS workspaceName,w.timezone,w.currency,(SELECT COUNT(*) FROM notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.operator_id=o.id WHERE n.operator_id=o.id AND nr.id IS NULL) AS unreadNotifications FROM operators o JOIN workspace w ON w.id='workspace' WHERE o.id=? AND o.active=1`).bind(authenticated.principal.humanId).first<{operatorId:string;name:string;email:string;workspaceId:string;workspaceName:string;timezone:string;currency:string;unreadNotifications:number}>()
    if(!current)return undefined
    const editorConfig=editorConfiguration(platform.bindings)
    const session: Omit<CurrentSession, 'launchInUse'> = {operator:{id:current.operatorId,name:current.name,email:current.email,initials:toInitials(current.name)},workspace:{id:current.workspaceId,name:current.workspaceName,timezone:current.timezone,currency:current.currency},unreadNotifications:current.unreadNotifications,editorOwner:editorConfig?await isEditorOwner(request,platform.bindings):false,editorConfigured:Boolean(editorConfig)}
    return {session, principal: authenticated.principal}
  }
  // Document admission needs current credentials, not a successful Launch read.
  // Never cache this identity across requests or use it to authorize page data.
  const getIdentity=async(request:Request)=>(await readIdentity(request))?.session
  const recheckIdentity=async(request:Request,principal:Principal)=>{
    const current=await readIdentity(request,true)
    // A projection belongs to the principal and credential that admitted it.
    // Even valid replacement credentials cannot inherit that navigation hint.
    const binding=['id','kind','humanId','sessionId','baseSessionId','credentialId','authenticationEpoch'] as const
    return current && binding.every(key=>current.principal[key]===principal[key]) ? current.session : undefined
  }
  const getCurrent=async(request:Request):Promise<CurrentSession|undefined>=>{
    const identity=await readIdentity(request)
    if(!identity)return undefined
    const inUse=await launchInUse(platform.database.$client,identity.principal)
    const current=await recheckIdentity(request,identity.principal)
    return current ? {...current,launchInUse:inUse} : undefined
  }
  const getDocumentCurrent=async(request:Request):Promise<DocumentSessionState|undefined>=>{
    const identity=await readIdentity(request)
    if(!identity)return undefined
    let inUse:boolean
    try {
      inUse=await launchInUse(platform.database.$client,identity.principal)
    } catch {
      // Retain only freshly verified identity for the existing error frame. An
      // unavailable projection is neither an empty Launch app nor a permission.
      const current=await recheckIdentity(request,identity.principal)
      return current ? {...current,launchAvailability:'unavailable'} : undefined
    }
    // A forbidden projection may mean revoked credentials as well as scoped
    // access. Revalidate both successful Boolean outcomes before admission.
    const current=await recheckIdentity(request,identity.principal)
    return current ? {...current,launchInUse:inUse,launchAvailability:'available'} : undefined
  }
  return {getCurrent,getIdentity,getDocumentCurrent}
}
export const createSessionService = (platform: Platform) => {
  const configuration:AuthConfiguration=platform.auth.configuration
  const native=createProductAuth(platform.database.$client,configuration)
  const {getCurrent,getIdentity}=createSessionReader(platform)
  const signedOut={error:{code:'signed_out',message:'An operator session is required.'}}
  return {getCurrent,native,signedOut,
    // The gate needs current credentials and the operator; the Launch navigation hint is only for /api/session.
    requireSession:():MiddlewareHandler<AppEnv>=>async(context,next)=>{const current=await getIdentity(context.req.raw);if(!current)return context.json(signedOut,401);context.set('session',current);await next()},
  }
}

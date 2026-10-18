import { versionConflict } from '../../../domains/admission/version-conflicts.server'
import { AdmissionError } from '../../../domains/admission/errors'
import type { Platform } from '../../platform'
import { createSessionReader } from '../session/service'
import { createProductAuth } from '../../../domains/authority/product-auth.server'
import {readInput} from '../../../../vendor/base/modules/operator-auth/input.mjs'

export async function firstRunComplete(db: D1Database) {
  return Boolean((await db.prepare('SELECT completed_at FROM cradle_first_run WHERE singleton=1').first<{completed_at:number|null}>())?.completed_at)
}

/** Native form admission uses the ordinary current session, CSRF and first-owner authority. */
export async function firstRunResponse(request: Request, platform: Platform) {
  const path = new URL(request.url).pathname
  const identity = await createSessionReader(platform).getIdentity(request)
  if (!identity) return request.method === 'GET' ? platform.auth.redirectToSignIn(request) : new Response('Sign in to continue.',{status:401})
  const db = platform.database.$client
  if (await firstRunComplete(db)) return path === '/setup' ? Response.redirect(new URL('/app', request.url),303) : undefined
  if (path !== '/setup') return Response.redirect(new URL('/setup', request.url),303)
  const owner=await db.prepare("SELECT 1 FROM authority_principals WHERE human_id=? AND state='active' AND initial_owner=1").bind(identity.operator.id).first()
  if(!owner)return new Response('The first owner must complete setup.',{status:403})
  if (request.method === 'GET') return undefined
  if (request.method !== 'POST') return new Response(null,{status:405,headers:{allow:'GET, POST'}})
  const form = await readInput(request)
  const headers = new Headers(request.headers)
  headers.set('x-csrf-token',String(form.csrf ?? ''))
  const auth = createProductAuth(db,platform.auth.configuration)
  const current = await auth.requireCsrf(new Request(request.url,{method:'POST',headers}))
  if(!['name','timezone','currency'].every(key=>typeof form[key]==='string'))return new Response('Enter valid workspace details.',{status:400})
  const name = String(form.name).trim(), timezone = String(form.timezone), currency = String(form.currency)
  if (!name || name.length > 200 || !/^[A-Z]{3}$/.test(currency)) return new Response('Enter a workspace name and three-letter currency.',{status:400})
  try { new Intl.DateTimeFormat('en',{timeZone:timezone}) } catch { return new Response('Enter a valid timezone.',{status:400}) }
  const workspaceVersion=Number(form.workspaceVersion),settingsVersion=Number(form.settingsVersion)
  if(![workspaceVersion,settingsVersion].every(version=>Number.isSafeInteger(version)&&version>0))return new Response('Supply the current workspace and settings versions.',{status:400})
  const dependencies=[
    {label:'Workspace',version:workspaceVersion,async current(){return (await db.prepare("SELECT version FROM workspace WHERE id='workspace'").first<{version:number}>())?.version??null}},
    {label:'Settings',version:settingsVersion,async current(){return (await db.prepare('SELECT version FROM workspace_settings ORDER BY id LIMIT 1').first<{version:number}>())?.version??null}},
  ]
  const stale=await versionConflict(dependencies,'Workspace setup changed before submission.')
  if(stale.currentVersion!==undefined)throw stale
  // Recheck current Base session and owner inside the same atomic change.
  const guard = `EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id
    JOIN cradle_base_operators m ON m.base_id=o.id JOIN authority_principals p ON p.id=m.principal_id
    JOIN operators native ON native.id=p.human_id AND native.active=1
    JOIN cradle_base_sessions cs ON cs.base_id=s.id
    JOIN authority_sessions ns ON ns.id=cs.session_id AND ns.principal_id=p.id
    WHERE s.id=? AND p.id=? AND ns.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND o.status='active'
    AND ns.revoked_at IS NULL AND ns.expires_at>? AND ns.authentication_epoch=p.authentication_epoch
    AND s.operator_version=o.version AND o.role='owner' AND p.state='active' AND p.initial_owner=1
    AND p.authentication_epoch=?) AND EXISTS(SELECT 1 FROM cradle_first_run WHERE singleton=1 AND completed_at IS NULL) AND EXISTS(SELECT 1 FROM workspace WHERE id='workspace' AND version=?) AND EXISTS(SELECT 1 FROM workspace_settings WHERE version=?)`
  const now=Date.now(),params=[current.principal.baseSessionId,current.principal.id,current.principal.sessionId,now,now,current.principal.authenticationEpoch,workspaceVersion,settingsVersion]
  try {await db.batch([
    db.prepare(`SELECT CASE WHEN ${guard} THEN 1 ELSE json_extract('owner changed','$') END`).bind(...params),
    db.prepare(`UPDATE workspace SET name=?,timezone=?,currency=?,version=version+1,updated_at=? WHERE id='workspace'`).bind(name,timezone,currency,now),
    db.prepare(`UPDATE workspace_settings SET workspace_name=?,timezone=?,currency=?,version=version+1,updated_at=?`).bind(name,timezone,currency,now),
    db.prepare('UPDATE cradle_first_run SET completed_at=? WHERE singleton=1').bind(now),
  ])} catch(error) {
    if(!String(error).includes('malformed JSON'))throw error
    await auth.requireCsrf(new Request(request.url,{method:'POST',headers}))
    const conflict=await versionConflict(dependencies,'Workspace setup is no longer available.')
    if(conflict.currentVersion!==undefined)throw conflict
    throw new AdmissionError('forbidden','The first-owner setup authority changed.')
  }
  return Response.redirect(new URL('/app',request.url),303)
}

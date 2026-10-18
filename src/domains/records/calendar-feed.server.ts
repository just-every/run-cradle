import { createUlid } from '../../core/shared/ids'
import { digest } from '../authority/crypto.server'
import type { RequestContext, PolicyPort } from '../authority/ports'
import { principalGuards } from '../authority/guards.server'
import { and, trustedPredicate } from '../admission/sql.server'
import { AdmissionError } from '../admission/errors'
import type { createRecordMetadata } from './metadata.server'
import type { RecordRow } from './contracts'
import { calendarIcal } from './calendar-feed-ical'
const unavailable = (): never => { throw new AdmissionError('not_found', 'Calendar subscription is unavailable.') }
export function createCalendarFeeds(db: D1Database, metadata: ReturnType<typeof createRecordMetadata>, policy: PolicyPort, origin: string) {
  const audience = `${origin}/calendar-feed`
  async function owner(ctx: RequestContext, viewId: string) {
    if (ctx.principal.kind !== 'human' || !ctx.principal.baseSessionId) throw new AdmissionError('forbidden', 'A native operator session is required.')
    const view = await metadata.readView(ctx, viewId)
    if (view.display !== 'calendar') throw new AdmissionError('validation', 'Choose a calendar view.')
    const row = await db.prepare('SELECT owner_id FROM record_views WHERE id=?').bind(viewId).first<{owner_id: string}>()
    if (row?.owner_id !== ctx.principal.id) throw new AdmissionError('forbidden', 'Only the view owner may manage its subscription.')
    const scope = await policy.scope(ctx, {appId: view.appId, entityId: view.entityId, purpose: 'export'})
    return {view, guard: and(...principalGuards(ctx), ...scope.currentAuthorityGuards, trustedPredicate("EXISTS(SELECT 1 FROM record_views WHERE id=? AND owner_id=? AND version=? AND visibility<>'deleted')", [viewId, ctx.principal.id, view.version]))}
  }
  async function list(ctx: RequestContext, viewId: string) {
    const {guard} = await owner(ctx, viewId)
    const rows = await db.prepare(`SELECT id,created_at,revoked_at FROM authority_credentials WHERE principal_id=? AND audience=? AND json_extract(scopes_json,'$[0].calendarViewId')=? AND ${guard.sql} ORDER BY created_at DESC`).bind(ctx.principal.id, audience, viewId, ...guard.values).all<{id:string;created_at:number;revoked_at:number|null}>()
    return {items: rows.results.map(row => ({id:row.id, createdAt:new Date(row.created_at).toISOString(), revokedAt:row.revoked_at === null ? null : new Date(row.revoked_at).toISOString()}))}
  }
  async function create(ctx: RequestContext, viewId: string) {
    const {guard,view} = await owner(ctx, viewId), id = createUlid(), now = Date.now(), bytes = crypto.getRandomValues(new Uint8Array(32)), token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    const native = await db.prepare('SELECT o.version FROM cradle_base_operators m JOIN oa_operators o ON o.id=m.base_id WHERE m.principal_id=? AND o.status=\'active\'').bind(ctx.principal.id).first<{version:number}>()
    if (!native) return unavailable()
    const result = await db.prepare(`INSERT INTO authority_credentials(id,principal_id,token_hash,audience,scopes_json,created_at,expires_at,authentication_epoch) SELECT ?,?,?,?,?,?,?,? WHERE ${guard.sql}`).bind(id,ctx.principal.id,await digest(token),audience,JSON.stringify([{appId:view.appId,actions:[],purposes:['read','export'],calendarViewId:viewId,nativeVersion:native.version}]),now,253402300799000,ctx.principal.authenticationEpoch,...guard.values).run()
    if (result.meta.changes !== 1) return unavailable()
    return {id, url:`${origin}/api/v1/calendar-feeds/${token}.ics`}
  }
  async function revoke(ctx: RequestContext, viewId: string, id: string) {
    const {guard} = await owner(ctx, viewId)
    const result = await db.prepare(`UPDATE authority_credentials SET revoked_at=COALESCE(revoked_at,?),version=version+1 WHERE id=? AND audience=? AND principal_id=? AND json_extract(scopes_json,'$[0].calendarViewId')=? AND ${guard.sql}`).bind(Date.now(),id,audience,ctx.principal.id,viewId,...guard.values).run()
    if (result.meta.changes !== 1) return unavailable()
    return {id, revoked:true}
  }
  async function read(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return unavailable()
    const hash = await digest(token)
    const lookup = () => db.prepare(`SELECT c.id,c.principal_id,p.human_id,c.created_at,c.expires_at,c.authentication_epoch,c.scopes_json FROM authority_credentials c JOIN authority_principals p ON p.id=c.principal_id JOIN operators local ON local.id=p.human_id JOIN cradle_base_operators m ON m.principal_id=p.id JOIN oa_operators o ON o.id=m.base_id WHERE c.token_hash=? AND c.audience=? AND c.revoked_at IS NULL AND c.expires_at>? AND p.kind='human' AND p.state='active' AND p.authentication_epoch=c.authentication_epoch AND local.active=1 AND o.status='active' AND o.version=json_extract(c.scopes_json,'$[0].nativeVersion')`).bind(hash,audience,Date.now()).first<{id:string;principal_id:string;human_id:string;created_at:number;expires_at:number;authentication_epoch:number;scopes_json:string}>()
    const credential = await lookup(); if (!credential) return unavailable()
    const now = new Date().toISOString(), ctx:RequestContext = {principal:{id:credential.principal_id,kind:'human',humanId:credential.human_id,sessionId:null,credentialId:credential.id,authenticationEpoch:credential.authentication_epoch,issuedAt:new Date(credential.created_at).toISOString(),expiresAt:new Date(credential.expires_at).toISOString()},now,requestId:createUlid(),ingress:'http'}
    const viewId = JSON.parse(credential.scopes_json)[0].calendarViewId as string
    const view = await metadata.readView(ctx,viewId)
    if (view.display !== 'calendar') return unavailable()
    const initialScope = await policy.scope(ctx,{appId:view.appId,entityId:view.entityId,purpose:'export'})
    let cursor: string | undefined, timezone = '', schema, rows:RecordRow[] = []
    do { const page = await metadata.viewQuery(ctx,view,{limit:200,...(cursor?{cursor}:{})}); timezone=page.timezone!; schema=page.schema; rows.push(...page.records.items); cursor=page.records.nextCursor??undefined } while(cursor)
    const current = await metadata.readView(ctx,viewId)
    if (current.version !== view.version || !await lookup()) return unavailable()
    const scope=await policy.scope(ctx,{appId:view.appId,entityId:view.entityId,purpose:'export'}), guard=and(...initialScope.currentAuthorityGuards,...scope.currentAuthorityGuards)
    if (!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()) return unavailable()
    return calendarIcal(view,schema!,rows,timezone,origin)
  }
  return {list,create,revoke,read}
}

import { Hono } from 'hono'
import { z } from 'zod'
import { createUlid } from '../../core/shared/ids'
import { readJsonBody } from '../../core/registry/body'
import { ApiError, errorResponse } from '../../core/registry/errors.server'
import type { RequestContext, PolicyPort } from '../../domains/authority/ports'
import type { AdmissionPort } from '../../domains/admission/ports'
import { createImportService } from '../../domains/portability/import.server'
import { parseCsv } from '../../domains/portability/csv'
import { idSchema } from '../../domains/records/validators'
import { createLegacyImportAdapter } from './import.server'
import { launchImportFields, launchImportKinds, type LaunchImportKind } from './import-fields'
import { authorizeLaunchProjection } from './projection-authority.server'
import { LAUNCH_APP_ID, launchEntities } from './contracts'
import type { LaunchContext } from './domain.server'

export type LaunchImportDependencies = {
 db: D1Database; bucket: R2Bucket; policy: PolicyPort; admission: AdmissionPort; context: LaunchContext
 authenticate(request: Request, ingress: RequestContext['ingress'], id: string): Promise<RequestContext>
 download(ctx: RequestContext, fileId: string): Promise<Response>
}
const envelope = <T extends z.ZodType>(input: T) => z.object({ commandId: idSchema, expected: z.array(z.unknown()).max(0), input }).strict()
const previewInput = envelope(z.object({ kind: z.enum(launchImportKinds), fileId: idSchema, mapping: z.array(z.object({ column: z.string().min(1).max(500), field: z.string().min(1).max(40) }).strict()).min(1).max(200) }).strict())
const commitInput = envelope(z.object({ token: idSchema }).strict())
const kindOf = (entityId: string) => launchImportKinds.find(kind => launchEntities[kind] === entityId)

/** Launch CSV import (IMPORT-001–005): preview a stored upload, read its changes, confirm it
 * atomically and download the stored original. Every route answers through admission or policy. */
export function createLaunchImportHttp(deps: LaunchImportDependencies) {
 const service = (kind: LaunchImportKind) => createImportService(deps.db, deps.policy, deps.admission, createLegacyImportAdapter(deps.context, kind))
 async function stored(id: string) {
  const row = await deps.db.prepare('SELECT entity_id,file_id,actor_id,created_at,preview_json,committed_command_id FROM portability_previews WHERE id=? AND app_id=?').bind(id, LAUNCH_APP_ID).first<{ entity_id: string; file_id: string; actor_id: string; created_at: string; preview_json: string; committed_command_id: string | null }>()
  const kind = row ? kindOf(row.entity_id) : undefined
  if (!row || !kind) throw new ApiError('not_found', 'Import not found.')
  return { ...row, kind }
 }
 async function fields(kind: LaunchImportKind, mapping: { column: string; field: string }[]) {
  const custom = kind === 'campaign' ? (await deps.db.prepare('SELECT id FROM launch_custom_fields').all<{ id: string }>()).results.map(row => 'custom:' + row.id) : []
  const allowed = new Set([...launchImportFields[kind].map(field => field.name), ...custom])
  const unknown = mapping.find(item => !allowed.has(item.field))
  if (unknown) throw new ApiError('validation', `Column ${unknown.column} maps to a field ${kind} imports do not have.`)
  for (const key of launchImportFields[kind].filter(field => field.key)) if (!mapping.some(item => item.field === key.name)) throw new ApiError('validation', `Map a column to ${key.label}; it identifies existing records.`)
  return Object.fromEntries(mapping.map(item => [item.column, item.field]))
 }
 const app = new Hono()
 app.all('*', async c => {
  const request = c.req.raw, url = new URL(request.url), requestId = createUlid()
  try {
   const ctx = await deps.authenticate(request, 'http', requestId)
   if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) throw new ApiError('forbidden', 'A same-origin request is required.')
   const respond = (data: unknown) => c.json({ data, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.consistencyToken ?? '' } }, 200, { 'cache-control': 'no-store' })
   const path = url.pathname.replace(/^\/api\/v1\/launch\/imports/, '')
   if (request.method === 'POST' && path === '/preview') {
    const command = previewInput.parse(await readJsonBody(request)), mapping = await fields(command.input.kind, command.input.mapping)
    const file = await deps.download(ctx, command.input.fileId), bytes = new Uint8Array(await file.arrayBuffer())
    try { parseCsv(bytes) } catch (error) { throw new ApiError('validation', `The CSV could not be read: ${error instanceof Error ? error.message : 'invalid file'}.`) }
    const receipt = await service(command.input.kind).preview(ctx, { commandId: command.commandId, appId: LAUNCH_APP_ID, entityId: launchEntities[command.input.kind], fileId: command.input.fileId, mapping }, bytes)
    return respond(receipt.result)
   }
   const commit = path.match(/^\/([0-9A-HJKMNP-TV-Z]{26})\/commit$/)
   if (request.method === 'POST' && commit) {
    const command = commitInput.parse(await readJsonBody(request)), preview = await stored(commit[1]!)
    // Replaying a confirmation with its key answers the original result under current import authority.
    if (preview.committed_command_id === command.commandId && preview.actor_id === ctx.principal.id) {
     await deps.policy.authorize(ctx, { appId: LAUNCH_APP_ID, targetEntityId: preview.entity_id, action: 'import.commit', expected: [], cost: [], inputHash: '' })
     const original = await deps.db.prepare("SELECT result_json FROM command_admissions WHERE command_id=? AND actor_id=? AND state='committed'").bind(command.commandId, ctx.principal.id).first<{ result_json: string }>()
     if (original) return respond(JSON.parse(original.result_json))
    }
    const receipt = await service(preview.kind).commit(ctx, commit[1]!, command.commandId, command.input.token)
    return respond('consistencyToken' in receipt ? receipt.result : receipt)
   }
   const rows = path.match(/^\/([0-9A-HJKMNP-TV-Z]{26})\/rows$/)
   if (request.method === 'GET' && rows) {
    const preview = await stored(rows[1]!), cursor = Number(url.searchParams.get('cursor') ?? 0)
    return respond({ kind: preview.kind, ...await service(preview.kind).readPreview(ctx, rows[1]!, cursor, 50) })
   }
   const file = path.match(/^\/([0-9A-HJKMNP-TV-Z]{26})\/file$/)
   if (request.method === 'GET' && file) {
    const recheck = await authorizeLaunchProjection(deps.db, deps.policy, ctx), preview = await stored(file[1]!)
    if (!preview.committed_command_id) throw new ApiError('not_found', 'Only a committed import keeps its stored file.')
    const original = await deps.db.prepare("SELECT filename,media_type,bytes,object_key FROM evidence_files WHERE id=? AND state='available'").bind(preview.file_id).first<{ filename: string; media_type: string; bytes: number; object_key: string }>()
    if (!original) throw new ApiError('not_found', 'The stored import file is no longer available.')
    const object = await deps.bucket.get(original.object_key)
    if (!object) throw new ApiError('internal', 'The stored import file is missing.')
    await recheck()
    return new Response(object.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': String(original.bytes), 'Content-Disposition': `attachment; filename="import.csv"; filename*=UTF-8''${encodeURIComponent(original.filename)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" } })
   }
   if (request.method === 'GET' && path === '') {
    const recheck = await authorizeLaunchProjection(deps.db, deps.policy, ctx)
    const list = await deps.db.prepare(`SELECT p.id,p.entity_id,p.preview_json,p.created_at,f.filename,f.bytes,o.name AS actor,a.created_at AS committed_at FROM portability_previews p
     JOIN command_admissions a ON a.command_id=p.committed_command_id LEFT JOIN evidence_files f ON f.id=p.file_id AND f.state='available' LEFT JOIN operators o ON o.id=p.actor_id
     WHERE p.app_id=? ORDER BY a.created_at DESC,p.id DESC LIMIT 100`).bind(LAUNCH_APP_ID).all<{ id: string; entity_id: string; preview_json: string; filename: string | null; bytes: number | null; actor: string | null; committed_at: string }>()
    await recheck()
    return respond({ items: list.results.map(row => { const preview = JSON.parse(row.preview_json) as { creates: number; updates: number; unchanged: number }; return { id: row.id, kind: kindOf(row.entity_id), filename: row.filename, bytes: row.bytes, committedBy: row.actor, committedAt: row.committed_at, creates: preview.creates, updates: preview.updates, unchanged: preview.unchanged } }) })
   }
   throw new ApiError('not_found', 'Unknown launch import route.')
  } catch (error) { return errorResponse(error, requestId, `${request.method} ${url.pathname}`) }
 })
 return app
}

import { z } from 'zod'
import type { Json } from '../../contracts/primitives'
import type { CommandRegistry } from '../../core/registry/commands'
import type { PolicyPort, RequestContext } from '../../domains/authority/ports'
import { AuthorityError } from '../../domains/authority/errors'
import { canonicalJson } from '../../domains/authority/grants.server'
import { digest } from '../../domains/authority/crypto.server'
import { idSchema } from '../../domains/authority/validators'
import { trustedPredicate } from '../../domains/admission/sql.server'
import { effects, removeRows, updateRows } from '../../domains/lifecycle/changes.server'
import { requireQuiescentFiles } from '../../domains/lifecycle/file-writes.server'
import { retainCleanup } from '../../domains/lifecycle/cleanup.server'
import { STAGING_ENTITY } from '../../domains/evidence/staging.server'
import { LAUNCH_APP_ID, launchEntities } from './contracts'

const command = z.object({
 commandId: idSchema, expected: z.array(z.never()).max(0),
 input: z.object({ previewId: idSchema }).strict(),
}).strict()

/** Remove a campaign import artifact, never the business records it admitted.
 * Shared or non-import files require their own custody path; refuse them intact. */
export function registerLaunchImportDeletion(db: D1Database, policy: PolicyPort, commands: CommandRegistry) {
 const identity = async (ctx: RequestContext, value: Pick<z.infer<typeof command>, 'commandId' | 'input'>) => {
  if (ctx.principal.kind !== 'human') throw new AuthorityError('forbidden', 'A human operator must delete an import.', 403)
  const canonicalInputHash = await digest(canonicalJson(value.input))
  // Recheck the action before receipt replay, including after the artifact is gone.
  const permit = await policy.authorize(ctx, { appId: LAUNCH_APP_ID, targetEntityId: launchEntities.campaign, action: 'import.delete', expected: [], cost: [], inputHash: canonicalInputHash, commandId: value.commandId })
  return { appId: LAUNCH_APP_ID, canonicalInputHash, permit }
 }
 commands.register({
  action: 'import.delete', description: 'Delete a retained campaign import and its original file, preserving imported records.',
  inputSchema: z.toJSONSchema(command) as Json, input: command,
  visible: async ctx => {
   try { await identity(ctx, { commandId: LAUNCH_APP_ID, input: { previewId: LAUNCH_APP_ID } }); return true }
   catch (error) { if (error instanceof AuthorityError) return false; throw error }
  },
  replayIdentity: identity,
  prepare: async (ctx, value) => {
   const { canonicalInputHash, permit } = await identity(ctx, value)
   const preview = await db.prepare(`SELECT p.file_id,p.committed_command_id,f.object_key,f.version,f.state,f.source_id,f.entity_id,s.purpose
    FROM portability_previews p JOIN evidence_files f ON f.id=p.file_id AND f.app_id=p.app_id
    LEFT JOIN evidence_staging s ON s.id=f.record_id AND s.app_id=f.app_id
    WHERE p.id=? AND p.app_id=? AND p.entity_id=? AND p.committed_command_id IS NOT NULL`)
    .bind(value.input.previewId, LAUNCH_APP_ID, launchEntities.campaign)
    .first<{ file_id: string; committed_command_id: string; object_key: string; version: number; state: string; source_id: string | null; entity_id: string; purpose: string | null }>()
   if (!preview) throw new AuthorityError('not_found', 'Committed campaign import not found.', 404)
   const privateArtifact = trustedPredicate(`EXISTS(SELECT 1 FROM evidence_files f JOIN evidence_staging s ON s.id=f.record_id AND s.app_id=f.app_id
    WHERE f.id=? AND f.app_id=? AND f.entity_id=? AND f.state='available' AND f.version=? AND f.object_key=? AND f.source_id IS NULL AND s.purpose='import')
    AND NOT EXISTS(SELECT 1 FROM portability_previews WHERE file_id=? AND id<>?)`,
    [preview.file_id, LAUNCH_APP_ID, STAGING_ENTITY, preview.version, preview.object_key, preview.file_id, value.input.previewId])
   if (!await db.prepare(`SELECT 1 WHERE ${privateArtifact.sql}`).bind(...privateArtifact.values).first())
    throw new AuthorityError('version_conflict', 'This file is shared or is not a private retained import. Nothing was deleted.', 409)
   const change = effects()
   await requireQuiescentFiles(db, change)
   change.guards.push(privateArtifact, trustedPredicate('EXISTS(SELECT 1 FROM portability_previews WHERE id=? AND file_id=? AND committed_command_id=?)', [value.input.previewId, preview.file_id, preview.committed_command_id]))
   await removeRows(db, change, 'portability_preview_rows', 'preview_id=?', [value.input.previewId])
   await removeRows(db, change, 'portability_previews', 'id=?', [value.input.previewId])
   await updateRows(db, change, 'evidence_files', { state: 'erased', filename: 'erased', updated_at: ctx.now, version: preview.version + 1 }, 'id=?', [preview.file_id])
   retainCleanup(change, { id: value.commandId, appId: LAUNCH_APP_ID, kind: 'campaign-import', subjectId: value.input.previewId, label: 'Deleted campaign import', now: ctx.now, keys: [preview.object_key] })
   return {
    commandId: value.commandId, appId: LAUNCH_APP_ID, action: 'import.delete', canonicalInputHash, permit,
    guards: change.guards, mutations: change.mutations,
    audit: [{ action: 'import.delete', subject: null, changes: [], sourceIds: [], personalContentRefs: [] }], events: [], outbox: [],
    committedResult: { id: value.input.previewId, erasureId: value.commandId, state: 'pending' },
   }
  },
 })
}

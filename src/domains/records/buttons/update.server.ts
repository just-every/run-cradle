import { z } from 'zod'
import type { CommandInput, CellValue } from '../../../contracts/primitives'
import type { RequestContext } from '../../authority/ports'
import type { TemplateDependencies } from '../templates/snapshot.server'
import { createUlid } from '../../../core/shared/ids'
import { canonicalHash } from '../../admission/canonical'
import { AdmissionError } from '../../admission/errors'
import { and, eq, exists, registerTable } from '../../admission/sql.server'
import { baseAccess, requireBaseAuthor } from '../manual/base-access.server'
import { assertGuards } from '../fence.server'
import { schemaGuard } from '../change.server'
import { RECORD_SCHEMA_ENTITY_ID } from '../contracts'
import { cellValueSchema, idSchema, refSchema, validateCell } from '../validators'
import { isButtonField } from './fields'
import { recordPatchPreparer } from './patch.server'

export const updateButtonSaveInput = z.object({
  kind: z.literal('update-field'), appId: idSchema, entityId: idSchema,
  fieldId: idSchema, value: cellValueSchema, name: z.string().trim().min(1).max(160),
  confirmation: z.boolean(), id: idSchema.optional(), buttonVersion: z.number().int().positive().optional(),
}).strict()
export type UpdateButtonSaveInput = z.infer<typeof updateButtonSaveInput>
export const buttonRunInput = z.object({
  appId: idSchema, entityId: idSchema, buttonId: idSchema,
  confirmed: z.boolean(), ref: refSchema, buttonVersion: z.number().int().positive().optional(),
}).strict()
export type UpdateButton = {
  kind: 'update-field'; id: string; appId: string; entityId: string; name: string
  confirmation: boolean; version: number; enabled: boolean; fieldId?: string; value?: CellValue
}
type Stored = { id: string; app_id: string; entity_id: string; owner_id: string; field_id: string; value_json: string; name: string; confirmation: number; version: number }
const table = registerTable('record_update_buttons', ['id', 'app_id', 'entity_id', 'owner_id', 'field_id', 'value_json', 'name', 'confirmation', 'version', 'created_at', 'updated_at'])
const refused = (error: unknown) => error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_revoked', 'grant_expired', 'schema_conflict', 'version_conflict', 'signed_out', 'validation'].includes(String(error.code))
const project = (row: Stored, enabled: boolean, configuration = false): UpdateButton => ({ kind: 'update-field', id: row.id, appId: row.app_id, entityId: row.entity_id, name: row.name, confirmation: row.confirmation === 1, version: row.version, enabled, ...(configuration ? { fieldId: row.field_id, value: JSON.parse(row.value_json) as CellValue } : {}) })

export function createUpdateButtons(db: D1Database, deps: TemplateDependencies) {
  const patch = recordPatchPreparer(deps)
  const rowGuard = (row: Stored) => exists(table, and(eq(table, 'id', row.id), eq(table, 'app_id', row.app_id), eq(table, 'entity_id', row.entity_id), eq(table, 'version', row.version)))
  async function configured(appId: string, entityId: string, id: string) {
    return db.prepare('SELECT * FROM record_update_buttons WHERE id=? AND app_id=? AND entity_id=?').bind(id, appId, entityId).first<Stored>()
  }
  function currentSchema(command: CommandInput<unknown>, appId: string, entityId: string) {
    const descriptor = deps.descriptors.get(appId, entityId)
    if (!command.expected.some(item => item.ref.appId === appId && item.ref.entityId === RECORD_SCHEMA_ENTITY_ID && item.ref.recordId === entityId && item.version === descriptor.schema.version)) throw new AdmissionError('schema_conflict', 'Current table schema version is required.')
    return descriptor
  }
  function literal(appId: string, entityId: string, fieldId: string, value: CellValue) {
    const descriptor = deps.descriptors.get(appId, entityId), field = descriptor.fields.get(fieldId)?.field
    if (!field || !isButtonField(field) || descriptor.writePolicy?.protectedFieldIds?.includes(fieldId)) throw new AdmissionError('forbidden', 'This button requires a writable scalar field.')
    return validateCell(field, value)
  }
  async function list(ctx: RequestContext, appId: string, entityId: string, recordId?: string): Promise<UpdateButton[]> {
    const scope = await deps.policy.scope(ctx, { appId, entityId, purpose: 'read' })
    await assertGuards(db, scope.currentAuthorityGuards)
    let author = false
    if (ctx.principal.kind === 'human' && !ctx.principal.credentialId && !ctx.principal.delegationGrant) {
      try { author = !!(await baseAccess(db, ctx, appId))?.canAdopt } catch (error) { if (!refused(error)) throw error }
    }
    const rows = await db.prepare('SELECT * FROM record_update_buttons WHERE app_id=? AND entity_id=? ORDER BY name,id').bind(appId, entityId).all<Stored>()
    const result: UpdateButton[] = []
    for (const row of rows.results) {
      let enabled = false
      if (ctx.principal.kind === 'human' && !ctx.principal.credentialId && !ctx.principal.delegationGrant) try {
        literal(appId, entityId, row.field_id, JSON.parse(row.value_json) as CellValue)
        if (!scope.readableFieldIds.includes(row.field_id) || !scope.writableFieldIds.includes(row.field_id)) throw new AdmissionError('forbidden', 'The configured field is unavailable.')
        const expected = recordId ? [{ ref: { appId, entityId, recordId }, version: (await deps.reader.record(ctx, scope, { appId, entityId, recordId })).version }] : []
        const permit = await deps.policy.authorize(ctx, { appId, targetEntityId: entityId, action: 'record.patch', expected, fieldIds: [row.field_id], cost: [], inputHash: await canonicalHash({ buttonId: row.id, version: row.version }) })
        await assertGuards(db, [...scope.currentAuthorityGuards, ...permit.guards, rowGuard(row)])
        enabled = true
      } catch (error) { if (!refused(error)) throw error }
      result.push(project(row, enabled, author && scope.readableFieldIds.includes(row.field_id) && scope.writableFieldIds.includes(row.field_id)))
    }
    return result
  }
  async function save(ctx: RequestContext, command: CommandInput<UpdateButtonSaveInput>) {
    const input = updateButtonSaveInput.parse(command.input), { appId, entityId, fieldId, name, confirmation } = input
    const author = await requireBaseAuthor(db, ctx, appId)
    if (!author || ctx.principal.delegationGrant) throw new AdmissionError('forbidden', 'Only a current base owner or creator can configure record buttons.')
    const descriptor = currentSchema(command, appId, entityId)
    const value = literal(appId, entityId, fieldId, input.value)
    const scope = await deps.policy.scope(ctx, { appId, entityId, purpose: 'read' })
    if (!scope.readableFieldIds.includes(fieldId) || !scope.writableFieldIds.includes(fieldId)) throw new AdmissionError('forbidden', 'The configured field must be readable and writable.')
    const previous = input.id ? await configured(appId, entityId, input.id) : null
    if (input.id && !previous) throw new AdmissionError('not_found', 'The record button is unavailable in this table.')
    if (previous && input.buttonVersion !== previous.version) throw new AdmissionError('version_conflict', 'The button configuration changed. Reload it before saving.')
    const id = previous?.id ?? createUlid(), version = (previous?.version ?? 0) + 1
    const action = 'record.template-button-save'
    const hash = await canonicalHash({ action, input: command.input, expected: command.expected, controlEpoch: command.controlEpoch ?? null })
    const permit = await deps.policy.authorize(ctx, { appId, targetEntityId: entityId, action: 'record.patch', expected: [], fieldIds: [fieldId], cost: [], inputHash: hash, commandId: command.commandId })
    const where = previous ? and(eq(table, 'id', id), eq(table, 'version', previous.version)) : undefined
    const set = { field_id: fieldId, value_json: JSON.stringify(value), owner_id: ctx.principal.id, name, confirmation: confirmation ? 1 : 0, version, updated_at: ctx.now }
    const stored: Stored = { id, app_id: appId, entity_id: entityId, ...set }
    return { commandId: command.commandId, action, appId, canonicalInputHash: hash, permit: { ...permit, action },
      guards: [...author.guards, ...scope.currentAuthorityGuards, schemaGuard(descriptor), ...(previous ? [rowGuard(previous)] : [])],
      mutations: where ? [{ kind: 'update' as const, table, set, where, expectedRows: 1 }] : [{ kind: 'insert' as const, table, row: { ...stored, created_at: ctx.now, updated_at: ctx.now } }],
      audit: [{ action, subject: { appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: entityId }, changes: [], sourceIds: [], personalContentRefs: [] }],
      events: [], outbox: [], committedResult: project(stored, true, true), accessSubjects: [{ ref: { appId, entityId: RECORD_SCHEMA_ENTITY_ID, recordId: entityId }, fieldIds: [] }],
    }
  }
  async function run(ctx: RequestContext, command: CommandInput<z.infer<typeof buttonRunInput>>) {
    const input = buttonRunInput.parse(command.input), { appId, entityId, ref } = input
    const row = await configured(appId, entityId, input.buttonId)
    if (!row) return null
    if (ctx.principal.kind !== 'human' || !ctx.principal.sessionId || ctx.principal.credentialId || ctx.principal.delegationGrant) throw new AdmissionError('forbidden', 'Record buttons require a current operator session.')
    if (ref.appId !== appId || ref.entityId !== entityId) throw new AdmissionError('validation', 'The triggering record must belong to the button table.')
    if (input.buttonVersion !== row.version) throw new AdmissionError('version_conflict', 'The button configuration changed. Reload the record before running it.')
    if (row.confirmation && !input.confirmed) throw new AdmissionError('validation', 'Confirm this button before updating the record.')
    currentSchema(command, appId, entityId)
    const value = literal(appId, entityId, row.field_id, JSON.parse(row.value_json) as CellValue)
    const plan = await patch(ctx, { ...command, input: { ref, changes: { [row.field_id]: value } } }, { action: 'record.template-button-run', command })
    return { ...plan, guards: [...plan.guards, rowGuard(row)] }
  }
  return { list, save, run }
}

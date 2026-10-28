import { z } from 'zod'
import type { CommandInput } from '../../../contracts/primitives'
import type { RequestContext } from '../../authority/ports'
import type { AdmissionPlan, SqlPredicate } from '../../admission/ports'
import type { TemplateDependencies } from './snapshot.server'
import type { createRecordTemplates } from './service.server'
import { createUlid } from '../../../core/shared/ids'
import { canonicalHash } from '../../admission/canonical'
import { AdmissionError } from '../../admission/errors'
import { and, eq, exists, registerTable } from '../../admission/sql.server'
import { idSchema, refSchema } from '../validators'
import { requireBaseAuthor } from '../manual/base-access.server'
import { assertGuards } from '../fence.server'
import { RECORD_SCHEMA_ENTITY_ID } from '../contracts'

export const templateButtonSaveInput = z.object({
  appId: idSchema, entityId: idSchema, templateId: idSchema,
  name: z.string().trim().min(1).max(160), confirmation: z.boolean(), id: idSchema.optional(),
}).strict()
export const templateButtonRunInput = z.object({
  appId: idSchema, entityId: idSchema, buttonId: idSchema,
  confirmed: z.boolean(), ref: refSchema,
}).strict()
export type TemplateButtonSaveInput = z.infer<typeof templateButtonSaveInput>
export type TemplateButtonRunInput = z.infer<typeof templateButtonRunInput>
export type RecordTemplateButton = {
  id: string; appId: string; entityId: string; templateId: string
  name: string; confirmation: boolean; version: number; enabled: boolean
}
type Services = Pick<TemplateDependencies,'policy'|'descriptors'|'reader'> & {templates:ReturnType<typeof createRecordTemplates>}
type Stored = { id: string; app_id: string; entity_id: string; template_id: string; name: string; confirmation: number; version: number }
const buttons = registerTable('record_template_buttons', ['id', 'app_id', 'entity_id', 'template_id', 'owner_id', 'name', 'confirmation', 'version', 'created_at', 'updated_at'])
const unavailable = (error: unknown) => error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_revoked', 'grant_expired', 'schema_conflict', 'version_conflict', 'signed_out'].includes(String(error.code))
const project = (row: Stored, enabled: boolean): RecordTemplateButton => ({ id: row.id, appId: row.app_id, entityId: row.entity_id, templateId: row.template_id, name: row.name, confirmation: row.confirmation === 1, version: row.version, enabled })
const identity = (action: string, command: CommandInput<unknown>) => canonicalHash({ action, input: command.input, expected: command.expected, controlEpoch: command.controlEpoch ?? null })

/** Configured buttons use the ordinary template creation planner and atomic admission. */
export function createTemplateButtons(db: D1Database, services: Services) {
  async function configured(appId: string, entityId: string, id: string) {
    const row = await db.prepare('SELECT id,app_id,entity_id,template_id,name,confirmation,version FROM record_template_buttons WHERE id=? AND app_id=? AND entity_id=?').bind(id, appId, entityId).first<Stored>()
    if (!row) throw new AdmissionError('not_found', 'The template button is unavailable in this table.')
    return row
  }
  function schemaExpected(command: CommandInput<unknown>, appId: string, entityId: string) {
    const schema = services.descriptors.get(appId, entityId).schema
    if (!command.expected.some(item => item.ref.appId === appId && item.ref.entityId === RECORD_SCHEMA_ENTITY_ID && item.ref.recordId === entityId && item.version === schema.version)) throw new AdmissionError('schema_conflict', 'Current table schema version is required.')
  }
  async function list(ctx: RequestContext, appId: string, entityId: string): Promise<RecordTemplateButton[]> {
    const scope = await services.policy.scope(ctx, { appId, entityId, purpose: 'read' })
    await assertGuards(db, scope.currentAuthorityGuards)
    const rows = await db.prepare('SELECT id,app_id,entity_id,template_id,name,confirmation,version FROM record_template_buttons WHERE app_id=? AND entity_id=? ORDER BY name,id').bind(appId, entityId).all<Stored>()
    const result: RecordTemplateButton[] = []
    for (const row of rows.results) {
      let enabled = false
      // Discovery never reserves a grant, copies files, or contacts a provider.
      if (ctx.principal.kind === 'human' && !ctx.principal.credentialId && !ctx.principal.delegationGrant) try {
        const { template, guards } = await services.templates.definition(ctx, appId, entityId, row.template_id)
        const current: SqlPredicate[] = [...guards]
        for (const target of [{ entityId, values: template.values }, ...template.children]) {
          const descriptor = services.descriptors.get(appId, target.entityId)
          const access = await services.policy.scope(ctx, { appId, entityId: target.entityId, purpose: 'read' })
          const fieldIds = Object.keys(target.values).filter(id => {
            const field = descriptor.fields.get(id)?.field
            return field && !field.readOnly && field.type !== 'computed' && !descriptor.writePolicy?.protectedFieldIds?.includes(id) && access.writableFieldIds.includes(id)
          })
          if ('parentFieldId' in target) {
            const field = descriptor.fields.get(target.parentFieldId)?.field
            if (field?.type !== 'relation' || field.relation?.ownerAppId !== appId || field.relation.entityId !== entityId || !access.writableFieldIds.includes(field.id)) throw new AdmissionError('forbidden', 'The template child link is not writable.')
            fieldIds.push(field.id)
          }
          const permit = await services.policy.authorize(ctx, { appId, targetEntityId: target.entityId, action: 'record.create', expected: [], fieldIds, cost: [], inputHash: await canonicalHash({ buttonId: row.id, version: row.version }) })
          current.push(...access.currentAuthorityGuards, ...permit.guards)
        }
        await assertGuards(db, current)
        enabled = true
      } catch (error) { if (!unavailable(error)) throw error }
      result.push(project(row, enabled))
    }
    return result
  }
  async function save(ctx: RequestContext, command: CommandInput<TemplateButtonSaveInput>): Promise<AdmissionPlan<RecordTemplateButton>> {
    const input = templateButtonSaveInput.parse(command.input), { appId, entityId, templateId, name, confirmation } = input
    const author = await requireBaseAuthor(db, ctx, appId)
    if (!author) throw new AdmissionError('forbidden', 'Only a base owner or creator can configure template buttons.')
    schemaExpected(command, appId, entityId)
    const { template, guards } = await services.templates.definition(ctx, appId, entityId, templateId)
    const previous = input.id ? await configured(appId, entityId, input.id) : null
    const id = previous?.id ?? createUlid(), version = (previous?.version ?? 0) + 1
    const action = 'record.template-button-save', hash = await identity(action, command)
    const permit = await services.policy.authorize(ctx, { appId, targetEntityId: entityId, action: 'record.create', expected: [], cost: [], inputHash: hash, commandId: command.commandId })
    const where = previous ? and(eq(buttons, 'id', id), eq(buttons, 'app_id', appId), eq(buttons, 'entity_id', entityId), eq(buttons, 'version', previous.version)) : undefined
    const set = { template_id: templateId, owner_id:ctx.principal.id, name, confirmation: confirmation ? 1 : 0, version, updated_at: ctx.now }
    return {
      commandId: command.commandId, appId, action, canonicalInputHash: hash, permit: { ...permit, action },
      guards: [...author.guards, ...guards, ...(where ? [exists(buttons, where)] : [])],
      mutations: where ? [{ kind: 'update', table: buttons, set, where, expectedRows: 1 }] : [{ kind: 'insert', table: buttons, row: { id, app_id: appId, entity_id: entityId, ...set, created_at: ctx.now } }],
      audit: [{ action, subject: template.sourceRef, changes: [], sourceIds: [], personalContentRefs: [] }], events: [], outbox: [],
      committedResult: { id, appId, entityId, templateId, name, confirmation, version, enabled: true },
      accessSubjects: [{ ref: template.sourceRef, fieldIds: [] }],
    }
  }
  async function run(ctx: RequestContext, command: CommandInput<TemplateButtonRunInput>) {
    const { appId, entityId, buttonId, confirmed, ref } = templateButtonRunInput.parse(command.input)
    if (ref.appId !== appId || ref.entityId !== entityId) throw new AdmissionError('validation', 'The triggering record must belong to the button table.')
    const button = await configured(appId, entityId, buttonId)
    if (button.confirmation && !confirmed) throw new AdmissionError('validation', 'Confirm this template button before creating records.')
    schemaExpected(command, appId, entityId)
    if (!command.expected.some(item => item.ref.appId === appId && item.ref.entityId === entityId && item.ref.recordId === ref.recordId)) throw new AdmissionError('validation', 'Current triggering record version is required.')
    const plan = await services.templates.apply(ctx, { ...command, input: { appId, entityId, templateId: button.template_id } }, undefined, { action: 'record.template-button-run', command })
    return { ...plan, guards: [...plan.guards, exists(buttons, and(eq(buttons, 'id', button.id), eq(buttons, 'app_id', appId), eq(buttons, 'entity_id', entityId), eq(buttons, 'version', button.version)))] }
  }
  return { list, save, run }
}

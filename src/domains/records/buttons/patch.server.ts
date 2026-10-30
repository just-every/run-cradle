import type { CellValue, CommandInput, Ref } from '../../../contracts/primitives'
import type { RecordActionDependencies } from '../actions.server'
import type { RequestContext } from '../../authority/ports'
import { canonicalHash } from '../../admission/canonical'
import { AdmissionError } from '../../admission/errors'

/** Both direct edits and configured updates use native patch admission. */
export function recordPatchPreparer(deps: Pick<RecordActionDependencies, 'policy' | 'writer'>) {
  return async (ctx: RequestContext, command: CommandInput<{ ref: Ref; changes: Record<string, CellValue> }>, identity = { action: 'record.patch', command: command as CommandInput<unknown> }) => {
    const { ref, changes } = command.input
    const expected = command.expected.find(item => item.ref.appId === ref.appId && item.ref.entityId === ref.entityId && item.ref.recordId === ref.recordId)
    if (!expected) throw new AdmissionError('validation', 'Current expected version is required')
    const scope = await deps.policy.scope(ctx, { appId: ref.appId, entityId: ref.entityId, purpose: 'read' })
    const change = await deps.writer.prepareChange(ctx, scope, { ref, changes, expectedVersion: expected.version })
    const { action } = identity
    const hash = await canonicalHash({ action, input: identity.command.input, expected: identity.command.expected, controlEpoch: identity.command.controlEpoch ?? null })
    const permit = await deps.policy.authorize(ctx, { appId: ref.appId, action: 'record.patch', expected: [expected], fieldIds: Object.keys(changes), cost: [], inputHash: hash, commandId: command.commandId })
    return { commandId: command.commandId, action, appId: ref.appId, canonicalInputHash: hash, permit: { ...permit, action }, guards: change.guards, mutations: change.mutations, audit: change.audit, events: [], outbox: [], committedResult: change.next, changed: [{ ref: change.next.ref, version: change.next.version }] }
  }
}

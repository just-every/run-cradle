import type { CommandInput } from '../../contracts/primitives'
import type { RequestContext } from '../../domains/authority/ports'
import { canonicalHash } from '../../domains/admission/canonical'
import { visibleRead } from '../../domains/authority/read-visibility.server'
import { LAUNCH_APP_ID, launchEntities } from './contracts'
import type { LaunchKind } from './descriptors.server'
import { load, ref, type LaunchContext } from './domain.server'

/** An identifier is not permission to learn that a record exists, its version or its
 * values. Before a command reads a supplied record, the caller needs current authority
 * for the action on that record; otherwise the answer is the one for a missing record.
 * The final write authorization still checks the exact fields and revisions. */
export async function authorizeTarget(context: LaunchContext, ctx: RequestContext, input: CommandInput<unknown>, action: string, kind: LaunchKind, id: string) {
 const inputHash = await canonicalHash({ input: input.input, expected: input.expected })
 await visibleRead(`${kind} ${id} was not found`, () => context.policy.authorize(ctx, { appId: LAUNCH_APP_ID, action, commandId: input.commandId, inputHash, expected: [{ ref: ref(kind, id), version: 0 }], cost: [], targetEntityId: launchEntities[kind] }))
}

export async function loadTarget(context: LaunchContext, ctx: RequestContext, input: CommandInput<unknown>, action: string, kind: LaunchKind, id: string) {
 await authorizeTarget(context, ctx, input, action, kind, id)
 return load(context.db, kind, id)
}

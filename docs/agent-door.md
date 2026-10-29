# Cradle agent support

The supported native MCP interface remains Cradle's scoped proposal door
(RECORDS-007). A proposing key can read its base's schema, prepare an inert
proposal, list and read its own proposals, and withdraw one. It cannot adopt a
proposal, operate records, change grants or credentials, or send to a provider.
Native row, field, base and credential restrictions continue to apply.

The shared Base agent door, Business settings and the door's theme/icon
dependencies are recorded at
`e1b4265eb0d839a67dae3c36a04f83fa48c9d480`, with additive migrations for their
schemas. These source copies prepare the shared door; they do not enable a
company-agent surface. The native proposal MCP dispatcher is still active.
There is no new policy receiver, Agents page, tool or resource registry.
Public pages and navigation retain their existing source pins.

Runtime source and the rer command are separate pins. The published project
rer dependency is pinned to released 0.2.86. This command pin does not change
the recorded runtime-source pin or enable the shared door. The corresponding
released Base source is `f96363bf919ea3e7ed1837daba6894810a50e4a6`
(`rer-v0.2.86`).

## Required continuation context

Cradle's durable execution runs, provider jobs, Launch analyses and automation
definitions retain their originating native principal. Final provider admission
must recheck that precise sponsor, agent, consent and operation against current
native grants and company policy, including Pause and revocations.

The selected Base API now supplies immutable `ToolContext.consent`, `scopes`,
`clientId`, `operationId` and `idempotencyKey`. Its `AgentDoor.invoke` accepts
the saved consent and operation identity at the trusted worker boundary, checks
them against the retained admission, and rechecks current signed revocations
before execution. A mismatched admission refuses with `operation_mismatch`;
a revoked consent refuses with `consent_revoked`. Execution and refusal audit
rows retain `consent` and `operation_id`. Each continuation tool has its own
once-only claim. See the copied `ADOPTING.md` section "Durable invocation
consent and operation identity".

This closes the earlier source API limitation. It does not establish that
Cradle's native queued provider path has adopted or proven that API.

## Verification boundary

The module's `runAgentDoorConformance` accepts an optional
`invoke(name, args, who)` callback for trusted worker admission. At this source
pin, the normal rer verifier does not pass that callback to the module harness.
Its native journey receives HTTP requests, tool calls, mail and provider fixture
controls, but no trusted invocation or queue/schedule driver. The disposable
hosted runtime configures queue producers without native queue consumers.
Consequently it cannot yet prove Cradle's required native queued continuation,
revocation and operation-mismatch cases through normal `rer verify`.

The integration needs a supported verifier bridge to the seed's real worker
boundary. An agent-callable test route, alternate consent store, fabricated
human session or substituted queue would not prove that boundary. Shared door
activation remains pending that proof and the native adapters, Business person
bindings and custody integration. The source API's module tests are separate
from Cradle's own production-path evidence.

Spend-cap enforcement remains a separate Base limit. These source copies do
not add a spend guarantee or expose additional provider operations.


## Synchronous adoption boundary

The first shared-door rollout targets tools, policy, pause, audit and
idempotency, with native principal authorization and owner-bound tokens required
for every call. This capability set is a rollout target; this installation does
not yet declare it or claim shared-door conformance. The five scoped proposal
verbs above remain the only supported MCP surface.

Queued lifecycle, seed-emitted events beyond the built-in event reader,
subscriptions, multiple sponsors, mail edges, resource refresh, timed lifecycle,
dual host and owner-native administration are outside that first rollout.
Provider sends, automation execution and retries, scheduled work, calendar and
webhook delivery, warehouse jobs and Launch event-driven effects all reach native
queues or schedules. A record write may also enqueue those effects; synchronous
record persistence alone does not establish a synchronous agent operation.
Do not register those paths merely to satisfy an unscoped conformance check.

Native services require their real session, credential or proposer admission.
A Business sponsor id is not a native session or a proposing key. The shared
people adapter must resolve `authority_principals.id` through
`cradle_base_operators`, and must re-read current native authority. The signed
Business owner/team binding selects that native person; an email match cannot
select or widen a binding. Business team roles and native application roles
remain separate.

Before exposing client records, the integration must include retained door
outcomes, pending approval arguments, summaries, trace, audit and events in the
native custody and erasure boundary, including pending execution and replay.
The existing native erasure path alone does not establish that coverage.

## Authoring prerequisites

Use the pinned CLI's `rer refresh-base --help`. Version 0.2.86 requires a full
immutable commit in `--ref`, including when the intended release is named by a
tag. An archive provides only one tree; refresh of these historical records
requires prior source membership and Git history. Keep existing recorded copies
and applied migration bytes intact when refresh refuses. Do not fabricate a
history, change record ownership or edit copied runtime files to bypass it.
Public pages and navigation keep their existing pins.

Use `rer door clauses --write` followed by `rer door clauses --check` to adopt
the canonical shared clauses once the seed's contract generator and standard
contract shape are available. The current legacy contract has no declared
`Lander-Regenerate` generator or `src/base/contract-docs.mjs`. A refusal is not
permission to write generated acceptance views by hand or claim the shared
clauses are satisfied.

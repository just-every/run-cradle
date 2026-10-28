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
rer dependency remains 0.2.80. The selected Base source includes additional
conformance machinery that has not yet been released as rer 0.2.86.

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

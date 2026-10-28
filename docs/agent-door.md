# Cradle agent support

The supported native MCP interface remains Cradle's scoped proposal door
(RECORDS-007). A proposing key can read its base's schema, prepare an inert
proposal, list and read its own proposals, and withdraw one. It cannot adopt a
proposal, operate records, change grants or credentials, or send to a provider.
Native row, field, base and credential restrictions continue to apply.

The shared Base agent door and Business settings source are recorded at
`7ce44fa5b70b68b21d270ba54760dae28b4a37a7`, with additive migrations for their
schemas. This is preparation for the shared door, not an enabled company-agent
surface. The legacy native MCP dispatcher is still the active dispatcher.
There is no new policy receiver, Agents page, tool or resource registry.

Runtime source and the rer command are separate pins. The published rer
dependency remains 0.2.80; the matching unreleased Base CLI is required for the
future complete agent conformance journey.

## Required continuation context

Cradle's durable execution runs, provider jobs, Launch analyses and automation
definitions retain their originating native principal. Final provider admission
must recheck that precise sponsor, agent, consent and operation against current
native grants and company policy, including Pause and revocations.

The pinned Base API supplies `ToolContext.consent`, `scopes` and `clientId`.
`AgentDoor.invoke` accepts that originating consent, re-reads current signed
revocations and refuses `consent_revoked` before the native effect. Successful
and refused invocation audits include consent. See the copied
`ADOPTING.md` section "Durable invocation consent".

The remaining integration boundary is the originating operation. Base removes
`idempotency_key` and `expected_revision` from native tool arguments, and its
`ToolContext` exposes neither the key nor a durable operation/decision reference.
Cradle's provider preparation retains a command identity, exact input hash and
provider idempotency key; final dispatch and recovery revalidate that same
operation. The native adapter therefore cannot retain the complete originating
door invocation specified by the continuation contract. Reading Base's private
audit tables or asking the caller to duplicate the door's reserved key would
introduce an unsupported second context channel.

The integration needs the remaining embedded/queued operation context from
Base's hooks-7 continuation: a supported native-tool context retaining the
originating operation identity alongside consent and original scope. Consent
alone is now supported. The eventual adapter must preserve native atomic state,
audit and outbox custody and must not resend an uncertain provider effect.

Until that API is available, Cradle does not add a second token verifier,
fabricate a human session, register a stand-in native service, or report shared
door conformance. Business identity bindings also need coherent native erasure
and restore behavior before activation. Spend-cap enforcement is a separate
Base follow-up; this source pin does not add a spend guarantee.

# Cradle agent support

The supported native MCP interface remains Cradle's scoped proposal door
(RECORDS-007). A proposing key can read its base's schema, prepare an inert
proposal, list and read its own proposals, and withdraw one. It cannot adopt a
proposal, operate records, change grants or credentials, or send to a provider.
Native row, field, base and credential restrictions continue to apply.

The shared Base agent door and Business settings source are recorded at
`d555e789cffb744a9f83d76ebe42a2e3bdd7a055`, with additive migrations for their
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

The pinned Base API carries `consent` in its authenticated `Principal`, but
omits it from `ToolContext`. `AgentDoor.invoke` accepts only person and agent,
and the ordinary durable audit row also omits consent. Consequently a native
adapter cannot retain the originating consent and feed it back to the shared
door when a queued action reaches final admission. A revoked agent and a revoked
consent are distinct; one must not be substituted for the other.

The integration requires a supported Base continuation context carrying the
consent, original scope and stable operation identity, and an embedded admission
API that revalidates them. It must preserve native atomic state, audit and outbox
custody and must not resend an uncertain provider effect.

Until that API is available, Cradle does not add a second token verifier,
fabricate a human session, register a stand-in native service, or report shared
door conformance. Business identity bindings also need coherent native erasure
and restore behavior before activation. Spend-cap enforcement is a separate
Base follow-up; this source pin does not add a spend guarantee.

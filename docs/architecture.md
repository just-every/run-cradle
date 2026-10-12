# Proposed architecture and product boundaries

These are planning decisions, not current code. They give the first
implementation a concrete shape while keeping Cradle product-owned and fully
editable. A different source, schema, UI, framework or infrastructure remains a
normal owner choice; the proof is preserved requirements and a verified outcome.

## Runtime and resource choice

For the maintained path, use the already accepted TanStack Start migration over
the current single Cloudflare Worker: Start owns React document routes;
explicit Hono routes retain their declared HTTP/API surfaces. D1 remains the
canonical relational store. Add private R2 objects for future evidence and
attachments, a Queue for committed outbox work, and Cron for declared schedules.
Outbox rows and action receipts remain in D1 as the durable source of execution
state; a Queue message wakes a worker but does not become the only copy of work.
The initial product has no need for a second Worker, a plugin runtime or a
Durable Object. Add another resource only for a named isolation, coordination,
or scaling requirement that has acceptance evidence.

Today `wrangler.jsonc` declares D1 and static assets, and the current SPA has not
completed the Start migration. R2, Queues, Cron and any provider adapters above
are proposed additions, not available Cradle capabilities. An owner may select
another target; it must still prove transactional admission, durable state,
private storage, idempotent wakeup, schedule recovery and exit/restore.

## Default records model

Use **metadata-defined, physically relational application schemas** as the
default. Each app describes entities, stable fields, types, links, validation,
formulas, views and policies in versioned product-owned source. A checked build
step emits ordinary typed server schemas, SQL migrations and UI/action code.
Each entity has a real relational table; each field has a physical typed column
whose internal name derives from an immutable field ID, while the display name
remains editable metadata. Relationships use real foreign keys and indexes.
Computed fields and rollups are deterministic read-only expressions, not stored
values that can be overwritten by an edit.

Expression definitions compile to a dependency graph when an app version is
saved. Unknown fields, incompatible types, unsupported functions and dependency
cycles are rejected before publish. Evaluation is deterministic and bounded:
maximum dependency depth is 64; one rollup evaluates at most 10,000 referenced
rows per result unless its index/aggregation contract defines a separately
verified pre-aggregation. There is no ambient clock, network or model call inside
an expression. A limit breach or invalid source produces a visible typed
`ComputedValueUnavailable` with its cause and affected fields; it never becomes
zero, a stale value presented as current, or a guessed fallback.

Currency values use exact integer minor units with an ISO 4217 currency on each
value. Arithmetic and rollups reject mixed currencies unless a formula explicitly
uses a separately identified exchange-rate source with its value, time and
authority. Instants are UTC; calendar dates remain dates, and a schedule also
records its declared IANA timezone and local-time rule. Timezone edits cannot
silently rewrite stored instants.

The generated code and migrations are inspectable and live beside the app
source. An owner and the owner's agent can edit every generated or hand-written
file. The generator does not own a protected region, erase custom work or force a
runtime plugin boundary. A declared app version identifies source bytes, schema
revision, actions, policy and connection contracts. Secret values remain outside
that identity; only the referenced credential/connection version is recorded.

This default favors database constraints, predictable SQL, useful query plans,
export/restore and familiar migrations over putting every unknown field in one
JSON/EAV store. Stable field IDs are the public identity; SQL names and screen
labels can change without changing the field. Adding a field is additive. A type
conversion, required/unique constraint, relationship change or retirement has
an explicit proposed migration, affected-row report, validation and recovery
path. No conversion silently drops values or repairs ambiguity by guessing.

**Revision point:** after two first-party apps and the held-out third owner app
are represented, run the full data profile and current declared Cradle limits.
First profile and tune ordinary indexes/query plans. Reconsider this storage
shape only if two consecutive full-profile runs still miss the retained search
or lens latency clauses, or a safe migration at the declared maximum requires
over 30 minutes of operator-visible unavailability. Any alternative must pass
the same access, relationship, export/restore and owner-editability checks before
it replaces the default. This is a measured review trigger, not a reason to
implement two storage engines now.

## Shared identity, app-specific authorization

A Cradle installation represents one owner/business with multiple apps and
collaborators. Login identity is shared across those apps; app data meaning and
access remain scoped. A shared entity such as `Store`, `Person` or `Supplier`
has one stable identity and explicit owners/consumers. Linking another app does
not copy its truth into a second field, automatically reveal it, or grant writes.
The effective read is constrained by both the shared-entity rule and the
receiving app's policy. A user cannot infer an inaccessible row from picker
choices, counts, error differences or a relationship lookup.

The proposed authorization model has three server-evaluated layers:

- **Row rules** decide which record identities an actor may discover and read.
- **Field rules** decide which fields may be read or changed, including masked
  data and values sent to a provider.
- **Action rules** decide whether a named command may run, against which record
  version, with which evidence and preconditions.

One policy decision function applies at the UI/API, MCP, import/export, connector,
webhook/callback, schedule and queue boundaries. Interfaces may hide unavailable
controls for clarity, but service authorization is definitive. All decisions
record the principal, app, resource, requested action, policy/grant version,
decision and relevant reason. Removing a collaborator revokes active sessions
and grants within the existing owner contract; histories retain an anonymized
actor where deletion applies.

An upgrade preserves current `OPS-001` behavior until a separately accepted
transition is implemented: existing operators are mapped to an explicit legacy
scope with the same access and mutation powers they have today. The migration
does not grant additional rows, fields, apps, endpoints, provider context or
actions. A narrower policy is introduced only through an owner-reviewed mapping;
new collaborators receive the least access declared for their workflow.

## Evidence and authority records

Keep these objects distinct and connected by stable IDs:

1. **Source item:** original message/file/provider response, source identity,
   receipt time, content hash and storage/access policy.
2. **Extracted claim:** a candidate value, exact source span and page, extractor and
   model version, time and confidence. Confidence is a hint, never authority.
3. **Proposed change:** before/after values, target record and version, evidence
   links, reason, expiry/staleness conditions and required action.
4. **Authoritative state:** the committed typed record, its schema/version,
   `createdAt`/`updatedAt`, and the person or action that committed it.
5. **Decision:** approval/rejection/revision, subject version, approver,
   authority, amount/scope, time and rationale. The business decision is not a
   model conclusion or a UI checkbox.
6. **Command and attempt:** a typed action, idempotency key, input snapshot,
   policy/grant snapshot, started/finished time and result for each attempt.
7. **Receipt:** provider/system identifier, exact response/confirmation,
   reconciliation link and whether the external outcome is confirmed, refused,
   partial or unknown.

Replacing or correcting a claim leaves the original and the correction linked.
The event history is append-preserving while personal content remains subject to
privacy and erasure. Under the accepted erasure policy, remove or redact source
text, email bodies, prompts, OCR, attachment bytes, extracted personal values,
credentials and provider copies where supported; retain only a non-personal
event/tombstone, actor anonymization, decision/action identity and time needed to
explain the business effect. Redaction is linked in history and reflected in
exports and restored backups. “Immutable audit” never means undeletable personal
evidence.

## Typed actions and standing grants

Every effectful capability is a named action with a typed input/output,
preconditions, allowed status transitions, affected record set and declared
external effects. Examples are `openWorkOrder`, `assignEligibleContractor`,
`requestQuote`, `approveQuote`, `bookVisit`, `acceptStoreCompletion`, and
`handoffInvoice`. An agent requests an action; it does not get generic write
access or arbitrary network access.

A grant is issued by an actor authorized to delegate and records:
issuer/delegate, application and action IDs, resource scope and predicates,
allowed transitions, per-action and period budget, permitted provider/data
scope, start/expiry, revocation state, approval/separation-of-duties rules and
grant version. Policy is reevaluated immediately before commit and before an
external call. A grant can permit a bounded set of routine steps to proceed
without a click each time. Reaching an approval threshold, leaving scope,
changing material source facts, violating separation of duties or exceeding a
budget blocks and routes the case to an authorized person.

An operator can revoke a grant; queued work rechecks and stops before the next
side effect. Already-committed external effects remain recorded and may need a
separately authorized compensation. Neither prompt text, a source document,
model confidence nor a developer-set default can create or broaden a grant. The
initial exemplar sends amounts above A$2,000 to the designated human approver;
neither an AI summary nor an under-threshold amount creates permission to spend.

## Durable work and uncertain outcomes

State-changing local work commits the canonical event, accepted state transition,
audit fact and durable outbox item in one SQL transaction on the maintained
Worker/D1 path. A single transaction boundary admits the conditional record
version update and its dependent effects: a losing version, policy or
precondition leaves no activity entry, grant consumption, event or queued action
behind. The implementation must prove this with simultaneous commands against
one version, then check persisted rows and emitted messages. No pre-read alone
authorizes a later write. Workers consume committed outbox items, record a
lease/attempt and use an idempotency key derived from the business command and
provider contract. Every side effect stores its result before later work
advances. A different runtime may be chosen if its transaction/admission
semantics meet the same observable test; transactional admission is required,
not optional.

The planned maintained implementation uses D1-backed outbox/attempt/receipt
state and dispatches only committed outbox work to Queues. D1's documented
[`batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
accepts prepared statements and returns results after execution; it does not
provide a JavaScript inspection/abort point between statements. A conditional
update affecting zero rows is not a SQL error and cannot roll back unconditional
follow-on writes.

Selecting and proving a compatible admission mechanism is an implementation gate.
A SQL-gated conditional batch may admit a unique command only when current record
version, actor/grant, business predicates and authority budget all permit it;
every state, budget, audit, event and outbox write must depend on that successful
unique admission within the same atomic boundary. An existing command identity
must reconcile to its prior result, never authorize repeating its effects. The
implementation must prove these predicates remain valid throughout admission,
including contention and revocation, using supported D1 SQL/API semantics. Do not
substitute a pre-read or a Drizzle interactive transaction callback for this proof.

Race two commands against one version and competing commands against one remaining
grant budget; prove exactly one admissible transition and budget consumption with
only its audit/event/outbox rows and dispatch. Also prove zero-predicate, duplicate
command and injected SQL-failure paths leave no orphan effects. If D1 cannot meet
the invariant with the selected mechanism, choose a compatible transaction runtime
and prove the same tests before accepting durable operations.

Retries are bounded and tied to classified transport failures. Invalid data,
refusal, revoked authority or an unmet precondition does not become a retry.
Cancellation stops future side effects; it cannot pretend an already-sent
request was undone. A different authorized operator can take over a stuck run
with the prior lease and attempt history retained.

If an external request times out after it could have succeeded, set
`UnknownOutcome`. Check the same provider idempotency key, fetch the remote object
or ask a human to reconcile. Retry only when evidence establishes that the prior
effect did not occur or the provider contract makes the key safe to replay. Do
not claim exactly-once external execution. A final UI state always distinguishes
confirmed success, known failure, cancellation, partial effect and unresolved
unknown.

The proposed [continuing-operation and improvement loops](operating-loops.md)
use this execution boundary; durable goals and plans never bypass admission.

## AI and connected work

Treat emails, files, web pages, connector records, OCR, provider replies and
model output as untrusted data. Instruction-like text is not an authorization
source. The orchestration context contains only fields the current actor and
action may read, along with purpose, source lineage, schema and response format.
Secrets and unused records do not enter prompts. Each provider configuration
declares its destination, retention/data terms, selected fields, rate/cost budget
and model identity. Requests and refusals are visible and measured. Missing or
disabled AI yields a clear unconfigured state; deterministic calculations and
ordinary collaboration keep working.

Connections are explicit, source-owned adapters with named data and effect
contracts: what is read, written, uploaded, retained, authoritative, and how
identities and receipts reconcile. A user previews mappings and source ownership
before initial import; each inbound source remains traceable. Outbound changes
are typed actions checked under the same grants and budget. No open webhook or
generic connector gains blanket scope by virtue of being configured. An owner
can author or replace an adapter in ordinary source code where the abstraction
does not fit.

## Candidate app versus live app

An operation brief, connected spreadsheet or prompt first creates an isolated,
versioned candidate. It cannot read or mutate live business data beyond an
explicit redacted sample. Its default external adapters are simulated; a real
sandbox needs explicit scoped credentials and an effects declaration.

Before publish, the candidate shows the schema and stable-ID diff, row/field
exposure changes, action/grant changes, connections/data egress, migration and
backfill plan, formulas/rollups, representative scenario results, tests,
load effect, budgets, in-flight work treatment, release identity and recovery
steps. Existing operations can replay against an old snapshot or run in shadow
mode; shadow actions have no external effects. An owner grant may authorize a
defined low-risk release class after all checks pass. Destructive changes,
new data exposure, new external effects and business-authority changes remain
human decision boundaries unless an owner has explicitly defined an equally
concrete standing authority for that exact class.

Retain the applied migration history. Use a forward-compatible expand,
backfill/validate, switch and contract plan with a recovery path. If backfill,
policy evaluation or recovery is incomplete, the candidate stays separate from
live operation. Generated code is reviewable and editable; publishing never
regenerates over owner changes.

## Reuse and decision log

| Capability | Current evidence | Plan status |
| --- | --- | --- |
| Cradle linked portfolio data, selected versioned writes, Hono routes and saved lenses | Present in this checkout; see [current state](current-state.md). | Verified starting source; general schemas and the broader guarantees still need implementation. |
| Base Start/Worker path | Maintained technical foundation and accepted Cradle migration recipe. | Chosen migration path for the first resumed implementation step; Base is not the product or its domain model. |
| Orbit attributed signal, ambiguity, permission recheck and delivery-reconciliation patterns | Identified in current Orbit source by the adjacent audit; those implementations serve CRM outreach. | Candidate patterns to inspect and adapt if they fit these typed records/actions; no records-engine adoption claim. |
| HappyToHelp explicit actor/role/grant and uncertain provider-operation patterns | Identified in native product source; its domain is conversations/support. | Candidate patterns to inspect and adapt; no generic data model or service compatibility claim. |

The default product source and migrations stay in Cradle. Extract a shared
implementation only after a real second adopter and adaptation test show it
saves owner work without forcing a product identity, runtime or interface.

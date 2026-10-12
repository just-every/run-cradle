# Product and workflow map

Repairs and launch readiness are two proving applications for one structured
records and internal-apps product. They are not the category boundary. An owner
must be able to describe materially different operational models, build distinct
role-specific screens over them, connect their existing systems, and apply one
shared identity and authority model. The plan must prove both an adaptable
records engine and complete working applications; neither an empty builder nor a
single hard-coded maintenance workflow is the destination.

## Product shell and application construction

The default is **Today: Needs your decision / Being handled / Finished**, with
role-specific business apps, records, search and lenses directly available.
Chat is optional; ordinary records work remains available with AI disabled.
See the [user journeys](user-journeys.md) for the proposed experience.

This is a capability and review inventory, **not seventeen top-level navigation
destinations** or a setup checklist for the owner. Cradle prepares the model,
mappings, screens, policies and evaluations from the outcome and permitted
sources. People confirm business constraints and consequential authority, not
technical configuration. Placement below is explicit; on-demand detail stays
accessible without becoming routine work. Names may change in accepted UX work,
but each responsibility and failure state must remain.

| Capability / review area | Placement | Purpose and key actions | Required error, conflict, or unknown states |
| --- | --- | --- | --- |
| Workspace home | Default Today summary | See active apps, due work, exceptions, decisions, aging unknown outcomes, recent changes, and outcome measures; open a work item directly. | No apps, no assigned work, stale metrics, partial provider outage, unavailable source, and retryable read failure. |
| Operations and case supervision | Case detail on demand | Review Cradle-prepared objective, scope, budgets and verification target; inspect selected work, evidence-based plan revisions and next action; pause, correct or take over. See [operating loops](operating-loops.md). | Stalled objective, no permitted action, exhausted budget, expired grant, changed evidence, unknown effect and takeover race. |
| Improvements | Prepared adoption decision when needed; detail on demand | Inspect recurrence/correction cohorts, process/app/model/context/routing diffs, replay/shadow results, adoption and post-change scorecard. | Insufficient cohort, uncertain cause, regression, unsafe candidate, unauthorized adoption and recovery required. |
| App studio | On demand: add/change an operation | Describe the operation and users; connect existing files/services; capture constraints and unanswered questions; browse the generated app plan. | Missing required information, contradictory source, inaccessible connector, unsupported request, model/provider unavailable, context/budget ceiling, and untrusted embedded instructions. |
| Data model | Authoring detail on demand | Add tables and typed fields; set required/unique rules, links, formulas, rollups and lifecycle; see stable IDs and versions; inspect sample rows and relationships. | Invalid type/expression, field or relation conflict, unsafe delete/type conversion, uniqueness collision, broken relation, and stale definition version. |
| Interface design | Authoring detail on demand | Compose forms, grids, cards, boards, calendars, timelines, dashboards and role-specific record screens; inspect keyboard and small-screen layouts. | Hidden required field, inaccessible control, no permitted fields, broken route, incompatible view type, and view constraints that filter display but do not grant access. |
| Rules and authority | Plain authorization card when needed; policy detail on demand | Inspect prepared validation, row/field/action policy; decision thresholds, standing grants, budgets, expiry, revocation and separation of duties. | Missing issuer or scope, contradictory grant, self-approval, expired/revoked grant, over-budget action, policy conflict, and a proposed privilege expansion. |
| Evaluation lab | System-run; evaluation detail on demand | Run representative data, imports and scenario cases against an isolated candidate; compare outputs and policy decisions with the current release. | Failed assertion, missing expected fixture, unknown side effect, data leakage, run timeout, provider mismatch and any non-deterministic difference that affects authority. |
| Candidate and release | Prepared adoption summary; technical detail on demand | Compare source, schema, screen, policy, integration and migration diffs; inspect backfill/replay, access changes, costs, tests and recovery before adoption. | Breaking change, failed migration, unverified recovery, widened access, unknown in-flight actions, concurrent release, cancellation and rollback boundary. |
| Work inbox | Role-directed Today items; full queue on demand | Triage new requests and exceptions; resolve ambiguity, missing evidence, approval, stale inputs, and conflicting reports. | Duplicate intake, unmatched identity, insufficient access, missing source, stale evidence, invalid transition and action outcome unknown. |
| Records and views | Direct business-app access | Search, filter, group, sort and bulk-update authorized records; inspect linked records and derived values; save and share an internal view. | Loading, empty, no access, no results, deleted/unavailable link, stale cursor, 409 version conflict, validation failure, partial load and retry. |
| Record detail | Direct record access | Inspect current authoritative fields beside their evidence, claims, proposals, decisions, related records, attachments, history, runs and external receipts. | Unknown relation, private or deleted attachment, conflicting claim, unsupported source, policy-redacted field, failed read and historical value without current authority. |
| Form and intake | Direct role-specific entry | Submit structured or unstructured work, attach files, confirm capture, and show what remains unresolved. | Invalid required value, unsupported file, duplicate submission, upload interruption, untrusted content, possible duplicate after lost response and private-link expiry. |
| Decisions and grants | Assigned Today decision; grant history on demand | Review exact action, subject, current value, source evidence, conditions, budget, actor, expiry and consequences; approve, reject, request changes, or revoke. | Stale quote/record, no authority, separation-of-duties violation, second competing decision, revoked/expired grant, conflict, timeout and terminal outcome. |
| Runs and connections | Connection consent when needed; diagnostics on demand | Inspect automation versions, each action attempt, retries, cancellation, connector health, rate/budget use, receipts and reconciliation. | Provider down/refused, invalid response, partial action, timed-out unknown result, duplicate delivery, budget exhausted, denied access, cancellation after external commit, or unresolvable external state. |
| Search and history | Search direct; history on demand | Search accessible records and their source/evidence; filter immutable change and decision history by actor, time, source, app and outcome. | Access-redacted match, expired cursor, unavailable source content, erasure marker, partial index, or stale history view. |
| People, access and settings | On demand; consequential access decisions surfaced | Manage account/session, collaborators, app roles, policies, provider scopes, retention, backups, export/restore, and operation budgets. | Last-owner removal, expired session, duplicate identity, incomplete revocation, missing secret, unavailable backup, import incompatibility, and provider not configured. |

All screens need loading, empty, success, validation, forbidden, conflict,
cancelled, retryable failure, non-retryable failure and explicit unknown states
when applicable. A failed read clears old values from the active view; stale data
is visibly timestamped rather than presented as current. Every consequential
decision identifies the state version it concerns. The mobile product supports
the same permission and evidence rules as desktop; narrower screens may change
layout, not access or action semantics.

### Disconnected and delayed submission

State changes require a current online server admission and fail closed offline.
The mobile/web interface labels unsent form contents **Local draft — not submitted**;
it never silently queues a mutation or presents a draft/upload as committed.
A local draft is only on this device, has a visible discard control and retention
warning, and follows the accepted privacy/session-clearing policy. If draft storage
is unavailable, say so before navigation; no offline persistence is promised.
Cached reads are timestamped and cannot authorize acceptance, approval or spending.

After reconnect, refetch current record/claim/quote versions and authority. Show
changes and require fresh confirmation for human submissions; a background retry
needs a still-valid standing grant and the same current precondition checks.
Retain the original idempotency key for the same attempted command. If a prior
submission may have reached the server, reconcile that key and its outcome first;
never turn uncertainty into a new command. A materially revised command gets a
new identity only after resolving the prior attempt and confirming the new intent.

Mobile proof covers disconnected intake with a photo (visible local draft, no
work order or upload receipt), reconnect and submit once; and store acceptance
whose response is lost as connectivity drops. While disconnected the completion
claim changes and the user's grant is revoked. Reconnect must reconcile the old
key, display any already-committed acceptance honestly, refetch current state and
deny a new acceptance without current authority. Include the alternate outcome
where no prior commit occurred: no success badge, no silent retry and no stale
claim acceptance. Restored authority still requires review of the changed claim.

## Repair operation: 40-store retailer

The business coordinates equipment repairs across forty stores. The accounting
system is the authoritative ledger and payment system. Cradle is responsible for
the operational request, eligibility, quote decision, schedule, evidence,
acceptance and handoff. Its work-order record does not claim that an invoice was
paid.

The initial relational model contains `Store`, `Asset`, `Contractor`, `WorkOrder`,
`Quote`, `Visit`, `Approval`, `EvidenceItem`, and `AccountingHandoff` records.
Fields and relationship identities are stable across app revisions. A work order
can have multiple sources, quotes, visits and evidence items; a quote binds to a
work-order scope/version; an accounting handoff stores the external identity and
receipt, not the payment ledger itself.

| Step | Routine path | Review or failure branch |
| --- | --- | --- |
| 1. Receive | A store email, submitted form or authorized mailbox connection creates a source item with original bytes, sender/source identity, timestamp and attachment hashes. Deterministic routing can accept it under a standing grant. | Duplicate source identity is linked, not silently copied. Bad/oversize attachment, unknown store, missing contact or unconfigured mail remains visible. Email text, photos and OCR are evidence, never system instructions or grants. |
| 2. Extract and identify | A configured, budgeted extractor proposes fault, store, asset identifiers, urgency and evidence references. Exact known store plus one active matching asset may open a work order through a named low-risk action if the grant permits it. | No exact match, several candidates, asset/store disagreement or ambiguous serial means unresolved identity. Retrieve permitted asset/context evidence first; if still unresolved, send one targeted `Needs asset review` question to the store contact, with candidates and why. No nearest-match auto-write. Preserve the original claim and decision. |
| 3. Triage | The operation view combines asset identity/history, warranty, urgency, store availability and linked requests. Deterministic rules route ordinary cases and monitor deadlines. | Conflicting repair history, expired asset/warranty details, possible safety issue, duplicate work, or a missing severity rule becomes an exception with owner and due time. Without an AI provider, manual triage and deterministic checks continue. |
| 4. Select contractor | Filter eligible contractors by active approval, service category, store coverage, contract dates, insurance/licence evidence and current workload. A typed assignment action rechecks those facts when it commits. | An expired credential, no eligible contractor, hidden picker choice or changed coverage blocks assignment. The user sees the exact rule and source; choosing a contractor in a filtered list alone cannot bypass it. |
| 5. Obtain and compare quotes | Store each quote and source separately. Compare quoted total, tax/currency, line items, exclusions, warranty, availability and quote expiry against the same work scope. Ask an approved contractor for a quote only under a declared connector and grant. | Missing/excluded work, incomparable currency/tax, overdue quote, scope change or duplicate provider response makes comparison incomplete or stale. Show the conflicting versions; do not rank unsupported totals as equivalent. A rejection records actor, time and reason. |
| 6. Authorize | The exemplar rule routes any selected quote **above A$2,000** to a current designated manager. The approval names the quote ID/version, scope, value, evidence and consequences. A human with authority approves, rejects or requests changes. | No requester self-approval where separation of duties applies. At or below A$2,000, any unattended commitment is still limited to the owner-issued action and budget grant; the threshold does not create permission by itself. If amount, scope, contractor or quote version changes, prior approval is stale and cannot authorize the new version. |
| 7. Schedule | An authorized `bookVisit` action reserves a contractor slot and records the request, idempotency key and returned booking receipt. Routine confirmations and reminders can run within their grant and budget. | Lost response enters `Unknown external outcome`; query by provider key/receipt and reconcile before retry. A known rejection returns to rescheduling; cancellation after a confirmed booking is a separate authorized action. No duplicate booking is inferred safe from a client timeout. |
| 8. Record contractor completion | Contractor completion email, report and photos are stored as a `ContractorCompletionClaim`; extraction proposes fields and evidence links. | This claim never marks the store's repair accepted. Missing/contradictory evidence, changed invoice or reported incomplete work goes to the exception queue. |
| 9. Store acceptance | A store operator inspects the repair and explicitly accepts or rejects it. Acceptance records its actor, time, evidence and the claim/version accepted. | Rejection records the reason, changed conditions and required rework; the work order reopens or enters a named dispute state. A stale claim cannot be accepted against changed scope without review. No invoice handoff as accepted completion until this decision is satisfied. |
| 10. Invoice handoff | Match the supplier invoice to the approved quote and accepted work; send a typed payable-handoff action to accounting. Accounting returns a durable external reference/receipt. The UI says `Handed off` only on that confirmed receipt. | Amount or payee mismatch, duplicate invoice, missing acceptance, expired approval or no accounting connection blocks handoff. Lost response remains unknown and is reconciled by external idempotency/reference before any resend. Accounting alone owns payable status, reconciliation and payment; Cradle never reports payment from a successful handoff. |

The operation dashboard reports each stage separately: time from intake to first
response, authorized quote, scheduled work, contractor claim, store acceptance
and accounting receipt; blocked/aged cases; evidence completeness; rework;
spend variance; and unresolved unknown outcomes. A “no touch” number counts only
work covered by a grant that later received valid acceptance and an accounting
receipt. It never rewards skipping a needed approval or review.

The [continuing operator example](operating-loops.md#continuing-operation) shows
how these actions are selected and revised after changed conditions; the
[improvement example](operating-loops.md#evidence-to-improvement-loop) turns repeated
exceptions into an evaluated application/process change. Dashboard measurements
use the [scorecard definitions](../PLAN.md#operation-scorecard).

### Required repair scenarios

The acceptance suite includes: unrecognized store; ambiguous or inactive asset;
duplicate message and retry; hostile instructions in a photo or email; expired
contractor credential; no eligible contractor; two incomparable quotes; quote
rejection and re-quote; amount changed across A$2,000; self-approval attempt;
stale approval; changed work scope; simultaneous operator edits; provider refused
booking; booking succeeded with lost response; cancel racing with booking; late
completion claim; store rejects work; store and contractor evidence disagree;
invoice/payee/amount mismatch; accounting succeeds but reply is lost; duplicate
handoff; connector revoked mid-run; budget exhaustion; unavailable provider; and
app change during a queued action; disconnected intake and delayed acceptance
with changed authority/claim versions and an unknown prior submission. Each scenario asserts committed state,
evidence, authority, external attempts and visible UI outcome.

## Launch and campaign-readiness application

The existing product remains a first-class application for coordinating a
business launch. It keeps its campaign-centered language and purpose, not a
generic `Records` label in place of the user's domain.

The following manual workflow remains directly available. The future default is
a brief and permitted source material from which Cradle prepares the campaign,
deliverables, dependencies and readiness case; people correct business intent and
make necessary decisions. That future agent-write path requires an accepted
`AI-003` transition; current AI stays read-only and `CAMP-005` health semantics
remain binding. Neither readiness analysis nor silence approves or publishes a
launch. See [journey 7](user-journeys.md#7-prepare-and-run-a-launch).

1. An owner creates a campaign with purpose, code, owner, dates, objective, phase,
   status, health, budget, spend, tags and any supported custom fields.
2. The team builds its deliverable list, milestones, dates and dependencies,
   assigns accountable people, and reviews a current grid, portfolio overview
   and timeline/agenda. Derived completion, lateness and risk rollups remain
   derived; stale reads or conflicting writes do not replace current values.
3. Operators record risks, mitigation and escalation evidence; link explicit
   decisions; assign reviewers; request changes, approve, reject or cancel with
   reason and attribution. A resolved decision is terminal, and any related risk
   effect follows its policy rather than an AI-written status.
4. Comments, mentions and activity preserve who changed what and why. Search,
   saved lenses, bulk edits, CSV preview/commit, export and notifications use the
   same current rules and surface errors, version conflicts and archive state.
5. Readiness checks gather current deliverables, dependencies, unresolved risks,
   decisions and source evidence. Operators inspect gaps and decide whether the
   launch is ready. A campaign brief or risk analysis is clearly labelled and
   cited; it cannot set health, approve the launch or mutate a record by default.
6. Scheduled reminders and future automations use durable typed actions and
   visible run history. Launch, archive, restore and deletion preserve the
   existing lifecycle, notification, export and audit requirements.

The exact legacy clause inventory and how future capabilities may extend it are
in [contract-transition.md](contract-transition.md). The current UI port is only
the starting surface; the end state must complete its promised workflows and
their existing dependencies.

## Held-out third application

After the two proving apps have stable schema and action contracts, the owner
supplies a materially different operation brief that was not used to design the
record model or builder. The app must reach a complete useful first workflow
with its own entity graph, roles, forms/views, rules, action decisions and source
connectors. It must share at least one governed entity with an existing app
(for example, a supplier shared with repairs) without copying the entity or
inheriting its access. A procurement/request app could be an evaluation example,
but acceptance must use an owner-chosen brief rather than a canned third
template. The owner can inspect and change the generated source directly, then
verify the result and any future generated update against that intent.

## Structured-records floor

Beyond the two exemplar applications, an owner must be able to create another
materially different internal app from its own source/model rather than edit a
campaign or repair template. At minimum, the released records floor supports:

- Relational, typed tables with stable field IDs, typed references, schema
  versions, deterministic migrations and preserved prior values.
- Required/unique validation, text/number/date/currency/boolean/select/URL/person/
  relation/attachment fields; computed fields, formulas and rollups that cannot
  be edited as stored values.
- Forms for intake, role-specific record pages, responsive grid/cards/board/
  timeline/calendar views, saved conditions, sorting, grouping, bulk changes,
  global search and linked-record navigation.
- Private attachments with metadata, source provenance, content checks and
  download authorization; comments, mentions, change history and attribution.
- Server-side row, field and semantic-action policies; collaboration, imports,
  schema-aware export/restore and explicitly configured connector scopes.
- Shared account identity and revocable authority across apps and their UI/API/
  MCP/automation paths, with separate app concepts and workflows.

General scripting and arbitrary plugin execution are not prerequisites for this
floor. The product source can be changed freely when these core patterns do not
fit; the user has a code path and a measured update story for that divergence.

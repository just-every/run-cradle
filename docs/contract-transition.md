# Current contract and proposed extensions

The owner authorized implementation of the complete flagship plan on 27 September
2026. This crosswalk records that accepted transition; it does not claim release
acceptance or confer live business authority. Installation grants, additional app
exposure, provider context and external effects remain inactive until an actual
authorized issuer explicitly configures and grants them. Existing operator rights
map exactly to the legacy launch scope. Applied SQL history and existing records
retain their identities and meaning.

## Current contract mapping

| Existing clauses | Meaning retained in the future product | Explicitly proposed extension and effect |
| --- | --- | --- |
| `HOME-001` → `HOME-002` | Public identity remains configured, carries no record data, and links to sign-in; HOME-001 is superseded by HOME-002's public product landing. | The product shell may gain authenticated app discovery and exceptions. No public records, views or new sessionless paths follow from the plan. |
| `OPS-001` | Today every operator reads every current record and can perform every current contract mutation; there are no roles. | Add row/field/action rules as a new capability. Upgrade maps existing operators to an explicit legacy scope with exactly their current rights. It adds no record visibility, field exposure, endpoint or action grant. New narrower access requires explicit owner mapping; new collaborators receive only declared scope. |
| `OPS-002`, `OPS-004`, `OPS-005` | Preserve invite/removal, session ending, blocked-removal rules, attribution and personal-data erasure/anonymization behavior. | Add explicit actor, app and grant identity; revoke a collaborator's active grants and future queued work. Erasure can remove/redact personal source content, prompts, extracted data and attachment bytes while retaining only the minimum non-personal audit/tombstone needed to explain the action. No erasure behavior is shipped by this plan. |
| `OPS-003`, `OPS-006` | Preserve IANA timezone behavior and current single ISO currency semantics, including the rule that changing currency relabels rather than converts stored values. | New money fields carry explicit ISO currency/scale and use integer minor units or an exact decimal type; conversions require separately sourced rate, time and authority. New cross-timezone schedules retain instants and declared local-zone intent; old timestamps are not reinterpreted. |
| `VIEW-001`–`VIEW-007` | Retain independent campaign, risk, milestone and decision routes, consistent committed reads, explicit loading/empty/not-found/signed-out/failed states, version conflict handling, search and stable paging. Existing `VIEW-005` search p95 ≤500ms and `VIEW-007` paging limits remain binding. | Add app studio, generic table/form/view screens, role-specific app routes and evidence/run history. A new 1-second p95 target in `PLAN.md` applies only to the new collection/detail/mutation profile; it cannot relax `VIEW-005` or another stricter current clause. |
| `CAMP-001`–`CAMP-014` | Preserve campaigns, lifecycle, validations, detail/rollups, health staleness, overview, grid/custom fields, archive/restore/delete, risk rating, atomic bulk edit/undo and duplicate/date shift semantics. Launch becomes the included template under the 6 October identity transition; every campaign semantic remains binding. | New entity/schema mechanisms may be reused underneath. Do not turn a new generic record into a campaign, alter existing codes/IDs, or silently change any derived count or lifecycle rule. |
| `CAMP-005` | Current health attribution and 14-day stale rule remain. Under the current `campaign.health.v1` default, only explicit operator edit or mapped import can set health; AI output cannot. | Deterministic derived health or evidence-backed health actions need new named policy/clauses and owner approval. No model output may set health unless the owner explicitly accepts a new contract meaning and a typed, scoped grant; confidence alone is insufficient. |
| `DELIV-001`–`DELIV-003`, `MILE-001`–`MILE-006` | Preserve record identity, completion attribution, due/overdue rules, timeline, dependency, readiness request and rescheduling behavior. | Generic tables can host other lifecycles, but cannot change a launch deliverable or milestone without an explicit new typed action, its policy, and a conflict-safe transition. |
| `RISK-001`–`RISK-005` | Preserve risk fields, lifecycle, escalation, isolation and shipped Risks Lens results. | New risk types or linked operational cases are separate schema/versioned concepts; automation or AI does not resolve or escalate current risks unless an accepted action grant allows that exact effect. |
| `DEC-001`–`DEC-008` | Preserve decision queues, assignee, rationale, concurrency, first-outcome-wins, linked-risk policy, terminality and superseding links. | Extend decisions to new app actions only with subject/version, amount/scope, authority and separation-of-duties recorded. A new app approval cannot rewrite prior campaign decisions. |
| `LENS-001`–`LENS-007` | Current saved lenses remain typed to four fixed entity kinds and preserve condition, display, preview, share and result semantics; `LENS-002` preview ≤2s remains binding. | General views target arbitrary stable entity/field IDs with type-checked formulas and policy-filtered results. Existing saved lens IDs/definitions migrate explicitly and keep their meaning. |
| `ACT-001`–`ACT-004` | Keep campaign activity/comments/mentions and immutable actor/time/value attribution; preserve existing audit retention. | Add source, claim, proposal, action, attempt and receipt lineage. New evidence/privacy rules must redact personal content on erasure while retaining non-personal audit facts; no audit history is silently dropped on campaign deletion. |
| `AUTO-001`–`AUTO-011` | Preserve current trigger/version, cancellation, loop, history, retries, fan-out, manual retry and four shipped automation meanings. Current defined actions remain bounded by their clause text. | Add durable typed actions and connectors under new clauses. A new worker cannot claim that current read-only definitions execute or change the retry/idempotency semantics before full fault evidence exists. |
| `NOTIFY-001`–`NOTIFY-008` | Preserve current notification events, quiet-hour policy, delivery records/failure, digest, inbox, deduplication, muting and overdue-decision behavior. | New connector messages, contractor communication and app notifications require declared channel/data effects, action grant, receipt and failure state; they do not broaden the old email behavior automatically. |
| `AI-001`, `AI-002`, `AI-004`–`AI-006` | Preserve labelled immutable analyses, cited inputs, current bounded context, explicit provider failure, usage accounting and daily ceiling. Disabled or unavailable AI leaves ordinary features working. | Add extraction, bounded app construction and orchestration with action-specific context, prompt-injection isolation, cost ceilings and output schemas. Existing context is not widened to comments, custom values, attachments or other apps by default. |
| `AI-003` | AI output currently never changes a record field or sends a notification; proposals remain drafts until an operator saves them. | The accepted new `AGENT-AUTH-001` capability permits only registered typed actions under current scope, preconditions, budgets, expiry, revocation and human authority boundaries. This extends AI-003 for new action services; legacy analysis outputs remain read-only. It grants no arbitrary field-edit or outbound-message access and activates no grants on upgrade. |
| `IMPORT-001`–`IMPORT-005` | Preserve CSV preview, explicit mapping, whole-file validity, atomic commit, staleness/expiry, idempotent replay and stored-file behavior. | Add schema-aware entities and attachments only with previewed mapping, access checks, conflict reports and portable restore. Import cannot invent permissions or execute a new action merely because a row contains instructions. |
| `SET-001`–`SET-003` | Preserve current workspace settings, applied-after-change behavior, honest disabled AI, and first-run/sample-data semantics. | Add app/member/policy/grant/connector, source retention and budget settings with actor/time history. New providers begin disabled; adding configuration alone does not grant them unrestricted context. |
| `DATA-001`–`DATA-003` | Preserve complete export contents, current one-way CSV export and explicit capacity rejection without silent drops. | Include new app schemas, field definitions, records, linked sources, attachment bytes, decisions, grants (revoked state included), attempts and receipts in verified export/restore. Keep actor privacy/erasure semantics; import never reactivates expired/revoked grants. |

The ID ranges above are the complete existing product-clause inventory. Existing
clauses retain their meanings except the explicit accepted transitions in this
crosswalk and RELEASE.json; implementation and release verification remain distinct.
Never reuse an ID. Keep a release-by-release crosswalk so old app data and
decision history can still be interpreted.

## Current out-of-scope declarations

These `seed.json → nonGoals` are current product facts, not permanent prohibitions
against a deliberate future contract. The proposed extension is explicit:

| Current non-goal | Proposed treatment |
| --- | --- |
| Multiple workspaces or tenants | Retain one owner/business installation as the initial scope. Multiple apps and scoped collaborators live within it; cross-customer tenancy is not implied. |
| Roles or granular permissions | Proposed for the new app model, but not enabled on upgrade or for existing operators without an owner-approved permission mapping. |
| Arbitrary tables/schema, formulas and rollups | Proposed core records capability with stable IDs and versioned relational migrations. This is not present in the current lens/schema code. |
| General app building, scripting or generic webhooks | Proposed inspectable app construction and declared typed adapters. Arbitrary runtime script execution and unrestricted webhook effects are not required. Owners can edit full product source. |
| Public/embeddable views | Remains out of current proposal. Authenticated role-specific internal apps are in scope. Any public surface requires a separate privacy/origin contract. |
| Bidirectional SaaS/spreadsheet sync | Not promised. Explicit source-owned read/write connectors with per-field authority and reconciliation may be added; broad sync remains a separately scoped product decision. |
| Automatic dependency rescheduling/critical path and resource/capacity planning | Automatic launch dependency rescheduling remains excluded. New PORTFOLIO-PLAN-001 adds independently checked resource/capacity planning with current source versions, units and authority; accepting a strategy alone grants no effects. |
| General task management | Remains a neighboring product purpose, not a side effect of owning generic records. |
| Autonomous AI mutations or outbound communication | Proposed only as named typed actions under an explicit owner grant, policy and budget. Legacy AI-003 analysis remains read-only; AGENT-AUTH-001 governs the separately authorized typed-action capability. |
| Other notification channels | Each connector/action must be explicitly declared; no universal delivery channel follows from the plan. |
| File attachments on records | Proposed as private, policy-checked source/evidence objects with export, restore, provenance and erasure. Not current behavior. |
| Editorial content calendars/customer feedback | Remain separate product purposes; the launch app retains its current exclusions. |
| Native mobile applications | Responsive mobile web is planned. A native app is not in scope without a separately justified product decision. |

## Shared baseline remains binding

Every baseline clause remains in force: `BASE-ACCESS-001`–`004` (sign-in,
sessions, public paths and server-side authorization); `BASE-INPUT-001`–`003`
(validation, safe HTML/text and private bounded uploads); `BASE-SECRET-001`–`002`
(no leakage and fail-visible configuration); `BASE-DATA-001`–`005` (portable
records/attachments, retention, erasure, declared egress and independent
deployment); `BASE-PUBLIC-001`–`003` (privacy/origin/accessibility where relevant);
and `BASE-OPS-001`–`005` (health, recoverable migrations, idempotent handlers,
visible failure and durable audit).

New sources and attachments strengthen the need for explicit retention,
access-controlled retrieval and deletion. They do not waive baseline privacy,
outbound-flow, export or erasure obligations. Audit preservation means retaining
only the non-personal event/decision facts required to explain what occurred;
personal source text, prompts, OCR, photos, credentials and other content are
redacted or erased under the accepted owner policy. Backups and restore tests
must show those rules actually hold.

## Safe transition rule

For any future released extension:

1. identify each old clause and baseline clause affected;
2. state old and new semantics and why the owner wants the change;
3. preserve current data and applied migrations, with a forward and recovery
   path;
4. default to the existing access and action scope, with new grants disabled;
5. test every ingress/egress path, actor, denial, revocation, replay, archive,
   export and restore relevant to that change;
6. record accepted supersessions by exact stable IDs in release metadata and
   preserve prior meaning for old data/history.

A clean migration, passing upstream suite, generated schema or AI suggestion is
not authorization to broaden exposure or alter business meaning.

## Accepted transition identifiers

- `BASE-ACCESS-002`: Start owns authenticated document/server-function transport;
  Hono owns explicit HTTP families. Every ingress independently authorizes.
  Native protected-document redirect remains 303 to `/signin?next=`.
- `OPS-001` / `APP-SCOPE-001`: prior operators retain precisely legacy launch
  rights. New app/row/field/action scopes require explicit mapping and default off.
- `AI-003` / `AGENT-AUTH-001`: new typed actions use current grant and policy,
  atomic admission, budgets and receipts. Existing analysis stays read-only.
- `AI-002`, `AI-004` / `AGENT-CONTEXT-001`: new purpose-specific model contexts
  and durable jobs do not widen old analysis inputs or its 60-second timeout.
- `DATA-003` / `CAPACITY-001`: 100 operators and 40 concurrent sessions are the
  new explicit target, not a measured claim; retained record/latency limits apply.
- `PORTFOLIO-PLAN-001`: new resource planning is independently checked and stale
  inputs invalidate plans; no automatic legacy milestone rescheduling.

All replacements require observable tagged checks before release acceptance.
RELEASE.json records an unreleased development transition, never a ready version.

## BASE-ACCESS-002 transport clarification — 29 September 2026

Old wording, in full:

> A session expires after at most 30 days of inactivity; sign-out revokes that session. Every operator endpoint requires a valid session and returns 401 without one.

New wording, in full:

> A session expires after at most 30 days of inactivity; sign-out revokes that session. A valid session is required before an operator request reads private product data or performs its requested action. A protected operator document and each private generated server-function handler validate the session independently; a document gate does not authorize a function call. For an otherwise-admissible request that reaches session validation, a protected operator HTTP API returns 401 when the session is missing, expired, or revoked; a protected document returns its native sign-in response; and a generated transport may encode an identifiable session denial or sign-in redirect in its framework protocol, including a 200 serialized redirect. No such denial response exposes private product data or performs the requested mutation. Declared public exceptions remain governed by BASE-ACCESS-003, and host, method, Origin/CSRF, input, and runtime guards retain their normal order.

This is a breaking semantic clarification of response protocols, not an authorization expansion. The old universal 401 wording conflicts with the retained native document 303 and Start serialized redirect. Protected APIs remain 401 before product reads; documents preserve 303, absolute same-origin `/signin?next=` location and empty body; private generated functions independently deny missing, expired and revoked sessions. Host, Origin and valid input controls remain separate. The actual reporter is `tests/contract.mjs` and the registered matrix is `tests/start-runtime.mjs` (`[BASE-ACCESS-002]`), with parameterized detail controls in `tests/start-resources.mjs`. A missing/expired/revoked request must satisfy the same generated wire protocol as its valid positive control. No full baseline-pack or flagship acceptance is implied.

## Records-first identity — 6 October 2026

The records-first direction applies: records builder leads,
launch readiness becomes the included template, repairs navigation is hidden unless
`enableRepairs` is true in owner configuration. This identity transition changes no stored data or authority.

Changed meanings: HOME-001 describes a records workspace; VIEW-001 has one Home,
records-first navigation and grouped launch-template routes; RECORDS-001 names the
records capability. APP-SCOPE-001 retains exact legacy launch rights. Former
launch-only non-goals for typed schemas, granular access, formulas, rollups and
private attachments are removed; their wider acceptance remains explicitly open.
CAMP/DELIV/MILE/RISK/DEC/LENS/ACT/AUTO/NOTIFY/AI/IMPORT/SET/DATA clauses and every
BASE clause retain their data, authority, privacy and operational guarantees.

No migration or stored data changes accompany this transition. Existing IDs,
launch lifecycle, analysis limits, permissions, grant state and source history
remain intact. Repair visibility is a navigation preference, never authorization;
its APIs independently enforce current policy. No provider is activated. Existing
launch routes remain reachable. The obsolete unmounted Today component is removed.

Default verify gains records and all launch test files. Isolated authoring is a
separate opt-in profile, not a waiver of its release gate. Tests/foundation-shell.mjs
covers responsive navigation, theme, unknown-route HTTP status and remote-host
local-identity denial. Hosted bootstrap and sign-in proof require accepted Base
modules and separately authorized deployment; local checks cannot substitute.

## Public product landing — 8 October 2026

The owner asked for a public product landing page at `/`. The shipped page is the owner's
chosen hero (the headline "Everything comes together in one place." above ribbons of data
streaming into one Projects screen) followed by sections for tables, views, safe schema
changes, the practical parts (CSV, automations, read-only AI) and ownership, each a
decorative close-up of Cradle's own screens, then a closing call to action and the footer
with the credit. `HOME-001`
(owner identity plate) is superseded by the new clause `HOME-002`; the old ID is
retained in `CONTRACT.md`, marked superseded, and is never reused.

Changed meanings: HOME-001 forbade any feature tour on `/`. HOME-002 allows the page to
describe the capabilities the contract ships (typed tables, guarded schema changes,
views, CSV, visible automations, optional read-only AI, self-hosted ownership) and still
forbids pricing, testimonials, customer logos, metrics and unshipped integrations.

Retained guarantees: no record content or public views on `/`; a link to `/signin`; the
credit to `https://runeditrun.com` is visible by default, configurable off, static, with
no telemetry or phone-home; the product name, hero line and workspace name come from
configuration and the persisted workspace. New: scroll motion never leaves content
hidden (reduced motion, no script, normal scrolling) and the page requests nothing from
another origin. Security consequences: none. No new sessionless path (fonts and assets
use existing `/fonts/` and `/assets/`), no data or migration change, and every other
page using the shared public layout (sign-in, not-found, error) is unchanged. Tests:
the former HOME-001 tests are retagged HOME-002 and assert the landing; `seed.json` maps
the `public-landing` capability to HOME-002. The page lives in
`src/core/app/screens/landing/`; owners may rewrite its copy and illustrations freely.

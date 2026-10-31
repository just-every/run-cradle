<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Cradle installation

The primary journey: move in an existing operations app, review its typed records and relationships, build the views and forms the team uses, set its authority, and run its daily work with visible automation outcomes and portable exits.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 62 | 140 | 46 | 248 |
| Agent surface | 0 | 0 | 9 | 9 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 62 | 140 | 55 | 257 |

Judged from the code and tests at commit `d7dc8100256a244030024bb616a746d7f0ade6d0` (27 October 2026). Field proof register: 15 rows; 0 passed, 0 failed, 15 not run.

## Core

### Records, schema and the app model

#### RECORDS-001 — Records builder

Core · published · **done** · Cites BASE-ROLE-001, BASE-ACCESS-004

**Requirement.** Authenticated operators discover only the bases their current authority allows, open their typed records and views, and use record forms, relationships, bulk edits and CSV import.

**Acceptance.**
1. Native and legacy HTTP doors refuse forbidden reads and writes after a policy change; desktop and phone browser journeys open only authorized bases.

**Evidence.** `tests/ui-records-builder.mjs` — "[SNAP-002] Manual records browser journeys and concrete UI review corrections"; `tests/launch-write-authority.mjs` — "native and legacy HTTP reject forbidden writes and return permitted ones only through readable fields"; `tests/launch-scoped-authority.mjs` — "every retained launch transport enforces current rows, fields and membership"
**Gap.** None.

#### RECORDS-002 — Manual schema adoption

Core · published · **partial** · Cites BASE-ROLE-001, BASE-OPS-002, BASE-DATA-001

**Requirement.** An owner or creator builds tables with typed fields, linked-record fields and lookups without an AI provider. Every schema change shows an impact preview naming the changes, the affected records and any destructive value removal before adoption; an agent's adoption carries live, adding access for changed authority, external for new outside exposure and destructive for value removal without recovery, and the company's policy decides the call; who may adopt which change within a base (a base owner for any change, a creator alone for additive changes, editors never) is PERM-009, and views are not schema (PERM-009). Adoption rechecks the preview against current schema, records and authority and applies the accepted change atomically. Removed field values have an authorized recovery export. Field type conversion and table deletion follow FIELD-002.

**Acceptance.**
1. Builder journey at 1440 and 390 adopts a table/field/link/lookup change; a stale preview, stale schema or lost authority is refused with nothing changed.

**Evidence.** `tests/records-manual-release.mjs` (including “RECORDS-001 RECORDS-002 stale data, schema, policy and session preview refusal table is atomic”; “RECORDS-001 RECORDS-002 recovery export journey preserves references, restricted custody, newer edits and original record identities”; “RECORDS-001 RECORDS-002 schema preview permission refusal table preserves restricted rows, fields and shared memberships”), `tests/records-manual-roundtrip.mjs`, `tests/helpers/records-picker-journey.mjs`, `src/domains/records/manual/service.server.ts`, `docs/contract/RECORDS-002/`
**Gap.** Missing a cited builder journey at 1440/390 for table, field, link and lookup adoption. The old cited manual-release/manual-roundtrip/picker journeys prove HTTP schema preview, atomic refusal and recovery; tests/ui-records-builder.mjs contains the browser authoring journey but is absent from the old RECORDS-002 Evidence cell.

#### RECORDS-003 — Records views

Core · published · **done** · Cites BASE-ROLE-001, BASE-ACCESSIBILITY-001

**Requirement.** Authorized operators see human field and select labels and linked-record chips. A grid supports sort, filter and group; saved views preserve those choices, and kanban and form views use the same current records and server-side policy. Records journeys operate at desktop and phone widths without horizontal page overflow. The wider view set is VIEW-008 to VIEW-014.

**Acceptance.**
1. Saved grid/board/form round trip and browser journeys at 1440 and 390 with axe.

**Evidence.** `tests/records-manual-roundtrip.mjs` — "saved grid and board survive field removal and export current view CSV, base JSON and all-table CSV through HTTP"; `tests/ui-records-builder.mjs` — "[SNAP-002] Manual records browser journeys and concrete UI review corrections"; `tests/ui-recut-final.mjs` — "final records review preserves spacing, hierarchy and reachable records on desktop and phone"
**Gap.** None.

#### RECORDS-004 — View CSV and templates

Core · published · **done** · Cites BASE-DATA-001, BASE-ROLE-001

**Requirement.** An authorized view export contains its selected records in the view's query order and its visible fields in their displayed order. Import into an equivalent fresh table previews creates, updates and errors before committing and preserves typed values, select labels, nulls and linked references; lookups are recomputed. Customer relationships and Project tracker provide editable starting schemas through preview and adoption; Launch readiness opens the included base without creating a duplicate. Formulas, rollups and the wider field set are CALC-001 to CALC-005 and FIELD-001. Recurring CSV and .xlsx imports that merge into an existing populated table are RECORDS-008.

**Acceptance.**
1. Per-view CSV export compared field for field against a fresh-table re-import; template adoption journey.

**Evidence.** `tests/records-manual-roundtrip.mjs` — "RECORDS-001 RECORDS-004 fresh table CSV restores nullable select labels, real links and recomputed lookup exactly"; `tests/records-csv-fence.mjs` — "CSV, workbook and Sheets imports retain review, mapping, scheduled merge and export fences"
**Gap.** None.

#### RECORDS-005 — Reviewed base import

Core · published · **partial** · Cites BASE-DATA-001, BASE-ROLE-001, BASE-OPS-003 · Rules D-1

**Requirement.** An authenticated owner previews 1–20 source CSV tables or one supported native base JSON with no database writes. Preview names every type conversion, rejected row, skipped nonempty value, unresolved or ambiguous reference and reciprocal disagreement; mapping changes invalidate acknowledgment. Explicit review and the existing schema-impact/release adoption path create a retained, bounded import job. Resume needs only current authority and job ID. Independent native reconciliation names missing, duplicate, extra and mismatched effects. Undo or partial rollback reverses unchanged imported record/link and saved view/form effects; edited effects remain conflicts, base schema and exact source custody remain. Wrong format/version/type, duplicate identities, dangling native links and capacity violations fail before writes. Imported content follows D-1; every completed, partial or undone job yields its retained move-in receipt and skipped-attachment list. Live source-account move-in is MIGRATE-001 to MIGRATE-004.

**Acceptance.**
1. A preview of native or CSV source data changes no records and reports each conversion, rejected row, skipped nonempty value, unresolved or ambiguous reference and reciprocal disagreement; remapping invalidates its acknowledgment.
2. Adoption retains a bounded job; after interruption, current authority and its job identity resume it. Independent reconciliation identifies missing, duplicate, extra and mismatched effects.
3. Undo and partial rollback reverse unchanged records, links and saved views or forms, preserve edited effects as conflicts, and retain base schema and exact source custody.
4. Wrong format, version or type, duplicate identities, dangling links and capacity violations are refused before writes.
5. Through the import, restart, rollback and Undo doors, D-1 is preserved; later ordinary owner edits still cause their normal effects.
6. A native completion, needs-attention or failure notice reaches only the retained authorized starter under NOTIFY-009, with opt-in and preference rules; imported collaborators receive no replayed mentions.
7. The move-in receipt and skipped-attachment list reconcile with the retained job at desktop and phone widths. Import/export, archive/restore and erasure during an active import remain part of the same retained lifecycle proof.

**Evidence.** `tests/records-import-d1.mjs`, `tests/records-import-undo-restart.mjs`, `tests/records-import-receipt.mjs`, `tests/ui-base-import.mjs`, `tests/ui-base-undo.mjs`; NOTIFY-009 reports the native job’s own completion or failure only to its retained starter (`tests/helpers/notification-delivery-matrix.mjs`), erasure of a starter whose import attempt is live is proven in `tests/lifecycle-erasure.mjs`, and `tests/rer-retained-archive.mjs` and `tests/rer-integrations-archive.mjs` passed in c45 Verify 40427855179. The populated-state integration archive also passed at commit 49fcc1d730371851d5c718ce6a5aa109808e23d3 through the existing registration.
**Gap.** Missing a public import journey for SCALE-002 wider tables. Cited import and receipt journeys cover retained jobs, current bounded tables, restart and conflict-preserving reversal; the old Gap explicitly refuses above 80 fields/100 physical columns.

#### RECORDS-006 — Portable base exits

Core · published · **partial** · Cites BASE-DATA-001, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** A complete base JSON export preserves ordered native tables/fields, primary identities, types/options/relations/lookups/incoming metadata, typed records and ID links, saved view and authenticated form definitions through a deliberate portable allowlist. Every table, field and included view/form requires current authority; complete row/join/schema/metadata sets and authority are fenced, and restricted or changed content fails closed. Fresh-install return through RECORDS-005 preserves canonical content and IDs except the documented capture envelope; an existing-install copy uses a complete bijective identity map. One CSV-set download contains every table and field, primary first, with raw primary-value link quotation and public review choices; explicitly reviewed, byte-bound correspondence preserves every record, ordered link and complete ordered select option list, including distinct duplicate-primary targets and null/empty/false values. Raw reference classifications remain truthful, and selected/materialized counts remain separate. Loading correspondence accepts no choices; ordinary CSV ambiguity never chooses a first match. CSV excludes saved views/forms and prior source custody. Existing per-view CSV keeps its scoped semantics. The current installation owner can prepare and download a verified whole-installation .rer archive in Settings, using the same format and privacy policy as rer export. Credentials and private connection settings are excluded; source is retained separately. Wider data lifecycle acceptance remains separately recorded. Formulas, attachments, interfaces and automations all belong to this allowlist under RL-2 (FILE-003, FILE-004, FILE-007, IFACE-001, AUTO-USER-002) so an exit always carries the whole app.

**Acceptance.**
1. Opening base JSON and CSV exits, a fresh return and a copy preserves the required content, ordering and reviewed identities; an unauthorized or changed export is refused, and the owner can download a verified installation archive from Settings.

**Evidence.** `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”), `tests/records-base-edge-return.mjs`, `tests/ui-base-exits.mjs`, `tests/installed-home.mjs`
**Gap.** Missing the whole-app exit/return journey including uploaded attachment bytes, complete store-reference return choices, and SCALE-002 width. Cited journeys prove current portable records/schema/views/forms and installation archives; the old Gap says attachment exits/returns and >100-column proof remain incomplete.

#### RECORDS-007 — Agent-proposed schema changes

Core · published · **partial** · Cites BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-005, BASE-AGENT-007, BASE-AGENT-008, BASE-AGENT-009, BASE-AGENT-012

**Requirement.** The installation owner can issue a proposing key: a one-time machine credential stored as a digest, for one manual base or a new one, expiring within 30 days and revocable from Settings. It reaches only the proposal door, whose REST and MCP faces run the same tools: read the schema the issuing owner may currently read, propose tables, typed fields, links, lookups, views and forms and receive the RECORDS-002 impact preview with affected-record counts but never record identities or values, and list, read or withdraw its own proposals. Every other route or tool answers as missing; the key cannot adopt, read or write records, manage keys or see another key's proposals. A proposal is inert: its names, help text and notes are stored text and create no grant, membership, credential, automation, connection, outbound call or outbox row. Adoption rechecks the stored preview against current schema, records and the issuer's authority and requires the proposing key to be current; a proposing key itself has no adoption scope. An adoption by an agent with the separate adoption scope carries live, adding access, external and destructive where the current preview changes authority, exposes content outside or removes values without recovery, and the company's policy decides it; stale, declined, withdrawn and revoked-key proposals are refused and change nothing, and a replayed adoption returns its first result. After an owner adopts, the adoption audit row names that owner, the proposal and the key, and the release records the preview hash; an agent adoption remains attributed to the agent under the inherited Base duty. A proposal stays reviewable for 7 days; when an owner declines it, the agent can read the note. The company's policy decides whether the standard proposal or its live adoption is held for that decision. Model-authored proposals inside Cradle are not part of this clause. Model-authored proposals from the owner's files are AGENT-001.

**Acceptance.**
1. REST and MCP proposal door tests with the official MCP SDK client; 67 door cases.

**Evidence.** `tests/records-agent-proposals.mjs`
**Gap.** Missing a public journey computing this action's risk classes and applying both the held and all-autonomous company policies. The cited journeys show the earlier person-driven or fixed-control behavior.

#### APP-SCOPE-001 — Explicit application scope

Core · published · **done** · Cites BASE-ROLE-001, BASE-ACCESS-004

**Requirement.** Existing operators retain exactly their legacy launch rights. Enabling repair navigation in the documented product implementation grants no record visibility or actions and does not activate mandates, providers or background work. New scopes require explicit owner mapping.

**Acceptance.**
1. Repeated setup and legacy mapping preserve explicit scopes and revocations.

**Evidence.** `tests/launch-scoped-authority.mjs` — "reviewed legacy mapping retains identities and rights without replacing an existing scoped policy"; `tests/launch-setup-race.mjs` — "setup replay preserves deleted memberships for legacy and first-owner mappings"
**Gap.** None.

### Automations and follow-up

#### AUTO-USER-001 — Approved record triggers

Core · published · **partial** · Cites BASE-ROLE-001, BASE-OPS-003, BASE-AUDIT-001, BASE-MAIL-001

**Requirement.** An automation author (AUTO-USER-009 names who: base owners and creators) with current app and record access can create, edit, disable and renew created/updated record triggers with ordered notify, email, update, webhook and Slack actions. An enabled automation runs for the lifetime AUTO-USER-009 sets: until disabled or until its author's authority lapses, with any expiry being an owner-set policy announced in advance. Each committed native change captures the enabled definition versions atomically. AUTO retains run/action history and the approved definition snapshot. Disable cancels queued work; lost issuer, app, subject or credential authority stops new effects, and an operator recipient who loses authority stops receiving that effect. Email to addresses that are not operators (customers, vendors, requesters) needs no recipient authority, so removing an operator stops only the sends addressed to that operator (AUTO-USER-011). Repeated queue delivery preserves one logical run/effect. A repeated automation or excessive causal depth is recorded as Suppressed. External uncertainty is visible and never authorizes automatic resend.

**Acceptance.**
1. Automation tests on emitted workerd; browser journey for definition and run history.

**Evidence.** `tests/user-automations.mjs`, `tests/ui-user-automations.mjs`, `src/domains/automations/capture.server.ts`, `src/domains/authority/user-delegation.server.ts`
**Gap.** Missing a cited author-lifetime journey with no expiry until disabled and an owner-set announced maximum. The cited journeys always supply a one-day or 29-day expiry; they prove bounded saved triggers and revocation, but not the stated no-expiry lifetime.

### API, webhooks and integrations

#### API-USER-001 — Scoped revocable keys

Core · published · **partial** · Cites BASE-ROLE-001, BASE-ACCESS-004, BASE-SECRET-001

**Requirement.** The owner can issue a random one-time key for one app and entity, read access or approved create/update access, and a lifetime under API-USER-004: no expiry until revoked, or a date the issuer chooses, within any owner-set maximum. Only a digest is stored. Keys grant neither administrative authority nor browser sessions. Listing returns safe metadata. Key revocation, issuer policy/membership/epoch/owner changes and expiry fence current reads and atomic writes. Interrupted issuance cannot reveal the same secret again.

**Acceptance.**
1. API key tests across issue, use, revoke and expiry.

**Evidence.** `tests/user-api-keys.mjs`, `src/domains/authority/user-keys-http.server.ts`, `src/domains/authority/user-delegation.server.ts`
**Gap.** Missing a cited no-expiry key journey and complete credential-expiry, issuer epoch/membership/ownership transition fencing through reads and writes. Cited tests use fixed one-day keys, execute grant expiry and issuer-policy narrowing, and do not cover the full lifetime/source-authority promise.

#### WEBHOOK-USER-001 — Private destinations and signed delivery

Core · published · **done** · Cites BASE-SECRET-001, BASE-SECRET-002, BASE-DATA-004, BASE-OPS-003

**Requirement.** Webhook and Slack destination URLs are immutable encrypted configuration. A new webhook signing key is shown once and is never recoverable from history or later listing. Exact Base integrations prepare signatures and classify delivery. The trusted relay uses Base public-DNS-pinned verified TLS, HTTPS-only destinations, no redirects, bounded requests/responses and timeouts. The native relay command is source only; the owner provisions its HTTPS endpoint.

**Acceptance.**
1. Webhook and Slack delivery tests at the network edge.

**Evidence.** `tests/user-webhooks.mjs` — "real Worker signed delivery preserves ordered replay, delete resynchronization and policy-narrowed restores"
**Gap.** None.

### Public landing and docs

#### HOME-002 — Public product landing

Core · published · **partial** · Cites BASE-PUBLIC-001, BASE-DATA-005 · Register R-2, R-3

**Requirement.** Cradle's public run site presents the product in its configured theme and type, using the visible copy mapped in Homepage claims.

**Acceptance.**
1. The shared header names Cradle and links to Docs and its public source. The hero shows ‘Everything comes together in one place.’, the configured supporting description, the free open-source Airtable and Smartsheet alternative line, Run Cradle, a docs link and decorative data flowing into a Projects screen.
2. Illustrated sections show typed and linked tables, views, guarded schema changes, CSV movement, visible automations, optional read-only analysis and ownership with coding agents. At least two sections link quietly to their published importing, automation, installing or leaving guide; every Docs link resolves.
3. The closing action repeats Run Cradle and links to Docs. The shared footer retains section anchors that also work from Docs, docs/source links, the source MIT licence link and an optional configured product credit, visible initially and removable through configuration.
4. Copy claims only delivered capabilities. No records, public views, pricing, testimonials, customer logos, metrics or undelivered integrations appear.
5. Every section remains visible with reduced motion, without script and after scrolling. The page loads no resource from another origin, reads no installation data and links no installation-only door.
6. Run Cradle reaches the Run page, which shows the two commands for running the public Cradle source.

**Evidence.** `tests/foundation-shell.mjs`, `tests/ui-local-signin.mjs`
**Gap.** Missing a cited built run-site journey through the homepage hero, all illustrated sections, guide links, footer credit toggle, Run commands, reduced-motion and scriptless visibility. Both old cited journeys exercise installed app/Lobby/auth paths, not the static product landing.

#### HOME-003 — Installed Lobby

Core · published · **done** · Cites BASE-ACCESS-002, BASE-ACCESS-003

**Requirement.** The installed front door shows Cradle's lockup, one line and one action according to the durable owner claim, independently of workspace first-run details.

**Acceptance.**
1. Before the owner claim, the action is Finish setup; after it, the action is Sign in and the line names the persisted workspace, including a later rename, or its configured public name when the name cannot be read.
2. The public setup-state read reports only whether the same durable owner claim exists and is not cached.
3. A signed-in app visit still requires the first-run details of SET-003. Every visitor gets the same script-free Lobby, with no further installation disclosure.

**Evidence.** `tests/installed-home.mjs` — "[OPS-006] [OPS-003] The installed Lobby recognizes the owner claim, validates workspace setup, preserves money on relabel and moves workspace schedules"; `tests/public-document-runtime.mjs` — "Actual emitted public SSR survives unavailable workspace names and recovers persisted renames"
**Gap.** None.

#### DOCS-001 — Public docs

Core · published · **partial** · Cites BASE-DOCS-001, BASE-PUBLIC-001, BASE-ACCESS-003 · Register R-2, R-3

**Requirement.** Every page in the published docs navigation is served without a session from its Markdown source inside the product page’s shared header and footer (HOME-002), with Docs marked as current and the page’s editable source linked on GitHub. The installed instance also links sign-in; the run site serves the same pages statically without it. Exact document and source-link paths are recorded in the product mechanism guide. A slug that is not listed is a genuine 404, never a redirect or an empty page. Links between pages and to repository files resolve at build time, and a broken link or anchor fails the build. A page loads no script, style, font or image from another origin; outbound links are plain anchors. The docs show no record content and expose no sessionless product data.

**Acceptance.**
1. Public document and built-site journeys open the landing, docs, setup and sign-in surfaces.

**Evidence.** `tests/public-document-runtime.mjs`, `tests/start-resources.mjs`
**Gap.** Missing a cited built-site/broken-link journey proving build-time Markdown link/anchor refusal and the static site’s sign-in-free chrome. Existing cited journeys read the installed docs and genuine 404s, but do not build/check those static-site outcomes.

### Operators

#### AUTH-BASE-001 — Cradle identity admission

Core · published · **partial** · Cites BASE-ACCESS-001, BASE-ACCESS-002, BASE-ACCESS-003, BASE-ACCESS-004, BASE-SECRET-001, BASE-SECRET-002, BASE-INSTALL-001, BASE-MAIL-001 · Register R-12

**Requirement.** Cradle maps identities admitted by Base to existing product identities and the app, row and field authority those identities hold.

**Acceptance.**
1. An empty installation can establish its configured first owner independently of mail or an existing session; replacing the deployment setup credential cannot reset that completed claim.
2. An admitted owner completes durable first-run details unless installation configuration already supplied them under SET-003. A complete email login hint fills the sign-in form's email field, including when the deployment's Open app action supplies the claimed owner's address.
3. A prepared Cradle mutation loses admission when its Base session is revoked.
4. Local and hosted installations expose no captured-mail inbox or outbox. Hosted mail failures give actionable guidance; an unclaimed installation directs its host to finish deployment.
5. Absent owner configuration admits neither the legacy sign-in path nor legacy product cookies.

**Evidence.** `tests/auth-base-only-runtime.mjs` (including “AUTH-BASE-001: emitted production rejects missing OWNER_EMAIL despite complete legacy mail configuration”), `tests/launch-production-composition.mjs`, `tests/local-auth-runtime.mjs`
**Gap.** Missing a journey in the old Evidence set that prepares a product mutation, revokes its Base session and proves refusal with no effect, plus the local rer-dev/private-setup and durable first-run paths; the cited files exercise production bootstrap and sign-in, not these retained paths. Existing local dev/first-run browser journeys are in ui-local-signin.mjs and installed-home.mjs, which this old Evidence cell does not cite.

#### OPS-001 — Equal operators

Core · published · **partial** · Cites BASE-ROLE-001

**Requirement.** Legacy Launch operators retain equal rights within the included template.

**Acceptance.**
1. Every legacy launch operator can read every launch-template record and perform every mutation in that retained scope.
2. New app access remains explicit under APP-SCOPE-001.
3. The only restrictable action is inviting and removing operators, under the operator-management policy.
4. There are no roles.

**Evidence.** `tests/launch-production-composition.mjs`, `tests/launch-scoped-authority.mjs`
**Gap.** Missing a legacy-operator journey that executes representative permitted mutations as well as reads while demonstrating the launch-only equal-rights scope. Cited `tests/launch-production-composition.mjs`, `tests/launch-scoped-authority.mjs` show: Retained legacy read access and explicit scoped-policy/membership preservation are exercised.

#### OPS-002 — Management

Core · published · **partial** · Cites BASE-SIGNIN-001, BASE-ACCESS-001, BASE-DATA-003

**Requirement.** Settings supports operator management and safe ownership handover.

**Acceptance.**
1. The operator configured at setup can be removed only by themselves, so every operator record stays removable and erasable by an operator.
2. Because the installation always keeps an active owner, that owner first hands ownership to another active member in settings — after a fresh email-link confirmation of their own identity — and can then remove themselves once they own no active campaign and hold no unresolved assigned decision.
3. The initial operator-management policy allows any operator to invite or remove.

**Evidence.** `tests/launch-operator-doors.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** Missing a Settings invitation journey that creates an operator and reads the resulting admitted identity; cited journeys create their people with fixture helpers. Cited `tests/launch-operator-doors.mjs`, `tests/ui-launch-operator-doors.mjs` show: Settings handover/removal with fresh identity confirmation, last-owner refusal and self-removal are exercised.

#### OPS-003 — Workspace timezone

Core · published · **partial**

**Requirement.** The workspace timezone controls the operation’s displayed times and future schedules.

**Acceptance.**
1. Setup requires a valid IANA workspace timezone and rejects any other value with a validation error.
2. Changing it re-renders every displayed time and moves the next fire time of every schedule in this contract; it leaves stored UTC timestamps byte-identical and moves no run already queued and no email already sent.

**Evidence.** `src/core/features/setup/server.ts`, `src/domains/channels/settings.server.ts`, `tests/installed-home.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Explicit-zone owner-authored schedules do not move with the workspace; shared Timestamp presentation uses browser timezone. Shipped schedules, deadline redisplay, IANA validation and preservation have named proof.

#### OPS-004 — Removing an operator

Core · published · **done** · Cites BASE-ACCESS-002, BASE-SIGNIN-001, BASE-ROLE-001

**Requirement.** Operator removal withdraws future participation while preserving attributed work.

**Acceptance.**
1. Removing an operator drops them from digest recipients, and cancels their outstanding readiness requests.
2. Removal is rejected, naming each blocking record, while that operator owns an active campaign or is the assignee of an unresolved decision.
3. Risks, deliverables, milestones, comments, activity entries, and AI analyses keep their attribution to the removed operator, and a lens condition naming them returns zero results rather than an error.

**Evidence.** `tests/launch-operator-doors.mjs` — "the sole owner hands over ownership after a fresh confirmation, the installation keeps exactly one owner, the former owner removes themselves, Base operator routes cannot remove the owner, and scheduled CSV and Parquet exports to every destination follow current policy before a leaver is removed and erased through company SCIM for good"
**Gap.** None.

#### OPS-005 — Erasing an operator

Core · published · **done** · Cites BASE-DATA-003, BASE-AUDIT-001

**Requirement.** Erasing a removed operator anonymizes retained work and removes their personal delivery state.

**Acceptance.**
1. A removed operator can be erased under `BASE-DATA-003`.
2. Erasure replaces their name and email with a stable anonymous label wherever they appear, deletes their notifications and delivery records, keeps the comments, activity entries, and decision outcomes they authored under that label, and cannot be undone.

**Evidence.** `tests/launch-operator-doors.mjs` — "the sole owner hands over ownership after a fresh confirmation, the installation keeps exactly one owner, the former owner removes themselves, Base operator routes cannot remove the owner, and scheduled CSV and Parquet exports to every destination follow current policy before a leaver is removed and erased through company SCIM for good"
**Gap.** None.

#### OPS-006 — Money

Core · published · **done**

**Requirement.** The workspace uses one explicit currency for its budgets and spending.

**Acceptance.**
1. Setup requires an ISO 4217 workspace currency.
2. Budget and spend are stored as minor-unit integers in that currency and are displayed, summed, and exported in it.
3. Changing the currency relabels stored amounts and never converts them.
4. The Campaign Grid's budget and spend totals cover the rows currently shown and label that scope.

**Evidence.** `tests/installed-home.mjs` — "The installed Lobby recognizes the owner claim, validates workspace setup, preserves money on relabel and moves workspace schedules"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

### Operator views

#### VIEW-001 — Operating surfaces

Core · published · **done**

**Requirement.** The signed-in workspace presents Records and the included Launch template in one navigation shell.

**Acceptance.**
1. One Home in the signed-in workspace leads with Records and links to App studio.
2. Launch readiness is grouped as an included template: Portfolio Overview, Campaign Grid, Risks Lens, Timeline Lens, Campaign Detail, Lens Builder, Decision Queue and Automation Monitor retain their routes in the same October theme and navigation shell.
3. Repair navigation is opt-in.
4. Unknown document routes show a useful not-found page.

**Evidence.** `tests/foundation-shell.mjs` — "one themed responsive shell, records-first navigation, 404 and Base sign-in without a mail viewer"
**Gap.** None.

#### VIEW-002 — Selected detail

Core · published · **done**

**Requirement.** Selection shows the chosen record without stale content from a previous selection.

**Acceptance.**
1. Selecting a campaign, risk, milestone, or decision shows that record's own fields and the records linked to it.
2. No field and no identifier of a previously selected record stays visible.

**Evidence.** `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### VIEW-003 — Cross-view consistency

Core · published · **done**

**Requirement.** Views agree on the committed results of completed mutations.

**Acceptance.**
1. A read issued after a mutation's success response returns that mutation's committed state and the counts derived from it on Home, Portfolio Overview, Campaign Grid, Campaign Detail, every lens, Decision Queue, and Automation Monitor.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/helpers/launch-consistency-clauses.mjs` — "verifyConsistencyClauses"
**Gap.** None.

#### VIEW-004 — Explicit states

Core · published · **partial**

**Requirement.** Collection and detail surfaces make their current state explicit.

**Acceptance.**
1. Every collection and detail surface renders exactly one of loading, empty, not found, signed out, or failed.
2. The failed state names the operation that failed and offers a retry; it renders no rows, no sample data, and no result of an earlier successful read.
3. An action a policy forbids is refused with a stated reason and changes nothing.

**Evidence.** `tests/launch-authority-browser.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a collection/detail state journey that observes loading and signed-out transitions, fails after a populated read and checks no stale rows, and attempts a policy-forbidden action with no effect. Cited `tests/launch-authority-browser.mjs`, `tests/ui-launch-walkthrough.mjs` show: Scoped/missing and real D1-failure screens with retry plus some empty states are exercised.

#### VIEW-005 — Search

Core · published · **partial**

**Requirement.** Global search finds readable records across authorized bases and retained Launch work.

**Acceptance.**
1. Global search matches case-insensitive token prefixes across readable text, URL and select values in every authorized base, returning at most 20 results per table linked to their record detail.
2. Launch readiness retains campaign name/code/summary and deliverable/risk/milestone/decision title search.
3. Current row and field policy is rechecked before responding; inaccessible cells cannot produce matches.
4. Comment text is excluded.
5. Archived records are returned only when explicitly included.
6. Search meets its 500ms response target.

**Evidence.** `tests/launch-search-authority.mjs`
**Gap.** Missing a search journey for text, URL and select prefix matches, comment exclusion and archived opt-in, the twenty-results-per-table bound and the 500ms bar. Cited `tests/launch-search-authority.mjs` show: Cross-base search and current membership/row/field authorization are exercised with launch and vault text.

#### VIEW-006 — Concurrent edits

Core · published · **done**

**Requirement.** Concurrent edits protect current records and definitions from stale mutations.

**Acceptance.**
1. Every mutation of a campaign, deliverable, milestone, risk, decision, comment, lens, custom-field definition, automation, or workspace setting supplies that record's current version.
2. A mutation carrying an older version returns a conflict, names the current version, and changes nothing.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### VIEW-007 — Paging and order

Core · published · **partial**

**Requirement.** Collections provide bounded, ordered pages with truthful totals.

**Acceptance.**
1. A collection response returns at most 200 records with a cursor, applies the requested sort with the record ID as its final tiebreak so paging repeats and skips nothing, and reports an exact total up to 10,000 matches and 10,000+ beyond it.
2. A result larger than one page states how many records are shown out of that total.

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** Missing a public paging journey for the 200-record cap, stable tied ordering, exact totals through 10,000, 10,000+ above it and shown-out-of-total presentation. Cited `tests/launch-operator-doors.mjs` show: The cited HTTP journey follows tiny keyset pages and inserts before the cursor without repeats/skips.

### Campaigns

#### CAMP-001 — Record

Core · published · **partial**

**Requirement.** Operators maintain campaigns with the fields needed to run a launch.

**Acceptance.**
1. An operator can create, edit, archive, and delete a campaign.
2. It requires a code, a name, an owner, a start date, and a launch date, and it also carries an objective, a status summary of at most 280 characters, a phase, a status, health, budget, spend, tags, and custom fields.

**Evidence.** `tests/launch-authority-browser.mjs`, `tests/launch-optional-fields.mjs`
**Gap.** Missing a campaign CRUD journey that also edits, archives and deletes through the cited public doors, with the unsafe deletion refused unchanged. Cited `tests/launch-authority-browser.mjs`, `tests/launch-optional-fields.mjs` show: The cited browser journeys create campaigns with populated or blank optional prose and read detail/reload.

#### CAMP-002 — Lifecycle

Core · published · **partial**

**Requirement.** Campaigns have an active and an archived lifecycle.

**Acceptance.**
1. A campaign is active or archived, and any operator can archive or restore one.
2. Archiving deletes nothing.
3. The initial phases are Planning, Build, Production, Review and Launch prep; the initial statuses are On track, Watch, At risk and Blocked; the initial launch-preparation phase is Launch prep.

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public lifecycle journey that restores the archived campaign, reads retained records and demonstrates operator lifecycle behavior; the cited browser never restores. Cited `tests/ui-launch-walkthrough.mjs` show: Public archive calls preserve unresolved child states in portfolio proof.

#### CAMP-003 — Validation

Core · published · **partial**

**Requirement.** Campaign validation preserves coherent dates, ownership, codes, health and amounts.

**Acceptance.**
1. A campaign's launch date must not fall before its start date, its health must be a whole number from 0 to 100, and its budget and spend must be zero or greater.
2. Campaign codes are trimmed and unique case-insensitively.
3. A mutation breaking any of these, or clearing the owner, start date, or launch date of an active campaign, is rejected with a validation error naming the field and changes nothing.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public campaign-validation journey that attempts invalid dates, health, money, codes and required-field removal, observes field errors and unchanged state, and completes a valid edit. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Internal command-handler/admission helpers check campaign validation and atomic snapshots; cited browser creates valid campaigns.

#### CAMP-004 — Detail and rollups

Core · published · **done**

**Requirement.** Campaign detail brings its current fields and linked work together.

**Acceptance.**
1. Campaign detail shows the campaign's fields, its complete and total deliverable counts, its milestones, its open risks, its unresolved decisions, its comments, and its activity.
2. Those counts are derived: they change only through a mutation to a linked record.

**Evidence.** `tests/launch-write-effects.mjs` — "prior full policy covers conservative effects and campaign record clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### CAMP-005 — Health

Core · published · **partial** · Cites BASE-AGENT-006, BASE-AGENT-007

**Requirement.** Campaign health shows who reported it and whether that report is stale.

**Acceptance.**
1. Health is shown with the operator who last set it and when.
2. A campaign whose health has not been set in the last 14 days is marked stale.
3. The initial campaign health policy changes health and status only through an explicit operator edit or an import row mapping the field.
4. A replacement may derive health from linked records; an AI-derived reversible health update carries standard, which the company's policy decides under AI-003.

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public journey computing this action's risk classes and applying both the held and all-autonomous company policies. The cited journeys show the earlier person-driven or fixed-control behavior.

#### CAMP-006 — Portfolio overview

Core · published · **done**

**Requirement.** Portfolio Overview summarizes the current active portfolio.

**Acceptance.**
1. Portfolio Overview shows Live campaigns as the count of non-archived campaigns, Needs attention as the count of non-archived campaigns whose status is At risk or Blocked, Open decisions as the count of unresolved decisions on non-archived campaigns, and Portfolio health as the arithmetic mean of non-archived campaign health rounded half up to a whole number, or No data when there are none.
2. It states how many campaigns in that mean are stale under CAMP-005.

**Evidence.** `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### CAMP-007 — Grid

Core · published · **done**

**Requirement.** The Campaign Grid lets each operator inspect current campaigns through useful saved starting views.

**Acceptance.**
1. Any operator can filter, group, sort, and choose visible fields in the campaign grid.
2. Three built-in views ship: All active, every non-archived campaign; Launch prep, every non-archived campaign in the lifecycle policy's launch-preparation phase; and My campaigns, every non-archived campaign owned by the signed-in operator.
3. Each re-queries on open and on refresh, and opening, filtering, grouping, or sorting a view changes no record.

**Evidence.** `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### CAMP-008 — Custom fields

Core · published · **partial**

**Requirement.** Operators extend campaigns with custom fields and manage their stored values.

**Acceptance.**
1. An operator can define, edit and delete declared campaign custom-field types, and those fields are available in grid display, filtering, lens conditions, CSV import and CSV export.
2. Deleting a definition deletes its stored values and is confirmed with the number of campaigns holding one.

**Evidence.** `tests/ui-launch-operator-doors.mjs`
**Gap.** Missing a custom-field journey editing/deleting definitions with the affected-value count, reading deleted values absent and using the field in grid/filter/lens/CSV import and export. Cited `tests/ui-launch-operator-doors.mjs` show: The sole cited browser creates and fills a select custom field.

#### CAMP-009 — Archiving

Core · published · **partial**

**Requirement.** Archiving withdraws a campaign’s active work without completing it.

**Acceptance.**
1. Archiving a campaign is allowed while it has open deliverables, milestones, risks, and decisions, and withdraws its work in one commit: its unresolved decisions leave Decision Queue, its risks and milestones leave every lens and the digest, its incomplete deliverables and milestones stop counting as overdue, it leaves the counts in CAMP-006 and every search that does not ask for archived campaigns, its outstanding readiness requests and every queued automation run whose subject is that campaign or one of its records are canceled without executing an action, and email held under NOTIFY-002 for that campaign is dropped.
2. Archiving completes and resolves nothing.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public archive journey on populated work that executes archive and reads all withdrawals, cancellations and held-mail disposal without completing/resolving the children. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public archive is read in portfolio/collections; internal lifecycle helpers inspect queue/readiness/mail/digest effects.

#### CAMP-010 — Restoring

Core · published · **partial**

**Requirement.** Restoring returns archived campaign work without catching up actions for the archived period.

**Acceptance.**
1. Restoring returns the campaign and every record archived with it to the state each had at archiving, and creates no notification, readiness request, or automation run for the archived period.
2. CAMP-003 is applied at restore: a campaign whose owner was removed while it was archived must be given a current owner before it becomes active.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public restore journey with the same populated state, observed no-catch-up effects and a removed-owner refusal that changes nothing. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Internal lifecycle helpers check restoration state, no catch-up work and removed-owner refusal.

#### CAMP-011 — Deletion

Core · published · **partial** · Cites BASE-DATA-003, BASE-AUDIT-001

**Requirement.** Confirmed campaign deletion permanently removes its associated product content.

**Acceptance.**
1. Deleting a campaign removes its deliverables, its milestones and their dependencies, its risks, decisions, comments, campaign activity, AI analyses, and import references under `BASE-DATA-003`.
2. A person deleting confirms by typing the campaign code. An agent deletion carries destructive, which the company's policy decides; it does not stand for that person's typed confirmation. Deletion cannot be undone.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public journey computing this action's risk classes and applying both the held and all-autonomous company policies. The cited journeys show the earlier person-driven or fixed-control behavior.

#### CAMP-012 — Risk rating

Core · published · **partial**

**Requirement.** Campaign risk ratings summarize their open risks.

**Acceptance.**
1. A campaign's risk rating is derived as the highest severity among its open risks, or None when it has none, and is shown wherever the campaign is listed.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public campaign-rating journey that reads the highest of multiple open severities in detail and collections, then changes/resolves that highest risk and reads the next rating or None. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public browser checks a Critical risk on campaign and its disappearance after resolution; internal reader helpers calculate severity rollups.

#### CAMP-013 — Bulk edit

Core · published · **partial**

**Requirement.** Bulk changes apply one change to a bounded selection atomically and support one undo.

**Acceptance.**
1. In the campaign grid and in any Grid or Cards lens an operator can select up to 500 records, including every record matching the current conditions, and apply one change to all of them: owner, phase, status, a tag added or removed, a custom-field value, archive, or restore.
2. A bulk change commits for every selected record or none, is rejected naming the first record that fails validation, writes one activity entry on each changed record and one bulk entry naming the operator and the count, and can be undone once within 1 hour, restoring the prior value of every record it changed.

**Evidence.** `tests/launch-write-authority.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** Missing a bulk-edit journey that exercises the 500-record bound, both lens doors, allowed change classes, atomic invalid-record refusal, per-record and bulk activity and one-hour/single-use undo. Cited `tests/launch-write-authority.mjs`, `tests/ui-launch-operator-doors.mjs` show: The cited browser applies a two-campaign status change, undoes it and uses matching owner selection; internal admission helpers check field guards.

#### CAMP-014 — Duplicating

Core · published · **partial**

**Requirement.** Campaign duplication creates an independent copy of the reusable launch plan.

**Acceptance.**
1. Duplicating a campaign copies its fields, tags, custom-field values, deliverables, and milestones under a new unique code, and copies no risks, decisions, comments, activity, notifications, or AI analyses.
2. When the operator supplies a new launch date, every copied date shifts by the difference between it and the original launch date; otherwise dates are copied unchanged.
3. The copy triggers no automation.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public duplicate-campaign journey creating and opening the unchanged-date and shifted-date copies and reading the retained values and excluded effects. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Internal lifecycle handlers check a populated copy, shifted dates, exclusions, remapped dependencies and no events.

### Deliverables

#### DELIV-001 — Record

Core · published · **partial**

**Requirement.** Operators maintain deliverables belonging to a campaign.

**Acceptance.**
1. An operator can create, edit, and delete a deliverable.
2. It belongs to exactly one campaign, requires a title and an owner, has an optional due date, and has a state of Open or Complete that starts Open.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public deliverable CRUD journey that deletes a populated deliverable and tries an unsafe deletion without effects, then reads the missing record and updated campaign count. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Browser creates a deliverable and public concurrency edits its title; internal helpers additionally edit/delete and validate.

#### DELIV-002 — Completion

Core · published · **partial**

**Requirement.** Deliverable completion and reopening update attribution, history and derived counts together.

**Acceptance.**
1. Completing or reopening a deliverable records the operator and the time, adds a campaign activity entry, and changes the campaign's derived completion count in the same commit.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public complete/reopen journey reading actor, time, activity and campaign count before and after each committed transition. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public consistency commands complete a deliverable and read the derived count; internal handlers check completion and reopening attribution.

#### DELIV-003 — Overdue

Core · published · **done**

**Requirement.** Overdue deliverables are identified consistently using the workspace date.

**Acceptance.**
1. An Open deliverable with a due date before the current date in the workspace timezone is marked overdue on campaign detail, in every lens and search result that contains it, and in CSV export.
2. A deliverable due today is not overdue.

**Evidence.** `tests/launch-write-effects.mjs` — "prior full policy covers conservative effects and campaign record clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

### Milestones

#### MILE-001 — Record

Core · published · **partial**

**Requirement.** Operators maintain dated campaign milestones.

**Acceptance.**
1. An operator can create, edit, and delete a milestone.
2. It belongs to exactly one campaign, requires a title and an owner, has a type of Launch, Review, Approval, Decision, Event, or Publish, has a status of Not started, On track, Watch, At risk, Blocked, or Complete that starts Not started, and has either a single date or a start and end date whose end does not fall before its start.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public milestone CRUD journey deleting a real milestone, refusing an unsafe date/relationship without effects and reading the complete supported record state. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public browser creates point/range milestones and public concurrency edits; internal helpers validate all types/statuses and delete.

#### MILE-002 — Timeline lens

Core · published · **partial**

**Requirement.** The shipped Timeline Lens presents active campaign milestones on a calendar.

**Acceptance.**
1. As shipped, Timeline Lens contains every milestone of every non-archived campaign, ordered by date ascending using the start date for a range and then by campaign code.
2. A range is rendered as a range with both dates and a point as a point with one date.
3. Month scale renders one column per calendar month and Quarter scale one per quarter in the workspace timezone; switching scale changes only the columns, never the milestone set.
4. Every item links to its campaign detail and to its milestone detail.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public shipped-timeline journey that reads date-ascending and campaign-code-tiebreak ordering on its populated result. Cited `tests/ui-launch-walkthrough.mjs` checks timeline item sets after sorting the extracted links; `tests/launch-write-effects.mjs` checks ordering through an internal preview, while calendar shapes, axes, stable scale-switch membership and links have public proof.

#### MILE-003 — Dependencies

Core · published · **partial**

**Requirement.** Milestone dependencies expose conflicts without silently rescheduling other work.

**Acceptance.**
1. An operator can name existing milestones in any campaign as predecessors of a milestone.
2. A predecessor set that would create a cycle is rejected with a validation error and changes nothing.
3. When a milestone starts before a predecessor ends, both carry a dependency-conflict marker on milestone detail and in Timeline Lens, and setting the later milestone's status to On track while that marker stands requires a reason of at least one non-whitespace character, recorded on the milestone and in campaign activity.
4. Changing one milestone's date never changes another's.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public dependency journey executing and refusing a cycle, recording/reading its nonblank conflict override and activity, and reading unchanged other dates. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Browser creates a dependency and observes conflict markers; internal handlers check cycles, required override reason/activity and unchanged peer dates.

#### MILE-004 — Readiness request

Core · published · **partial**

**Requirement.** The shipped readiness schedule asks the responsible owner once for each eligible milestone.

**Acceptance.**
1. A readiness request is an in-app notification addressed to a milestone's owner, Outstanding until that owner acknowledges it.
2. Within 15 minutes of 08:00 each day in the workspace timezone the shipped readiness automation creates exactly one Outstanding request for every milestone of type Launch that is not Complete, whose campaign is non-archived, and whose date falls within the next 5 days, and that has no Outstanding request.
3. A repeated evaluation creates no duplicate.

**Evidence.** `tests/launch-installed-schedules.mjs`
**Gap.** Missing a readiness journey in the cited schedule file where the addressed owner acknowledges the outstanding request and the resulting state is read; no acknowledgment runs there. Cited `tests/launch-installed-schedules.mjs` show: Emitted cron creates and deduplicates scheduled owner readiness and observes timing/window exclusion and mail.

#### MILE-005 — Readiness rescheduling

Core · published · **partial**

**Requirement.** Readiness requests follow changes to their milestone and campaign.

**Acceptance.**
1. Moving a Launch milestone's date out of the five-day window cancels its Outstanding request, and moving it inside the window creates one at the next daily evaluation.
2. Completing or deleting the milestone, or archiving its campaign, cancels an Outstanding request.
3. A milestone whose date has already passed receives no request.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing an emitted scheduled/public-command rescheduling journey showing outside/inside-window, completion/deletion/archive cancellation and no requests for past dates. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Internal retained scheduler helpers create real readiness, reschedule/cancel and inspect durability; browser does not drive these cases.

#### MILE-006 — Overdue

Core · published · **done**

**Requirement.** Incomplete milestones show overdue status from their point date or range end.

**Acceptance.**
1. An incomplete milestone whose date, or whose range end, falls before the current date in the workspace timezone is marked overdue wherever it appears.

**Evidence.** `tests/launch-write-effects.mjs` — "prior full policy covers conservative effects and campaign record clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

### Risks

#### RISK-001 — Record

Core · published · **partial**

**Requirement.** Operators maintain campaign risks and their supporting evidence.

**Acceptance.**
1. An operator can create, edit, and delete a risk.
2. It belongs to exactly one campaign, requires a title and an owner, has a severity of Low, Medium, High, or Critical, has an optional due date, carries a signal and a mitigation as free text of at most 2,000 characters each — the signal being the evidence that raised the risk — and has a workflow state.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public risk CRUD journey deleting a risk and refusing an unsafe deletion without effect while preserving its linked decision. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public browser creates risks and current-lens journey edits signal; internal handlers validate/edit/delete complete risk data.

#### RISK-002 — Lifecycle

Core · published · **partial**

**Requirement.** Risk resolution and reopening preserve an attributed account of the outcome.

**Acceptance.**
1. An open risk is Watching, In progress, Needs decision, or Escalated.
2. Resolving it requires a resolution note of at least one non-whitespace character and records the operator and the time.
3. Reopening a resolved risk returns it to Watching and keeps the previous resolution in activity.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public risk lifecycle journey that reads resolution actor/time/note, reopens to Watching and reads the retained previous resolution in activity. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Browser/public command resolves a risk and observes campaign rating cleared; internal handlers check nonblank note, attribution and reopen history.

#### RISK-003 — Escalation

Core · published · **partial**

**Requirement.** Risk escalation records its reason and applies the configured business policy.

**Acceptance.**
1. An operator can escalate an open risk with a reason.
2. In one commit the escalation sets the risk's state to Escalated, records the operator, reason, and time, and applies the escalation policy; the response carries any decision the policy created.
3. Initially, escalating a Critical risk creates one unresolved Critical-priority decision linked to it unless an unresolved decision is already linked, and notifies the campaign owner; escalating a lower severity creates no decision.

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing an escalation journey reading the campaign-owner notification and operator/time attribution after Critical escalation, with the existing unresolved decision not duplicated. Cited `tests/ui-launch-walkthrough.mjs` show: Browser escalation reads reason, linked decision and lower-severity no-decision outcome.

#### RISK-004 — Isolation

Core · published · **partial**

**Requirement.** Risk actions change only their defined business effects.

**Acceptance.**
1. Escalating, updating, or resolving a risk changes that risk, the campaign activity entry ACT-001 requires, the campaign's derived rollups, and — when the risk-escalation policy fires — the one decision and one notification it creates.
2. No other record changes; a linked decision changes only through the decision-resolution policy.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public risk-isolation journey reading unchanged unrelated records plus the exact allowed activity/rollup/decision/notification effects. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Internal snapshots check risk isolation; public browser escalates/resolves but inspects only selected related fields.

#### RISK-005 — Shipped lens

Core · published · **partial**

**Requirement.** The shipped Risks Lens shows the current high-priority risks approaching launch.

**Acceptance.**
1. As shipped and before any operator edit, Risks Lens contains exactly the open risks of severity High or Critical whose campaign is non-archived and whose launch date is no later than 30 days from today in the workspace timezone, so a campaign already past its launch date stays in the lens.
2. It orders Critical before High, then earliest due date, then risks without a due date, then campaign code, and shows severity, state, owner, due date, signal, mitigation, and campaign.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public shipped-lens journey reading the complete set/order across overdue/day-30/day-31/archive/resolved/severity fixtures and each listed business field. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Browser opens populated high/critical risks; internal lens preview checks full membership, ordering and fields.

### Decisions

#### DEC-001 — Record

Core · published · **partial**

**Requirement.** Operators maintain decisions tied to campaign work.

**Acceptance.**
1. An operator can create, edit, and delete a decision.
2. It belongs to exactly one campaign, links to at most one risk and to at most one decision it supersedes, requires a title and a requester, and has a priority of Critical, High, Medium, or Low, a due time, a recommendation, an impact statement, an optional assignee, and a state of Awaiting approval, In review, Approved, Rejected, or Canceled.
3. Awaiting approval and In review are unresolved; the other three are terminal.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public decision CRUD journey deleting a decision and trying an unsafe deletion without changing linked records, then reading its absence. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public browser creates decisions and reads recommendation/impact/links; internal handlers check full typed CRUD and deletion.

#### DEC-002 — Queue

Core · published · **partial**

**Requirement.** Decision Queue presents unresolved decisions in the business’s chosen order.

**Acceptance.**
1. Decision Queue contains exactly the unresolved decisions on non-archived campaigns.
2. The initial queue order is overdue first, then Critical, High, Medium and Low priority, then earliest due time and earliest creation time.

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a populated public Decision Queue journey checking unresolved/non-archived membership and configured overdue/priority/due/creation ordering. Cited `tests/ui-launch-walkthrough.mjs` show: The cited browser opens Decision Queue when empty and exercises other decision screens.

#### DEC-003 — Approval

Core · published · **partial**

**Requirement.** Decision approval records an attributed outcome and applies its business effects atomically.

**Acceptance.**
1. Approving an unresolved decision records the approver, the time, the outcome, and an optional rationale, adds a campaign activity entry, applies the decision-resolution policy, and removes the decision from Decision Queue, all in one commit.

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public approval journey reading approver and time, linked-risk policy outcome and queue removal after the same approval. Cited `tests/ui-launch-walkthrough.mjs` show: Public browser approves, reads persisted outcome/rationale and human activity; internal helpers check full outcome metadata and linked-risk policy.

#### DEC-004 — First outcome wins

Core · published · **done**

**Requirement.** The first committed decision outcome wins over competing stale outcomes.

**Acceptance.**
1. A request that approves, rejects, or cancels a decision is a mutation under VIEW-006.
2. The first such outcome to commit is the decision's outcome; a later one against the older version returns a conflict and changes nothing.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### DEC-005 — Assignment

Core · published · **done**

**Requirement.** Operators assign unresolved decisions to current operators.

**Acceptance.**
1. Any operator can assign or reassign an unresolved decision to a current operator, which records the operator and the time and notifies the new assignee.
2. Assignment changes no other field.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"
**Gap.** None.

#### DEC-006 — Changes, rejection, and cancellation

Core · published · **partial**

**Requirement.** Requests for changes, rejection and cancellation require an attributed rationale.

**Acceptance.**
1. Requesting changes on an unresolved decision requires a rationale of at least one non-whitespace character, records the operator and the time, and sets the decision to In review.
2. Rejecting or canceling an unresolved decision also requires such a rationale and is a terminal outcome under DEC-004.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public request-changes/rejection/cancellation journey reading acting operator and time with the stored rationale and In review/terminal outcomes. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public browser rejects with a rationale and public portfolio fixture requests changes/cancels; internal helpers verify attributed transitions.

#### DEC-007 — Linked-risk effect

Core · published · **partial**

**Requirement.** Linked risks change only through the decision-resolution policy.

**Acceptance.**
1. A decision outcome changes its linked risk only through the resolution policy, and no other decision action changes a risk.
2. Initially, approval moves a linked risk from Needs decision or Escalated to In progress; requesting changes, rejection and cancellation leave it unchanged, and no decision outcome resolves a risk.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public linked-risk policy journey reading the risk after approval and another outcome, including no changes from other decision actions and no implicit resolution. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public browser approves a linked risk decision; internal helpers inspect all resolution-policy transitions and unchanged risks.

#### DEC-008 — Finality

Core · published · **partial**

**Requirement.** Terminal decisions remain final and can be superseded with a linked new decision.

**Acceptance.**
1. A terminal decision cannot be edited into another outcome; such a request is rejected and changes nothing.
2. An operator can create a new decision that supersedes it under DEC-001, and each decision links to the other on both details.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public terminal-decision journey attempting an outcome rewrite and observing refusal with unchanged state before creating the superseding decision. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public supersede commands and 1440/390 screens follow reciprocal prior/replacement links; internal prepare rejects terminal edits.

### Lenses

#### LENS-001 — Definition

Core · published · **done**

**Requirement.** A lens is a typed, saved definition of a view over one kind of Launch record.

**Acceptance.**
1. A lens has a name, a description, exactly one record type from Campaign, Risk, Milestone, or Decision, at most 20 conditions, a sort order, visible fields, and a display mode valid for its type: Grid for Campaign, Cards for Risk or Decision, Timeline or Agenda for Milestone.
2. A lens with a mode its type does not allow is rejected on save.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### LENS-002 — Preview

Core · published · **done**

**Requirement.** Operators preview unsaved lens definitions without changing business records.

**Acceptance.**
1. Lens preview evaluates the unsaved definition against non-archived records, reports the exact matching count under VIEW-007 within 2 seconds, changes no record, and shows an explicit zero-results state.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### LENS-003 — Save and share

Core · published · **partial** · Cites BASE-ACCESS-002

**Requirement.** Saved lenses are shared within the operator workspace with clear authorship.

**Acceptance.**
1. Saving a lens makes it available to every operator and records who saved it and when.
2. Sharing produces a URL to the saved lens

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public save/share journey reading saver identity and time from the saved result; those fields are asserted only with internal record readers. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Public browser saves/opens a shared lens; native HTTP allows another operator and refuses signed-out reads.

#### LENS-004 — Edit and delete

Core · published · **partial**

**Requirement.** Lens editing and deletion affect definitions rather than their underlying records.

**Acceptance.**
1. An operator can edit a lens definition or delete the lens.
2. Neither changes, archives, or deletes any record the lens displays or hides.
3. A shipped lens cannot be deleted.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public delete journey observing unchanged displayed and hidden business records and a shipped-lens deletion refusal with no effect. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Native HTTP edits a lens while observing unchanged business tables; browser cleanup deletes a lens.

#### LENS-005 — Current results

Core · published · **done**

**Requirement.** Each opened or refreshed lens presents one coherent current evaluation.

**Acceptance.**
1. Opening or refreshing a lens re-evaluates it against non-archived records, and its result list, count, condition summary, and selected detail all describe that one evaluation.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### LENS-006 — Shipped views

Core · published · **partial**

**Requirement.** Operators can adapt the two shipped lenses and restore their original definitions.

**Acceptance.**
1. Risks Lens and Timeline Lens ship as saved lenses.
2. Operators can duplicate or edit them, and restoring either returns its definition to exactly the one in RISK-005 or MILE-002 without changing a record.

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public shipped-lens journey that executes duplicate/edit/restore at the native door and reads the exact restored definitions and unchanged business state. Cited `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs` show: Internal handlers duplicate/edit/restore both installed lenses and public reads show resulting definitions.

#### LENS-007 — Conditions

Core · published · **done**

**Requirement.** Lens conditions use operators appropriate to their selected fields.

**Acceptance.**
1. A condition names one field of the lens's record type — campaign custom fields only on a Campaign lens — and one operator from equals, not equals, one of, contains, is empty, is not empty, before, after, and within the next N days, typed to that field: contains applies to text fields only, and the date operators to date fields only.
2. Conditions combine with AND.
3. A condition naming an unknown field, or an operator its field's type does not support, is rejected on preview and on save.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"
**Gap.** None.

### Activity and comments

#### ACT-001 — Campaign activity

Core · published · **partial** · Cites BASE-OPS-005, BASE-AUDIT-001, BASE-DATA-003

**Requirement.** Campaign activity presents a readable history of the work performed.

**Acceptance.**
1. Campaign activity is ordered newest first.
2. It records every create, field change, archive, restore, and delete of the campaign and of its deliverables, milestones, risks, decisions, and comments, plus every import and every mutation made by an automation.
3. Each entry carries its type, its subject's ID, the operator or the automation run that acted, the time, and for a field change the field name with its previous and new value.
4. Campaign activity is the operator-visible view of the audit records in `BASE-OPS-005`: deleting a campaign removes this view,

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a public activity journey reading newest-first entries for campaign/child/import/automation changes with subject, actor/run, timestamp and previous/new field values, plus retained anonymized audit after deletion. Cited `tests/ui-launch-walkthrough.mjs` show: The browser reads human-readable escalation/approval activity with the actor and expanded dates.

#### ACT-002 — Comments

Core · published · **done**

**Requirement.** Operators hold plain-text campaign conversations with retained deletion history.

**Acceptance.**
1. An operator can add a plain-text comment to a campaign, and it appears in campaign activity.
2. A comment changes no field of any record and triggers no automation and no AI call.
3. An operator can delete a comment, which leaves a deletion entry in activity.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### ACT-003 — Dates and times

Core · published · **partial**

**Requirement.** Calendar dates and instants retain their intended meanings across displays and exits.

**Acceptance.**
1. Every timestamp in the API and the export is ISO 8601 in UTC.
2. Campaign, deliverable, and milestone dates are calendar dates evaluated from the start of that day in the workspace timezone; decision due times are instants.
3. Every relative time exposes its absolute time as its accessible name.

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** Missing a cited public date/time journey opening API/export timestamps as UTC ISO values and reading the absolute accessible name for relative times. Cited `tests/ui-launch-walkthrough.mjs` show: The browser reads human calendar dates and workspace-formatted decision instants.

#### ACT-004 — Mentions

Core · published · **done**

**Requirement.** Comment mentions notify the intended current operator without changing business fields.

**Acceptance.**
1. A comment can mention a current operator, which notifies exactly that operator and changes no field of any record.
2. A mention of a removed or erased operator renders as plain text and notifies nobody.

**Evidence.** `tests/launch-write-effects.mjs` — "unmodelled definition changes and decision/lens clauses"; `tests/ui-launch-walkthrough.mjs` — "Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

### Automations

#### AUTO-001 — Definition

Core · published · **done**

**Requirement.** Operators define event-driven or scheduled automations as ordered actions.

**Acceptance.**
1. An automation has a name, one trigger, an ordered action list, an enabled state and a definition version that increments on every edit.
2. A trigger is a declared product event or a schedule of at most one run per hour; a shorter schedule is refused on save.
3. Actions can escalate a risk, create a decision, notify an operator, send email, request AI analysis or add activity, as well as run a command supplied through the maintained contribution mechanism.

**Evidence.** `tests/launch-installed-event-control.mjs` — "[AUTO-001] [AUTO-003/004] [AUTO-006] definitions version every edit and refuse undeclared events, sub-hourly schedules and uncontributed commands; a jobs.commands.v1 action runs once from the emitted queue; disable cancels queued work before any effect; full run history pages with each attempted action and a 30-day success rate"; `tests/helpers/launch-automation-definitions.mjs` — "verifyDefinitions; verifyContributedRun"
**Gap.** None.

#### AUTO-002 — Commit boundary

Core · published · **partial**

**Requirement.** Only committed events dispatch enabled automations.

**Acceptance.**
1. An event automation is dispatched within 10 seconds of the mutation that raised its event committing.
2. A rolled-back mutation dispatches nothing.
3. A disabled automation runs on neither events nor schedules and records no run.

**Evidence.** `tests/launch-installed-runtime.mjs`
**Gap.** Missing a cited disabled-schedule journey showing no scheduled run is recorded; the cited runtime journey exercises disabled event work and a rejected mutation, not a disabled schedule.

#### AUTO-003 — One run per trigger

Core · published · **done** · Cites BASE-OPS-003

**Requirement.** Each automation trigger has one logical run despite transport redelivery.

**Acceptance.**
1. One run exists per automation, definition version, and trigger event or scheduled instant; transport retries are attempts inside that run.
2. Under `BASE-OPS-003`, a redelivered message reuses each action's idempotency key, so no decision, notification, analysis, or activity entry is created twice.

**Evidence.** `tests/launch-installed-runtime.mjs` — "[AUTO-002/003/004/011] emitted queue escalates committed Critical risk within ten seconds; replay, rollback and disable make no duplicate effects"; `tests/launch-installed-event-control.mjs` — "[AUTO-003 AI-003] duplicate emitted queue delivery during an in-flight brief preserves its wake-up and completes once"; `tests/launch-installed-event-control.mjs` — "[AUTO-001] [AUTO-003/004] [AUTO-006] definitions version every edit and refuse undeclared events, sub-hourly schedules and uncontributed commands; a jobs.commands.v1 action runs once from the emitted queue; disable cancels queued work before any effect; full run history pages with each attempted action and a 30-day success rate"
**Gap.** None.

#### AUTO-004 — Definition changes

Core · published · **partial**

**Requirement.** A run retains its original definition while later changes affect future work.

**Acceptance.**
1. A run records the definition version that created it.
2. Editing an automation affects only later triggers.
3. Disabling one cancels queued runs that have not started, recording each as Canceled with no action executed.

**Evidence.** `tests/launch-installed-event-control.mjs`, `tests/launch-installed-network-cancel.mjs`
**Gap.** Missing a cited journey that edits the definition while a retained run exists and reads old versus later-trigger actions; the cited journeys show version numbering and disable/cancel, but never distinguish retained-run action snapshots from an edited definition.

#### AUTO-005 — Loop protection

Core · published · **partial**

**Requirement.** Automation chains retain causes and suppress recursive work.

**Acceptance.**
1. Every mutation made by an automation carries the ID of the run that made it, and a run inherits its cause's chain of run IDs.
2. An event whose chain already contains a given automation starts no new run of it, and the suppression is recorded on the causing run.
3. A chain is at most 10 runs deep, and an eleventh is recorded as Suppressed and not dispatched.
4. Two runs triggered by the same event may finish in either order and neither waits for the other.

**Evidence.** `tests/launch-installed-event-control.mjs`
**Gap.** Missing a cited loop-protection journey that drives a causal cycle, reads suppression on the causing run and refuses the eleventh run, while independent sibling runs complete; the cited journeys show a causal run tag and brief throttling only.

#### AUTO-006 — Run history

Core · published · **done**

**Requirement.** Retained run history and Automation Monitor show truthful results and success rates.

**Acceptance.**
1. Every run records its automation version, trigger, subject, queued, started, and finished times, each attempted action with its result, the number of records it affected, and the error code and message of any failure.
2. Run history is retained in full and paged under VIEW-007, and Automation Monitor shows each automation's success rate as finished successful runs divided by finished runs over the trailing 30 days, stating that window.
3. An Unknown run counts as finished without success in the displayed success rate.

**Evidence.** `tests/launch-installed-event-control.mjs` — "[AUTO-001] [AUTO-003/004] [AUTO-006] definitions version every edit and refuse undeclared events, sub-hourly schedules and uncontributed commands; a jobs.commands.v1 action runs once from the emitted queue; disable cancels queued work before any effect; full run history pages with each attempted action and a 30-day success rate"; `tests/helpers/launch-run-history.mjs` — "verifyRunHistory"; `tests/launch-installed-retries.mjs` — "[AUTO-007/009 AUTO-USER-001] [AUTO-006] uncertain SendGrid delivery stays visible as a finished Unknown run without unsafe automatic or manual resend"; `tests/ui-launch-walkthrough.mjs` — "[OPS-006] [OPS-003] [CAMP-006] [VIEW-006] [LENS-005] [ACT-002] [ACT-004] [MILE-002] [MILE-006] [DEC-008] [LENS-002] [LENS-003] [DELIV-003] [CAMP-004] [CAMP-012] [VIEW-002] [CAMP-001] [CAMP-002] [CAMP-005] [RISK-003] [DEC-002] [DEC-003] [ACT-001] [ACT-003] [BASE-PUBLIC-003] [AUTO-006] [CAMP-007] Launch walkthrough E10–E17 at desktop and phone"
**Gap.** None.

#### AUTO-007 — Transport retry

Core · published · **done** · Cites BASE-AUDIT-001, BASE-MAIL-001, BASE-OPS-004

**Requirement.** Known-safe transport failures retry within bounds; uncertain outcomes remain visible without unsafe resends.

**Acceptance.**
1. An action with a transport failure known to be safe to retry is retried at 1, 5, 15, 30, and 60 minutes after its first failure.
2. A retry re-executes only actions that have not completed and reuses their idempotency keys.
3. When the fifth retry fails the run is marked Failed.
4. An uncertain external outcome, including an uncertain SendGrid submission, leaves the action and run visibly Unknown with their error code and message; neither automatic nor manual retry resends it.
5. A retained action key alone does not establish provider-side idempotency or a safe resend.

**Evidence.** `tests/launch-installed-retries.mjs` — "[AUTO-007/009] installed ordered actions retry transport failures at absolute offsets, preserve completed effects and link manual retry"; `tests/launch-installed-retries.mjs` — "[AUTO-007/009 AUTO-USER-001] [AUTO-006] uncertain SendGrid delivery stays visible as a finished Unknown run without unsafe automatic or manual resend"
**Gap.** None.

#### AUTO-008 — Failure that retrying cannot fix

Core · published · **partial** · Cites BASE-OPS-004

**Requirement.** Failures that retrying cannot fix stop immediately and stay visible.

**Acceptance.**
1. A validation error, a policy rejection, a schema failure, or a provider refusal fails the run immediately with no retry.

**Evidence.** `tests/launch-installed-event-control.mjs`
**Gap.** Missing a cited failure journey that reads the error code/message on the Automation Monitor for validation/schema/provider refusal and proves no retry; the cited file shows a policy failure in storage and provider-refused history, but does not read the Monitor failure projection.

#### AUTO-009 — Manual retry

Core · published · **done**

**Requirement.** Operators can safely retry failed work while retaining the original run.

**Acceptance.**
1. An operator can retry a Failed run.
2. The retry is a new run linked to the original, reuses the original action idempotency keys so completed actions do not repeat, and leaves the original run Failed and unchanged.
3. Unknown runs are ineligible; manual retry cannot bypass AUTO-007's uncertain-outcome restriction.

**Evidence.** `tests/launch-installed-retries.mjs` — "[AUTO-007/009] installed ordered actions retry transport failures at absolute offsets, preserve completed effects and link manual retry"; `tests/launch-installed-retries.mjs` — "[AUTO-007/009 AUTO-USER-001] [AUTO-006] uncertain SendGrid delivery stays visible as a finished Unknown run without unsafe automatic or manual resend"
**Gap.** None.

#### AUTO-010 — Fan-out

Core · published · **done**

**Requirement.** One multi-record change produces bounded automation fan-out.

**Acceptance.**
1. A mutation that changes many records at once — a bulk edit under CAMP-013 or a committed import under IMPORT-003 — dispatches at most one run per enabled automation, carrying the affected record IDs, rather than one run per record.

**Evidence.** `tests/launch-installed-event-control.mjs` — "[AUTO-005/011 AI-002] [AUTO-010] bulk edits and committed imports fan out once per automation while mixed briefs preserve skips, quota and retry progress"
**Gap.** None.

#### AUTO-011 — Shipped automations

Core · published · **partial**

**Requirement.** The included Launch template provides four configurable starting automations.

**Acceptance.**
1. The seed ships four automations.
2. Critical risk escalation triggers when a risk's severity becomes Critical while the risk is open and not already Escalated, and its one action escalates that risk under RISK-003; it is enabled by default.
3. Launch readiness runs on the schedule in MILE-004 and is enabled by default; its lead time, 5 days by default, and its evaluation hour, 08:00 by default, are editable in settings.
4. Campaign brief triggers when a campaign is created or updated, at most once per campaign per hour, skipped when nothing in its AI-002 context changed since the last brief; it is enabled by default and dispatched only while AI is enabled under SET-002.
5. The weekly portfolio digest runs on the schedule in NOTIFY-004 and is disabled by default.
6. No other parameter of a shipped automation is editable, and each can be disabled.

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-schedules.mjs`
**Gap.** Missing a cited fresh-install definition journey that reads all four shipped defaults and tries forbidden parameter edits; the cited journeys run the four features but do not inspect every default or show that only permitted shipped parameters are editable.

### Notifications

#### NOTIFY-001 — In-app events

Core · published · **partial**

**Requirement.** Operators receive in-app notices for the work addressed to them.

**Acceptance.**
1. An operator receives an in-app notification when a decision is assigned to them, when they are mentioned in a comment, when a Critical risk is escalated on a campaign they own, when a readiness request is created for them, and when an automation run they started fails.
2. A Failed run that no operator started notifies the owner of the campaign it acted on, or every operator when the run has no campaign subject.

**Evidence.** `tests/ui-launch-notifications.mjs` / `tests/helpers/notification-in-app-clauses.mjs` / verifyNotificationInAppClauses (push launch-notifications), at 1440/390
**Gap.** The NOTIFY-001 public-door journey proves exact decision-assignee, comment-mention, campaign-owner Critical-risk and readiness-target notices, plus failed-run starter and campaign-owner recipients with public inbox readback at 1440/390. Gap: a subjectless Failed run omits active operators without current Launch memberships; all-active-operator delivery and inbox availability for those operators remain unfulfilled.

#### NOTIFY-002 — Email delivery

Core · published · **partial**

**Requirement.** Notification email follows the workspace’s delivery and quiet-hours policy.

**Acceptance.**
1. Every in-app notification has an email counterpart routed by the delivery policy through the configured mail sender against the workspace quiet hours in settings, which default to 18:00–08:00 in the workspace timezone.
2. Authentication email and the weekly digest are never held.
3. Initially, a Critical escalation or decision assignment is emailed within 60 seconds at any hour; every other email raised in quiet hours is held and sent within 60 seconds of quiet-hours end, as one message per operator.

**Evidence.** `tests/ui-launch-notifications.mjs` / `tests/helpers/notification-email-policy.mjs`, verifyNotificationEmailPolicy (push launch-notifications)
**Gap.** The NOTIFY-002 public-door journey proves default 18:00–08:00 workspace quiet hours, assignment and Critical escalation mail on a 59-second tick, two held events grouped into one message per operator within 60 seconds of quiet-hours end, and authentication/digest exceptions with exact provider-edge counts at 1440/390. Gap: record-automation producers deliberately request in-app-only delivery, so those in-app notifications have no email counterpart under the clause’s first sentence.

#### NOTIFY-003 — Delivery failure

Core · published · **partial** · Cites BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Delivery records expose failed or uncertain email outcomes while preserving the in-app notice.

**Acceptance.**
1. Every outbound email has a delivery record linked to its notification and, when an automation sent it, to that run.
2. A failed send, including an asynchronous bounce, is retried on the AUTO-007 schedule subject to its safe-retry requirement and then marked failed on both the delivery record and the notification, where settings lists it.
3. An uncertain submission remains visibly Unknown under AUTO-007, rather than being treated as a confirmed failure that permits resend.
4. The in-app notification stays available.

**Evidence.** `tests/ui-launch-notifications.mjs` / `tests/helpers/notification-delivery-failures.mjs`, verifyNotificationDeliveryFailures (push launch-notifications)
**Gap.** The NOTIFY-003 public-door journey proves notification-linked delivery records, failed-run notification linkage to its actual automation run, rejected/Unknown outcomes in the inbox and Settings at 1440/390, retained notices, provider acceptance distinct from mailbox delivery, and refusal of automatic or manual Unknown resend. Gap: installation mail has no asynchronous-bounce intake bound to these records; known-safe rate-limited notification sends are not retried on AUTO-007’s schedule; direct Launch send-email actions do not create notification-linked channel delivery records.

#### NOTIFY-004 — Digest

Core · published · **partial**

**Requirement.** The weekly digest summarizes the active portfolio for its selected recipients.

**Acceptance.**
1. When enabled, the weekly digest is sent within 15 minutes of 09:00 each Monday in the workspace timezone to the configured recipients, defaulting to every current operator, and once per recipient address however often that address appears.
2. It itemizes non-archived campaigns, launches in the next 30 days, open High and Critical risks, unresolved decisions, and runs that failed in the previous 7 days.

**Evidence.** `tests/launch-installed-schedules.mjs`
**Gap.** Missing a cited populated digest journey that includes open High/Critical risks, unresolved decisions and a failed run from the previous seven days and reads those items in the delivered message; those digest sections are not exercised with populated records in the cited schedule journey.

#### NOTIFY-005 — Inbox

Core · published · **done**

**Requirement.** The inbox preserves each operator’s own read state and safely describes unavailable subjects.

**Acceptance.**
1. The inbox lists the operator’s notifications newest first and the navigation shell shows their unread count.
2. A notice stays unread until that operator opens it; the operator can mark one or all read without changing another operator’s read state.
3. An archived, deleted or inaccessible subject shows neutral unavailable content with the title Notification unavailable, an empty body and no protected link.
4. For NOTIFY-009, the currently authorized retained starter can separately read the permitted generic operation outcome as recipient-owned outcome metadata, including when progress email is muted.
5. Outcome metadata reveals no subject names, record content, destination, protected error details or inaccessible links, grants no access and remains subject to erasure; muting suppresses mail and supplies no authority for another channel.
6. With a removed or inaccessible failed export and muted starter progress mail, the inbox shows the permitted needs-attention outcome, neutral unavailable subject content and no protected link or mail, and discloses nothing to another operator.
7. Authority and erasure are rechecked, including erasure during live import; accepted receipts survive only where the lifecycle policy permits, and no later send or restored debt revives erased content or a recipient.

**Evidence.** `tests/ui-launch-notifications.mjs` — "notification preferences, real delivery events and inbox retention and erasure at desktop and phone"; `tests/helpers/launch-inbox-screens.mjs` — "verifyInboxScreens"; `tests/helpers/notification-delivery-matrix.mjs` — "verifyNotificationDeliveryMatrix"
**Gap.** None.

#### NOTIFY-006 — One per event

Core · published · **done**

**Requirement.** Notification deduplication avoids repeated notices and self-notification.

**Acceptance.**
1. An operator receives at most one in-app notification and one email for a single product event however many of its roles they hold, is never notified of an action they took themselves, and a repeat of the same event on the same subject within 60 minutes updates the existing unread notification instead of creating another.
2. A distinct same-kind event for the same subject within 60 minutes updates the existing unread notice while the email count remains one.

**Evidence.** `tests/ui-launch-notifications.mjs` — "notification preferences, real delivery events and inbox retention and erasure at desktop and phone"
**Gap.** None.

#### NOTIFY-007 — Muting

Core · published · **done**

**Requirement.** Operators control email muting by notification kind.

**Acceptance.**
1. In settings each operator can mute any notification kind for themselves.
2. Muting stops the email for that kind for that operator only; the in-app notification is still created, and delivery to every other operator is unchanged.

**Evidence.** `tests/ui-launch-notifications.mjs` — "notification preferences, real delivery events and inbox retention and erasure at desktop and phone"; `tests/helpers/notification-delivery-matrix.mjs` — "verifyNotificationDeliveryMatrix"; `tests/launch-installed-schedules.mjs` — "NOTIFY-004: enabled Monday digest creates one notification/delivery and mail"
**Gap.** None.

#### NOTIFY-008 — Overdue decisions

Core · published · **done**

**Requirement.** Overdue unresolved decisions produce a single timely notice and can re-arm after a due-time change.

**Acceptance.**
1. A decision still unresolved 15 minutes after its due time notifies its assignee once, or its requester once when it has no assignee.
2. Moving the due time later re-arms that notification once for the new time.

**Evidence.** `tests/launch-installed-schedules.mjs` — "NOTIFY-008: unresolved decision due plus fifteen minutes notifies once and re-arms"
**Gap.** None.

### AI

#### AI-001 — Analyses

Core · published · **partial**

**Requirement.** Requested Launch analyses retain their provenance and remain identifiable as AI-generated.

**Acceptance.**
1. An operator, or the shipped campaign-brief automation, can request a campaign brief, a risk readout, or a lens proposal.
2. Each result is stored as an immutable AI analysis linked to its campaign, to the lens it was invoked from, or to its lens draft, marked as AI-generated wherever it appears, stamped with the time it was produced, and citing the ID and version of every entity in its input.

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-ui.mjs`
**Gap.** Missing a cited analysis journey reading the produced timestamp and exact input entity IDs and versions after source changes, and verifying retained prior-analysis immutability. Cited journeys read result text/feature/AI marker and input-version presence/entity-kind count, not the complete attribution/revision promise.

#### AI-002 — Context

Core · published · **partial**

**Requirement.** Each analysis receives only its defined business context.

**Acceptance.**
1. Initially, a campaign brief receives the campaign’s standard fields and linked deliverables, milestones, open risks and unresolved decisions; a risk readout receives the invoking lens’s result set capped at 200 risks; a lens proposal receives supported field definitions and the operator’s prompt.
2. Comment text and custom-field values go to none of the three.

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-event-control.mjs`
**Gap.** Missing a cited readout journey with more than 200 eligible risks showing the exact cap and chosen lens result set. Existing fixtures show private-context exclusion and ordinary result shapes; they never measure the stated 200-risk boundary.

#### AI-003 — Analysis and applied actions

Core · published · **partial** · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-007

**Requirement.** An AI brief remains analysis content. Applying a suggested change is the classified product action, decided by the company's policy.

**Acceptance.**
1. Completing a deliverable, moving a milestone, escalating or resolving a risk, recording a decision, saving a lens and sending a notice each use the company's policy rule for their computed classes. Reversible internal changes carry standard; binding decisions add commitment, outside notices add external and irreversible changes add destructive.
2. Under a named company policy that assigns approval to standard lens changes, a lens proposal stays an editable draft until that policy's named approver saves it; under the all-autonomous policy the classified action can save it without a person's step.

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-ui.mjs`
**Gap.** Missing a public journey computing this action's risk classes and applying both the held and all-autonomous company policies. The cited journeys show the earlier person-driven or fixed-control behavior.

#### AI-004 — Provider and failure

Core · published · **partial**

**Requirement.** AI provider failures are visible and isolated from other work.

**Acceptance.**
1. AI calls go through the configured AI provider with a 60-second timeout.
2. A timeout, a response that fails its schema, or an unconfigured or unavailable provider stores no analysis and changes no field of any record.
3. An operator-initiated request shows the provider's error code and message where it was requested; an automation-initiated one fails that run under AUTO-008.
4. Every other automation, notification, mutation, and read proceeds unaffected.

**Evidence.** `tests/launch-installed-ai-failures.mjs`
**Gap.** Missing a cited automation-initiated provider-failure journey reading the failed automation run and showing unrelated automation/notification work still completes. The cited failure test disables campaign-brief automation and exercises operator requests only.

#### AI-005 — Usage

Core · published · **partial** · Cites BASE-AGENT-009, BASE-AGENT-011

**Requirement.** AI usage remains attributable and measurable by feature and day.

**Acceptance.**
1. Every AI call records its feature, model, input and output token counts, reported cost, subject, requesting operator or automation run, duration, and result.
2. Settings shows call counts, token counts, and cost by day and by feature.

**Evidence.** `tests/launch-installed-ai-failures.mjs`
**Gap.** Missing a cited usage journey reading each call’s feature, model, input/output token counts, reported cost, subject, requesting operator/run, duration and result, plus per-feature Settings totals. Existing old evidence reads aggregate request counts/days, not the complete listed per-call fields and per-feature display.

#### AI-006 — Company AI limits

Core · published · **partial** · Cites BASE-AGENT-011

**Requirement.** Cradle applies company-chosen AI quantity thresholds in the workspace's day and records refused work without disrupting non-AI work.

**Acceptance.**
1. A configured daily threshold resets at midnight in the workspace timezone. Under the named held company policy with a threshold of 200 calls, the next call is refused with an error naming that threshold, stores no analysis and fails its requesting run under AUTO-008.
2. Under a company policy with no quantity or provider-spend cap, the old fixed daily ceiling does not stop the call. Non-AI work is unaffected.

**Evidence.** `tests/launch-installed-ai-failures.mjs`
**Gap.** Missing a public journey computing this action's risk classes and applying both the held and all-autonomous company policies. The cited journeys show the earlier person-driven or fixed-control behavior.

### Import

#### IMPORT-001 — CSV preview

Core · published · **partial** · Cites BASE-INPUT-001, BASE-INPUT-003

**Requirement.** Operators preview mapped Launch CSV changes before any records change.

**Acceptance.**
1. An operator can import campaign, deliverable or milestone CSV within the declared upload and row limits under `BASE-INPUT-003`.
2. The file must be UTF-8, comma-delimited, and carry a header row; a byte-order mark is accepted and anything else is rejected with a parse error.
3. Import requires an explicit mapping from columns to fields and, before any record changes and within 60 seconds at the row limit, shows the number of creates, updates, and unchanged rows, every row error, and for each updated row the fields that will change with their stored and incoming values.

**Evidence.** `tests/launch-operator-doors.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** Missing a cited maximum-row CSV preview timed within 60 seconds and malformed/non-UTF-8 format refusal; the cited journeys cover small BOM/quoted campaign CSV and a deliverable preview, not the measurable row-limit bar.

#### IMPORT-002 — Merge keys

Core · published · **partial**

**Requirement.** CSV merges use stable business keys and preserve existing values when incoming cells are blank.

**Acceptance.**
1. A campaign row creates or updates a campaign by its unique code; a deliverable or milestone row creates or updates by campaign code plus title, and is a row error when that campaign is not already in the workspace.
2. A merge key repeated inside the file, and a reference to an owner or select value that does not exist, are row errors.
3. A value that is empty or only whitespace never overwrites a stored value.

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** Missing a cited merge-key journey that tries duplicate file keys and invalid select values and reads a stored value after a whitespace-only incoming value; the cited journey covers campaign matching, a deliverable preview and unknown owner/campaign errors only.

#### IMPORT-003 — Commit

Core · published · **partial**

**Requirement.** A valid reviewed Launch import commits as one complete change.

**Acceptance.**
1. Confirm is available only when every row is valid; one invalid row blocks the whole file and there is no partial import.
2. Confirming commits every previewed row in one transaction, records an import record, and writes one activity entry on every campaign it created, updated, or whose deliverables or milestones it changed; any failure rolls back every row.
3. A committed import cannot be rolled back, which is why IMPORT-001 shows every field it will change.

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** Missing a cited commit-failure journey that executes an unsafe multirow transaction and reads every row unchanged after rollback; invalid input is refused before commit, while the successful path and replay are read back.

#### IMPORT-004 — Replay and staleness

Core · published · **partial**

**Requirement.** Import confirmation refuses stale previews and safely replays completed confirmation.

**Acceptance.**
1. Preview returns a token that expires 30 minutes after it is issued and that confirm requires, together with an idempotency key.
2. A record matched by the preview that changed before confirmation produces a conflict and requires a new preview.
3. Replaying a confirm with the same key within 24 hours returns the original result and creates no second record and no second activity entry.

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** Missing a cited expired-preview journey that advances past 30 minutes and shows confirmation refused with no rows changed; the cited journey covers record staleness and immediate replay only.

#### IMPORT-005 — Stored file

Core · published · **partial** · Cites BASE-INPUT-003, BASE-DATA-003

**Requirement.** Operators can retrieve the original file retained with an import.

**Acceptance.**
1. The uploaded file is stored with its import record and is downloadable by any operator.
2. Deleting the import record deletes the file within 5 minutes.

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** Missing a cited import-deletion journey that deletes the import record and verifies the stored file is gone within five minutes; the cited journeys only download the retained file.

### Settings

#### SET-001 — Settings area

Core · published · **partial**

**Requirement.** One signed-in Settings area manages the workspace and its operating features.

**Acceptance.**
1. Settings is one operator-only area with sections for the workspace (name, timezone, currency, quiet hours), operators, notification preferences, custom-field definitions, automations and digest recipients, AI, imports and failed email deliveries, and current usage against every declared workspace limit.
2. Changing a setting records the operator and the time and applies to work dispatched after the change; work already dispatched is unaffected.

**Evidence.** `tests/ui-launch-operator-doors.mjs`
**Gap.** Missing a cited Settings journey that reads every named section/current usage and changes a setting with actor/time readback while distinguishing already-dispatched from later work; the cited journey exercises custom fields, samples and ownership only.

#### SET-002 — AI configuration

Core · published · **partial** · Cites BASE-SECRET-002, BASE-AGENT-007

**Requirement.** The workspace explicitly enables a configured AI provider before using AI features.

**Acceptance.**
1. AI stays off until an operator enables it in Settings with every declared configuration value available for the chosen provider.
2. While AI is off, an AI request is rejected with a message naming what is missing, the campaign-brief automation is not dispatched, and every other feature works unchanged.

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-ui.mjs`
**Gap.** Missing a cited unconfigured-provider journey that refuses enabling AI with missing configuration named and shows no campaign-brief dispatch; the cited journeys use a fully configured provider and test AI off/on only.

#### SET-003 — First run and sample data

Core · published · **partial**

**Requirement.** First run establishes durable workspace details and offers removable sample work.

**Acceptance.**
1. Configured workspace name, timezone and currency are the owner’s confirmed details: first-owner initialization stores them and completes first run, so the first sign-in opens the app.
2. Without configured details, a new deployment directs signed-in visits to first-run setup until the owner confirms them; completion survives setup reruns, and completed setup visits open the app.
3. The installation starts with the configured operator, timezone and currency, two shipped lenses, four shipped automations and no campaigns; every surface shows its VIEW-004 empty state.
4. Settings installs or removes sample data in one action; removal deletes only its created records and is refused naming them once any has been edited.

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** Missing a first-run journey in this clause's old evidence that exercises configured/unconfigured setup, durable completion and empty initial data; the cited operator-door file covers sample installation/removal only. The existing first-run journeys are in installed-home.mjs and ui-local-signin.mjs, which this old Evidence cell does not cite.

### Data

#### DATA-001 — Export contents

Core · published · **partial** · Cites BASE-DATA-001

**Requirement.** Installation exports carry the complete Launch workspace and its original stored import files.

**Acceptance.**
1. In addition to the archive guarantees in `BASE-DATA-001`, the export contains every workspace setting, operator, campaign, tag, custom-field definition and value, deliverable, milestone and dependency, risk, decision and supersede link, lens, comment, activity entry, notification, delivery record, automation definition and run, import record, AI analysis, and AI usage record as JSON, and every stored import file in its original form.

**Evidence.** `src/domains/portability/archive.server.ts`, `tests/rer-retained-archive.mjs`
**Gap.** Installation archive machinery and retained-archive restoration have current push coverage. Full clause-named enumeration of every required Launch entity, setting and original import file remains unproven.

#### DATA-002 — CSV export

Core · published · **done**

**Requirement.** CSV exits carry the selected view exactly as the operator sees its records and fields.

**Acceptance.**
1. An operator can export the campaign grid or any lens or queue result as CSV containing exactly the visible fields in their displayed order and exactly the records the current conditions select, with dates in the workspace timezone and money in the workspace currency, naming the view, the currency, and the instant it was taken.
2. It is a one-way download and creates no sync relationship with any external system.

**Evidence.** `tests/ui-launch-operator-doors.mjs` — "[IMPORT-003] [IMPORT-005] [DATA-002] [CAMP-008] [CAMP-013] [SET-001] [SET-003] [OPS-002] Launch operator doors at desktop and phone"
**Gap.** None.

#### DATA-003 — Capacity limits

Core · published · **partial**

**Requirement.** Declared workspace limits refuse excess work visibly without silently losing data.

**Acceptance.**
1. A create, invitation or import that would exceed a declared workspace limit is refused as a conflict naming the limit, its value and the current count, with no changes.
2. No record, row, or field is silently dropped or trimmed.

**Evidence.** `src/apps/launch/domain.server.ts`, `tests/records-import-d1.mjs`, `tests/records-manual-release.mjs`
**Gap.** Launch storage guards and import/adoption capacity refusals are implemented and related tests run in CI. Full clause-named create/invitation/import coverage of every declared workspace limit, exact error counts and zero effects remains unproven. Gap: `fieldsPerTable` 500 is declared in code, not `seed.json -> limits`; field 501 is refused as HTTP 400 `validation`, not `capacity_limit`; imports still cap at 80 fields.

### Records, schema and the app model — target

#### RECORDS-008 — Merge import into an existing table

Core · target · **partial** · From RECORDS-008

**Requirement.** An operator with create and update rights on a table imports a CSV file, an.xlsx sheet or a Google Sheet (INTEG-003) into that existing, populated table. They map each column to a field or skip it and choose zero or more merge fields. The preview lists exactly the records that will update, with before and after values; the rows that will create records; unchanged rows; and refused rows with the reason for each. A row whose merge value matches exactly one existing record updates it, and a row that matches none creates one. A merge value that matches several records, or appears twice in the file, is refused rather than guessed. Linked-record columns resolve by the linked table's primary value, the way a person types it. When the operator ticks it, a missing linked record is created. An ambiguous or unknown name is shown on its row. Values convert by field type: US and ISO dates, currency with or without `$` and thousands separators, select labels, checkbox words, multi-select separators and E.164 or US-formatted phones. A column mapped to a field the importer cannot write, to a calculated field or to a hidden field is refused before the preview. Commit rechecks policy and record versions and applies the import in one atomic write. For 7 days the whole import can be undone as ordinary audited writes; a cell that someone changed since is reported as a conflict, not overwritten (VIEW-014). The mapping and merge fields are saved per table and source name, so next week's file is mapped in one step. The importer chooses whether import writes fire automations; the default is off, as in RECORDS-005. Every import yields a receipt counting created, updated, unchanged and refused rows.

**Acceptance.**
1. A fixture vendor price list, as CSV and as.xlsx, is merged on SKU into a populated table.
2. The preview and commit update exactly the matching records with the expected values, create the rest, resolve linked records by primary value, and refuse a mapped forbidden field and a repeated SKU.
3. Undo restores every prior value.
4. A cell another operator changed after the import is reported as a conflict on undo.
5. A saved mapping applied to next week's fixture file produces the expected preview.

**Evidence.** `tests/records-csv-fence.mjs`, `src/domains/records/csv-mappings.server.ts`, `src/domains/records/csv-typed-values.ts`, `src/ui/records/manual-import-mappings.tsx`, `docs/contract/RECORDS-008/`
**Gap.** Versioned per-person/table/source CSV mappings restore columns and one merge key for next week; preview and commit recheck schema, policy and record versions. US/ISO dates, exact USD/number amounts, checkbox words, select and separated/quoted multi-select labels convert; primary-value links and ambiguous names use current policy. Real 61-vendor create then saved-mapping update is exercised at 1440/390. Workbook and Google Sheets intake now use the same mapping, before/after preview and atomic merge; hourly Sheets merges recheck the configuring owner and pause on lost rights. Gaps: zero or multiple merge keys, missing-link creation, phone normalization, scheduled CSV/JSON URLs and emailed attachments under RECORDS-010, seven-day undo and automation choice. Currency and multi-select field authoring is recorded under FIELD-001 (`src/ui/records/schema/field-type-label.ts`). Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### RECORDS-010 — Scheduled imports into an existing table

Core · target · **partial** · From RECORDS-008

**Requirement.** A scheduled import runs the same mapping through the same preview rules from a Google Sheet, a CSV or JSON URL, or an emailed attachment (INTEG-002's inbound address). Rows that need review hold the run for a person, while a clean run commits on its own. Saved table/source mappings and merge fields from RECORDS-008 are reused; the importer chooses whether writes fire automations, off by default, and each run yields created, updated, unchanged and refused row counts.

**Acceptance.**
1. A scheduled Google Sheet import, run at a fixed clock against a recorded API fixture, commits a clean run and holds one with a refused row.
2. Run the same saved mapping from a CSV URL, JSON URL and an emailed attachment received under INTEG-002; each applies RECORDS-008’s conversion, matching, preview, authority and version rules.
3. The receipt counts created, updated, unchanged and refused rows, and the chosen automation setting is respected.

**Evidence.** `tests/records-csv-fence.mjs`, `src/domains/records/csv-mappings.server.ts`, `src/domains/records/csv-typed-values.ts`, `src/ui/records/manual-import-mappings.tsx`, `docs/contract/RECORDS-008/`
**Gap.** Versioned per-person/table/source CSV mappings restore columns and one merge key for next week; preview and commit recheck schema, policy and record versions. US/ISO dates, exact USD/number amounts, checkbox words, select and separated/quoted multi-select labels convert; primary-value links and ambiguous names use current policy. Real 61-vendor create then saved-mapping update is exercised at 1440/390. Workbook and Google Sheets intake now use the same mapping, before/after preview and atomic merge; hourly Sheets merges recheck the configuring owner and pause on lost rights. Gaps: zero or multiple merge keys, missing-link creation, phone normalization, scheduled CSV/JSON URLs and emailed attachments under RECORDS-010, seven-day undo and automation choice. Currency and multi-select field authoring is recorded under FIELD-001 (`src/ui/records/schema/field-type-label.ts`). Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### RECORDS-009 — Record templates and duplicate record

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-DATA-003

**Requirement.** Any operator with create rights can duplicate a record, optionally with its linked records and attachments. The copy goes through the same policy, validation and automation triggers as a new record, and fields the operator cannot write are left empty. A creator can save record templates per table: preset field values, preset linked records and child records to create with it (a purchase order with its standard line items). Operators apply a template from the grid, a form, an interface button (IFACE-004) or an automation action (AUTO-USER-003).

**Acceptance.**
1. Duplicate journey, with and without links, where a field the operator cannot write is left empty.
2. A template is applied from the grid and from an automation, and it creates its child records in one audited write.

**Evidence.** `tests/records-templates.mjs` (duplicate links, empty unwritable fields, validation, atomic children, replay and refusal); `tests/helpers/record-template-browser.mjs` (recordTemplateBrowser: attachment bytes, saved presets, grid and form, at 1440 and 390); `tests/helpers/record-template-automation.mjs` (recordTemplateAutomation: automation action, audit, native triggers and revoked credentials); `tests/helpers/record-template-buttons.mjs` (recordTemplateButtons and recordTemplateButtonsBrowser: configured interface button, confirmation and disabled refusal); `tests/helpers/record-template-automation-browser.mjs` (recordTemplateAutomationBrowser: saved action and dry preview); `tests/lifecycle-erasure.mjs` (public erasure before the first installation transfer: templates and their buttons)
**Gap.** All named product doors are implemented and locally proven. The standard-layout conversion is complete; this carried partial status awaits an independent fresh-judge claim for the named journeys.

#### OWN-001 — Owned installation without seat charges

Core · target · **partial** · Cites BASE-INSTALL-001, BASE-DATA-005, BASE-DATA-001 · Register R-12

**Requirement.** Cradle is MIT licensed and offers RER Managed hosting as an alternative installation path. Settings shows current product usage against every declared workspace limit.

**Acceptance.**
1. Settings shows the current usage and named capacity for every declared workspace limit.

**Evidence.** `scripts/installer/seed.mjs`, `tests/rer-data-roundtrip.mjs`, `tests/rer-retained-archive.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** Missing a cited Settings-usage journey that reads usage against every declared limit; the cited browser journey exercises custom fields, samples and ownership without reading usage. Installer and whole-installation archive work are covered by the cited CLI journeys, but neither every-limit usage nor a fresh own-account/Managed installation is exercised here.

#### SCALE-001 — Operational scale

Core · target · **partial** · Cites BASE-INPUT-001

**Requirement.** A base holds at least 250,000 records per table and 500,000 per base, 500 fields per table and 50 tables per base. Grid open, filter, sort and group return the first page within 1 second p95 at those sizes; a single-record write commits within 300 ms p95; formula and rollup reads meet CALC-004. Limits are declared in `seed.json → limits`, measured rather than estimated, and a request beyond one is refused naming the limit, its value and the current count (DATA-003). Larger analytic workloads are served by SYNC-002, not by stretching a request.

**Acceptance.**
1. Declared load profile run against emitted workerd/D1 recording p50/p95/p99 and error rate, then an authorized hosted run.
2. The declared 40-store data and concurrency profile is measured alongside the workspace limits, recording p50/p95/p99, concurrency, plan, dataset and error rates without relaxing stricter retained response targets.

**Evidence.** `scripts/scale/run.mjs`, `docs/contract/SCALE-001/`, ACCEPTANCE.md
**Gap.** Additive local workerd/D1 loading and authenticated HTTP measured 250,000 records/table, 500,000/base and 50 tables at 80 fields (86 physical columns); all seven diagnostic latency targets passed with zero errors. Gap: the full profile at `15b0403a762f32fccb4b03bb8c668efd9a1fc9bc` was refused at CREATE TABLE (D1_ERROR: too many columns). At 6 columns plus 0-4 per field, D1's limit of 100 columns bars 500 fields until SCALE-002. The 80-field run is diagnostic only. Hosted: NOT RUN. Evidence: `scripts/scale/run.mjs`, `docs/contract/SCALE-001/`, ACCEPTANCE.md. The 80-field diagnostic is not SCALE-001 acceptance.

#### SCALE-002 — Wide tables

Core · target · **missing**

**Requirement.** A table holds 500 fields of any FIELD-001 mix, whatever the engine's limits. Every field is created, written, filtered, sorted, grouped, formula-referenced, imported, exported, restored and read through the API at SCALE-001's sizes and targets. Field 501 is refused per DATA-003 (the declared fields-per-table limit). A full-profile base's bytes are measured. A second such base is accepted, or refused naming the storage limit.

**Acceptance.**
1. Emitted workerd/D1 holds a 50-table, 500,000-record base whose largest table has 250,000 records and 500 mixed fields, money included.
2. It proves: - field 500 filtered, sorted and grouped, first page ≤1 s p95; - a write to fields 1 and 500 ≤300 ms p95; - a formula over both fields meeting CALC-004; - field 501 refused; - byte-equal RECORDS-006 return and SNAP-001 restore; - API-USER-002 reads of all 500 fields; - a 500-column RECORDS-005 CSV import; - p50/p95/p99, error rate and bytes recorded; - then a hosted run.

**Evidence.** None yet.
**Gap.** Gap: wide-table storage is not implemented. The maintained installation archive inventories physical tables; its logical extra-payload consumer runs outside the final D1 restore transaction. Atomic logical-table archive/restore support is needed before sharded custody can meet this clause. Every 500-field public-door point, the 25,000-record tier, the 250,000/500,000-record 50-table profile, measured bytes and second-base storage acceptance remain unproven. Hosted: NOT RUN.

### Fields, calculations and attachments

#### FIELD-001 — Complete field types

Core · target · **partial**

**Requirement.** A table can hold: single-line text; long text, plain or rich, where rich text supports bold, italic, strikethrough, inline code, headings (levels 1–3), bulleted and numbered lists, checklists, block quotes, code blocks and links, stored as Markdown; number (integer, or decimal with set precision); currency (USD by default, any ISO 4217 code, stored as exact minor units); percent; date, and date-time with time zone, where each date-time field displays either in each viewer's local time zone or in one fixed time zone for everyone (the workspace zone by default), stores UTC and shows the zone it used; duration; checkbox; single select and multiple select, with colors; rating (1–10); email; US-first phone (stored E.164, shown (555) 123-4567); URL; user (one or many operators; notification on assignment is FIELD-004); linked record (one or many; its record picker is FIELD-005); lookup, rollup, count and formula; attachment; barcode (scanned or typed, a Code 128, UPC, EAN or QR value); autonumber; created time, last-modified time, created by and last-modified by; button (IFACE-004). Each type validates on every door (UI, form, API, import, automation) and exports and re-imports losslessly.

**Acceptance.**
1. A builder journey creates one field of every type.
2. It writes valid and invalid values through the UI, a public form, REST and CSV, then re-imports the base export with every value equal.
3. A rich-text value using every listed format comes back byte-equal in Markdown after a base JSON export and re-import, a CSV export and re-import, and a REST read and write.
4. A date-time field set to the viewer's local zone shows the same instant as 9:00 AM Eastern to a viewer in New York and 6:00 AM Pacific to a viewer in Los Angeles.
5. Set to a fixed zone, it shows both viewers 9:00 AM Eastern.
6. Email accepts one valid address without control characters; rating stores whole values from 1 to a configured maximum of 1–10 (default 5); duration stores whole seconds and is entered and shown as h:mm or h:mm:ss.
7. The builder, record editor and typed lookups carry all three; UI, authenticated form, REST, CSV and automation writes refuse invalid values naming the field, and base JSON/view CSV/explicit-correspondence CSV roundtrips preserve their values.

**Evidence.** `tests/records-manual-release.mjs` via `tests/helpers/records-phone-journey.mjs` and `tests/helpers/records-typed-field-journey.mjs` (schema and every write door); `tests/records-manual-roundtrip.mjs` via `tests/helpers/records-field-portability.mjs` (JSON and CSV equality); `tests/ui-records-builder.mjs` via `tests/helpers/field-browser.mjs` (1440/390)
**Gap.** The builder now authors US-first Phone fields stored as E.164, displayed with US formatting, edited with tel inputs and carried by typed lookups. UI, authenticated form, REST, CSV and automation writes name and refuse invalid phone values; JSON and view/explicit-correspondence CSV roundtrips retain values. Existing text-bound SMS actions continue; their editor asks for a Phone field. Email accepts one valid address without control characters; rating stores whole values from 1 to a configured maximum of 1–10 (default 5); duration stores whole seconds and is entered and shown as h:mm or h:mm:ss. The builder, record editor and typed lookups carry all three; UI, authenticated form, REST, CSV and automation writes refuse invalid values naming the field, and base JSON/view CSV/explicit-correspondence CSV roundtrips preserve their values. The other authored field types remain as previously recorded. Long/rich text, percent, barcode, autonumber, metadata, buttons, multiple people and authored precision/time-zone formatting remain absent; importing people requires matching active installation identities.

#### FIELD-002 — Field conversion and table deletion with preview

Core · target · **done**

**Requirement.** An owner can convert a field to another type (text to select, select to linked record, number to currency, text to date and so on) and delete a field or table. The impact preview lists every value that converts, every value that would be lost with examples, and every formula, view, form, automation and API key that depends on it; adoption keeps a recovery export and a deleted table or field stays restorable for 30 days (SNAP-002).

**Acceptance.**
1. Conversion matrix test through Adopt with lossy and lossless cases; delete-then-restore journey.

**Evidence.** `tests/helpers/field-conversion-journey.mjs` — "fieldConversionJourney"; `tests/helpers/field-trash-journey.mjs` — "fieldTrashJourney"; `tests/helpers/field-history-restore-journey.mjs` — "historicalLinkedFieldRestore"; `tests/helpers/schema-purge-journey.mjs` — "schemaPurgeJourney"; `tests/helpers/field-browser.mjs` — "fieldBrowser"
**Gap.** None.

#### FIELD-003 — Validation and conditional rules

Core · target · **partial**

**Requirement.** Fields can be required, unique, bounded (min/max, length, pattern) and given defaults; table rules state conditions across fields ("Ship date is required when Status is Shipped"; "Discount above 20% needs Manager approval"). Rules are enforced on every write door with a message naming the rule, and a rule added to existing data reports the records that already break it before adoption.

**Acceptance.**
1. Writes through UI, form, REST, import and automation refused with the rule's message; adoption preview counts existing violators.

**Evidence.** `src/domains/records/validation-values.server.ts`, `src/domains/records/manual/rule-preview.server.ts`, `tests/helpers/records-field-rules.mjs`, `docs/contract/FIELD-003/`
**Gap.** The schema builder authors required/unique fields, numeric/date/money bounds, text lengths and bounded patterns, typed defaults and named cross-field rules. Canonical create/patch, authenticated forms, CSV/bulk and automation enforce complete proposed records and report the rule. Adoption previews count and link existing violators and refuse adoption until resolved. Defaults and rules survive portable exports. Conditions currently cover stored fields, with a bounded safe pattern language; calculated-field conditions and full pattern syntax remain absent. Public shareable form acceptance remains blocked by FORM-001

#### FIELD-004 — Notify people when they're added to a user field

Core · target · **missing**

**Requirement.** A user field has the option "Notify people when they're added". It is on by default for new user fields and off for fields imported without that setting. Anyone newly added to the field by any door (grid, form, interface, API, import with notifications chosen, automation or agent) is notified once in-app and by email. When a Slack, Teams or Nook connection exists (INTEG-001), the person's chosen channel also receives the notice. It names the record, the field, the person who added them and a link the recipient can open under their current read policy. A person who adds themselves is not notified, and neither is anyone who cannot read the record. Re-saving the same value or a bulk edit that leaves someone in the field sends nothing; NOTIFY-006's one-per-event and self-action rules apply. A person added to a user field also watches the record's comments (COLLAB-003) until they are removed from the field or unwatch it. Later comments on the record reach them in their chosen delivery, at once or in a digest. A person removed from a user field stops receiving that record's comments unless they watch it separately.

**Acceptance.**
1. A journey and an emitted-worker test add an operator to an Assignee field and show that operator, and nobody else, notified once in-app and once by email.
2. A fake Slack edge receives exactly one message.
3. A self-assignment notifies no one.
4. A bulk edit that keeps the same assignee sends nothing.
5. A later comment on the record reaches the assignee.
6. After the assignee loses read access, the next comment notifies nobody.
7. Turning the option off stops further notices.

**Evidence.** None.
**Gap.** on general bases, user fields hold people (src/domains/records/validators.ts:14 `person`) with no notification. Launch decisions notify a new assignee (DEC-005; src/apps/launch/transitions.server.ts), and that can be reused

#### FIELD-005 — Linked-record picker

Core · target · **partial**

**Requirement.** Choosing a linked record is fast and limited to the right records: Search and display. The picker searches the linked table by its primary field and by other fields the author chooses, and each candidate shows those fields (and an attachment thumbnail when chosen), so similar names can be told apart. It pages through tables at the SCALE-001 limits. Limit to a view. The author can limit selection to the records in one view of the linked table (for example "Active vendors"). Its filters are evaluated when the picker opens, so a vendor marked inactive stops being offered. Grids, record pages, forms (FORM-001), interfaces (IFACE-001) and the mobile app (MOBILE-001) offer only those records. By default the limit governs pickers only, as Airtable's does; the author can also enforce it on every write door, and then a REST, import or automation write that links a record outside the view is refused naming the field. Create from the picker. The picker can create a new linked record in place: a short form of the linked table's fields opens, and the new record is created and linked in one audited write. The option is shown only to people who may create records in the linked table, and the author can turn it off per field and per form. Policy. Candidates obey the chooser's current row and field policy on the linked table, so a record or field they cannot read is never offered, searched or shown.

**Acceptance.**
1. A builder journey at 1440 and 390 limits Orders' Vendor link to the "Active vendors" view.
2. In the grid, a public form and an interface, the picker offers exactly the active vendors of a 5,000-vendor fixture.
3. A search by a vendor's city finds it, and an inactive vendor is never offered.
4. With enforcement on, a REST write linking an inactive vendor is refused naming the field. "Create new vendor" from the picker creates and links the vendor in one audited write.
5. An operator without create permission on Vendors sees no create option.
6. A vendor hidden by row policy never appears.

**Evidence.** `tests/records-csv-fence.mjs`, `tests/helpers/records-picker-journey.mjs`, `src/domains/records/csv-link-candidates.server.ts`, `src/ui/records/schema/link-picker-settings.tsx`, `docs/contract/FIELD-005/`
**Gap.** The owner authors additional text/URL search fields, scalar context and a shared target view through reviewed schema adoption. The readable primary text field is always searched. Every candidate page uses the actual source relationship, live shared-view filters/order and current source/target policy; inaccessible search/context is omitted and missing/private/invalid views refuse candidates. Record creation/editing, filters, bulk controls and authenticated forms share the picker. Native JSON preserves/remaps field and view identities; CSV explicitly warns of picker-setting loss. Attachment thumbnails, create-and-link, optional all-write enforcement, public interface/mobile and 5,000-vendor acceptance remain unfinished. Gap (SCALE-002): profile timing needs 500-field tables.

#### CALC-001 — Formula fields

Core · target · **partial** · From CALC-001

**Requirement.** An owner or creator writes formulas in a spreadsheet-style language whose syntax and function set match Airtable's formula field reference, so an Airtable formula pastes in unchanged. That covers the operators (`+ - * / & = != < > <= >=`), field references in `{braces}` and every function CALC-005 lists, including WORKDAY and WORKDAY_DIFF with US federal holidays. The editor autocompletes fields and functions, shows the result type, previews results on real records before adoption and names the field and position of any error. A cell whose formula cannot be computed shows why rather than a blank; ERROR() and ISERROR behave as Airtable's do. Result display and exports follow CALC-006.

**Acceptance.**
1. A formula builder journey authors one formula from each function family and checks the previewed results.
2. A broken formula shows its positioned error.
3. The evaluator passes CALC-005's reference fixture with every row equal.

**Evidence.** `tests/ui-records-builder.mjs` (“[SNAP-002] Manual records browser journeys and concrete UI review corrections”) through `tests/helpers/records-base-roles-journey.mjs` (baseRolesJourney: native creator formula authoring, independent adoption and retained-preview refusal after demotion); `tests/records-manual-roundtrip.mjs` through `tests/helpers/records-calculation-journey.mjs` (calculationJourney: supported functions, real-record previews and portable results)
**Gap.** The installation owner and a non-installation-owner creator author the bounded Airtable-style subset with field and function suggestions, inferred result types, positioned syntax errors and labeled real-record previews. The creator independently adopts an additive formula and reads the expected result; demotion refuses the retained formula preview without changing live schema or record values. Arithmetic, comparison, logical, text and day-based date functions run through API, CSV and native JSON exits. Remaining: full CALC-005 function coverage and Airtable semantics, real-Airtable reference captures, and the separate missing CALC-006 target for contract-specified result formatting across views, interfaces, forms, record pages, print, email, CSV and REST, including raw versus formatted values, precision, currency, percent, duration and viewer-local or fixed-zone dates.

#### CALC-006 — Formula result formatting

Core · target · **missing** · From CALC-001

**Requirement.** The author formats the result by its type, as Airtable's formatting tab does: a number with set decimal places and thousands separators; currency (USD by default, any ISO 4217 code) with set places; percent with set places; duration as h:mm, h:mm:ss or h:mm:ss.S; a date in US (10/17/2026), ISO, European or friendly form, with or without a 12- or 24-hour time, in a viewer-local or fixed zone (FIELD-001). The format applies wherever the value is shown: views, interfaces, forms, record pages, print layouts, emails (AUTO-USER-010) and CSV export. Stored values stay raw: REST and JSON export return the raw value, and REST returns the formatted text when asked for it (the string-format request documented in docs/contract/capability-mechanisms.md).

**Acceptance.**
1. A formula returning 1234.5 formatted as USD with 2 places shows `$1,234.50` in the grid, an interface and the CSV export, while REST returns `1234.5` and, with the documented string-format request, `$1,234.50`.
2. A percent result of 0.125 shows `12.5%`.
3. A date result formatted US with a 12-hour time shows `10/17/2026 3:05 PM` in the field's fixed Eastern zone.
4. Changing the format changes no stored value.

**Evidence.** `tests/ui-records-builder.mjs` (“[SNAP-002] Manual records browser journeys and concrete UI review corrections”) through `tests/helpers/records-base-roles-journey.mjs` (baseRolesJourney: native creator formula authoring, independent adoption and retained-preview refusal after demotion); `tests/records-manual-roundtrip.mjs` through `tests/helpers/records-calculation-journey.mjs` (calculationJourney: supported functions, real-record previews and portable results)
**Gap.** Result formatting is wholly absent. The installation owner and a non-installation-owner creator author the bounded Airtable-style subset with field and function suggestions, inferred result types, positioned syntax errors and labeled real-record previews. The creator independently adopts an additive formula and reads the expected result; demotion refuses the retained formula preview without changing live schema or record values. Arithmetic, comparison, logical, text and day-based date functions run through API, CSV and native JSON exits. Remaining: full CALC-005 function coverage and Airtable semantics, real-Airtable reference captures, and contract-specified result formatting across views, interfaces, forms, record pages, print, email, CSV and REST, including raw versus formatted values, precision, currency, percent, duration and viewer-local or fixed-zone dates. The cited formula journeys show authoring and bounded evaluation through API, CSV and native exits, but no configured formula-result display or export formatting journey; this part remains missing.

#### CALC-002 — Lookups across links

Core · target · **done**

**Requirement.** A lookup field shows chosen fields of linked records through a link. It recomputes from current linked values on read and respects the reader's current row and field policy on the linked table. Like a rollup (CALC-003), a lookup can be conditional: it shows only linked records that match a condition, sorted by a chosen field and limited to the first N. For a collection source (multi-select values, linked records or a nested lookup array), it selects linked records first, applying the condition, sort and first-N limit, then flattens their collections in that selected record order and each collection's value order. Duplicate values are retained. An empty collection contributes no values; an empty result is an empty array (`[]`), never null or an error.

**Acceptance.**
1. A manual round trip recomputes a lookup after the linked record changes, and restricted linked fields are hidden from the lookup.
2. A conditional lookup that shows only open linked orders, sorted by date descending and limited to 3, returns exactly the expected three values, and it changes on the next read after one of those orders closes.
3. Through the schema preview/adoption and record query doors, select open linked orders sorted by date descending and limited to 3, including an order with an empty collection.
4. Check multi-select, linked-record and nested lookup sources: the flattened result follows the selected record order and then each source collection's value order, and a value shared by two selected records appears twice.
5. Check that the empty collection contributes nothing while its record still occupies one of the three selected-record slots; flattening does not pull in a fourth record.
6. With no linked records, a null single link, or only empty source collections, each collection lookup returns exactly `[]`, with no calculation error and no null result.

**Evidence.** `tests/helpers/records-lookups-journey.mjs` — "lookupJourney"; `tests/helpers/records-collection-lookups.mjs` — "collectionLookupJourney"; `tests/helpers/records-collection-browser.mjs` — "collectionLookupsBrowser"
**Gap.** None.

#### CALC-003 — Rollups and counts

Core · target · **partial**

**Requirement.** A rollup aggregates a field across linked records with SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTALL, ARRAYJOIN, ARRAYUNIQUE, AND, OR, optionally only over linked records matching a condition; a count field counts linked records. Both are authored in the builder with previewed results.

**Acceptance.**
1. Builder journey adds a conditional rollup and a count; editing a linked record changes them on the next read.

**Evidence.** `tests/records-manual-roundtrip.mjs`, `tests/helpers/records-calculation-journey.mjs`, `src/domains/records/formula-rollup.ts`, `src/ui/records/schema/computed-editor.tsx`, `docs/contract/CALC-003/`
**Gap.** The owner authors conditional SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTALL, ARRAYJOIN, ARRAYUNIQUE, AND, OR and count fields over single/multiple links, with real-record previews and next-read results. ARRAYUNIQUE refuses boolean/money sources at adoption; supported arrays use canonical strings. Nonterminating/excessive-precision averages and fractional minor-unit currency averages are visibly unavailable. Creator schema adoption is available under PERM-009; rollup-specific creator acceptance remains unproven.

#### CALC-004 — Calculation consistency

Core · target · **partial**

**Requirement.** After any committed write, the next read anywhere (grid, interface, API, export, automation condition) returns calculated values that reflect it; cycles and depth over 64 are refused at adoption; a formula over 10,000 linked records still returns within 1 second p95 or states that it is unavailable with the reason. Calculated values are never written directly (`BASE-INPUT-001`).

**Acceptance.**
1. Write-then-read test across UI, REST and export; cycle refused at adoption; timing at the SCALE-001 profile.

**Evidence.** `tests/records-manual-roundtrip.mjs`, `tests/helpers/records-calculation-journey.mjs`, `tests/helpers/records-lookups-journey.mjs`, `src/domains/records/calculation-bounds.ts`, `docs/contract/CALC-004/`
**Gap.** Public-door preview/adopt/write/read/CSV/native JSON copy proves current calculations, hidden-dependency redaction and stale-preview refusal. Ordered conditional many-link lookups recompute typed values immediately after a linked order closes, in REST, native return and the record UI. Cycles, expression/node bounds and dependency depth over 64 are refused. The 10,000-link and hosted SCALE-001 timing profile, and general automation-condition consistency, remain unproven or absent. Gap (SCALE-002): profile timing needs 500-field tables.

#### CALC-005 — Airtable formula coverage

Core · target · **partial** · Register R-6

**Requirement.** The coverage bar is every function in Airtable's formula field reference (support.airtable.com/docs/formula-field-reference), evaluated with Airtable's results, including its handling of blanks, errors, types and time zones. These are the functions: Logical: AND, BLANK, ERROR, FALSE, IF, ISERROR, NOT, OR, SWITCH, TRUE and XOR. Text: the `&` operator, CONCATENATE, ENCODE_URL_COMPONENT, FIND, LEFT, LEN, LOWER, MID, REGEX_EXTRACT, REGEX_MATCH, REGEX_REPLACE, REPLACE, REPT, RIGHT, SEARCH, SUBSTITUTE, T, TRIM and UPPER. Numeric: ABS, AVERAGE, CEILING, COUNT, COUNTA, COUNTALL, EVEN, EXP, FLOOR, INT, LOG, MAX, MIN, MOD, ODD, POWER, ROUND, ROUNDDOWN, ROUNDUP, SQRT, SUM and VALUE. Date and time: DATEADD, DATESTR, DATETIME_DIFF, DATETIME_FORMAT, DATETIME_PARSE, DAY, FROMNOW, HOUR, IS_AFTER, IS_BEFORE, IS_SAME, MINUTE, MONTH, NOW, SECOND, SET_LOCALE, SET_TIMEZONE, TIMESTR, TODAY, TONOW, WEEKDAY, WEEKNUM, WORKDAY, WORKDAY_DIFF and YEAR. Array: ARRAYCOMPACT, ARRAYFLATTEN, ARRAYJOIN, ARRAYSLICE and ARRAYUNIQUE. Record: CREATED_TIME, LAST_MODIFIED_TIME (with or without field arguments) and RECORD_ID. The required function inventory has no exceptions. An exception can be added only by a contract change that names the function and the reason, and the move-in receipt then counts each formula that uses it. When Airtable adds a function to its reference, it joins this list in the next contract revision. The reference fixture holds at least one row per listed function, plus blank, error, time-zone and US-holiday edge rows. Each row records the formula text, its input field values and the expected value as captured from a real Airtable base, with the capture date. Smartsheet and Quickbase formulas get the same treatment under MIGRATE-002 and MIGRATE-003: every function in each incumbent's published formula reference is covered or named as an exception.

**Acceptance.**
1. The evaluator returns the expected value for every row of the reference fixture through the formula field, REST and CSV export.
2. A fixture-coverage check fails when any listed function has no row, and a translation check fails when any listed function is flagged as untranslatable on move-in.

**Evidence.** `src/domains/records/formulas.ts`
**Gap.** The bounded formula language supports arithmetic and comparison operators, CONCATENATE, COALESCE, IF, AND, OR, NOT, UPPER, LOWER, TRIM, LEN, TRUE, FALSE and BLANK, plus DATEADD and DATETIME_DIFF for days (`src/domains/records/formula-functions.ts`, `src/domains/records/formula-parser.ts`). Money arithmetic retains currency and scale. Formula and rollup authoring ship under CALC-001 and CALC-003; rollup aggregate support does not imply the same function is available in a formula. Full Airtable semantics, the remaining listed functions and the real-Airtable reference fixture remain unverified or absent. No exception to the required coverage is declared.

#### FILE-001 — Attachments with previews

Core · target · **partial** · Cites BASE-INPUT-003, BASE-ROLE-001

**Requirement.** An attachment field holds files stored privately in the installation's R2. A browser upload takes files up to 100 MB each. A resumable multipart upload, through the API, the phone apps or the browser for a large file, takes files up to 5 GB each (site-visit video, for example). Both limits are declared in `seed.json → limits` and refused with the limit named. Images, PDFs, video, audio and Office documents show thumbnails and an in-app preview; downloads require current row and field authority and use short-lived links. Files can be added by upload, drag and drop, paste, phone camera (MOBILE-002), public form (FORM-001), API and automation.

**Acceptance.**
1. An upload, preview and download journey runs at 1440 and 390, and a revoked operator's old link is refused.
2. An API upload round trip passes, and so does a resumable multipart upload of a 1 GB fixture that is interrupted and resumed and then arrives equal by checksum.
3. A file over each declared limit is refused naming the limit.

**Evidence.** `src/domains/records/attachments.server.ts`, `src/domains/evidence/attachments.server.ts`
**Gap.** src/domains/records/attachments.server.ts:4 and src/domains/evidence/attachments.server.ts:1 hold attachment custody and record projection; manual bases can author attachment fields for FILE-002 references but cannot upload or preview files, and no preview journey exists

#### FILE-002 — Attachments from connected file stores

Core · target · **partial** · From FILE-002 · Cites BASE-ROLE-001, BASE-SECRET-001, BASE-DATA-003, BASE-DATA-004 · Register R-8

**Requirement.** An attachment can instead reference a file in Google Drive, Microsoft OneDrive/SharePoint, Dropbox, Box or [Chest](https://github.com/just-every/run-chest) through that store's picker, keeping the store's own sharing; Cradle shows name, type and thumbnail and never copies the file unless the owner asks.

**Acceptance.**
1. For Google Drive, Microsoft OneDrive/SharePoint, Dropbox, Box and Chest, attach through the store picker against its sandbox or a fake only at the network edge; the cell shows the store reference and its permitted name, type and thumbnail.
2. The reference survives export; the store’s sharing stays unchanged, and file bytes are copied only when the owner asks.

**Evidence.** `tests/evidence-read-privacy.mjs` via `tests/helpers/file-stores-journey.mjs` and `tests/helpers/file-stores-personal.mjs`; `tests/rer-integrations-archive.mjs` via `tests/helpers/file-store-archive.mjs`; `tests/ui-base-import.mjs` via `tests/helpers/file-stores-browser.mjs` (1440/390)
**Gap.** Personal Google Drive, OneDrive, Dropbox and Box references retain their existing picker, custody, preview-sharing and current-policy guarantees. An explicit base-owner Keep a copy request reads through the attacher's current connection and atomically places verified bytes in ordinary attachment custody; replay does not fetch again, no unasked copy occurs, and store deletion/unsharing does not remove the copy. Downloads follow current row/field policy. Attacher erasure removes only their references and credentials while retaining the owner's copy. The real installation archive/import preserves references and exact copied/uploaded bytes, revokes connection custody and requires reconnect; owner reset erases both ordinary uploaded and copied bytes. FILE-007 keeps its independent return limits. Live store consent is NOT RUN. Gap: Chest has no third-party picker or token door; it remains link-only (FILE-002-CHEST default: no duty move).

#### FILE-005 — Personal connected-store accounts

Core · target · **partial** · From FILE-002 · Cites BASE-SECRET-001, BASE-DATA-003, BASE-ROLE-001, BASE-DATA-004 · Register R-8

**Requirement.** An operator who can write an attachment field may connect their own Google Drive, Microsoft OneDrive/SharePoint, Dropbox or Box account with the narrowest read scopes, then list, search and attach through it. A reader may connect only to preview. Each connection belongs to its maker. The installation owner can enable providers, restrict connections to base owners and creators or to the installation owner, and revoke connections; the initial eligibility is people who can write an attachment field.

**Acceptance.**
1. People with write authority list, search and attach through their own account; people with read authority alone connect only for previews.
2. Credentials remain sealed in connection custody; no other person can list, search, attach or preview through the connection, including the installation owner.
3. Turning a provider off or narrowing connection eligibility changes the offered connections; owner revocation ends use.
4. Deprovisioning revokes the person’s connections, and erasure follows the existing erasure rule.

**Evidence.** `tests/evidence-read-privacy.mjs` via `tests/helpers/file-stores-journey.mjs` and `tests/helpers/file-stores-personal.mjs`; `tests/rer-integrations-archive.mjs` via `tests/helpers/file-store-archive.mjs`; `tests/ui-base-import.mjs` via `tests/helpers/file-stores-browser.mjs` (1440/390)
**Gap.** Personal Google Drive, OneDrive, Dropbox and Box references retain their existing picker, custody, preview-sharing and current-policy guarantees. An explicit base-owner Keep a copy request reads through the attacher's current connection and atomically places verified bytes in ordinary attachment custody; replay does not fetch again, no unasked copy occurs, and store deletion/unsharing does not remove the copy. Downloads follow current row/field policy. Attacher erasure removes only their references and credentials while retaining the owner's copy. The real installation archive/import preserves references and exact copied/uploaded bytes, revokes connection custody and requires reconnect; owner reset erases both ordinary uploaded and copied bytes. FILE-007 keeps its independent return limits. Live store consent is NOT RUN. Gap: Chest has no third-party picker or token door; it remains link-only (FILE-002-CHEST default: no duty move).

#### FILE-006 — Store-sharing-aware attachment previews

Core · target · **partial** · From FILE-002 · Cites BASE-ROLE-001, BASE-SECRET-001, BASE-DATA-003, BASE-DATA-004 · Register R-8

**Requirement.** Every reader with current row and field authority sees a store reference’s name, type, size and store link. Thumbnail lookup follows the provider’s own sharing: first through the viewer’s own connection to that provider and account when it can read the item; otherwise through the attacher’s connection only with that attacher’s optional sharing of thumbnails to people who can read the field. The latter setting covers thumbnails alone, never file content or downloads.

**Acceptance.**
1. A viewer who can read the item through their own matching connection receives its thumbnail after a current-authority recheck.
2. Without that connection, a permitted viewer receives a thumbnail through the attacher only after the attacher chooses “Share previews of files I attach with people who can read this field”.
3. Thumbnail sharing is initially off, offered at attachment time, audited and revocable; it ends when the attacher loses field-read authority or the connection is revoked.
4. With neither permitted route, show “connect <store> to preview” and no thumbnail.
5. Thumbnails are not persisted, and each response prevents caching as documented in docs/contract/capability-mechanisms.md.

**Evidence.** `tests/evidence-read-privacy.mjs` via `tests/helpers/file-stores-journey.mjs` and `tests/helpers/file-stores-personal.mjs`; `tests/rer-integrations-archive.mjs` via `tests/helpers/file-store-archive.mjs`; `tests/ui-base-import.mjs` via `tests/helpers/file-stores-browser.mjs` (1440/390)
**Gap.** Personal Google Drive, OneDrive, Dropbox and Box references retain their existing picker, custody, preview-sharing and current-policy guarantees. An explicit base-owner Keep a copy request reads through the attacher's current connection and atomically places verified bytes in ordinary attachment custody; replay does not fetch again, no unasked copy occurs, and store deletion/unsharing does not remove the copy. Downloads follow current row/field policy. Attacher erasure removes only their references and credentials while retaining the owner's copy. The real installation archive/import preserves references and exact copied/uploaded bytes, revokes connection custody and requires reconnect; owner reset erases both ordinary uploaded and copied bytes. FILE-007 keeps its independent return limits. Live store consent is NOT RUN. Gap: Chest has no third-party picker or token door; it remains link-only (FILE-002-CHEST default: no duty move).

#### FILE-003 — Attachments in exports, erasure and migration

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-003

**Requirement.** Base exports, whole-installation archives and Airtable move-in (MIGRATE-001) carry attachment bytes with checksums; erasing a record or person removes their files under `BASE-DATA-003`; the skipped-attachment list of RECORDS-005 becomes empty when every file arrived.

**Acceptance.**
1. Archive round trip with files equal by checksum; erasure test showing no remaining bytes; move-in receipt with zero skipped attachments.

**Evidence.** `tests/rer-data-roundtrip.mjs`, `tests/lifecycle-erasure.mjs`, `src/domains/records/base-transfer/attachment-manifest.ts`
**Gap.** tests/rer-data-roundtrip.mjs carries files in whole-installation archives; tests/lifecycle-erasure.mjs erases R2 files; base JSON export and import list attachments as skipped (src/domains/records/base-transfer/attachment-manifest.ts)

#### FILE-004 — Portable connected-store references

Core · target · **partial** · From FILE-004 · Cites BASE-ROLE-001, BASE-SECRET-001, BASE-DATA-003, BASE-DATA-001, BASE-DATA-004 · Register R-8

**Requirement.** A connected-store reference from FILE-002 leaves every base JSON, CSV-set and workbook exit as the ordered portable object documented in docs/contract/capability-mechanisms.md, alongside FILE-003 file entries. It retains provider, account, stable item identity, name, MIME type, size, modified time, provider digest when supplied, provider-hosted link, attacher and attachment time. Portable return resolution is FILE-007.

**Acceptance.**
1. Export Google Drive, Microsoft OneDrive/SharePoint, Dropbox, Box and Chest references, including a field mixed with retained files, through all three base exit formats.
2. Base JSON keeps a native array; CSV-set and workbook cells keep the identical array as canonical JSON text, with sorted keys and no whitespace; per-view CSV keeps FILE-002’s columns.
3. The exact provider-specific digest choices and null-digest cases follow the documented portable format.
4. No exported reference contains connection identity, credentials, thumbnail or temporary download URLs, sharing settings, resolution state or file bytes.
5. Row and field scope and RECORDS-006 fencing apply; an erased attacher is the anonymous label.
6. Re-export before local resolution reproduces byte-equal portable objects.

**Evidence.** `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”), `tests/evidence-read-privacy.mjs`, `tests/ui-base-import.mjs`, `docs/contract/FILE-004/`
**Gap.** Base JSON, CSV-set and workbook export portable store references without connection bindings, credentials, preview URLs or bytes; canonical unresolved returns and copies preserve those objects, show their metadata without thumbnails and list them on the move-in receipt. Own matching-account metadata checks resolve equal digests, mark null digests unverified, and require audited explicit confirmation for changed content; current row/field authority, anonymous attacher export and uploaded-byte refusal are proven. Evidence: `tests/records-base-exits.mjs` (existing launch roundtrip), `tests/evidence-read-privacy.mjs`, `tests/ui-base-import.mjs`, `tests/helpers/store-reference-exits.mjs`, `tests/helpers/store-reference-resolution.mjs`, `docs/contract/FILE-004/`. Bulk changed-content confirmation reviews multiple selected references, rechecks every observed digest and current row, field and own matching-account connection authority, commits atomically, audits each accepted change and refreshes portable metadata without provider writes. Evidence: `tests/helpers/store-reference-resolution.mjs` (storeReferenceResolution: multi-selection, stale-digest, foreign-account, reader, row, field, connection and current-policy refusals, per-reference audit and portable metadata); `tests/helpers/file-stores-browser.mjs` (resolvedStoresBrowser: explicit selected-file review and confirmation at 1440 and 390). Gap: automatic import-preview lookup, null-account resolution (including current Dropbox, Box and Chest captures) and cross-algorithm equality remain unbuilt or unproven. Older references without captured digest metadata or attachment instant require reattachment; uploaded bytes stay FILE-003. Reference and connection erasure and archive custody follow FILE-002 and FILE-005. This part retains its own unresolved return cases. No real provider call or consent; real consents NOT RUN.

#### FILE-007 — Resolve store references on return

Core · target · **partial** · From FILE-004 · Cites BASE-ROLE-001, BASE-SECRET-001, BASE-DATA-003, BASE-DATA-001, BASE-DATA-004 · Register R-8

**Requirement.** Each base return—RECORDS-005 import, RECORDS-006 copy and INTEG-003 workbook import—returns portable store references without copying file bytes or calling a provider write. Preview resolves metadata only through a matching provider/account connection already held by the returning person and counts each outcome; connection bindings and resolution state remain local to the installation, outside canonical portable content.

**Acceptance.**
1. With no matching connection, a fresh return leaves every reference visibly unresolved at 1440 and 390, showing name, type, size, provider and link, an Unresolved badge and no thumbnail; the receipt lists it beside skipped attachments.
2. An item found with an equal digest resolves; a null digest resolves but is marked unverified. Missing, inaccessible and changed-digest items remain unresolved.
3. Import never prompts for consent mid-job, uses another person’s connection or guesses; a malformed reference array refuses its row naming the cell.
4. A person with field-write authority and a matching connection can later resolve references; a changed digest requires recorded per-reference or bulk confirmation and refreshes name, size, modified time and digest.
5. Provider-edge traces contain no write or sharing call, restricted fields stay absent, and re-exporting unresolved content yields identical portable objects.

**Evidence.** `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”), `tests/evidence-read-privacy.mjs`, `tests/ui-base-import.mjs`, `docs/contract/FILE-004/`
**Gap.** Base JSON, CSV-set and workbook export portable store references without connection bindings, credentials, preview URLs or bytes; canonical unresolved returns and copies preserve those objects, show their metadata without thumbnails and list them on the move-in receipt. Own matching-account metadata checks resolve equal digests, mark null digests unverified, and require audited explicit confirmation for changed content; current row/field authority, anonymous attacher export and uploaded-byte refusal are proven. Evidence: `tests/records-base-exits.mjs` (existing launch roundtrip), `tests/evidence-read-privacy.mjs`, `tests/ui-base-import.mjs`, `tests/helpers/store-reference-exits.mjs`, `tests/helpers/store-reference-resolution.mjs`, `docs/contract/FILE-004/`. Bulk changed-content confirmation reviews multiple selected references, rechecks every observed digest and current row, field and own matching-account connection authority, commits atomically, audits each accepted change and refreshes portable metadata without provider writes. Evidence: `tests/helpers/store-reference-resolution.mjs` (storeReferenceResolution: multi-selection, stale-digest, foreign-account, reader, row, field, connection and current-policy refusals, per-reference audit and portable metadata); `tests/helpers/file-stores-browser.mjs` (resolvedStoresBrowser: explicit selected-file review and confirmation at 1440 and 390). Gap: automatic import-preview lookup, null-account resolution (including current Dropbox, Box and Chest captures) and cross-algorithm equality remain unbuilt or unproven. Older references without captured digest metadata or attachment instant require reattachment; uploaded bytes stay FILE-003. Reference and connection erasure and archive custody follow FILE-002 and FILE-005. This part retains its own unresolved return cases. No real provider call or consent; real consents NOT RUN.

### Views, editing and collaboration

#### VIEW-008 — Spreadsheet-grade grid editing

Core · target · **partial**

**Requirement.** In a grid, an operator edits cells inline, moves with the keyboard, selects ranges, copies and pastes ranges to and from Excel and Google Sheets, fills down, expands a row into its record, resizes, freezes, hides and reorders columns, and adds a record from the last row. A paste that breaks validation shows each failing cell and commits nothing until fixed. Undo and redo are VIEW-015. Find in the current view is VIEW-016.

**Acceptance.**
1. Grid browser journey with keyboard-only editing, a pasted 50×5 range from clipboard text and a refused invalid paste.

**Evidence.** `tests/records-grid-range.mjs`, `src/ui/records/record-grid.tsx`, `src/ui/records/grid-interaction.tsx`, `docs/contract/VIEW-008/`
**Gap.** Missing a cited browser journey for inline/keyboard editing, row expansion, clipboard copy, column resize/freeze/hide/reorder and last-row creation. The cited native range journey proves atomic 50×5 paste, refusal and recovery, while UI source and receipts do not execute those browser outcomes.

#### VIEW-009 — Kanban

Core · target · **done**

**Requirement.** A kanban view stacks records by any single select, user or single linked-record field, shows chosen fields and an attachment cover on each card, and lets an operator drag a card between stacks (an ordinary update under policy) and reorder within a stack.

**Acceptance.**
1. Board journey drags a card and the record's field changes; a read-only operator cannot drag.
2. With an attachment field chosen as the cover, each card shows its record's first image, fitted or cropped as the view sets, and a card with no attachment shows no cover.
3. For a reader who cannot read that attachment field, no card shows a cover.

**Evidence.** `tests/helpers/records-extended-boards.mjs` — "extendedBoardJourney"; `tests/helpers/records-board-journey.mjs` — "boardJourney" and "boardBrowserJourney"
**Gap.** None.

#### VIEW-010 — Calendar

Core · target · **done**

**Requirement.** A calendar view places records by a date or start/end date range in month, week and day layouts in the workspace time zone; dragging moves the dates; the view can be subscribed to as a private iCal feed URL (revocable) from Google Calendar or Outlook.

**Acceptance.**
1. Calendar journey creates, drags and opens records; the iCal feed returns the view's records and stops after revocation.

**Evidence.** `tests/ui-records-calendar.mjs` — "record calendars, boards, private covers and saved view presentation at desktop and phone widths"; `tests/helpers/records-calendar-feed.mjs` — "calendarFeedJourney"
**Gap.** None.

#### VIEW-011 — Gallery

Core · target · **done**

**Requirement.** A gallery view shows records as cards led by an attachment cover image, with chosen fields and the same filter, sort and group as other views.

**Acceptance.**
1. Gallery journey at 1440 and 390 with image covers.

**Evidence.** `tests/helpers/records-gallery-journey.mjs` — "galleryBrowserJourney"
**Gap.** None.

#### VIEW-012 — Timeline and Gantt

Core · target · **done**

**Requirement.** A timeline view lays records on a time axis by date or range, grouped by any field, with day, week, month, quarter and year zoom. A Gantt layout draws dependencies from a linked-record field, flags a record that starts before its predecessor ends, highlights the critical path, and lets an operator drag bars; moving one record never silently moves another. Baselines snapshot planned dates for comparison.

**Acceptance.**
1. A timeline journey groups records, shows the dependency conflict marker and drags a bar, and a baseline is compared after the move.
2. A Gantt fixture of eight tasks, whose single longest dependency chain is known, highlights exactly those tasks as the critical path.
3. After a task's duration changes so that a different chain becomes longest, the highlighted set becomes exactly that chain.
4. Dragging one bar changes no other record's dates.

**Evidence.** `tests/helpers/records-timeline-journey.mjs` — "timelineBrowserJourney"
**Gap.** None.

#### VIEW-013 — Personal, locked and formatted views

Core · target · **done**

**Requirement.** Views are collaborative, personal or locked (only creators may change a locked view). Grouped views show per-group counts and a summary bar with sum, average, min, max, count, empty and percent-filled per column. Conditional formatting colors rows or cells by rules on field values.

**Acceptance.**
1. View journey: personal view hidden from others, locked view refuses edits, summary values checked against the records, color rule applied.

**Evidence.** `tests/helpers/records-view-settings-journey.mjs` — "viewSettingsJourney"
**Gap.** None.

#### VIEW-014 — Live multi-user editing

Core · target · **done**

**Requirement.** Two operators in the same view see each other's committed changes and new records within 2 seconds without reloading, see who else is viewing, and a write based on a stale version of a record is refused naming the current value rather than overwriting it.

**Acceptance.**
1. Two-browser journey: an edit in one appears in the other within 2 seconds; a stale concurrent edit shows the conflict.

**Evidence.** `tests/helpers/records-live-journey.mjs` — "liveBrowserJourney"; `tests/helpers/records-presence-journey.mjs` — "recordsPresenceJourney"
**Gap.** None.

#### VIEW-015 — Undo and redo

Core · target · **partial**

**Requirement.** In any view, an operator can undo and redo their own recent record changes in that table with Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z or with toolbar buttons. That covers a cell edit, a range paste, a fill, a bulk edit, a drag on a board, calendar or timeline, a record creation and a record deletion. At least the last 50 actions of the session are kept. Each undo or redo is an ordinary audited write under the operator's current policy, and it fires automations as any edit would. Each multi-cell action undoes as one step. An undo whose target cells another person or an automation has changed since is not applied over them. VIEW-014's stale-version rule names each conflicting cell and its current value, applies nothing, and leaves the operator to choose. Record history (COLLAB-002) restores older values beyond the undo stack.

**Acceptance.**
1. A grid journey pastes a 50×5 range, undoes it so every cell has its prior value, then redoes it so every cell has the pasted value.
2. A fill-down, a bulk edit and a deletion are each undone and restored.
3. After a second browser changes one pasted cell, undo reports that cell's conflict and applies nothing.
4. A demoted operator's undo is refused.

**Evidence.** `tests/ui-records-builder.mjs` (Home presents records and bases before launch work with atomic range history at desktop and phone widths) through `tests/helpers/records-grid-range-browser.mjs` (gridRangeBrowserJourney: native 50 by 5 clipboard paste, one-step undo, exact typed redo after reload, second-operator conflict and demoted undo at 1440 and 390); `tests/records-grid-range.mjs` (VIEW-014 VIEW-008 VIEW-015 native HTTP range paste is atomic, reversible, stale-safe and policy checked); `tests/helpers/records-history-journey.mjs`, `tests/helpers/records-board-journey.mjs`, `tests/ui-records-calendar.mjs`, `src/ui/records/grid-history.tsx`, `src/domains/records/history-conflicts.server.ts`
**Gap.** Creation/deletion remain outside the stack; deletion is refused pending evidence erasure/recovery support. Undo requires readable prior cells and browser session storage.

#### VIEW-016 — Find in view

Core · target · **done**

**Requirement.** Cmd/Ctrl+F in a grid, board, gallery, calendar or timeline searches the current view's visible fields and records, under the reader's policy. It highlights each match, shows the match count and steps through the matches with Enter and Shift+Enter, scrolling to each one. Global search across bases is VIEW-005.

**Acceptance.**
1. A grid journey on a 5,000-record fixture finds a term and checks the reported count.
2. Stepping through the matches reaches each matching cell.
3. A hidden field's value is never matched.

**Evidence.** `tests/helpers/records-find-journey.mjs` — "findBrowserJourney"; `tests/helpers/records-browser-summary-find.mjs` — "summaryAndFind"
**Gap.** None.

#### VIEW-017 — List view across linked tables

Core · target · **missing**

**Requirement.** A list view shows records as an outline: top-level records from one table, each expandable into its linked child records in another table (Projects → Tasks → Subtasks), up to 5 levels deep, or into a table's own parent link (the row hierarchy MIGRATE-002 brings from Smartsheet). Each level has its own visible fields, filter and sort. Operators edit cells inline, add a child record under a parent (created and linked in one write), indent or outdent a record and drag it to another parent (each an ordinary link update under policy). Each viewer's expanded and collapsed state is remembered. Every level obeys the reader's row and field policy, so a child the reader cannot see is absent and not counted.

**Acceptance.**
1. A list journey at 1440 and 390 on a fixture of 3 projects, 12 tasks and 30 subtasks shows the exact hierarchy, counts and per-level fields.
2. Adding a subtask under a task creates a linked record.
3. Dragging a task to another project updates its link, and a read-only operator cannot drag.
4. A task hidden by row policy is absent along with its subtasks.
5. A Smartsheet-imported sheet with row hierarchy shows as indented rows.

**Evidence.** None.
**Gap.** the record views are grid, board, form and date views (src/ui/records/record-grid.tsx; src/ui/records/record-board.tsx; src/ui/records/date-views.tsx); there is no list view

#### COLLAB-001 — Record comments and mentions

Core · target · **partial**

**Requirement.** Every record in every base has a comment thread with @mentions of operators; a mention notifies that person in-app and by email (and in Slack, Teams or Nook when connected), comments are searchable by authorized readers, editable by their author and erased with the person under `BASE-DATA-003`.

**Acceptance.**
1. A comment-and-mention journey runs on a manual base.
2. The mentioned operator is notified once in-app and once by email, and with a fake Slack, Teams or Nook edge connected, exactly one message reaches the mentioned person's chosen channel.
3. The author edits their comment and the thread shows it as edited; another operator's edit is refused.
4. Comment search finds the comment for an operator who can read the record.
5. It returns nothing to an operator whose row policy hides the record, and the same holds through REST.
6. Erasure anonymizes the author.

**Evidence.** `tests/evidence-read-privacy.mjs`, `docs/contract/COLLAB-001/`
**Gap.** Slack/Teams/Nook delivery preferences, writable API-key comment grants and full person-erasure acceptance remain.

#### COLLAB-002 — Record history

Core · target · **partial**

**Requirement.** Each record shows who changed which field from what to what and when, including changes by automations, imports, API keys and agents, reprojected under the reader's current row and field policy; an authorized operator can restore a prior field value from history as an ordinary audited write.

**Acceptance.**
1. History reads hide fields the reader cannot see; restore-from-history journey.

**Evidence.** `tests/evidence-read-privacy.mjs`, `docs/contract/COLLAB-002/`
**Gap.** Missing a cited history journey that reads changes actually made by automation, import, API-key and agent doors with their actor and time. The cited journey reads/restores human writes and synthetic retained attachment history under current authority; the named other writers are not executed/read back.

#### COLLAB-003 — Watching and change notifications

Core · target · **missing**

**Requirement.** An operator can watch a record, a view or a table, or be made a watcher of a record by being added to its user field (FIELD-004), and choose in-app, email, Slack, Teams or Nook delivery, immediately or as a daily digest; notifications follow NOTIFY-006's one-per-event and self-action rules and respect current read authority.

**Acceptance.**
1. A watch journey at a fixed clock produces one daily digest that lists every watched change.
2. A watcher set to immediate delivery is notified of a change once in-app and once by email within 1 minute of the commit, and with a fake Slack edge connected, one Slack message arrives.
3. A watcher's own change notifies nobody.
4. A revoked reader stops receiving notifications.

**Evidence.** None.
**Gap.** launch-template notifications only (NOTIFY-001 to NOTIFY-008)

### Forms, interfaces and dashboards

#### FORM-001 — Public shareable forms

Core · target · **partial** · Cites BASE-PUBLIC-001, BASE-ACCESS-003, BASE-INPUT-001, BASE-INPUT-003, BASE-MAIL-001

**Requirement.** A form view can be published at an unguessable public URL that needs no sign-in. Submitters see help text, required marks, attachments upload, linked-record pickers limited to what the form exposes, URL prefill and hidden fields; after submit they see a confirmation message or redirect and can receive an email copy. Submissions are rate-limited per IP, protected by Cloudflare Turnstile, size-bounded, and create records under the form owner's authority with no other read access. The owner can close, reopen, rotate or delete the link.

**Acceptance.**
1. Signed-out browser journey submits with an attachment and prefill; rate limit and Turnstile refusal; rotated link answers 404.
2. A submitter who ticks "Email me a copy" receives exactly one message from the installation sender (AUTO-USER-010), at the address entered in the form's email field, listing the answers they could see and leaving out hidden fields; with the box unticked, nothing is sent.

**Evidence.** `src/domains/records/form-actions.server.ts`, `src/ui/records/forms-panel.tsx`
**Gap.** src/domains/records/form-actions.server.ts:15 and src/ui/records/forms-panel.tsx ship authenticated saved forms; no public form door

#### FORM-002 — Conditional form logic

Core · target · **done**

**Requirement.** Form fields show or hide on earlier answers, sections and pages group long forms, and validation follows FIELD-003 so a submission that breaks a rule is refused with the rule's message.

**Acceptance.**
1. Conditional form journey; hidden fields are never written.
2. Newly hidden values clear; submitted hidden values are refused, visible required fields and canonical rules are checked, and native JSON return/copy preserves layout and conditions.

**Evidence.** `tests/helpers/records-forms-journey.mjs` — "conditionalFormsJourney"
**Gap.** None.

#### FORM-003 — Embedded forms and views

Core · target · **missing** · Cites BASE-PUBLIC-002, BASE-PUBLIC-001

**Requirement.** A form or a read-only view can be embedded in another site (for example a [Pane](https://github.com/just-every/run-pane) site) by iframe or script snippet, showing only the fields and records the share allows.

**Acceptance.**
1. Embed test on an allowed and a refused origin.

**Evidence.** None.
**Gap.** seed.json nonGoals still list public or embeddable views for the current release

#### IFACE-001 — Interface designer

Core · target · **partial** · Cites BASE-DATA-003

**Requirement.** An owner or creator builds interface pages from components bound to tables, arranged on a responsive layout of sections and tabs. The components are grid, list, record detail, record picker, kanban, calendar, timeline, gallery, form, chart, number, text, divider, filter controls and buttons. Each page is published to chosen roles or people, and its components only ever show what the viewer's own policy allows. What each component lets a viewer do, and which records a page shows the viewer, are IFACE-007. Every publish creates a numbered version with its author and time. An owner or creator can open any earlier version read-only and restore it, which publishes it as a new version. An interface is previewed as a chosen user (PERM-004) before publishing and is included in exports (RECORDS-006).

**Acceptance.**
1. A designer journey builds and publishes a three-page interface with a section, two tabs and a record picker; a member sees it and a non-member does not.
2. The designer publishes v2, opens v1 read-only showing v1's layout, and restores v1, which becomes v3 with v1's layout and members see it on their next load.
3. Export and restore preserve every version.
4. Interfaces remain restorable in Trash for 30 days by people entitled to delete them, with links and history intact; erasure bypasses Trash.
5. A schema impact preview names the interface dependents of every conversion or loss, with affected values and loss examples; adoption preserves the recovery export and 30-day field/table restoration required by FIELD-002 and SNAP-002.

**Evidence.** `src/ui/records/record-detail-page.tsx`, `tests/ui-records-builder.mjs`, `src/domains/construction/service.server.ts`
**Gap.** saved views/forms and record detail pages ship (src/ui/records/record-detail-page.tsx; tests/ui-records-builder.mjs); construction machinery exists (src/domains/construction/service.server.ts:9); no page/layout editor. Gap: the interface dependent-preview duty moved verbatim from FIELD-002 and interface trash duty moved from SNAP-002 are unproven; no deletable interface object exists

#### IFACE-002 — Record review and approval screens

Core · target · **partial**

**Requirement.** An interface can present a queue (records matching a condition) beside a record detail with approve, reject or custom action buttons that update named fields, add a comment and trigger automations, so an approver works through a list without touching the grid. The queue's filter can reference the current viewer ("records where Approver is me"), and the screen's per-field edit and action controls follow IFACE-007.

**Acceptance.**
1. Approval journey works a queue of ten records; actions are policy-checked and audited.

**Evidence.** `src/domains/records/form-actions.server.ts`, `tests/ui-launch-walkthrough.mjs`
**Gap.** registered form actions (src/domains/records/form-actions.server.ts:15); launch Decision Queue (DEC-002/DEC-003; tests/ui-launch-walkthrough.mjs) is a template-specific instance

#### IFACE-003 — Charts and dashboards

Core · target · **partial**

**Requirement.** Dashboards show bar, line, area, pie, scatter, number and pivot-table components over any table with filters and grouping, summing currency in USD or the field's currency, with drill-down into the matching records. A dashboard can be emailed or posted to Slack, Teams or Nook on a schedule as a snapshot (REPORT-001).

**Acceptance.**
1. Dashboard journey with each chart type checked against computed totals; drill-down lists exactly the counted records.

**Evidence.** `src/core/features/portfolio/ui/portfolio-overview-page.tsx`
**Gap.** template-specific Portfolio Overview (src/core/features/portfolio/ui/portfolio-overview-page.tsx; CAMP-006); configurable charts absent

#### IFACE-004 — Buttons and record actions

Core · target · **partial**

**Requirement.** A button field or interface button runs a configured action on its record: update fields, create linked records, open a prefilled form or URL, start an automation, or send for signature through [Inkwell](https://github.com/just-every/run-inkwell). It shows a confirmation when configured and is disabled for people whose policy forbids the action.

**Acceptance.**
1. Button journey with confirmation; a forbidden user sees it disabled and the API refuses.

**Evidence.** `src/domains/records/form-actions.server.ts`
**Gap.** Configured table template buttons use current create authority, optional confirmation and one audited parent and child write (`src/domains/records/templates/buttons.server.ts`, `tests/helpers/record-template-buttons.mjs`). General button fields and the remaining configured action kinds are absent.

#### IFACE-005 — External portals

Core · target · **missing**

**Requirement.** An interface can be shared with external people (clients, vendors, contractors) who sign in by magic link to a portal that shows only the records a rule ties to them (for example, where Vendor email equals the signed-in email), lets them submit and update allowed fields, and never shows the workspace, other bases or other external users. The portal's pages use IFACE-007's controls, so a portal grants an external user only the fields and actions its components make editable, within their policy.

**Acceptance.**
1. Two external users each see only their own rows through the portal and REST; an attempt at another's record is refused.

**Evidence.** None.
**Gap.** no code

#### IFACE-006 — Templates and starting apps

Core · target · **done**

**Requirement.** New bases start from editable templates through the same preview and adoption: Customer relationships, Project tracker and Launch readiness, plus US SMB operations templates for inventory and orders, vendor and contract register, asset and equipment register, event planning, field operations tracker and content production. A whole base can be duplicated with or without records.

**Acceptance.**
1. Template adoption journey for each template; duplicate-base copy with an identity map.

**Evidence.** `tests/helpers/records-operations-templates.mjs` — "operationsTemplatesJourney"; `tests/helpers/records-browser-templates.mjs` — "exerciseTemplates"
**Gap.** None.

#### IFACE-007 — Per-component permissions and viewer filters

Core · target · **missing**

**Requirement.** Each interface component that shows records has user-action settings: inline editing on or off; adding records on or off; deleting records on or off; for each field shown in the component and its record details, view-only or editable; which buttons and comments are available. These settings can only narrow what the viewer's base role and row and field rules allow, never widen it. A field marked editable that the viewer's policy makes read-only stays read-only. The server enforces every write made through an interface against both the viewer's policy and the component's settings: the interface's own API calls carry the component's identity, and a write to a field the component marks view-only is refused even when the viewer's role could make it in the grid. Each page, and each component on it, has a record filter: all records, specific conditions, or "Viewer's records", meaning records where the current viewer is in a chosen user field or their email matches a chosen email field. Conditions can also compare a field with the current viewer ("Approver is me", "Region is my region" through a linked person record). The filter applies on the server, so a viewer cannot read a record outside it through the interface, its exports or its API calls.

**Acceptance.**
1. A field-technician list component makes Status and Notes editable and Amount view-only.
2. For a technician whose base role can edit Amount, writing Status through the interface succeeds.
3. Writing Amount is refused both in the UI and through the component's API call, and Amount stays editable to them in the grid.
4. A component with adding and deleting off refuses both actions through its API.
5. On a "Viewer's records" page, each of two technicians sees only the rows where they are the Assignee, through the page and its API calls.
6. A request for the other technician's record is refused as missing.

**Evidence.** None.
**Gap.** no interface designer yet (IFACE-001). Row and field policy is enforced server-side (PERM-002; src/domains/authority/policy.server.ts), and the component-level narrowing would build on it

#### REPORT-001 — Scheduled reports

Core · target · **missing**

**Requirement.** Any view or dashboard can be sent on a schedule (daily, weekly, monthly, in the workspace time zone) to chosen operators by email, Slack, Teams or Nook as a summary with a CSV or PDF attachment, computed under the recipient's own read policy, with delivery recorded under NOTIFY-003's honesty rules.

**Acceptance.**
1. Scheduled report test at a fixed clock; a recipient with narrower policy receives fewer rows.

**Evidence.** None.
**Gap.** only the launch weekly digest (NOTIFY-004; tests/launch-installed-schedules.mjs)

#### REPORT-002 — Print and page layouts

Core · target · **missing**

**Requirement.** Any record can be printed or saved as a PDF in a clean layout of its visible fields, linked records and attachment thumbnails. Any view can be printed or saved as a PDF with its filters, grouping and summary bar, on US Letter or A4, portrait or landscape. A creator designs page layouts with a drag-and-drop page designer: field values, linked-record tables, images, barcodes and QR codes, static text and the logo. Examples are packing slips, work orders, invoices for reference and labels on Avery US Letter sheets. A layout renders for one record or a batch from a view. Rendering runs under the requesting operator's read policy, and a field they cannot read renders empty. Layouts are versioned and exported with the base.

**Acceptance.**
1. A record prints to a PDF whose text contains every visible field and no hidden field.
2. A packing-slip layout rendered for a batch of five records produces five pages, each with its own order lines and a barcode that decodes to that record's value.
3. A label sheet places 30 records on one Avery 5160 page at the template's positions.
4. A viewer with a narrower field policy gets the restricted fields empty.

**Evidence.** None.
**Gap.** no print or PDF layout code. REPORT-001's PDF attachment is missing too

### Roles, permissions and sharing

#### PERM-001 — Roles and base sharing

Core · target · **partial** · Cites BASE-ROLE-001

**Requirement.** Each base has owners, creators, editors, commenters and read-only members, plus custom roles built from actions; operators are added per base or per interface. Base owners and creators adopt schema changes under PERM-009 and author interfaces and automations (AUTO-USER-009). Editors create and change collaborative views without schema adoption (PERM-009).

**Acceptance.**
1. Role matrix test through REST and UI for each role; demotion fences an open session's next write.
2. A custom role "Purchasing clerk" built from actions (read every table, create and update Orders, comment, no delete, no export) lets its holder do exactly those actions through REST and the UI and refuses delete and export.
3. Removing update from the role refuses that holder's next update.

**Evidence.** `src/domains/authority/member-management.server.ts`, `src/domains/authority/policy.server.ts`, `tests/user-api-keys.mjs`, `tests/evidence-read-privacy.mjs`
**Gap.** explicit memberships and policy-scoped operations (src/domains/authority/member-management.server.ts; src/domains/authority/policy.server.ts; tests/user-api-keys.mjs; tests/evidence-read-privacy.mjs); named base role presets now ship under PERM-009; custom-role authoring and interface membership are absent

#### PERM-002 — Row and field rules

Core · target · **partial** · Cites BASE-ROLE-001, BASE-ACCESS-004

**Requirement.** Rules restrict which records (by condition, including "assigned to me") and which fields each role can read and write; restricted cells are absent from reads, search, history, exports, lookups, formulas shown to that reader and API answers, and cannot be inferred from errors.

**Acceptance.**
1. Policy tests hide rows and fields across reads, history and search.

**Evidence.** `src/domains/authority/policy.server.ts`, `tests/evidence-read-privacy.mjs`, `tests/records-manual-release.mjs` (including “RECORDS-001 RECORDS-002 schema preview permission refusal table preserves restricted rows, fields and shared memberships”), `tests/launch-search-authority.mjs`
**Gap.** Missing a single cited current-policy journey that also reads scoped export, formula/lookup projections and refusal/error payloads for hidden values. Old cited journeys demonstrate record/history/search privacy and schema refusals, but do not perform/read the full listed export/calculation/error-inference scope.

#### PERM-003 — Action and schema authority

Core · target · **done** · Cites BASE-ROLE-001, BASE-ACCESS-004

**Requirement.** Create, update, delete, bulk edit, export, comment, run-button and schema-change rights are separate grants. Schema changes always go through impact-previewed adoption (RECORDS-002) by a role PERM-009 allows to adopt that change.

**Acceptance.**
1. A forbidden action is refused through native and legacy HTTP, and adoption by a person PERM-009 does not allow is refused.

**Evidence.** `tests/launch-write-authority.mjs` — "native and legacy HTTP reject forbidden writes and return permitted ones only through readable fields"; `tests/records-manual-release.mjs` — "[FIELD-002] conversion matrix converts reviewed values and refuses undefined mappings"; `tests/user-api-keys.mjs` — "scoped subscription credentials and record reads/writes stop on revoke and issuer policy change"
**Gap.** None.

#### PERM-004 — Preview access as a user

Core · target · **partial**

**Requirement.** An owner can view any base, view or interface as a chosen person or role before saving a rule change, and the preview shows which records and fields that person would gain or lose.

**Acceptance.**
1. Preview journey shows the exact row/field diff a rule change causes for a chosen member.

**Evidence.** `src/domains/authority/policies.server.ts`
**Gap.** policy impact preview (src/domains/authority/policies.server.ts:14); no view-as-user surface

#### PERM-005 — Guests

Core · target · **partial** · Cites BASE-ACCESS-001, BASE-ACCESS-002, BASE-ACCESS-004, BASE-DATA-003, BASE-ROLE-001, BASE-INSTALL-001

**Requirement.** An owner can invite a guest by email to one base or interface; guests see nothing else in the installation, cannot invite others

**Acceptance.**
1. Guest journey: one base visible, workspace navigation and search show nothing else.

**Evidence.** `tests/launch-authority-browser.mjs` (emailed guests see one base, isolated navigation and search, cannot invite and use no licenses); `tests/helpers/guest-access-journey.mjs` (guestAccessJourney: native emailed invitation, single-base reads and search, invitation and write refusals, unchanged operator usage and zero guest licenses; finishGuestAccess: removal, erasure and captured-token replay refusal); `tests/helpers/guest-access-browser.mjs` (guestAccessBrowser: Settings invitation, navigation, base picker and positive and negative search at 1440 and 390); `tests/lifecycle-identity-security.mjs` (member erasure retires attributed OIDC custody, retains used grants and preserves accountant mappings)
**Gap.** The emailed single-base guest journey is delivered; the whole interface alternative and fresh clause judgment remain uncounted. The previous tooling hold is resolved by contract-docs generation, without promoting the clause.

#### PERM-006 — Share links

Core · target · **missing**

**Requirement.** A view, record or interface can be shared read-only by link with optional password, expiry, email-domain restriction and hidden fields; the link shows live data under the sharer's narrowed scope and stops at revocation. A shared view has an "Allow viewers to copy data and download CSV" setting, off by default. When it is off, the page offers no CSV download, and the export endpoint refuses the link.

**Acceptance.**
1. In a share-link test, password, expiry and revocation each refuse, and hidden fields never appear in the payload.
2. With CSV download off, the export endpoint refuses the link.
3. With it on, the CSV holds exactly the shared rows and visible fields.

**Evidence.** None.
**Gap.** public or embeddable views are a current-release non-goal in seed.json. Gap (PERM-008): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`).

#### PERM-007 — Company sign-in and provisioning

Core · target · **done** · Cites BASE-SIGNIN-001, BASE-ROLE-001, BASE-ACCESS-002 · Register R-1

**Requirement.** Cradle integrates Base's standards identity lifecycle with its app memberships and retained record attribution. Supported provider integrations are Auth, Okta, Microsoft Entra ID and Google Workspace; vendor commissioning is recorded separately.

**Acceptance.**
1. With Auth as the standards provider, an admitted person opens only their current Cradle bases; lifecycle removal preserves the attribution on the person's existing Cradle records under OPS-004.
2. Restoring an installation does not revive prior company-identity credentials or sessions; newly authorized access still maps to the retained product identity.

**Evidence.** `tests/auth-oidc.mjs` — "company OIDC/SAML and SCIM: optional pull-link shares the email owner, admits only existing people and retains product policy"; `tests/launch-operator-doors.mjs` — "the sole owner hands over ownership after a fresh confirmation, the installation keeps exactly one owner"; `tests/rer-data-roundtrip.mjs` — "real rer setup twice, complete generated DB/FILES fresh-install restore, authority hold and confirmed reset"
**Gap.** None.

#### PERM-008 — Admin audit log

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-OPS-005, BASE-DATA-003

**Requirement.** Cradle's admin audit covers sign-ins, membership and roles, schema adoptions, share-link and key issuance, exports, erasures and automation changes. The category-specific journeys are PERM-010 to PERM-013; share-link issuance remains with PERM-006 (RL-1).

**Acceptance.**
1. An owner filters the Cradle action sequence by person, base and time and opens its CSV and JSON exports with every action listed once.

**Evidence.** `tests/user-api-keys.mjs`, `tests/helpers/admin-audit-journey.mjs`, `tests/ui-user-automations.mjs`, `tests/helpers/admin-audit-browser.mjs`
**Gap.** split (ct, 24 October 2026) into PERM-010 to PERM-013; share-link issuance stays carried verbatim by PERM-006's Gap (ct, 23 October). PERM-008 is not an sd target on its own. Owners can read recorded command and identity metadata in Settings, filter by person/base/time and export CSV or JSON. Key issue/replay/revoke appears once, schema adoption is present, non-owner human and bearer access is refused, and retained command events anonymize erased actors. Evidence: `tests/user-api-keys.mjs`, `tests/helpers/admin-audit-journey.mjs`, `tests/ui-user-automations.mjs`, `tests/helpers/admin-audit-browser.mjs` (1440/390). Gap: ordinary sign-ins and native invitation/role changes lack durable audit rows; some export and erasure doors are not fully audited; company identity audit rows are deleted during erasure; the complete category-by-category scripted sequence remains unproven. Share-link issuance is inherited from PERM-006, whose current release is a non-goal. Exports over 10,000 matching rows refuse and require a narrower time range.

#### PERM-009 — Who changes schema and views within a base

Core · target · **partial**

**Requirement.** Within a base, adoption works by role: Base owner. Adopts any schema change through RECORDS-002, without the installation owner. Creator. Adopts additive changes in a base where they are a creator, on their own and without another person: a new field, table, link, lookup, rollup or formula field, a new select option, a renamed field or table, and help text. The impact preview is still shown, and they still submit Adopt. Destructive changes go to a base owner's review: deleting a field or table, converting a type with any lossy value (FIELD-002), removing a select option that is in use, and narrowing a validation rule that existing records break. The base owner can allow named creators to adopt destructive changes themselves, and the preview and recovery export still apply. Editors never change schema; their attempts are refused naming the role that can. They can create, rename, reorder, filter, sort, group, hide fields in, color and delete collaborative views without schema adoption, unless the view is locked (VIEW-013). Commenters and read-only members create personal views only. Forms and interfaces are authored by creators and base owners and published without schema adoption. A change to them that alters which fields a form writes is checked against FIELD-003. Every schema adoption and every view change is audited (PERM-008), and a view change is recorded in the view's history.

**Acceptance.**
1. In a role journey, a base creator who is not the installation owner adds a "PO number" field and adopts it alone; the field appears to editors on their next read.
2. The same creator's field deletion waits for the base owner's review, and the base owner adopts it.
3. An editor creates and saves a collaborative view with a filter and grouping, and other members see it with no adoption step.
4. An editor's attempt to add a field is refused through the UI and through the RECORDS-007 or REST schema door.
5. A read-only member can save only a personal view.

**Evidence.** `tests/helpers/records-base-roles-journey.mjs` (baseRolesJourney at 1440 and 390), `tests/records-manual-release.mjs` via `tests/helpers/records-creator-additive.mjs` (creatorAdditiveJourney), `tests/records-manual-roundtrip.mjs` via `tests/helpers/records-field-portability.mjs` (fieldPortabilityJourney), `src/domains/records/manual/base-collaborators.server.ts`, `src/domains/records/manual/service.server.ts`, `docs/contract/PERM-009/`
**Gap.** Explicit base owner, creator, editor, commenter and read-only roles use current policy and version fences. Creators adopt supported additive schemas; field deletion is retained for base-owner review unless the creator has named destructive authority. Adoption preserves base ownership, extends full-base member policies and keeps restricted fields restricted. Editors save collaborative views; commenters and read-only members save personal views only. View saves/deletes/restores are audited with current-policy history. Proven at 1440/390 through native sessions, REST refusal, recovery export and demotion. Creators now append select options without changing existing option identities, labels or stored values and author bounded plain-text field help. Both changes show current-record impacts before independent adoption, preserve audit and native JSON return, and refuse editors or demoted creators. Option removal and relabeling remain outside additive adoption. Remaining: persisted view ordering, violating-rule adoption and IFACE-001 interface authoring; creator form and lock acceptance and delegated-destructive journeys remain unproven. FIELD-003 still refuses adoption with existing violations; owner review, destructive-change, dependent-custody and recovery obligations remain unchanged.

#### PERM-010 — Admin audit: keys, schema adoptions and automation changes

Core · target · **done** · Cites BASE-AUDIT-001, BASE-OPS-005, BASE-DATA-003

**Requirement.** Cradle's audit distinguishes API, proposing, SCIM, webhook and change-subscription keys; manual and proposed schema adoptions; and automation creation, editing, enabling, renewal, disabling and destination changes (RL-1).

**Acceptance.**
1. After the category sequence through each product door present, the owner filters by person, base and time and opens CSV and JSON exports with each key, adoption and automation event listed once, with its acting person, key or feature.

**Evidence.** `tests/helpers/admin-audit-actions.mjs` — "adminAuditActions"; `tests/helpers/admin-audit-journey.mjs` — "adminAuditJourney"; `tests/helpers/signing-key-rotation.mjs` — "preparedSigningRotation"; `tests/helpers/admin-audit-browser.mjs` — "adminAuditBrowser"
**Gap.** None.

#### PERM-011 — Admin audit survives subject erasure

Core · target · **done** · Cites BASE-AUDIT-001, BASE-OPS-005, BASE-DATA-003

**Requirement.** Cradle's company-identity and command audit stores retain one anonymized occurrence of each action after its subject is erased (RL-1).

**Acceptance.**
1. After subject erasure, names, email addresses and IdP-shared identifiers are absent from retained Cradle audit rows and their CSV and JSON exports; the same category sequence remains listed once.

**Evidence.** `tests/lifecycle-identity-security.mjs` — "member erasure retires attributed OIDC custody, retains used grants and preserves accountant mappings"; `tests/helpers/admin-audit-journey.mjs` — "adminAuditMemberErasure"; `tests/helpers/admin-audit-browser.mjs` — "adminAuditBrowser"
**Gap.** None.

#### PERM-012 — Admin audit: sign-ins, membership and role changes

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-OPS-005, BASE-DATA-003

**Requirement.** Cradle audits email-link, owner-link, OIDC and SAML sign-ins, invitations under each base granted, removal, ownership, role, policy and grant changes through native and SCIM doors (RL-1).

**Acceptance.**
1. After that category sequence, the owner filters by person, base and time and opens CSV and JSON exports showing each action once.

**Evidence.** `tests/auth-oidc.mjs` and `tests/helpers/company-identity-journey.mjs` (email/OIDC/SAML and SCIM); `tests/auth-base-only-runtime.mjs` (owner-link); `tests/lifecycle-identity-security.mjs` (multi-base invitations)
**Gap.** Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`). Carried (PERM-008, verbatim): *Acceptance:* Audit export after a scripted sequence of admin actions lists each one once. Scope: Email-link, owner-link, OIDC and SAML sign-ins; invitations under every base granted, removals, ownership, roles, policies and grants through Base native doors and SCIM. Proven slice: Email and OIDC confirmations use Base afterConfirm; SAML sign-ins are in company identity audit and owner-link consumption retains its existing one-use audit. Multi-base invitations appear once under each granted base, including replay and filtered CSV/JSON. Gap: Base native invitation/cancellation/status/role/domain-rule administration lacks a transaction-composed seed audit hook; the complete ownership/policy/grant door matrix remains unproved.

#### PERM-013 — Admin audit: exports and erasures

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-OPS-005, BASE-DATA-003

**Requirement.** Cradle audits every export door, including the audit's own export, and every erasure and purge door; a scheduled purge names its feature (RL-1).

**Acceptance.**
1. After that category sequence, the owner filters by person, base and time and opens CSV and JSON exports showing each action once.

**Evidence.** `tests/user-api-keys.mjs` via `tests/helpers/export-audit-journey.mjs`; `tests/helpers/warehouse-export-journey.mjs`; `tests/lifecycle-identity-security.mjs`; `tests/ui-user-automations.mjs` via `tests/helpers/admin-audit-browser.mjs` (1440/390)
**Gap.** Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`). Carried (PERM-008, verbatim): *Acceptance:* Audit export after a scripted sequence of admin actions lists each one once. Scope: Every export door, including the audit log's own export; every erasure and purge door, with a scheduled purge naming the feature. Proven slice: Product view CSV/XLSX JSON and streamed downloads, base JSON/CSV-set/XLSX, recovery, installation HTTP/archive, warehouse and audit-log exports now write metadata-only audit rows; privacy.erase and import.delete have admitted audit facts. The export store survives member erasure anonymously. Gap: native CLI/direct Base installation exports expose no seed audit hook; the complete privacy.erase/import.delete and manual/scheduled erasure/purge door matrix is not yet asserted once in log and exports.

### Automations and follow-up — target

#### AUTO-USER-002 — Every trigger

Core · target · **partial**

**Requirement.** Automations start on: record created, record updated (optionally only for named fields), record enters or leaves a view's conditions, form submitted, button pressed, a schedule (every N minutes down to 15, hourly, daily, weekly, monthly, in the workspace time zone), a date field reaching an offset ("3 days before Due"), an inbound webhook with a signed secret, and an email arriving at the base's inbound address. Definitions travel in exports.

**Acceptance.**
1. One emitted-worker test per trigger kind at a fixed clock; exported definitions restore disabled.

**Evidence.** `tests/user-automations.mjs` [AUTO-USER-002] via `tests/helpers/automation-trigger-journey.mjs` (named-field/no-op changes; fixed-clock minutes/hourly/daily/weekly/monthly boundaries, coalescing and restart; date offset, one notice and no unreadable-record run); `tests/ui-user-automations.mjs` [AUTOMATIONS-USER-UI-001] via `tests/helpers/automation-trigger-browser.mjs` (saved schedule at 1440/390); `docs/contract/AUTO-USER-002/`
**Gap.** View enter/leave membership snapshots; form/button, inbound signed webhook and inbound email triggers; definitions in base exports and new-kind restore-disabled proof; builder editing/testing; broad DST/nonexistent-day, write-only actor/field-type and backlog/hosted proof. Defaults ADOPTED: coalesce missed slots, minimum 15 minutes, workspace calendar day, explicit readable schedule record, current owner approval; existing narrowed write-grant and AUTO-USER-009 boundaries remain.

#### AUTO-USER-003 — Every action

Core · target · **partial**

**Requirement.** Actions: create record, update record, update many found records, find records, link records, delete record (with confirmation setting), send email from the installation's own sender to any address, operator or not, with To, CC, BCC, a From name, a Reply-to, inserted values and record attachments (AUTO-USER-010), or the same from a connected Gmail or Microsoft 365 mailbox (INTEG-002), post to Slack, Teams or Nook, send a signed webhook, create or update a Google or Outlook calendar event, send an SMS through Twilio, request a signature through Inkwell, call another Run Edit Run product's API with a scoped key, generate with AI into a field (AI-FIELD-001) and run a bounded script (AUTO-USER-007). Each action's inputs can use values from the trigger and earlier steps.

**Acceptance.**
1. Per-action tests with fakes only at the provider network edge; each records its effect and idempotency key.

**Evidence.** `src/domains/automations/effects.server.ts`, `tests/user-automations.mjs` via `tests/helpers/sms-journey.mjs`, `tests/user-webhooks.mjs` via `tests/helpers/slack-app-journey.mjs`
**Gap.** update, notify, email, webhook, Slack incoming-webhook, Slack app approval and Twilio SMS actions (`src/domains/automations/effects.server.ts`; `tests/user-automations.mjs` via `tests/helpers/sms-journey.mjs`; `tests/user-webhooks.mjs` via `tests/helpers/slack-app-journey.mjs`); the email action reaches one operator only (AUTO-USER-010, AUTO-USER-011); template-based parent and child creation is proven by `tests/helpers/record-template-automation.mjs`; a general create-record action and the remaining actions are absent

#### AUTO-USER-004 — Conditions, branches and repeats

Core · target · **partial**

**Requirement.** A step can run only when conditions hold, an automation can branch into up to 10 paths, and a repeat step runs its actions once for each record found or each item in a list (up to 1,000 per run), with one run record and per-item results.

**Acceptance.**
1. Branching and repeat test where each path's effect is checked and the per-item log names every item.

**Evidence.** `tests/user-automations.mjs` [AUTO-USER-004] via `tests/helpers/automation-control-journey.mjs` (conditions, first-match/otherwise paths, ten/eleven paths, per-item outcomes, continuation, Unknown stopping, current authority, mid-run restart, 1,000 accepted/1,001 refused before effects); `tests/ui-user-automations.mjs` [AUTOMATIONS-USER-UI-001] via `tests/helpers/automation-control-browser.mjs` (item results and saved summary at 1440/390); `docs/contract/AUTO-USER-004/`
**Gap.** Builder UI for conditions, branches and repeats, including builder tests; list-value and nested repeats; saved-view finds; full filter/operator and concurrent-crash matrix; 1,000-write throughput and hosted limits; full control-history export/restore/erasure and individual repeat-item retries. Defaults ADOPTED: owner authoring, found IDs snapshotted before effects, ordinary item failure continues to Partial, Unknown stops without resend.

#### AUTO-USER-005 — Test runs

Core · target · **partial**

**Requirement.** Before enabling, the builder tests the trigger against a chosen real record and each action in turn; external effects in a test run go only to the builder (their own email, a test channel) unless they confirm a live test, so an operator-addressed email reaches the builder instead, showing the recipients it would have used (an email composed under AUTO-USER-010 and addressed under AUTO-USER-011 to a customer or vendor), and the test result shows each step's input and output.

**Acceptance.**
1. Builder journey tests every step; an external send in test mode reaches only the builder's destination.

**Evidence.** `tests/user-automations.mjs`, `tests/helpers/automation-test-journey.mjs`, `tests/ui-user-automations.mjs`, `tests/helpers/automation-test-browser.mjs`, `docs/contract/AUTO-USER-005/`
**Gap.** Dry updates/notifications, held signed webhook payload, builder-only operator email, trigger mismatch, non-author refusal, replay without resend, unknown outcomes, labelled history, unchanged success rates and confirmed live operator send. Gap: customer/vendor test delivery remains AUTO-USER-010 point 6 under RL-14; other base-owner and creator authorship (AUTO-USER-009), Slack transport and full history custody proof; chooser bounded to 100.

#### AUTO-USER-006 — Run history and failure alerts

Core · target · **partial**

**Requirement.** Every run shows trigger, inputs, each step's result, records affected and the error of any failure. A failed run notifies the automation's owner in-app and by email (and Slack, Teams or Nook when chosen) once per failure kind per day, with the cause in plain words, a link to the run and a retry when the failure is safe to retry (AUTO-007's uncertain-delivery rule holds). Run counts per month are visible against the installation's limits.

**Acceptance.**
1. Failure test produces one notification with cause and link; an uncertain send offers no retry.

**Evidence.** `tests/user-automations.mjs` [AUTO-USER-006] via `tests/helpers/automation-failure-journey.mjs` (one in-app/email notice with cause/link, daily suppression, recipient isolation, immutable safe retry and Unknown no-resend); `tests/ui-user-automations.mjs` [AUTOMATIONS-USER-UI-001] via `tests/helpers/automation-failure-browser.mjs` (run history/inbox at 1440/390); `docs/contract/AUTO-USER-006/`
**Gap.** Slack, Teams and Nook alerts; monthly counts against an installation run limit (none is declared); full trigger/input/result and affected-record presentation; complete history export/restore/erasure, workspace-day/DST boundary and large-backlog proof; user-automation automatic retry cadence and alert email delivery confirmation/recovery after interruption between claim and send. Defaults ADOPTED: enabling user only, workspace time-zone calendar day, installation-owner authority.

#### AUTO-USER-007 — Scripts

Core · target · **missing**

**Requirement.** Creators can add a JavaScript script step or script button that reads and writes records through the same policy-checked API, with a scoped token, a 30-second wall clock, bounded memory, and network access only to owner-approved destinations; the script source is versioned, reviewed at enable time and exported with the base.

**Acceptance.**
1. Script test reads and writes allowed records, is refused a forbidden table, is stopped at the time limit and cannot reach an unapproved host.

**Evidence.** None.
**Gap.** seed.json nonGoals exclude unrestricted runtime scripts; a bounded sandbox is required instead

#### AUTO-USER-008 — Follow-up until done

Core · target · **partial**

**Requirement.** A follow-up rule names a condition that must become true for each matching record ("Status is Received by Ship date"), who is responsible (a user field) and how to chase: reminders before and after the due time, an update request that lets the person change named fields from a one-time link without signing in, and escalation to a named person after N reminders. Each record's follow-up stores next action, due time, responsible person, attempts, replies and completion evidence; it stops when the condition holds, the record leaves scope or authority lapses, and the person's reply is shown on the record.

**Acceptance.**
1. Follow-up test at a fixed clock: reminder, update-request link updating a field, escalation and stop on completion; each recorded on the record.

**Evidence.** `tests/launch-installed-schedules.mjs`
**Gap.** launch readiness requests and overdue-decision follow-up (MILE-004, MILE-005, NOTIFY-008; tests/launch-installed-schedules.mjs); general follow-up rules absent

#### AUTO-USER-009 — Automation authorship and lifetime

Core · target · **partial** · Cites BASE-ROLE-001, BASE-ACCESS-004, BASE-OPS-005

**Requirement.** Who authors and how long an automation runs: Authors. Base owners and creators create, edit, test, enable, disable, duplicate and delete automations in their bases, with no installation-owner step. Each automation records its author. Editors and below can see run history only when the base owner allows it, and cannot change automations. Lifetime. An enabled automation runs until someone disables it, with no expiry by default. Each run acts under its author's current authority (base role, row and field rules, connected accounts). When the author is removed from the base, demoted below creator, deprovisioned (PERM-007) or erased, their automations stop producing new effects on the next run. Queued work is fenced, as AUTO-USER-001 states. The base owners are notified in-app and by email, once per author change, with the list of paused automations. A base owner or creator can reassign each one, with one step per automation, to themselves or another creator, and it resumes under the new author's authority from that moment. Expiry policy. The installation owner can set a maximum lifetime for automations (30, 90, 180 or 365 days, or none, the default), per installation or per base. An automation under such a policy warns its author and the base owners in-app and by email 7 days and 1 day before it expires. Expiry pauses it, records the expiry in run history and never deletes it. Renewing takes one step by an author and restarts the lifetime. Run accounting. Automation run counts per month are shown against the installation's limits (AUTO-USER-006).

**Acceptance.**
1. An emitted-worker test at a fixed clock covers authorship, lifetime and policy: - A base creator who is not the installation owner authors "New order → notify warehouse" and enables it. - At day 31 and at day 91, a new order still fires it once, and the effect is recorded. - When the creator is demoted to editor, the next new order produces no effect.
2. The base owner is notified once, listing the automation. - The base owner reassigns the automation to themselves, and the next order fires it again. - Under an owner-set 90-day policy, warnings arrive on days 83 and 89, the automation pauses on day 90, and one renewal restores it. - An editor's attempt to create or edit an automation is refused.

**Evidence.** `tests/user-automations.mjs`, `src/domains/automations/configuration.server.ts`, `src/domains/authority/user-delegation.server.ts`
**Gap.** automations fence lost authority and stop new effects (tests/user-automations.mjs; src/domains/automations/configuration.server.ts). Authoring is installation-owner only, with every approval capped at 30 days (src/domains/authority/user-delegation.server.ts:48). Creator authoring, the non-expiring default, the owner-set policy with warnings, and reassignment are absent

#### AUTO-USER-010 — Email composition from the installation sender

Core · target · **partial** · From AUTO-USER-010 · Cites BASE-MAIL-001, BASE-ROLE-001

**Requirement.** The email action sends from the installation’s configured sender without a connected Gmail or Microsoft 365 mailbox. The sender’s domain is verified with SPF, DKIM and DMARC at its mail provider. The author chooses a From display name, initially the base name, and an optional static or record/earlier-step Reply-to. Recipient resolution follows AUTO-USER-011; files follow AUTO-USER-012; suppression and promotional mail follow AUTO-USER-013.

**Acceptance.**
1. A new Orders record emails a customer who has no Cradle account from the installation sender with From name “Acme Orders” and the record’s Owner email as Reply-to.
2. The subject is plain text up to 200 inserted characters. The Markdown body is delivered as HTML and plain-text alternatives.
3. Subject and body insert trigger-record and earlier-step values in their displayed currency, date-zone, select-label and linked-record-name form; an order number and total of $1,234.50 appear as displayed.
4. An unreadable inserted field fails before sending and names the field; inserted record links require the recipient’s own access and otherwise reach sign-in without content.
5. Run history records resolved To, CC and BCC, subject, attachment names and sizes, provider message ID and retry identity; uncertain provider outcomes remain visible without automatic resend.
6. At 1440 and 390, compose the action with field and typed To/CC/BCC values and preview a chosen record. Test delivery under AUTO-USER-005 goes only to the builder and lists intended customer/vendor recipients.

**Evidence.** `src/domains/automations/effects.server.ts`, `src/domains/automations/contracts.ts`, `tests/user-automations.mjs`
**Gap.** the email action sends through the installation's Base mail sender (`MAIL_FROM`) to one operator chosen by ID, with a static subject and text, rechecking that operator's authority just before dispatch, and records an uncertain answer without resending (src/domains/automations/effects.server.ts:55; src/domains/automations/contracts.ts:7; tests/user-automations.mjs). Field and static addresses, CC and BCC, the From name, Reply-to, inserted values, Markdown, attachments, the caps, the domain policy, suppression and unsubscribe are absent. The test-run acceptance point moved from AUTO-USER-005 is unproven: arbitrary recipients are absent.

#### AUTO-USER-011 — Resolve automation email recipients

Core · target · **partial** · From AUTO-USER-010 · Cites BASE-MAIL-001, BASE-ROLE-001

**Requirement.** To, CC and BCC each take a list that mixes static addresses the author types in with dynamic values from the trigger record, from records found or created by earlier steps and from repeat items (AUTO-USER-004): email fields, lookups of email fields, user fields (each operator's current email) and text fields holding addresses, including comma-separated lists. A recipient needs no Cradle access. Duplicate addresses are sent once, in the most visible list. Recipients see To and CC, never BCC. One action run sends one message to at most 50 recipients across To, CC and BCC (*Policy* default; the owner may set 1 to 500, within the provider's per-message limit). A repeat step sends one message per item within AUTO-USER-004's 1,000. Every resolved address is checked before anything is sent: a single address of valid syntax with no header control characters. A blank or malformed value fails the run before sending and names the list, the input and the record, and nothing is sent. An input the author marks "skip when blank" is skipped instead, and the run lists it as skipped. By default any domain may receive. The installation owner may set, per installation or per base, an allowlist of recipient domains and a blocklist. A resolved recipient outside them fails the run naming the address, and nothing is sent. The same policy governs INTEG-002 mailbox sends. Removing or demoting an operator stops only sends to that operator; static and field-resolved recipients continue under AUTO-USER-009.

**Acceptance.**
1. Send To a trigger-record customer email, CC a static purchasing address and BCC a user-field operator; recipients see To and CC but never BCC, and duplicate addresses appear once in their most visible list.
2. Email lookups, user fields, text addresses, comma-separated values, found/created records and repeat items all resolve with current authority; a recipient needs no Cradle access.
3. Blank Customer email, malformed address and line-break injection each fail before any message, naming the list, input and record; “skip when blank” skips the empty CC and records that skip.
4. With the owner’s acme.example/customer.example allowlist, other.example is refused with its address and no send. The same domain policy governs INTEG-002 mailbox sends.
5. Under the documented initial 50-recipient bound a 51st recipient refuses before sending; the owner may choose 1–500 within provider limits. Repeats send one message per item within AUTO-USER-004’s 1,000.
6. After the BCC operator is removed from the base, the next message still reaches its Customer-email To and static CC, but not that operator.

**Evidence.** `src/domains/automations/effects.server.ts`, `src/domains/automations/contracts.ts`, `tests/user-automations.mjs`
**Gap.** the email action sends through the installation's Base mail sender (`MAIL_FROM`) to one operator chosen by ID, with a static subject and text, rechecking that operator's authority just before dispatch, and records an uncertain answer without resending (src/domains/automations/effects.server.ts:55; src/domains/automations/contracts.ts:7; tests/user-automations.mjs). Field and static addresses, CC and BCC, the From name, Reply-to, inserted values, Markdown, attachments, the caps, the domain policy, suppression and unsubscribe are absent. The test-run acceptance point moved from AUTO-USER-005 is unproven: arbitrary recipients are absent.

#### AUTO-USER-012 — Automation email attachments

Core · target · **missing** · From AUTO-USER-010 · Cites BASE-MAIL-001, BASE-ROLE-001, BASE-INPUT-003

**Requirement.** The action can attach files from the trigger record's attachment fields (all, or a named field), files from earlier steps, and a REPORT-002 page layout rendered as a PDF for the record (a quote, a packing slip, a work order). Attachments up to 25 MB per message in total (*Policy* default, never above the provider's limit) are attached; larger files are sent as expiring links (7 days by default, revocable), and the run records which.

**Acceptance.**
1. Attach files from the trigger record’s chosen or all attachment fields, from earlier steps, and a REPORT-002 page layout rendered as a record PDF.
2. The packing-slip PDF arrives with an equal checksum. Under the initial 25 MB total and provider bound, attached files remain ordinary attachments.
3. A 30 MB attachment becomes a revocable expiring link, initially seven days, and run history records which files were linked.

**Evidence.** `src/domains/automations/effects.server.ts`, `src/domains/automations/contracts.ts`, `tests/user-automations.mjs`
**Gap.** Record and report mail attachments, private attachment delivery and the declared attachment bounds are absent. The cited earlier email journeys send static plain mail to an operator.

#### AUTO-USER-013 — Suppression and promotional email

Core · target · **missing** · From AUTO-USER-010 · Cites BASE-MAIL-001, BASE-ROLE-001

**Requirement.** A hard bounce or spam complaint reported by the provider puts the address on the installation's suppression list. Later sends skip it and the run records the skip; the owner can see and clear the list. An action the author marks as promotional carries an unsubscribe link and the installation's postal address, as CAN-SPAM requires; an unsubscribed address receives no further promotional sends from that base.

**Acceptance.**
1. A hard bounce or spam complaint from the provider adds the address to the installation’s visible suppression list; a later run skips it and records the skip.
2. The owner can inspect and clear the list.
3. An action marked promotional includes its unsubscribe link and the installation postal address; an unsubscribed address receives no more promotional messages from that base.

**Evidence.** `src/domains/automations/effects.server.ts`, `src/domains/automations/contracts.ts`, `tests/user-automations.mjs`
**Gap.** Suppression, unsubscribe and promotional-mail controls are absent. The cited earlier operator email journeys do not provide these recipient controls.

### API, webhooks and integrations — target

#### API-USER-002 — Complete REST API

Core · target · **partial**

**Requirement.** A documented REST API (OpenAPI 3.1 per base, generated from the live schema) lists, filters (by condition or formula), sorts, pages, gets, creates, updates, upserts by a merge field and deletes records in batches of up to 100, uploads attachments, reads and writes comments, and reads schema; schema writes go through the RECORDS-007 proposal path. Personal access tokens for operators carry their own policy, with the scopes and lifetime API-USER-004 sets; rate limits are declared per key and answered with 429 and Retry-After.

**Acceptance.**
1. Contract test drives every endpoint from the generated OpenAPI document; a batch over limits is refused whole.
2. A batch is all-or-nothing after whole-request validation, authority and limit checks; deleting requires explicit delete scope.

**Evidence.** `tests/user-api-keys.mjs` [API-USER-001] [API-USER-002] via `tests/helpers/rest-api-journey.mjs` (all eight generated-document operations with JSON Schema validation; 100-row create/update/delete, whole-request refusal, one admission/replay, unique upsert, Trash, delete scopes and narrower documents/responses); `docs/contract/API-USER-002/`
**Gap.** Attachment upload and comments in the documented REST namespace; personal tokens and API-USER-004 lifetime policy; formula predicates; per-key rate limits with 429 and Retry-After (no existing per-key REST limit); schema writes beyond RECORDS-007; Settings controls/labels for delete-key issuance; deleted/unreadable-subject receipt replay (current policy refuses it); complete field/type, linked-delete, concurrent-upsert and capacity-race matrix, and hosted scale. Defaults ADOPTED: all-or-nothing batches, separate delete opt-in, current issuer/key/row/field policy, readable REST write fields and conservative unique-value swap refusal. Gap (SCALE-002): unproven above 100 physical columns.

#### API-USER-003 — OAuth for third-party apps

Core · target · **missing**

**Requirement.** Third-party apps (Zapier, Make, Crank, n8n) connect through OAuth 2.0 authorization code with PKCE and per-base scopes the owner approves; tokens are revocable from Settings and every call is audited. Every installation has its own domain, so a connecting app first asks for the installation URL. The installation publishes RFC 8414 authorization-server discovery. Third-party clients such as Zapier and Make are pre-registered with fixed redirect URIs on every installation, and any other client registers itself (RFC 7591) for the owner to approve. Refresh tokens stay valid until revoked or until the owner-set lifetime of API-USER-004 ends.

**Acceptance.**
1. An OAuth flow test with a local client enters the installation URL, discovers the endpoints, then covers consent, scoped access, a refresh after the access token expires, and revocation.
2. A redirect URI that is not registered is refused.

**Evidence.** None.
**Gap.** no code

#### API-USER-004 — Long-lived integration keys and personal access tokens

Core · target · **partial** · Cites BASE-ROLE-001, BASE-SECRET-001, BASE-AUDIT-001

**Requirement.** Integrations and scripts do not break on a calendar: Integration keys. An owner issues API-USER-001 keys with no expiry (active until revoked, the default) or with a chosen expiry date. Personal access tokens. Each operator creates their own tokens, named and scoped to chosen bases and to read, write, comment or schema-proposal scopes. A token has no expiry unless its issuer or the owner’s lifetime policy sets one. Owner policy. The installation owner may set a maximum lifetime for keys and tokens (30, 90, 180 or 365 days, or none, the default). Keys or tokens that the policy would end are listed before it is saved. Each affected key or token warns its issuer, and the owner for integration keys, in-app and by email 7 days and 1 day before expiry, naming its last-used time. Settings lists every key and token with its scopes, issuer, created, last-used and expiry times, and the owner can revoke any of them; an operator can revoke their own. Storage. Only digests are stored, and every use is audited (PERM-008).

**Acceptance.**
1. A fixed-clock test over the lifetimes: - A non-expiring integration key and a personal access token both still read and write at day 31 and day 91. - Revoking either fails its next request. - Demoting the token's operator to read-only refuses its next write. - Under an owner-set 90-day policy, a key issued that day warns on days 83 and 89 and is refused on day 90. - The listing shows the last-used time for each key and token.

**Evidence.** `tests/user-api-keys.mjs`, `src/domains/authority/user-keys.server.ts`, `src/domains/authority/user-delegation.server.ts`
**Gap.** scoped, digest-stored, revocable app keys with issuer fencing (tests/user-api-keys.mjs; src/domains/authority/user-keys.server.ts). Every expiry is capped at 30 days (src/domains/authority/user-delegation.server.ts:48). Non-expiring keys, personal access tokens, the owner lifetime policy, warnings and last-used times are absent

#### WEBHOOK-USER-002 — Change subscriptions

Core · target · **partial**

**Requirement.** An API client can subscribe to changes in a base, table or view and receive signed notifications, then fetch the ordered change payloads since its cursor, so an external system keeps in step without polling; a subscription expires after 7 days unless refreshed.

**Acceptance.**
1. Subscription test receives a ping per change and replays the cursor without gaps or duplicates.

**Evidence.** `tests/user-webhooks.mjs` — [WEBHOOK-USER-001] [WEBHOOK-USER-002] real Worker signed delivery preserves ordered replay, delete resynchronization and policy-narrowed restores, through `tests/helpers/change-subscriptions-journey.mjs`, `tests/helpers/change-subscriptions-deletes.mjs`, `tests/helpers/change-subscriptions-recovery.mjs`, `tests/helpers/change-subscriptions-upgrade.mjs` and `tests/helpers/change-subscriptions-erasure.mjs`; `tests/user-api-keys.mjs` — [API-USER-001] [WEBHOOK-USER-002] scoped subscription credentials and record reads/writes stop on revoke and issuer policy change; `docs/contract/WEBHOOK-USER-002/`
**Gap.** API-key subscription create/list/refresh/delete, sealed once-only secrets, audit-ordered signed cursor windows, current-policy narrowing, id-only deletes, the identical cause-free range marker, narrowed restores and separate 30-day cursor/seven-day subscription expiry are exercised through the emitted Worker. A least-watermark-first bounded sweep reaches 202 public subscriptions while earlier ones keep changing; listing remains bounded to 200. An uncertain acknowledgement stays visibly failed and is never resent: cursor fetch recovers each change once in order, and later changes still ping. A definite HTTP 429 retries the same signed id and immutable body. Base/table/view synchronization and an unavailable view's generic final page and ended/authority_lost safe listing are proven. Reviewed table deletion is also covered: HTTP reads and emitted queue wakes terminate subscriptions from current scoped keys, clear sealed secrets and return an empty cause-free final range with no further delivery; populated cursors replay identically and listings remain safe. The 9045 audit-sequence and 9047 deleted-view populated upgrades preserve historical facts, unique ordered sequences, cursor replay and the full 30-day restore window. Person erasure removes an identity-only held record's retained audit identity and values, issuer subscriptions and sealed secrets; whole feed pages, cursor-window rows and integration envelopes are checked. A subscriber learns only activity or uncertainty in its subscribed range, never a resync cause, record identity or prior readability. HMAC-SHA256 integrations.webhook.v1 and its five-minute replay window are unchanged. No real provider call or consent was used. Gap: The complete write-door/base-table-view matrix remains unproven for workbook/Sheets merges and MCP interoperability. A public base/table/view matrix covers create/patch/delete/Trash restore, bulk/undo, range/inverse, authenticated forms, CSV create/update and automation updates under current row/field narrowing. Reviewed base-import application/reversal bypasses admission_audit under RECORDS-005's existing effects suppression; typed Launch/repair/lifecycle audit actions are outside the feed projection; restore queue wakes and restored incoming-link audit coverage remain open. Archive restore and broader person/record-erasure journeys remain unproven.

#### MCP-001 — Live records for AI assistants

Core · target · **partial** · Cites BASE-AGENT-001, BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-009 · Register R-7

**Requirement.** Claude, ChatGPT and other MCP clients connect to a Cradle MCP server with an OAuth-scoped or owner-issued key and can search, read, create and update records, run views and propose schema changes, always under that key's policy; a reversible internal write carries standard, an outside exposure adds external, an active schema adoption adds live and changed authority adds access, with other classes computed from the actual effect; the company's policy decides each call, and its audit names the client.

**Acceptance.**
1. Through MCP, a scoped read and write complete and an out-of-scope table is refused. Under the named held company policy, a write that exposes the record outside carries external, waits for its policy-named approver and completes once approved.

**Evidence.** `src/domains/authority/proposer.server.ts`, `tests/records-agent-proposals.mjs`
**Gap.** the RECORDS-007 proposal door has REST and MCP faces for schema proposals (src/domains/authority/proposer.server.ts:5; tests/records-agent-proposals.mjs); live-record MCP tools absent

#### INTEG-001 — Slack, Microsoft Teams and Nook

Core · target · **done** · Register R-14

**Requirement.** Besides webhook notifications, Cradle installs as a Slack app and a Teams app (OAuth, channel picker) and connects to [Nook](https://github.com/just-every/run-nook): automations post rich record messages with approve/reject buttons whose clicks are policy-checked writes by the clicking person, and record links unfurl for readers allowed to see them: a pasted record link unfurls only when the person who posted it has linked their Cradle account and can read the record, and the unfurl shows only the fields the base owner marked as safe to unfurl and that person can read.

**Acceptance.**
1. Interactive-button test with a fake Slack/Teams/Nook edge: the click updates the record as that person; an unauthorized clicker is refused.
2. Unfurl test at the same edge: a link posted by an operator who can read the record unfurls with its primary field and the unfurl-safe fields.
3. The same link posted by a person without access, or by someone with no linked account, unfurls with no record values, and a field the poster cannot read never appears.

**Evidence.** `tests/helpers/slack-app-journey.mjs` — "slackAppJourney"; `tests/helpers/parallel-chat-journey.mjs` — "parallelChatJourney"; `tests/helpers/slack-app-browser.mjs` — "slackAppBrowser"; `tests/helpers/chat-provider-browser.mjs` — "chatProviderBrowser"
**Gap.** None.

#### INTEG-002 — Gmail and Microsoft 365 mail

Core · target · **partial**

**Requirement.** An operator connects Gmail or Microsoft 365 by OAuth; automations send from that mailbox with AUTO-USER-010’s content, AUTO-USER-011’s recipients, bounds and domain policy, and AUTO-USER-012’s attachments (files from the record’s attachment fields and REPORT-002 PDFs), and sent mail appears in that mailbox's Sent folder. When the connecting operator leaves the base or disconnects the mailbox, its automations pause, the base owners are notified, and each can be switched to another connected mailbox or to the installation sender (AUTO-USER-010) in one step. Each base can have an inbound address whose mail creates or updates records with attachments, sender and thread.

**Acceptance.**
1. Send and inbound-mail tests with fakes at the provider edge: a Gmail send and a Microsoft 365 send each reach a field address and a static CC with the record's PDF attached, equal by checksum; a recipient outside the allowed set is refused.
2. After the connecting operator is removed, the next run produces no send, the base owner is notified once, and switching the automation to the installation sender makes the following run deliver.

**Evidence.** `src/adapters/gmail.server.ts`
**Gap.** scoped Gmail read-only intake (src/adapters/gmail.server.ts:14); Base mail sends notifications; mailbox sending and inbound addresses absent

#### INTEG-003 — Google Sheets and Excel

Core · target · **partial**

**Requirement.** An owner imports .xlsx workbooks and Google Sheets (each sheet a table, types detected, links proposed from repeated values), merges a sheet into an existing table on a key, once under RECORDS-008 or on a schedule under RECORDS-010, and exports any view or base to .xlsx; a Google Sheet can be a synced source (SYNC-001).

**Acceptance.**
1. Workbook import and export round trip with typed values; Sheets import against a recorded API fixture.

**Evidence.** `tests/records-csv-fence.mjs` via `tests/helpers/workbook-journey.mjs`; `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”) via `tests/helpers/base-stream-exits.mjs`; `scripts/scale/stream-export.mjs` (50,000 rows, independent readers; Nightly run 40170915907 (workflow_dispatch on c3cb86781b63c0e89bb152622d6309543e401dbb) job 121101515939 verify-scale-export SUCCESS (UNCOUNTED until DONE)); `tests/ui-base-import.mjs` (CSV-set import preview, guarded adoption, stored resume and undo on desktop and phone) via `tests/helpers/company-workbook-browser.mjs` and `tests/helpers/base-import-hydration.mjs` (1440/390)
**Gap.** Whole-base JSON, CSV-set with complete correspondence and typed XLSX, including legacy JSON/base64 envelopes, stream policy-fenced pages beyond the unchanged intake bounds. Evaluated/computed and relationship reads page underlying records; signed continuation boundaries preserve ordering. Existing typed workbook/Sheets import, keyed merge and percent round trips remain proven. The standalone 50,000-row journey independently checks view CSV/XLSX and all three base formats, typed cells, ZIP checksums, correspondence ordinals, byte lengths and hashes. INTEG-003-SYNC asked whether INTEG-003 may be done while 'a Google Sheet can be a synced source' stays with SYNC-001; ct answered yes (24 Oct 12:52Z), and no synced-source behaviour is claimed here. Hosted memory and real Google consent remain NOT RUN non-claims. The independent 50,000-row boundary journey passes in `scripts/scale/stream-export.mjs`: Nightly run 40170915907 (workflow_dispatch on c3cb86781b63c0e89bb152622d6309543e401dbb) job 121101515939 verify-scale-export SUCCESS (UNCOUNTED until DONE). Python CSV/ZIP/XML/JSON readers assert row counts, typed values, ZIP checksums and correspondence byte lengths/hashes; every correspondence ordinal is exactly 1..50,000, and every identity and primary value matches its CSV position (assertions “Correspondence ordinal”, “Correspondence identity” and “Correspondence primary” in `scripts/scale/stream-export.mjs`). Shifted ordinals and swapped identities/primary values fail independently. The unchanged intake limit remains asserted. Gap: The INTEG-003-tagged portable-installation test `tests/rer-data-roundtrip.mjs` '[PERM-007 INTEG-003 SCALE-001 SC-03 SC-06 SC-08] real rer setup twice, complete generated DB/FILES fresh-install restore, authority hold and confirmed reset' fails with 'Company identity request failed' (400 !== 200 at tests/helpers/company-archive.mjs:4) in nightlies 40159000201 and 40170915907.

#### INTEG-004 — Google Calendar and Outlook record sync

Core · target · **done** · From INTEG-004 · Cites BASE-ROLE-001, BASE-OPS-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AUDIT-001, BASE-DATA-004 · Rules D-1

**Requirement.** A base owner or creator enables sync for one date or date-range field using a controlled connection and an owned calendar, choosing the event-title field and further fields to expose. The setup states that everyone with calendar access can see those values. Google and Outlook calendar events track create, move and cancel and link back to the record. Calendar-side edits follow INTEG-008. Definition versioning, connection scopes and effect reconciliation are documented in docs/contract/capability-mechanisms.md. The separate agent class and company-policy target is SURFACE-002 and SURFACE-005.

**Acceptance.**
1. Against a recorded Google and Outlook provider edge, create, move and cancel the event for a record, retaining its record link.
2. Version the definition and run under its author’s current authority. Lost authority, a revoked connection or removed calendar capability starts no new effects and shows the stopped field; fields no longer readable by the author leave later events.
3. Connection permission explicitly identifies the calendar and is audited; a credential for another calendar/account cannot be used.
4. Unknown acknowledgements reconcile by readback without resending; definite rate-limit refusals retry the same request when safe, with stable effect identity and no duplicates.
5. Clearing the date, moving the record to Trash or deleting it cancels the event; restoring creates a new generation.
6. Bulk changes pace at most one effect per record per change. RECORDS-005 import writes start no calendar effects, and the sync list counts unsynced imported records for explicit author sync.
7. Calendar connection jobs only read. Google and Outlook use their narrowest required event-write scopes, recorded in the linked mechanism document.

**Evidence.** `tests/helpers/record-calendar-journey.mjs` — "recordCalendarJourney"; `tests/helpers/record-calendar-proof.mjs` — "recordCalendarProof"; `tests/helpers/record-calendar-author.mjs` — "recordCalendarAuthor"; `tests/helpers/record-calendar-archive.mjs` — "restoredRecordCalendar"
**Gap.** None.

#### INTEG-008 — Resolve calendar-side changes

Core · target · **done** · From INTEG-004 · Cites BASE-ROLE-001, BASE-OPS-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AUDIT-001, BASE-DATA-004 · Rules D-1

**Requirement.** A read-only connection job compares Cradle-marked Google and Outlook events to the last version Cradle wrote. A move, retitle or deletion made in the calendar opens a review item on its record and the base sync list; the unresolved item stops further effects on that event. A date-field writer can choose whether to apply the calendar state to the record or restore the record state to the calendar. The separate agent class and company-policy target is SURFACE-002 and SURFACE-005.

**Acceptance.**
1. Edit, move and delete the event at the provider edge and see the corresponding record and base-list review item; no silent record write or further event effect occurs.
2. Apply to record under current write authority and read back the ordinary record change and its usual automation effects.
3. Restore calendar from record and read back the one reconciled calendar-move effect.
4. After resolution, the item closes and subsequent synchronization follows the resolved state.

**Evidence.** `tests/helpers/record-calendar-journey.mjs` — "recordCalendarJourney"; `tests/helpers/record-calendar-proof.mjs` — "recordCalendarProof"; `tests/helpers/record-calendar-author.mjs` — "recordCalendarAuthor"; `tests/helpers/record-calendar-archive.mjs` — "restoredRecordCalendar"
**Gap.** None.

#### INTEG-005 — CRM, development and payment systems

Core · target · **missing**

**Requirement.** Synced tables (SYNC-001) and automation actions connect Salesforce and HubSpot (accounts, contacts, opportunities; [Orbit](https://github.com/just-every/run-orbit) for the Run Edit Run CRM), Jira, GitHub and [Vector](https://github.com/just-every/run-vector) (issues), and Stripe (customers, payments, invoices read-only; payment links created by action, the processor holding all money).

**Acceptance.**
1. One synced-table and one action test per system against recorded fixtures at the network edge.

**Evidence.** None.
**Gap.** no code

#### INTEG-006 — Twilio SMS

Core · target · **done** · Register R-14

**Requirement.** Automations send SMS through the owner's Twilio account and number to a phone field, with US A2P 10DLC registration status shown, STOP/HELP opt-out honored and recorded on the record, and delivery status written back.

**Acceptance.**
1. SMS action test with a Twilio fake: send, delivery callback, STOP suppresses later sends.
2. Twilio registration refusals retain the provider code and message verbatim in run history under current phone-field read authority and cannot be retried.
3. Ambiguous replies retain installation STOP/HELP/START consent without guessed record attribution and are listed once in SMS Settings with time, masked number and body.

**Evidence.** `tests/helpers/records-phone-journey.mjs` — "phoneJourney"; `tests/helpers/sms-journey.mjs` — "smsJourney" and "smsRiderJourney"; `tests/helpers/sms-browser.mjs` — "smsBrowser"
**Gap.** None.

#### INTEG-007 — Zapier, Make and Crank

Core · target · **missing** · Cites BASE-ROLE-001 · Register R-5, R-13

**Requirement.** Cradle provides Zapier and Make app definitions and a Crank connector; the public directory and catalog publication receipts are in the Field proof register. Each one connects to any installation by its URL plus OAuth (API-USER-003), so one published app serves every buyer's own domain. Triggers: new record; new or updated record, optionally only when named fields change; record enters a view; new form submission; and new comment. Each works as an instant webhook trigger over WEBHOOK-USER-002, with polling where the platform needs it. Actions and searches: create record; update record; create or update a record by a merge field; delete record; find records by formula or field value, with "create if not found"; and add a comment. Each takes base and table pickers, and field inputs are generated from the live schema. Output and policy. Output keys use record ID, created time and field names, as Airtable's Zapier and Make apps do. When a Zap or scenario switches its app from Airtable to Cradle, its later steps' field mappings carry over by name. The docs page "Moving your Zaps and scenarios" maps each Airtable trigger and action to its Cradle equivalent. Every call runs under the connecting operator's OAuth scopes and current policy.

**Acceptance.**
1. The repository’s Zapier app runs every trigger, action and search against a local emitted installation using its installation URL and API-USER-003 OAuth; network fakes are confined to the edge, and platform validation passes.
2. The repository’s Make definition includes its base, connection, modules, RPCs and webhooks; each module runs through Make SDK tooling against the local installation.
3. Each Crank trigger and action runs from a local Crank client.
4. A recorded Airtable New Record → Slack Zap repointed at Cradle receives the same field-name output keys, and the migration guide maps each Airtable trigger and action.

**Evidence.** None.
**Gap.** no Zapier, Make or Crank app code. The REST record API it would use is partial (API-USER-002), OAuth is missing (API-USER-003), and the change-subscription door is partial (WEBHOOK-USER-002)

### Move-in, sync and recovery

#### MIGRATE-001 — Airtable move-in

Core · target · **partial** · Register R-6

**Requirement.** With an Airtable personal access token (or a downloaded base export), Cradle reads every table, field, record, link, attachment, comment, view (type, filters, sorts, groups, hidden fields) and form; translates formulas, lookups and rollups into Cradle's language; lists interfaces and automations with a rebuild proposal for each (AGENT-003); and imports through RECORDS-005 review with a receipt naming every loss. The formula bar is measurable. Every formula built only from functions CALC-005 covers must translate and, on every imported record, evaluate equal to the value Airtable showed at export. Only a formula that uses a CALC-005 named exception may be flagged; it is listed with its original text and keeps Airtable's last values as read-only text until someone rewrites it. Any other flag fails the move-in. People, created and modified metadata, comment authors and record ID mapping follow MIGRATE-005. A second run imports only what changed, so the team can work in Airtable until cutover.

**Acceptance.**
1. A recorded-API move-in of a fixture base runs through review.
2. The base has: - every field type, including single and multiple collaborator fields, created-by, last-modified-by, created-time and last-modified-time fields; - CALC-005's reference formulas, attachments and every view type; - a form; - comments with @mentions by three different collaborators.
3. Every covered formula translates, and every one evaluates equal to its exported value on every record; the check fails on any flag.
4. People, metadata and comments meet MIGRATE-005's checks.
5. The form and its fields are present.
6. The receipt shows zero unexplained losses.
7. A delta re-run imports exactly the changed records.

**Evidence.** `src/domains/records/base-transfer/source-api.ts`, `tests/records-import-receipt.mjs`
**Gap.** Airtable-shaped CSV and recorded-API import with attachment/behavior loss receipts (src/domains/records/base-transfer/source-api.ts; tests/records-import-receipt.mjs); live connection, formula translation, attachments, comments and rebuild absent. Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### MIGRATE-002 — Smartsheet move-in

Core · target · **missing**

**Requirement.** From a Smartsheet API token, Cradle imports sheets as tables with column types, row hierarchy (as a parent link), cross-sheet references as links, attachments, comments, Gantt predecessors as dependency links and forms, with a loss receipt. Contact columns, row authors, created and modified times, and comment authors follow MIGRATE-005. Column formulas meet CALC-005's bar for Smartsheet's function reference.

**Acceptance.**
1. A recorded-API move-in of a fixture workspace with hierarchy, predecessors, contact columns, comments by two people and formulas from each Smartsheet function family.
2. Every covered formula evaluates equal to its exported value.
3. People and metadata meet MIGRATE-005's checks.
4. The receipt is checked.

**Evidence.** None.
**Gap.** CSV path only (RECORDS-005). Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### MIGRATE-003 — Quickbase move-in

Core · target · **missing**

**Requirement.** From a Quickbase user token, Cradle imports tables, relationships, lookup and summary fields (as lookups and rollups), formula fields (translated, or flagged only for a named CALC-005 exception), reports as views and file attachments, with a loss receipt. User fields, record owners, Date Created, Date Modified, Last Modified By and Record ID# values follow MIGRATE-005.

**Acceptance.**
1. A recorded-API move-in of a fixture app with user fields, summary fields and formulas from each Quickbase function family.
2. Every covered formula evaluates equal to its exported value.
3. People and metadata meet MIGRATE-005's checks.
4. The receipt is checked.

**Evidence.** None.
**Gap.** CSV path only (RECORDS-005). Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### MIGRATE-004 — Spreadsheet workbook move-in

Core · target · **partial**

**Requirement.** A multi-sheet Excel or Google Sheets workbook becomes a base: one table per sheet, types detected, VLOOKUP/XLOOKUP and repeated-key columns proposed as links, simple formulas proposed as formula fields, all through review.

**Acceptance.**
1. Workbook fixture produces a reviewed proposal whose adopted base matches the workbook's values.

**Evidence.** `tests/records-import-d1.mjs`
**Gap.** multi-table CSV move-in with reviewed relationship mapping (RECORDS-005; tests/records-import-d1.mjs). Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### MIGRATE-005 — People and provenance on move-in

Core · target · **partial**

**Requirement.** Every move-in (MIGRATE-001 to MIGRATE-003, and RECORDS-005 when the source carries people) keeps who did what. People. The source's collaborators are matched by email to existing operators. The review step lists each unmatched person, and the owner chooses for each one: invite as an operator in a chosen base role, invite as a guest (PERM-005), or keep as a named person without access. A person kept without access stays on the record as a named, non-signing-in person with their source name and email. They appear on the receipt and become a real operator if they are invited later. Values that depend on people keep their people: user and collaborator field values, created-by and last-modified-by, comment authors and @mentions, and record owners where the source has them. "Assigned to me" filters (PERM-002), "Viewer's records" pages (IFACE-007) and FIELD-004's watching work for matched people from the first day. Times. Each record's original created and last-modified times are kept as its created-time and last-modified-time values; the import time is recorded separately in its history. "Days since created" formulas therefore evaluate as they did in the source. Comments. Comments are imported with their author, original timestamp, @mentions and thread order, without notifying anyone. Record ID map. The receipt includes a downloadable CSV and JSON map from each source record ID (Airtable `rec…`, Smartsheet row ID, Quickbase Record ID#) to its Cradle record ID. The API can read records by their source ID, so external systems that store old IDs can be repointed.

**Acceptance.**
1. A fixture move-in with three collaborators, two matching existing operators and one unmatched, checks: - every user-field value, created-by and last-modified-by, and comment author maps to the matching operator; - the unmatched person is kept by name and listed on the receipt, then becomes the operator in those same values once invited; - created and last-modified times equal the source timestamps to the second; - comments keep their authors, timestamps and order, and the import sends no notifications; - a "my open requests" view shows each matched operator exactly their source rows; - the ID map holds every source ID once, and the API finds each record by its source ID.

**Evidence.** `src/domains/records/base-transfer/source-kinds.ts`, `src/domains/records/base-transfer/receipt.ts`, `tests/records-import-receipt.mjs`
**Gap.** the Airtable recorded-API path reads collaborator, created-by and last-modified-by kinds (src/domains/records/base-transfer/source-kinds.ts:3) but keeps collaborator names as text and states that on the receipt (src/domains/records/base-transfer/receipt.ts:9; tests/records-import-receipt.mjs). Matching by email, invitation, original created and modified times, comment import and the ID map are absent

#### SYNC-001 — Synced tables

Core · target · **missing**

**Requirement.** A table can be a one-way synced copy of another Cradle base's view, an Airtable table (to keep working in both during a move), a Google Sheet, a CSV/JSON URL, Salesforce, HubSpot, Jira or Stripe, refreshed on a schedule (down to 5 minutes) or on demand. Synced fields are read-only; local fields beside them are editable; each refresh records added, changed and removed counts and errors, and a source that disappears marks records rather than deleting them. Two Cradle bases can also sync both ways on chosen fields, with conflicts shown for a person to settle.

**Acceptance.**
1. Sync test against recorded sources: refresh counts, removed-source marking, and a two-way conflict surfaced.

**Evidence.** None.
**Gap.** seed.json nonGoals exclude bidirectional sync for the current release

#### SYNC-002 — Warehouse export

Core · target · **done** · Register R-15

**Requirement.** An owner can schedule a full or incremental export of chosen bases to the buyer's BigQuery, Snowflake or R2/S3 bucket as Parquet or CSV for analysis beyond the app. BigQuery and Snowflake are proven against network-edge fakes; no transfer to a real BigQuery or Snowflake account has run.

**Acceptance.**
1. Scheduled export test writes a correct incremental file to a local bucket.

**Evidence.** `tests/helpers/warehouse-export-journey.mjs` — "warehouseExportJourney"; `tests/helpers/warehouse-r2-restart.mjs` — "warehouseR2Restart"; `tests/helpers/warehouse-archive.mjs` — "restoredWarehouseArchive"
**Gap.** None.

#### SNAP-001 — Automatic snapshots and point-in-time restore

Core · target · **partial**

**Requirement.** Each base is snapshotted automatically (hourly for 7 days, daily for 90 days) and on every schema adoption; an owner can browse a snapshot and restore it as a new base or roll the base back, with a receipt of what changed.

**Acceptance.**
1. Snapshot test at fixed clocks; restore-as-copy equals the snapshot; rollback receipt.

**Evidence.** `src/domains/portability/archive.server.ts`, `src/domains/records/manual/snapshot.server.ts`
**Gap.** manual verified whole-installation archives (src/domains/portability/archive.server.ts) and adoption snapshots (src/domains/records/manual/snapshot.server.ts); scheduled point-in-time recovery absent. Gap (SCALE-002): unproven above 100 physical columns.

#### SNAP-002 — Trash

Core · target · **partial**

**Requirement.** Deleted records, fields, tables and views stay in a trash for 30 days, restorable by people with the right to delete them, with links and history intact; erasure under `BASE-DATA-003` bypasses the trash; interfaces: IFACE-001.

**Acceptance.**
1. Delete-and-restore test for each kind; erasure leaves nothing in trash.

**Evidence.** `tests/records-manual-release.mjs`, `tests/helpers/record-trash-journey.mjs`, `tests/helpers/record-trash-browser.mjs`, `docs/contract/SNAP-002/`
**Gap.** Records, saved views and forms retain canonical values for 30 days, restore under current deletion rights and purge through the scheduled clock. Fields and linked tables now have 30-day grouped schema Trash recovery, ordered inbound relinking and scheduled physical schema custody purge under FIELD-002. Gap: interfaces carved into IFACE-001 as an acceptance point (ct, 22 October), no interface object invented; source/file purge beyond FIELD-002's scheduled physical schema custody purge, archive restore, complete erasure, paged trash. The deletion dialog states 30-day Trash and restoration by people with the right to delete.

### Mobile

#### MOBILE-001 — Complete phone web app

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001 · Register R-2, R-3, R-11

**Requirement.** Every records, view, form, interface, comment and automation-history journey works at 390 CSS px and 320 CSS px with no horizontal page overflow, touch targets of at least 24 px

**Acceptance.**
1. Every browser journey above also runs at 390 and 320 with axe.

**Evidence.** `tests/ui-records-builder.mjs`, `tests/ui-base-import.mjs`
**Gap.** Current CI exercises records, import/exit, calendar/board/gallery/timeline, collaboration, roles, automation and Launch browser journeys at 390 as well as 1440 (`tests/ui-records-builder.mjs`, `tests/ui-base-import.mjs`, `tests/ui-base-exits.mjs`, `tests/ui-records-calendar.mjs`, `tests/ui-user-automations.mjs`, `tests/ui-launch-walkthrough.mjs`); 320 px and complete coverage of every target journey remain unproven

#### MOBILE-002 — Installable app with camera and scanning

Core · target · **missing**

**Requirement.** Cradle installs as a progressive web app with web push notifications, camera capture into attachment fields, and barcode/QR scanning that finds or fills a barcode field.

**Acceptance.**
1. PWA install and push test in Chromium; scanning test with an image fixture.

**Evidence.** None.
**Gap.** no code

#### MOBILE-003 — Native iOS and Android apps

Core · target · **missing** · Cites BASE-ROLE-001, BASE-ACCESS-002 · Register R-4

**Requirement.** Native apps for iOS and Android, published under Run Edit Run's store accounts and pointed at the buyer's own installation, browse bases, views and interfaces, edit records, submit forms, comment, scan barcodes, receive push notifications and keep device-only drafts offline that reconcile on reconnect with the same stale-version and authority checks as the web (a draft never becomes a silent success).

**Acceptance.**
1. Device-farm journeys on current iOS and Android: sign-in to a local installation, edit, offline draft and reconcile, push receipt.

**Evidence.** None.
**Gap.** seed.json nonGoals exclude native mobile applications for the current release; device-only drafts exist for repair intake only

### AI in the base

#### AI-FIELD-001 — AI fields

Core · target · **missing**

**Requirement.** An AI field holds the result of a prompt over chosen fields of its record (summarize, classify into the field's options, extract a value, translate, draft a reply). It runs on demand, on change of its input fields or in bulk; it writes only its own field, marks results as AI-generated with the inputs' versions, never overwrites a person's manual edit to it, and counts against any AI threshold or spend cap the company has set in its policy.

**Acceptance.**
1. With a provider fixture, bulk calculation and an input-change calculation produce the expected field values, preserve a manual edit and apply the company's chosen threshold or spend cap.

**Evidence.** None.
**Gap.** read-only analysis machinery for the launch template (src/domains/intelligence/service.server.ts) can be reused

#### AI-FIELD-002 — Document extraction

Core · target · **missing** · Cites BASE-AGENT-006, BASE-AGENT-007

**Requirement.** An attachment (invoice, W-9, purchase order, receipt, certificate of insurance) can be read into named fields with each value's source location and confidence; the extracted value retains its confidence and source location. Filling a field carries standard, adding sensitive for regulated data and external where that field is exposed outside; the company's policy decides whether the value fills the field alone or waits for a person. Under the named held company policy, the person confirms the exact proposed value before it is written.

**Acceptance.**
1. Extraction from fixture PDFs reads the expected values, source locations and confidence; under the named held company policy its sensitive field fill waits for the named person and then applies the exact confirmed value.

**Evidence.** None.
**Gap.** no code

#### ASSIST-001 — Base assistant

Core · target · **partial** · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007

**Requirement.** In any base, an operator asks questions in plain English ("orders over $5,000 shipped late in Texas this quarter") and gets an answer citing the records it used, drawn only from what that operator may read; the assistant can draft a view, chart, formula (with an explanation) or automation as an unsaved draft. Saving a view carries standard, activating an automation or formula adds live, and changed visibility adds access or external; the company's policy decides whether the assistant saves it alone or a person saves or discards it.

**Acceptance.**
1. With a provider fixture, the answer cites only readable records. Under a named company policy that assigns approval to standard view changes, the drafted view stays unchanged until its named approver saves or discards it; under the named all-autonomous policy the classified view action saves it.

**Evidence.** `src/domains/records/manual/proposal-agent.server.ts`, `tests/records-agent-proposals.mjs`
**Gap.** permissioned external schema proposals (src/domains/records/manual/proposal-agent.server.ts; tests/records-agent-proposals.mjs); in-product assistant absent

### Honest boundaries

#### BOUND-001 — Separate products stay separate

Core · target · **done**

**Requirement.** Cradle is the relational database and internal-app builder. It is not a project or work management suite (task inboxes, workload and resource planning across projects; the separate product is [Pegboard](https://run-pegboard.com)), a CRM ([Orbit](https://github.com/just-every/run-orbit)), a survey platform ([Pencil](https://github.com/just-every/run-pencil)), a wiki ([Slate](https://github.com/just-every/run-slate)), file storage ([Chest](https://github.com/just-every/run-chest)), team chat ([Nook](https://github.com/just-every/run-nook)), an issue tracker ([Vector](https://github.com/just-every/run-vector)), an automation platform ([Crank](https://github.com/just-every/run-crank)), an identity provider ([Auth](https://github.com/just-every/run-auth)) or a website builder ([Pane](https://github.com/just-every/run-pane)). It connects to each through the clauses above.

**Acceptance.**
1. Docs and navigation link to the sibling for each named job; no Cradle surface claims it.

**Evidence.** `tests/public-document-runtime.mjs` — "Every published docs page shares the site chrome and serves truthful product and regulated-data boundaries without a session"
**Gap.** None.

#### BOUND-002 — Not a regulated system of record

Core · target · **done**

**Requirement.** Cradle is not an accounting ledger, payroll, EHR or payment processor. The separate payroll product is [Envelope](https://run-envelope.com). Money moves only through the buyer's processor (Stripe); ledgers stay in the buyer's accounting system. Cradle makes no HIPAA, PCI DSS or SOC 2 claim; a covered entity storing PHI needs its own hosting agreement (BAA) and its own assessment.

**Acceptance.**
1. Docs state the boundary; no card number field type exists.

**Evidence.** `tests/public-document-runtime.mjs` — "Every published docs page shares the site chrome and serves truthful product and regulated-data boundaries without a session"
**Gap.** None.

#### BOUND-003 — Bounded compute

Core · target · **partial**

**Requirement.** Formulas, scripts and automations run within declared time and memory bounds inside the Worker. Heavy analytics and long-running jobs run in the buyer's own warehouse or runtime (SYNC-002, API-USER-002), not in Cradle requests.

**Acceptance.**
1. Script and formula limit tests (AUTO-USER-007, CALC-004).

**Evidence.** `src/domains/records/formulas.ts`
**Gap.** formula depth/cycle bounds (src/domains/records/formulas.ts); script sandbox not yet built

#### BOUND-004 — Honest migration and delivery claims

Core · target · **done** · Cites BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** Cradle never says an app migrated because its rows did, and never resends an uncertain external effect; receipts name every loss and uncertainty.

**Acceptance.**
1. Move-in receipts and uncertain-delivery tests.

**Evidence.** `tests/records-import-receipt.mjs` — "move-in receipt and skipped-attachment manifest come from the retained job for CSV, recorded API and JSON imports, partial and undone"; `tests/launch-installed-retries.mjs` — "uncertain SendGrid delivery stays visible as a finished Unknown run without unsafe automatic or manual resend"
**Gap.** None.

#### BOUND-005 — One business per installation

Core · target · **partial**

**Requirement.** An installation serves one business with many bases; multiple tenants are separate installations, and moving a base between them uses RECORDS-006.

**Acceptance.**
1. Base copy between two installations by JSON export and reviewed import.

**Evidence.** `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”)
**Gap.** Missing a cited public-door base export/download/import journey between two emitted installations. The sole cited test invokes export/import services directly for separate stores; it proves data mechanics but not the clause’s user-facing transfer door.

### Notifications (target clauses)

#### NOTIFY-009 — Outage and progress notices

Core · target · **done** · From NOTIFY-009 · Cites BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** An integration-connection outage or an automation stop notifies the people who own it, and a long-running import or export reports completion or failure to the person who started it (the notices Airtable, Smartsheet and Quickbase users get), each a generated event through the same matrix with its own mute kind, recipient rules and one-notice-per-event. Export recovery and truthful needs-attention reporting follow NOTIFY-010.

**Acceptance.**
1. An integration-connection outage and an automation stop notify exactly their owners through their respective generated events, mute kinds and recipient rules.
2. A long-running import and long-running export each report completion and failure to exactly their retained authorized starter, subject to their completion opt-in and delivery preferences.
3. Each event is driven through a real product path and the delivery matrix at 1440 and 390 with muted and unmuted recipients, exact provider-edge mail and one notice per logical event.
4. Notification-attempt lease expiry alone establishes no import or export failure; protected or safely recovering export work follows NOTIFY-010.
5. Successful protected resume produces one completion, no false failure and zero notification debt; redelivery never adds another logical outcome.

**Evidence.** `tests/ui-launch-notifications.mjs` — "notification preferences, real delivery events and inbox retention and erasure at desktop and phone"; `tests/helpers/notification-delivery-matrix.mjs` — "verifyNotificationDeliveryMatrix"; `tests/lifecycle-erasure.mjs` — "public erasure before the first installation transfer creates its checkpoint atomically"
**Gap.** None.

#### NOTIFY-010 — Bounded export recovery and truthful outcomes

Core · target · **done** · From NOTIFY-009 · Cites BASE-MAIL-001, BASE-AUDIT-001

**Requirement.** A resumable export protects valid advancing work while a documented finite automatic-recovery policy accounts for durable unsuccessful recovery executions and useful progress. When automatic recovery stops without completion, the retained authorized starter receives one actionable needs-attention outcome describing the stop and permitted next step; this preserves safe-resume authority and transfer custody unless current authority, erasure or execution-validity rules remove them.

**Acceptance.**
1. A matching active claim for the same retained execution, version and scheduled slot prevents premature failure during protected work or safe recovery; unrelated and obsolete claims do not suppress another outcome.
2. A current matching claim protects its advancing export; a nonmatching or obsolete execution version or scheduled slot does not protect another outcome.
3. Repeated interrupted resumes reach the documented finite recovery limit and one truthful needs-attention event; progress bookkeeping cannot reset an incomplete crash sequence indefinitely.
4. Normal bounded yields and a concurrently active live or slow valid worker do not count as crashes and are never falsely failed.
5. Notification-lease expiry and elapsed age alone do not establish a terminal export failure.
6. Recovery attempts and redeliveries produce no duplicate logical event, while a later authorized completion is recorded as its distinct actual outcome with event identity and notification-debt cleanup.
7. Repeat the relevant phases muted and unmuted through production application paths, checking exact recipients, durable delivery and provider-edge outcomes at 1440 and 390; faults do not replace product behavior.

**Evidence.** `tests/ui-launch-notifications.mjs` — "notification preferences, real delivery events and inbox retention and erasure at desktop and phone"; `tests/helpers/notification-delivery-matrix.mjs` — "verifyNotificationDeliveryMatrix"; `tests/lifecycle-erasure.mjs` — "public erasure before the first installation transfer creates its checkpoint atomically"
**Gap.** None.

### Flagship application acceptance

#### FLAGSHIP-001 — Reachable product states

Core · target · **missing** · From new

**Requirement.** Reachable product states is part of the retained future acceptance target.

**Acceptance.**
1. Owner can explore a tangible desktop and mobile product across app construction, structured records, repair operations, launch readiness, approvals, exceptions, evidence, run history and change preview. Every state in the screen map is reachable and described.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-002 — Attention across the complete intake cohort

Core · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007

**Requirement.** Attention across the complete intake cohort is part of the retained future acceptance target.

**Acceptance.**
1. The eight journeys in [user journeys](docs/user-journeys.md), including their failure paths, run through the authorized runtime; Today shows decisions, being handled and finished, while apps and records remain directly accessible and chat optional.
2. Cradle prepares and evaluates before asking. Consequential spend, access, egress, commitments and unknowns stay visible; company policy decides agent calls in their money, access, external, commitment and other computed classes.
3. The role-specific attention hypothesis in the [product plan](PLAN.md#attention-acceptance-hypothesis) is measured over complete intake cohorts: total human minutes and transferred labor, repeated inputs and reconstruction, and owner interruptions.
4. Routine recovery is quiet while meaningful outages escalate without suppressing required notices. Planned UX earns no benefit claim.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-003 — Early intelligent vertical

Core · target · **missing** · From new · Register R-10

**Requirement.** Early intelligent vertical is part of the retained future acceptance target.

**Acceptance.**
1. After the runtime migration and owner-reviewed screens, before completing the generic engine, the [frontier proof](docs/frontier-direction.md#prove-intelligence-before-completing-the-engine) uses authorized historical data for a portfolio decision, adapted optimizer, independent feasibility checks, evidence-acquisition choice and interactive tradeoffs.
2. Independent evaluation includes novel held-out constraints and a misleading causal explanation; case-loop, frontier-only, fast-only and evaluated hybrid are compared on quality, cost, owner effort and validated-result and completion latency.
3. Proportional incumbent and from-scratch comparisons record their gaps. Historical replay is not live benefit.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-004 — Temporal evidence in expert operation

Core · target · **missing** · From new

**Requirement.** Temporal evidence in expert operation is part of the retained future acceptance target.

**Acceptance.**
1. Expert operation uses temporal evidence and invalidation at demonstrated scope, together with the existing operation and improvement gates.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-005 — Portfolio choices in expert operation

Core · target · **missing** · From new

**Requirement.** Portfolio choices in expert operation is part of the retained future acceptance target.

**Acceptance.**
1. Expert operation makes portfolio choices at demonstrated scope, together with the existing operation and improvement gates.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-006 — Competence-based routing

Core · target · **missing** · From new

**Requirement.** Competence-based routing is part of the retained future acceptance target.

**Acceptance.**
1. Expert operation routes by demonstrated competence, together with the existing operation and improvement gates.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-007 — Contingent plan revalidation

Core · target · **missing** · From new

**Requirement.** Contingent plan revalidation is part of the retained future acceptance target.

**Acceptance.**
1. Expert operation revalidates contingent plans at demonstrated scope, together with the existing operation and improvement gates.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-008 — Bounded investigation

Core · target · **missing** · From new

**Requirement.** Bounded investigation is part of the retained future acceptance target.

**Acceptance.**
1. Expert operation performs bounded investigation at demonstrated scope, together with the existing operation and improvement gates.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-009 — Useful software adoption

Core · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007

**Requirement.** Useful software adoption is part of the retained future acceptance target.

**Acceptance.**
1. Expert operation adopts useful software at demonstrated scope under company policy for the resulting live, access, security or other computed classes, together with the existing operation and improvement gates.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-010 — Independently verified procedures

Core · target · **missing** · From new · Register R-9

**Requirement.** Independently verified procedures is part of the retained future acceptance target.

**Acceptance.**
1. Expert operation reuses independently verified procedures at demonstrated scope. Prospective authorized evidence measures business outcomes and total cost independently of model self-grading; optional inter-product coordination is not required for release.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-011 — Source and authority lineage

Core · target · **missing** · From new

**Requirement.** Source and authority lineage is part of the retained future acceptance target.

**Acceptance.**
1. Original sources, extracted claims, proposed changes, canonical values, decisions, typed commands, attempts and receipts have stable identities and auditable links; conflicting, unsupported or uncertain evidence remains visible.
2. Repair controls retain identities for the original report and photo, quote evidence, exact human decision, provider attempt and key, completion claim, store inspection and accounting receipt.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-012 — Inspectable application candidates

Core · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007

**Requirement.** Inspectable application candidates is part of the retained future acceptance target.

**Acceptance.**
1. A natural-language operation brief and connected source materials create an inspectable, versioned candidate with schema, screens, policies, integrations and a verification plan.
2. Provider context and cost remain bounded and visible under the company policy; missing provider state is honest and non-AI work continues.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-013 — A different third application

Core · target · **missing** · From new

**Requirement.** A different third application is part of the retained future acceptance target.

**Acceptance.**
1. A fresh owner brief withheld during initial design produces a materially different third internal app with its own entities, roles, views, policies, forms and workflow.
2. At least one governed entity is shared with a proving app; shared identity, authority and records are verified without merging app-specific meanings.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-014 — Continuing operation under changed conditions

Core · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007

**Requirement.** Continuing operation under changed conditions is part of the retained future acceptance target.

**Acceptance.**
1. The mandate and supervision surfaces, durable case, goal and run state, evidence-based work selection and plan revision, permitted typed actions and independent outcome verification satisfy the [paired and held-out continuation proof](docs/operating-loops.md#proof-required).
2. Decision correctness, verified outcomes, budget use and escalations are recorded across restart, changed conditions, uncertainty, stall, revocation and takeover; fixed scenario-specific sequences are insufficient.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-015 — Evidence-to-improvement

Core · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007

**Requirement.** Evidence-to-improvement is part of the retained future acceptance target.

**Acceptance.**
1. A recurring correction or exception cohort produces a concrete process/application and, where appropriate, model/context/routing candidate; adjudicated historical and held-out replay and effect-free shadow results inform adoption under company policy for the action's computed classes.
2. Post-change scorecard measurement, negative results and a recovery rehearsal retain immutable candidate, release and decision lineage.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-016 — Repair intake to accounting

Core · target · **missing** · From new

**Requirement.** Repair intake to accounting is part of the retained future acceptance target.

**Acceptance.**
1. Every intake-to-accounting path and branch in [repair workflows](docs/workflows.md) has end-to-end evidence. Simulated adapters and authorized provider sandbox runs are labelled separately; accounting's receipt confirms handoff rather than payment.
2. A refused retry stays unresolved until its execution run is terminal; replacement and original retries are mutually fenced. Booking and reconciliation, contractor claim, independent store acceptance, versioned invoice correction, accountant mapping and original-key handoff and recovery remain reachable product steps.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-017 — Disconnected repair submissions

Core · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007

**Requirement.** Disconnected repair submissions is part of the retained future acceptance target.

**Acceptance.**
1. The mobile intake and acceptance scenario in [disconnected submission](docs/workflows.md#disconnected-and-delayed-submission) distinguishes local drafts from committed state and never claims queued work or success silently.
2. Reconnect refetches authority and revisions, reads the original command and reconciles unknown submissions with the same key; changed claims or revoked authority cause no silent resubmission.
3. A recovered historical receipt remains visible, while a revised claim requires fresh inspection and either the person's confirmation or the agent action's company-policy decision; an authorized retry retains the exact saved action.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-018 — Connector fault outcomes

Core · target · **missing** · From new

**Requirement.** Connector fault outcomes is part of the retained future acceptance target.

**Acceptance.**
1. Every connector exercises unavailable, refused, invalid, duplicate, slow, partial and lost-response results through deterministic network-edge adapters and an authorized provider sandbox. Data egress, budget and evidence are recorded for each connector.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-019 — Operation economics and outcomes

Core · target · **missing** · From new · Register R-9

**Requirement.** Operation economics and outcomes is part of the retained future acceptance target.

**Acceptance.**
1. Every measure in the [operation scorecard](PLAN.md#operation-scorecard) states its cohort and window, denominator or clock, evidence, exclusions and unmeasured baseline where applicable; those results feed both operating loops.
2. Maintained-path work and cost are compared with an incumbent and an agent-built application at the same scope and quality floor, separating build, operate and maintain totals.
3. Replay supplies the fixture evidence. Prospective pilots and longer-term samples remain published field measurements without blocking unrelated technical acceptance.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-020 — Independent customized-owner update

Core · target · **missing** · From new · Register R-12

**Requirement.** Independent customized-owner update is part of the retained future acceptance target.

**Acceptance.**
1. A fresh frozen installation retains release identity, an operator-readable operations guide, the applicable package and browser checks and source, licence, infrastructure and data portability.
2. A customized-owner update proves intent survives a deep source divergence; generated output never overwrites owner work.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

#### FLAGSHIP-021 — Execution outcome recovery

Core · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-007

**Requirement.** Execution outcome recovery is part of the retained future acceptance target.

**Acceptance.**
1. The execution paths cover concurrent updates, duplicates, retry, cancellation, takeover, stale policy, outage, lost-response reconciliation and atomic state, budget, audit, event and outbox admission under races, zero-row conditions and storage failure.
2. Manual outcome resolution preserves the supplied human evidence; an agent equivalent carries its computed commitment or other classes under company policy, without impersonating a human confirmation.

**Evidence.** None.
**Gap.** No complete public journey proves this carried flagship acceptance gate.

### Push further: agents that run the operation

#### AGENT-001 — Build a working base from the owner's files

Core · push-further · **partial** · Cites BASE-AGENT-002, BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007

**Requirement.** Given the owner's spreadsheets, CSVs, documents and (when connected) a Drive or Chest folder, the agent infers entities, field types, links, formulas, views, forms, roles and starter automations, imports a representative sample of real records into a preview, and presents the proposal with side-by-side source and result rows. Adoption follows RECORDS-002 and RECORDS-007 and carries live, adding access for roles and external for outside exposure; the company's policy decides whether the agent adopts or a person does. Nothing reaches live data before that adoption.

**Acceptance.**
1. Two held-out owner workbooks produce adopted bases whose records match the sources field for field.
2. In each workbook, a VLOOKUP or XLOOKUP column and a repeated-key column become a link or lookup field whose values equal the source cells.
3. Each source formula column becomes a formula field that evaluates equal to the source on every row.
4. Each workbook's proposal includes at least one view and one form drawn from its structure (a filtered sheet becomes a view, a header-only intake sheet becomes a form), a role per named owner column, and a starter automation for each status column.
5. Each of these is adopted and exercised: the view returns the source's filtered rows, a form submission creates a record, and the automation fires on a status change.
6. An injected instruction in a source file changes nothing.

**Evidence.** `ACCEPTANCE.md`, `tests/records-agent-proposals.mjs`, `src/domains/construction/build.server.ts`
**Gap.** scripted proposals through the proposal door were adopted for two held-apart briefs (ACCEPTANCE.md General-purpose authoring; tests/records-agent-proposals.mjs); construction runner (src/domains/construction/build.server.ts); model-authored proposals from files not run

#### AGENT-002 — Test changes against live records before adoption

Core · push-further · **partial**

**Requirement.** For any proposed schema, formula, rule or automation change, the agent replays it against current records and roles and reports before/after values for every changed calculation, every broken dependency (formulas, views, interfaces, automations, API keys, synced tables) and every record or field a role would gain or lose. Adoption shows that report and is refused if the records changed since it was made.

**Acceptance.**
1. Impact-report test on a populated base: a formula change lists exactly the changed cells; a rule change lists exactly the newly disclosed fields; a stale report is refused.

**Evidence.** `src/domains/records/manual/service.server.ts`, `src/domains/authority/policies.server.ts`
**Gap.** exact schema impact preview (src/domains/records/manual/service.server.ts:17) and policy impact preview (src/domains/authority/policies.server.ts:14); combined formula/role before-after report absent

#### AGENT-003 — Rebuild an incumbent app, not just its rows

Core · push-further · **partial** · Cites BASE-AGENT-006, BASE-AGENT-007

**Requirement.** After MIGRATE-001/002/003, the agent rebuilds the source's interfaces, automations and permissions as Cradle proposals, runs representative role journeys and record comparisons in both systems, and lists every behavior needing an explicit choice with the evidence for that choice. Cutover carries live, adding access for changed authority and external for outside effects; the company's policy decides whether the agent takes that step or a person does. Under the named held company policy, the outside effects stay inactive until that policy's approver accepts the exact proposed version.

**Acceptance.**
1. Fixture Airtable base with an interface and two automations: rebuilt proposals pass the same role journeys; the decision list names each untranslatable item.

**Evidence.** `src/domains/records/base-transfer/service.server.ts`, `src/domains/records/manual/proposal-agent.server.ts`
**Gap.** migration previews, custody and agent schema proposals (src/domains/records/base-transfer/service.server.ts; src/domains/records/manual/proposal-agent.server.ts); behavior reconstruction absent

#### AGENT-004 — Operate a workflow to its outcome

Core · push-further · **partial** · Cites BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-011

**Requirement.** The owner names an outcome over a view ("every purchase order received and invoiced by month end") and a mandate: which records, which fields the agent may update, which people and channels it may contact, any spend cap the company sets and an expiry. The agent traces linked records, finds missing evidence, sends requests carrying external, adding sensitive for regulated values, as the company's policy decides, reads replies, updates allowed fields, and marks a record done only when the outcome is verified, pausing on conflicting authority or an uncertain external result and reporting progress daily.

**Acceptance.**
1. Held-out continuation scenario on fixture records: outcome reached with every action inside the mandate; revocation mid-run stops new effects; an uncertain send is not repeated.

**Evidence.** `src/domains/operations/worker.server.ts`, `src/domains/execution/runtime.server.ts`, `tests/repairs-outcome-http.mjs`
**Gap.** outcome and execution machinery for the included Repairs app (src/domains/operations/worker.server.ts; src/domains/execution/runtime.server.ts; tests/repairs-outcome-http.mjs); no general record-outcome steward

#### AGENT-005 — Repair broken automations and integrations

Core · push-further · **partial** · Cites BASE-AGENT-006, BASE-AGENT-007

**Requirement.** When runs fail or a synced or connected system drifts (renamed field, expired token, changed schema, missing external IDs), the agent diagnoses the cause from run history and both sides' records, proposes a minimal fix with its impact preview. A reversible draft carries standard; activation adds live, changed authority adds access or security, and an outside effect adds external, which the company's policy decides. After adoption the agent confirms both sides reconcile; it never retries an uncertain external effect without verification.

**Acceptance.**
1. Fault-injection test: renamed field breaks an automation; the proposed fix is adopted and the next run succeeds; an uncertain webhook is reconciled, not resent.

**Evidence.** `src/domains/automations/runtime.server.ts`, `src/domains/execution/runtime.server.ts`
**Gap.** failure history and external-effect readback (src/domains/automations/runtime.server.ts; src/domains/execution/runtime.server.ts:42); agent repair absent

#### AGENT-006 — Keep the data clean

Core · push-further · **missing** · Cites BASE-AGENT-006, BASE-AGENT-007

**Requirement.** The agent finds likely duplicates, broken or one-sided links, inconsistent spellings of the same value and records that break rules, and proposes merges and normalizations as one bulk change with the records bulk service's preview, atomic commit and undo. Recoverable internal cleanup carries standard, outside exposure adds external and a change without recovery adds destructive; the company's policy decides whether the agent applies it alone or a person reviews it.

**Acceptance.**
1. Fixture base with seeded duplicates and variants: the proposed change fixes exactly them and undoes cleanly.

**Evidence.** None.
**Gap.** bulk preview/commit/undo exists to build on (src/domains/records/bulk.server.ts; tests/records-transport.mjs)

#### AGENT-007 — Agent authority

Core · push-further · **partial** · Cites BASE-AGENT-005, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-009, BASE-AGENT-011

**Requirement.** Cradle grants name bases, actions, fields and recipients, with spend and quantity only as set by the company.

**Acceptance.**
1. Through the grant and business-action doors, an out-of-scope action is refused and expiry or revocation ends work. Under the named held company policy, an action crossing the company-set threshold waits for its designated approver without effects and completes only for the accepted saved version.
2. A repair grant records issuer, delegate, named action, resource scope, predicates, company-set budget or quantity, expiry, revocation and separation of duties. Under the named repair-quote company policy, money or commitment calls above A$2,000 wait for its designated approver; a covering autonomous company policy completes routine calls without per-step clicks.

**Evidence.** `tests/records-agent-proposals.mjs`, `tests/repairs-outcome-http.mjs`
**Gap.** proposing keys (RECORDS-007; tests/records-agent-proposals.mjs) and repair mandates with designated-human approval (tests/repairs-outcome-http.mjs)

## Agent surface

### Agent surface

#### SURFACE-001 — Cradle jobs match the registry

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-013

**Requirement.** The Cradle registry presents this app steward's tool table, record templates, events and prompts as the seed's jobs, including the included Launch readiness app.

**Acceptance.** Through discovery and the public MCP door:
1. The table's Core clause coverage and not-tool reasons equal the registry's mapping, including record import, schema adoption, external connectors and Launch decisions.
2. A stranger can discover the move-in, build, operate, repair and cleanup prompts and follow their record links without instructions outside the installation.
3. The inherited Base conformance journey runs on Cradle's seeded bases, records and Launch app and reports the table's tools and classes.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-002 — Record work and exposure classes

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006

**Requirement.** Cradle distinguishes reversible internal record work from new outside exposure at the destination where the change lands.

**Acceptance.** Through the record, view, attachment and sharing tools:
1. Editing an internal order, making a private view, moving the order to recoverable Trash and undoing a cleanup each carry standard with their affected item counts.
2. The same order copied, restored or moved into a guest-visible base adds external even when the destination was shared before the call.
3. Sending the order to a known vendor, a new address and a public portal records the respective known, new and public counterparties and exact recipient counts.
4. A currency field that merely records an amount adds neither money nor commitment.
5. Applying a calendar-side change to the internal record carries standard; restoring its outside calendar event carries external, while a changed connection grant carries access with its direction.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-003 — Charges and business sign-offs

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-008

**Requirement.** A Cradle action identifies when its result changes a charge or records a sign-off the business relies on.

**Acceptance.** Through integration and decision tools:
1. Creating a Stripe payment link carries money with the link's exact amount, currency and customer, as well as external for the provider counterparty.
2. A nonbinding draft of a Launch decision carries standard; recording its binding business approval adds commitment and names its related record and counterparty.
3. A configured interface approval or workflow sign-off computes the same commitment facts as its ordinary product action.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-004 — Provider handoffs

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006, BASE-AGENT-008

**Requirement.** Cradle identifies the provider step needed to connect the selected mailbox, calendar, file store or business service.

**Acceptance.** Through connection tools:
1. A connection whose provider requires hosted consent carries gated with its provider and consent step before that step is attempted.
2. A provider response requiring account verification adds gated and preserves the exact connection and step for the handoff.
3. After the provider's named person completes the returned step, the retained connection resumes the requested record job without replaying an earlier completed outside effect.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-005 — Authority and credentials

Agent surface · target · **missing** · From new · Cites BASE-AGENT-005, BASE-AGENT-006

**Requirement.** Cradle distinguishes a change to app authority from a change to the credentials or settings protecting that authority.

**Acceptance.** Through member, permission, grant and connection tools:
1. Giving a second operator a base role carries access with the affected person and widening direction; removing that role reports narrowing.
2. A changed row rule, field rule, portal audience or shared view reports the bases and people whose authority changes.
3. Creating or revoking a proposal/API credential carries security and access; changing the stored connection credential carries security with its kind.
4. An app-scope change cannot silently become a schema-only or record-only action: its computed classes name the authority change.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-006 — Irreversible content and regulated values

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006

**Requirement.** Cradle classifies regulated record content and removal according to the retained custody that would remain after the call.

**Acceptance.** Through attachments, extraction, export, Trash and erasure tools:
1. Reading or extracting a W-9 tax identifier adds sensitive with the count and tax-identifier kind; an ordinary inventory description does not.
2. Exporting or sending the same values retains sensitive alongside the destination's other classes.
3. Recoverable record Trash carries standard; purging it carries destructive with the item count.
4. Erasing a person and their private custody carries destructive and sensitive, and a nonrecoverable schema-value removal carries destructive even when initiated by an otherwise ordinary adoption.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-007 — Changes to the running app

Agent surface · target · **missing** · From new · Cites BASE-AGENT-006

**Requirement.** A Cradle definition draft and the activation of that definition are distinct operations.

**Acceptance.** Through schema, interface, automation and sync tools:
1. Preparing an inactive schema or automation proposal carries standard; adopting the schema or activating the automation adds live and names the app and changed definition.
2. Publishing an interface for outside users carries live and external, adding access when the audience changes.
3. Changing a scheduled sync or active follow-up carries live and names the affected running job.
4. Deleting retained content or broadening authority during the same activation adds destructive or access according to the current preview, rather than hiding those facts under live.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-008 — Policy across app-building and app-operating agents

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-007, BASE-AGENT-011

**Requirement.** Cradle's file-to-app builder, assistant, repair worker and workflow steward apply the company's policy to the same proposed app actions and outside effects.

**Acceptance.** Through assistant, schema, repair and workflow tools:
1. Under the named all-autonomous company policy, a source-file proposal can proceed from preview to adoption, a low-confidence extracted value can fill its field and a reversible cleanup can commit without an invented person-confirmation requirement.
2. Under the named held company policy, those same actions follow that policy's standard, sensitive and live decisions: the standard cleanup runs into review, while the sensitive extraction and live adoption retain the exact preview or source location shown to their approver.
3. An AI analysis remains analysis content; applying its suggested view, schema or record change is the corresponding classified product action.
4. Under a company answer of no provider-spend cap, an AI-assisted Cradle job is not stopped by a shipped daily-business-volume ceiling; the installation's request and size limits still hold.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

#### SURFACE-009 — The app steward's seeded week

Agent surface · target · **missing** · From new · Cites BASE-AGENT-013

**Requirement.** A stranger agent given only the installation URL completes one seeded week of Cradle operations through MCP.

**Acceptance.** Under the named all-autonomous and held company policies:
1. It previews and imports a supplier workbook, compares source and result records, adopts a typed schema with a lookup and opens the resulting view.
2. It extracts a W-9's source-located values, corrects a reversible duplicate, sends a missing-evidence request to the supplier and follows the reply to the recorded business outcome.
3. It diagnoses a failed automation, applies the chosen repair, reconciles the next run and opens the receipt.
4. It creates the configured Stripe payment link, records the related business sign-off and makes the required provider-connection handoff.
5. It narrows a second operator's base access, rotates a connection credential and purges an expired retained fixture item, reading each resulting product state.
6. Under all-autonomous every policy class is autonomous and no call waits for a person or is refused by policy; under held, standard is review and every other declared class is approval, taken by the signed-in test person through the returned product pages.
7. The browser leg reads the app's changed records, attribution, pending/review outcomes and reconciliation receipts at 1440 and 390, and the final base agrees with the week's source records and completed outcomes.

**Evidence.** None.
**Gap.** No public MCP journey proves this Cradle-specific surface under the two company policies.

## Later

None.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Real Okta, Microsoft Entra ID and Google Workspace SAML/OIDC/SCIM vendor commissioning or certification | PERM-007 | not run | | |
| R-2 | Human screen-reader pass on Cradle operator and public journeys | MOBILE-001, DOCS-001, HOME-002 | not run | | |
| R-3 | Published VPAT covering the product | MOBILE-001, DOCS-001, HOME-002 | not run | | |
| R-4 | Native iOS App Store and Google Play listings under the fleet accounts | MOBILE-003 | not run | | |
| R-5 | Zapier App Directory and Make app catalog approval/listing, with authorized published scenario execution | INTEG-007 | not run | | |
| R-6 | Authorized real Airtable account move-in and real incumbent formula-result captures | MIGRATE-001, CALC-005 | not run | | |
| R-7 | Actual Claude, ChatGPT, Codex and Copilot MCP client compatibility receipts | MCP-001 | not run | | |
| R-8 | Real personal Google Drive, OneDrive/SharePoint, Dropbox, Box and Chest provider consent/commissioning | FILE-002, FILE-005, FILE-006, FILE-004, FILE-007 | not run | | |
| R-9 | Authorized prospective pilot and elapsed longitudinal business-outcome and cost measurements | FLAGSHIP-010, FLAGSHIP-019 | not run | | |
| R-10 | Authorized real historical customer data for the early intelligent vertical | FLAGSHIP-003 | not run | | |
| R-11 | Human keyboard and screen-reader, real phone/tablet and 320 CSS px or 400 percent reflow reviews | MOBILE-001 | not run | | |
| R-12 | Authorized disposable hosted installation with received magic-link owner sign-in, declared fetch/queue/scheduled triggers, and reconciled complete resource teardown | AUTH-BASE-001, OWN-001, FLAGSHIP-020 | not run | | |
| R-13 | Authorized Make published-app scenario on a hosted preview with execution log | INTEG-007 | not run | | |
| R-14 | Real Slack, Teams, Nook and Twilio account commissioning | INTEG-001, INTEG-006 | not run | | |
| R-15 | Real S3, BigQuery and Snowflake account warehouse transfers | SYNC-002 | not run | | |

<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a CONTRACT.md — Cradle installation

The primary journey: Exercise the capabilities and acceptance journeys below.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 133 | 62 | 22 | 217 |
| Agent surface | 0 | 0 | 0 | 0 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 133 | 62 | 22 | 217 |

Judged from the code and tests at commit `d7dc8100256a244030024bb616a746d7f0ade6d0` (27 October 2026). This records CT’s bounded notification review; the whole-table baseline remains `7c3eb8315f251eb2692df6dbf972055acdcd1d7a` (25 October 2026). Field proof register: 0 rows; 0 passed, 0 failed, 0 not run.

## Core

### Records, schema and the app model

#### RECORDS-001 — Records builder

Core · published · **done**

**Requirement.** Authenticated operators discover only the bases their current authority allows, open their typed records and views, and use record forms, relationships, bulk edits and CSV import. Every read and mutation rechecks server-side app/row/field/action policy, so a revoked membership or a narrowed rule takes effect on the next request without a reload.

**Acceptance.**
1. Native and legacy HTTP doors refuse forbidden reads and writes after a policy change; desktop and phone browser journeys open only authorized bases.

**Evidence.** `tests/records-manual-release.mjs` (including “RECORDS-001 RECORDS-002 stale data, schema, policy and session preview refusal table is atomic”; “RECORDS-001 RECORDS-002 schema preview permission refusal table preserves restricted rows, fields and shared memberships”), `tests/launch-scoped-authority.mjs`, `tests/launch-write-authority.mjs`, `tests/ui-records-builder.mjs`
**Gap.** None.

#### RECORDS-002 — Manual schema adoption

Core · published · **done**

**Requirement.** An owner or creator builds tables with typed fields, linked-record fields and lookups without an AI provider. Every schema change shows an impact preview naming the changes, the affected records and any destructive value removal before the adopting person submits `release.adopt`; who may adopt which change within a base (a base owner for any change, a creator alone for additive changes, editors never) is PERM-009, and views are not schema (PERM-009). Adoption rechecks the preview against current schema, records and authority and applies the accepted change atomically. Removed field values have an authorized recovery export; existing migration history is preserved. Field type conversion and table deletion follow FIELD-002.

**Acceptance.**
1. Builder journey at 1440 and 390 adopts a table/field/link/lookup change; a stale preview, stale schema or lost authority is refused with nothing changed.

**Evidence.** `tests/records-manual-release.mjs` (including “RECORDS-001 RECORDS-002 stale data, schema, policy and session preview refusal table is atomic”; “RECORDS-001 RECORDS-002 recovery export journey preserves references, restricted custody, newer edits and original record identities”; “RECORDS-001 RECORDS-002 schema preview permission refusal table preserves restricted rows, fields and shared memberships”), `tests/records-manual-roundtrip.mjs`, `tests/helpers/records-picker-journey.mjs`, `src/domains/records/manual/service.server.ts`, `docs/contract/RECORDS-002/`
**Gap.** Preview, recheck and atomic adoption ship for installation and assigned base owners and creators, including typed fields, links, calculations, validation/defaults and authored picker settings. Picker-view changes invalidate retained schema previews; native imports validate pending shared target views before new-base adoption. Stale schema/data/authority and destructive removal remain fenced with authorized recovery. Role-scoped adoption and its remaining gaps are tracked under PERM-009. Reviewed conversions, grouped field and linked-table Trash recovery, ordered inbound relinking and scheduled physical schema custody purge follow FIELD-002's proof (`tests/helpers/field-trash-journey.mjs`, `tests/helpers/field-history-restore-journey.mjs`, `tests/helpers/schema-purge-journey.mjs`).

#### RECORDS-003 — Records views

Core · published · **done**

**Requirement.** Authorized operators see human field and select labels and linked-record chips. A grid supports sort, filter and group; saved views preserve those choices, and kanban and form views use the same current records and server-side policy. Records journeys operate at desktop and phone widths without horizontal page overflow and with no serious or critical axe findings in their tested states. The wider view set is VIEW-008 to VIEW-014.

**Acceptance.**
1. Saved grid/board/form round trip and browser journeys at 1440 and 390 with axe.

**Evidence.** `tests/records-manual-roundtrip.mjs`, `tests/ui-records-builder.mjs`, `tests/ui-recut-final.mjs`
**Gap.** None.

#### RECORDS-004 — View CSV and templates

Core · published · **done**

**Requirement.** An authorized view export contains its selected records in the view's query order and its visible fields in their displayed order. Import into an equivalent fresh table previews creates, updates and errors before committing and preserves typed values, select labels, nulls and linked references; lookups are recomputed. Customer relationships and Project tracker provide editable starting schemas through preview and adoption; Launch readiness opens the included base without creating a duplicate. Formulas, rollups and the wider field set are CALC-001 to CALC-005 and FIELD-001. Recurring CSV and .xlsx imports that merge into an existing populated table are RECORDS-008.

**Acceptance.**
1. Per-view CSV export compared field for field against a fresh-table re-import; template adoption journey.

**Evidence.** `tests/records-csv-fence.mjs`, `tests/records-manual-roundtrip.mjs`, `src/ui/records/schema/templates.ts`
**Gap.** None.

#### RECORDS-005 — Reviewed base import

Core · published · **done**

**Requirement.** An authenticated owner previews 1–20 source CSV tables or one supported native base JSON with no database writes. Preview names every type conversion, rejected row, skipped nonempty value, unresolved or ambiguous reference and reciprocal disagreement; mapping changes invalidate acknowledgment. Explicit review and the existing schema-impact/release adoption path create a retained, bounded import job. Resume needs only current authority and job ID. Independent native reconciliation names missing, duplicate, extra and mismatched effects. Undo or partial rollback reverses unchanged imported record/link and saved view/form effects; edited effects remain conflicts, base schema and exact source custody remain. Wrong format/version/type, duplicate identities, dangling native links and capacity violations fail before writes. Import job writes, including restart, rollback and undo, start no automation, notification, mail or webhook, while later owner edits fire as usual, and every completed, partial or undone job yields a move-in receipt and skipped-attachment list built from the retained job. Synthetic and recorded-source checks do not claim a live source-account connection. Live source-account connections are MIGRATE-001 to MIGRATE-004.

**Acceptance.**
1. Native D1 import, restart, undo and receipt tests; desktop and phone move-in browser journeys.
2. Import silence and lifecycle clarification: the existing prohibition on notifications, mail, automations and webhooks from imported writes, restart, rollback and undo continues to govern imported content effects.
3. NOTIFY-009 independently reports the native job’s own completion, needs-attention or failure outcome to its retained authorized starter, subject to completion opt-in, current authority, erasure and notification preferences.
4. It does not replay imported mentions, notify imported collaborators, trigger row automations or emit per-record side effects.
5. The atomic Launch CSV import contract and its existing automation fan-out rule remain unchanged.
6. Additional required evidence: retain the existing silent-import, reconciliation, restart and conflict-preserving undo assertions while exercising the separate starter-only job outcome.
7. Original import and export acceptance, archive and restore checks, and erasure during live import remain required and are not satisfied by notification proof alone.

**Evidence.** `tests/records-import-d1.mjs`, `tests/records-import-undo-restart.mjs`, `tests/records-import-receipt.mjs`, `tests/ui-base-import.mjs`, `tests/ui-base-undo.mjs`; NOTIFY-009 reports the native job’s own completion or failure only to its retained starter (`tests/helpers/notification-delivery-matrix.mjs`), erasure of a starter whose import attempt is live is proven in `tests/lifecycle-erasure.mjs`, and `tests/rer-retained-archive.mjs` and `tests/rer-integrations-archive.mjs` passed in c45 Verify 40427855179. The populated-state integration archive also passed at commit 49fcc1d730371851d5c718ce6a5aa109808e23d3 through the existing registration.
**Gap.** Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### RECORDS-006 — Portable base exits

Core · published · **done**

**Requirement.** A complete base JSON export preserves ordered native tables/fields, primary identities, types/options/relations/lookups/incoming metadata, typed records and ID links, saved view and authenticated form definitions through a deliberate portable allowlist. Every table, field and included view/form requires current authority; complete row/join/schema/metadata sets and authority are fenced, and restricted or changed content fails closed. Fresh-install return through RECORDS-005 preserves canonical content and IDs except the documented capture envelope; an existing-install copy uses a complete bijective identity map. One CSV-set download contains every table and field, primary first, with raw primary-value link quotation and public review choices; explicitly reviewed, byte-bound correspondence preserves every record, ordered link and complete ordered select option list, including distinct duplicate-primary targets and null/empty/false values. Raw reference classifications remain truthful, and selected/materialized counts remain separate. Loading correspondence accepts no choices; ordinary CSV ambiguity never chooses a first match. CSV excludes saved views/forms and prior source custody. Existing per-view CSV keeps its scoped semantics. The current installation owner can prepare and download a verified whole-installation .rer archive in Settings, using the same format and privacy policy as rer export. Credentials and private connection settings are excluded; source is retained separately. Wider data lifecycle acceptance remains separately recorded. As formulas, attachments, interfaces and automations land, each joins this allowlist (FILE-003, FILE-004, IFACE-001, AUTO-USER-002) (ct, 23 October) so an exit always carries the whole app.

**Acceptance.**
1. Base JSON/CSV exit, fresh return and copy tests; Settings archive download journey.

**Evidence.** `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”), `tests/records-base-edge-return.mjs`, `tests/ui-base-exits.mjs`, `tests/installed-home.mjs`
**Gap.** Gap (SCALE-002): unproven above 100 physical columns. Gap (FILE-003, FILE-004): uploaded-byte exits remain incomplete; store-reference exits, unresolved returns and matching-account checks are partial, with preview lookup, null-account resolution and bulk confirmation still open.

#### RECORDS-007 — Agent-proposed schema changes

Core · published · **done**

**Requirement.** The installation owner can issue a proposing key: a one-time machine credential stored as a digest, for one manual base or a new one, expiring within 30 days and revocable from Settings. It reaches only the proposal door, whose REST and MCP faces run the same tools: read the schema the issuing owner may currently read, propose tables, typed fields, links, lookups, views and forms and receive the RECORDS-002 impact preview with affected-record counts but never record identities or values, and list, read or withdraw its own proposals. Every other route or tool answers as missing; the key cannot adopt, read or write records, manage keys or see another key's proposals. A proposal is inert: its names, help text and notes are stored text and create no grant, membership, credential, automation, connection, outbound call or outbox row. Only the owner's session adopts, through `release.adopt`, which rechecks the stored preview against current schema, records and the issuer's authority and requires the proposing key to be current; stale, declined, withdrawn and revoked-key proposals are refused and change nothing, and a replayed adoption returns its first result. The adoption audit row names the adopting owner, the proposal and the key, and the release records the preview hash. A proposal stays reviewable for 7 days and the owner may decline it with a note the agent can read. Model-authored proposals inside Cradle are not part of this clause. Model-authored proposals from the owner's files are AGENT-001.

**Acceptance.**
1. REST and MCP proposal door tests with the official MCP SDK client; 67 door cases.

**Evidence.** `tests/records-agent-proposals.mjs`
**Gap.** None.

#### APP-SCOPE-001 — Explicit application scope

Core · published · **done**

**Requirement.** Existing operators retain exactly their legacy launch rights. Enabling repair navigation in `src/ext/config.ts` grants no record visibility or actions and does not activate mandates, providers or background work. New scopes require explicit owner mapping.

**Acceptance.**
1. Repeated setup and legacy mapping preserve explicit scopes and revocations.

**Evidence.** `tests/launch-scoped-authority.mjs`, `tests/launch-setup-race.mjs` (“[APP-SCOPE-001 OPS-001] setup replay preserves deleted memberships for legacy and first-owner mappings”)
**Gap.** None.

### Automations and follow-up

#### AUTO-USER-001 — Approved record triggers

Core · published · **done**

**Requirement.** An automation author (AUTO-USER-009 names who: base owners and creators) with current app and record access can create, edit, disable and renew created/updated record triggers with ordered notify, email, update, webhook and Slack actions. An enabled automation runs for the lifetime AUTO-USER-009 sets: until disabled or until its author's authority lapses, with any expiry being an owner-set policy announced in advance. Each committed native change captures the enabled definition versions atomically. AUTO retains run/action history and the approved definition snapshot. Disable cancels queued work; lost issuer, app, subject or credential authority stops new effects, and an operator recipient who loses authority stops receiving that effect. Email to addresses that are not operators (customers, vendors, requesters) needs no recipient authority, so removing an operator stops only the sends addressed to that operator (AUTO-USER-010). Repeated queue delivery preserves one logical run/effect. A repeated automation or excessive causal depth is recorded as Suppressed. External uncertainty is visible and never authorizes automatic resend.

**Acceptance.**
1. Automation tests on emitted workerd; browser journey for definition and run history.

**Evidence.** `tests/user-automations.mjs`, `tests/ui-user-automations.mjs`, `src/domains/automations/capture.server.ts`, `src/domains/authority/user-delegation.server.ts`
**Gap.** None.

### API, webhooks and integrations

#### API-USER-001 — Scoped revocable keys

Core · published · **done**

**Requirement.** The owner can issue a random one-time key for one app and entity, read access or approved create/update access, and a lifetime under API-USER-004: no expiry until revoked, or a date the issuer chooses, within any owner-set maximum. Only a digest is stored. Ordinary `/api/v1` policy/admission remains authoritative; keys grant neither administrative authority nor browser sessions. Listing returns safe metadata. Key revocation, issuer policy/membership/epoch/owner changes and expiry fence current reads and atomic writes. Interrupted issuance cannot reveal the same secret again.

**Acceptance.**
1. API key tests across issue, use, revoke and expiry.

**Evidence.** `tests/user-api-keys.mjs`, `src/domains/authority/user-keys-http.server.ts`, `src/domains/authority/user-delegation.server.ts`
**Gap.** None.

#### WEBHOOK-USER-001 — Private destinations and signed delivery

Core · published · **done**

**Requirement.** Webhook and Slack destination URLs are immutable encrypted configuration. A new webhook signing key is shown once and is never recoverable from history or later listing. Exact Base integrations prepare signatures and classify delivery. The trusted relay uses Base public-DNS-pinned verified TLS, HTTPS-only destinations, no redirects, bounded requests/responses and timeouts. Missing relay configuration fails visibly. The native relay command is source only; the owner provisions its HTTPS endpoint.

**Acceptance.**
1. Webhook and Slack delivery tests at the network edge.

**Evidence.** `tests/user-webhooks.mjs`, `src/domains/automations/destinations.server.ts`
**Gap.** None.

### Public landing and docs

#### HOME-002 — Public product landing

Core · published · **done**

**Requirement.** *Changed on 13 October 2026: the page moved from the installed `/` (now HOME-003) to the static run site.* At `/` of the run site (`https://run-cradle.com`, built by `rer build --site` from `src/site/pages.tsx`), Cradle presents its public product page using the configured theme tokens and the product's own type. It has a header, shared with the docs under DOCS-001, with the configured product name and links to `/docs` and to the public source repository (`https://github.com/just-every/run-cradle`); a hero with one heading, "Everything comes together in one place.", a supporting line that is the description in `src/ext/config.ts`, the plain line "100% free, open source alternative to Airtable and Smartsheet", a button **Run Cradle** to `/run`, a link to `/docs` and decorative illustrations of data streaming into one Projects screen; and sections, each with its own decorative illustration of Cradle's screens, for typed and linked tables, views, guarded schema changes, the practical parts (CSV import and export, visible automations, optional read-only AI) and self-hosted ownership that the owner customizes with their own agents; at least two of those sections carry a quiet link to the published guide page on their subject (CSV import, automations, installing or leaving), and every `/docs` link on the page names a page published under DOCS-001. A closing call to action repeats **Run Cradle** to `/run` and links to `/docs`. The footer, also shared with the docs, carries the section anchors (which still reach the page from `/docs`), links to `/docs` and the source repository, an MIT license link to `LICENSE` in that repository, and the credit. Its copy describes only capabilities this contract ships and shows no record content, public views, pricing, testimonials, customer logos, metrics or integrations the product does not ship. Its optional footer credit is visible by default and config can turn it off; when visible it names the configured product and links statically to `https://runeditrun.com`. The credit adds no telemetry or phone-home. Scroll motion never hides content: with reduced motion, without script, and after scrolling, every section is fully visible. The page loads no resource from another origin, links no instance-only route (`/signin`, `/setup`, `/app`, `/auth/*`) and reads no installation data. `/run` (Base's Run page) shows the two commands that run Cradle from `https://github.com/just-every/run-cradle`.

**Acceptance.**
1. Public document runtime and built-site tests through `/`, `/docs`, `/setup` and `/signin`.

**Evidence.** `tests/foundation-shell.mjs`, `tests/ui-local-signin.mjs`
**Gap.** None.

#### HOME-003 — Installed Lobby

Core · published · **done**

**Requirement.** *Changed on 16 October 2026: owner claim is independent of workspace first-run details.* An installed instance answers `/` with Base's shared Lobby (`src/base/lobby.ts`, edition identity in `src/identity.ts`): Cradle's lockup, one line and one button, **Finish setup** to `/setup` until Base records its durable owner claim (`oa_bootstrap`), then **Sign in** to `/signin` with a line naming the persisted workspace name (including later renames), or the configured public workspace name when that name read is unavailable. `GET /setup/state` answers exactly `{"state":"unclaimed"}` or `{"state":"claimed"}` from the same owner-claim record, with no session and `no-store`. Signed-in app visits still require first-run workspace details under SET-003. The Lobby is the same for every visitor, runs no script and reveals nothing else about the installation.

**Acceptance.**
1. Public document runtime and built-site tests through `/`, `/docs`, `/setup` and `/signin`.

**Evidence.** `tests/installed-home.mjs`, `tests/public-document-runtime.mjs`
**Gap.** None.

#### DOCS-001 — Public docs

Core · published · **done**

**Requirement.** Every page listed in `docs/site.json` is served without a session at `/docs` (the first page) or `/docs/<slug>`, rendered from its Markdown file inside the same header and footer as the product page (HOME-002), with the Docs link marked as the current page, and with each page's source linked on GitHub at `https://github.com/just-every/run-cradle/edit/main/<file>`. The installed instance's header and footer also link `/signin`; the run site serves the same pages statically without it. A slug that is not listed is a genuine 404, never a redirect or an empty page. Links between pages and to repository files resolve at build time, and a broken link or anchor fails the build. A page loads no script, style, font or image from another origin; outbound links are plain anchors. The docs show no record content and add no sessionless path beyond `/docs` and `/docs/`.

**Acceptance.**
1. Public document runtime and built-site tests through `/`, `/docs`, `/setup` and `/signin`.

**Evidence.** `tests/public-document-runtime.mjs`, `tests/start-resources.mjs`
**Gap.** None.

### Operators

#### AUTH-BASE-001 — Install and sign in

Core · published · **done**

**Requirement.** A new installation uses Base operator-auth to atomically bootstrap its configured first owner on an empty auth store using a deployment setup token. Mail and an existing owner session are not prerequisites. Base owns opaque credentials, one-use magic-link confirmation, active operator/version checks and host/origin admission. The setup ledger cannot be reset by replacing the token. Base mail explicitly selects the RER Managed relay, SendGrid or Resend; failure never selects a fallback provider or claims mailbox delivery. Cradle maps admitted identities to its existing product IDs and current app/row/field policy, and prepared mutations also fence Base session revocation. A fresh local owner runs `rer dev`, which establishes a real Base dev session through the checkout key; optional `rer setup` writes private credentials with mode 0600. The signed-in owner completes durable first-run details at `/setup` unless installation configuration already set them (SET-003). The sign-in form fills its email field from `?login_hint=` when that is a complete email address; the deployment specification declares this (`surfaces.app.signIn`) so RER's Open app sends the claimed owner there with their email. Standalone local and hosted installs expose no captured-mail inbox or outbox page. Hosted sign-in requires a configured mail sender; failed delivery gives actionable guidance, and an unclaimed installation directs its host to finish rer deploy. A missing or blank `OWNER_EMAIL` fails closed during production setup and runtime configuration; it never selects legacy native-mail sign-in or accepts legacy product cookies.

**Acceptance.**
1. Public document runtime and built-site tests through `/`, `/docs`, `/setup` and `/signin`.

**Evidence.** `tests/auth-base-only-runtime.mjs` (including “AUTH-BASE-001: emitted production rejects missing OWNER_EMAIL despite complete legacy mail configuration”), `tests/launch-production-composition.mjs`, `tests/local-auth-runtime.mjs`
**Gap.** None.

#### OPS-001 — Equal operators

Core · published · **done**

**Requirement.** Every legacy launch operator can read every launch-template record and perform every mutation in that retained scope. New app access remains explicit under APP-SCOPE-001. The only restrictable action is inviting and removing operators, under `operator.management.v1`. There are no roles.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-production-composition.mjs`, `tests/launch-scoped-authority.mjs`
**Gap.** None.

#### OPS-002 — Management

Core · published · **done**

**Requirement.** Operators are invited and removed in settings. The operator configured at setup can be removed only by themselves, so every operator record stays removable and erasable by an operator. Because the installation always keeps an active owner, that owner first hands ownership to another active member in settings — after a fresh email-link confirmation of their own identity — and can then remove themselves once they own no active campaign and hold no unresolved assigned decision. *Policy: `operator.management.v1`; default: any operator may invite or remove.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** None.

#### OPS-003 — Workspace timezone

Core · published · **partial**

**Requirement.** Setup requires a valid IANA workspace timezone and rejects any other value with a validation error. Changing it re-renders every displayed time and moves the next fire time of every schedule in this contract; it leaves stored UTC timestamps byte-identical and moves no run already queued and no email already sent.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/core/features/setup/server.ts`, `src/domains/channels/settings.server.ts`, `tests/installed-home.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Explicit-zone owner-authored schedules do not move with the workspace; shared Timestamp presentation uses browser timezone. Shipped schedules, deadline redisplay, IANA validation and preservation have named proof.

#### OPS-004 — Removing an operator

Core · published · **done**

**Requirement.** Removing an operator ends their sessions within 1 minute, drops them from digest recipients, and cancels their outstanding readiness requests. Removal is rejected, naming each blocking record, while that operator owns an active campaign or is the assignee of an unresolved decision. Risks, deliverables, milestones, comments, activity entries, and AI analyses keep their attribution to the removed operator, and a lens condition naming them returns zero results rather than an error.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/domains/authority/members.server.ts`, `src/domains/lifecycle/members.server.ts`, `src/apps/launch/lenses.server.ts`, `tests/launch-operator-doors.mjs`, `tests/helpers/launch-operator-lifecycle.mjs`
**Gap.** None.

#### OPS-005 — Erasing an operator

Core · published · **done**

**Requirement.** A removed operator can be erased under `BASE-DATA-003`. Erasure replaces their name and email with a stable anonymous label wherever they appear, deletes their notifications and delivery records, keeps the comments, activity entries, and decision outcomes they authored under that label, completes within 5 minutes, is confirmed when complete, and cannot be undone.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/domains/authority/members.server.ts`, `src/domains/lifecycle/members.server.ts`, `src/domains/lifecycle/member-identity-places.ts`, `migrations/updates/9039_erased_operator_guard.sql`, `tests/launch-operator-doors.mjs`, `tests/helpers/launch-operator-erasure.mjs`
**Gap.** None.

#### OPS-006 — Money

Core · published · **done**

**Requirement.** Setup requires an ISO 4217 workspace currency. Budget and spend are stored as minor-unit integers in that currency and are displayed, summed, and exported in it. Changing the currency relabels stored amounts and never converts them. The Campaign Grid's budget and spend totals cover the rows currently shown and label that scope.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/core/features/setup/server.ts`, `src/core/shared/workspace-money.ts`, `src/core/features/portfolio/ui/campaign-money-totals.tsx`, `tests/installed-home.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

### Operator views

#### VIEW-001 — Operating surfaces

Core · published · **done**

**Requirement.** One Home at `/app` leads with Records and links to App studio. Launch readiness is grouped as an included template: Portfolio Overview, Campaign Grid, Risks Lens, Timeline Lens, Campaign Detail, Lens Builder, Decision Queue and Automation Monitor retain their routes in the same October theme and navigation shell. Repair navigation is opt-in. Unknown document routes return HTTP 404 with a useful not-found page.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/foundation-shell.mjs`, `tests/launch-authority-browser.mjs`
**Gap.** None.

#### VIEW-002 — Selected detail

Core · published · **done**

**Requirement.** Selecting a campaign, risk, milestone, or decision shows that record's own fields and the records linked to it. No field and no identifier of a previously selected record stays visible.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### VIEW-003 — Cross-view consistency

Core · published · **done**

**Requirement.** A read issued after a mutation's success response returns that mutation's committed state and the counts derived from it on Home, Portfolio Overview, Campaign Grid, Campaign Detail, every lens, Decision Queue, and Automation Monitor.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/helpers/launch-consistency-clauses.mjs`
**Gap.** Post-success native HTTP reads show committed campaign and child fields, derived Home/Overview/Grid/Detail counts, saved and shipped lenses, Decision Queue and Automation Monitor; archive and terminal decisions update the next read.

#### VIEW-004 — Explicit states

Core · published · **done**

**Requirement.** Every collection and detail surface renders exactly one of loading, empty, not found, signed out, or failed. The failed state names the operation that failed and offers a retry; it renders no rows, no sample data, and no result of an earlier successful read. An action a policy forbids is refused with a stated reason and changes nothing.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-authority-browser.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### VIEW-005 — Search

Core · published · **done**

**Requirement.** Global search matches case-insensitive token prefixes across readable text, URL and select values in every authorized base, returning at most 20 results per table linked to their record detail. Launch readiness retains campaign name/code/summary and deliverable/risk/milestone/decision title search. Current row and field policy is rechecked before responding; inaccessible cells cannot produce matches. Comment text is excluded. Archived records are returned only when explicitly included. The existing 500ms response target remains.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-search-authority.mjs`
**Gap.** None.

#### VIEW-006 — Concurrent edits

Core · published · **done**

**Requirement.** Every mutation of a campaign, deliverable, milestone, risk, decision, comment, lens, custom-field definition, automation, or workspace setting supplies that record's current version. A mutation carrying an older version returns 409, names the current version, and changes nothing.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`, `tests/helpers/launch-concurrency-clauses.mjs`
**Gap.** Current caller revisions fence every Launch record and definition mutation, comment deletion, workspace and readiness settings, sample removal, bulk undo and safe retry. Stale admissions and commit races name the authorized current version and commit no effects; native setup and 1440/390 settings journeys retain those revisions.

#### VIEW-007 — Paging and order

Core · published · **done**

**Requirement.** A collection response returns at most 200 records with a cursor, applies the requested sort with the record ID as its final tiebreak so paging repeats and skips nothing, and reports an exact total up to 10,000 matches and `10,000+` beyond it. A result larger than one page states how many records are shown out of that total.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** None.

### Campaigns

#### CAMP-001 — Record

Core · published · **done**

**Requirement.** An operator can create, edit, archive, and delete a campaign. It requires a code, a name, an owner, a start date, and a launch date, and it also carries an objective, a status summary of at most 280 characters, a phase, a status, health, budget, spend, tags, and custom fields.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-authority-browser.mjs`, `tests/launch-optional-fields.mjs`
**Gap.** None.

#### CAMP-002 — Lifecycle

Core · published · **done**

**Requirement.** A campaign is active or archived, and any operator can archive or restore one. Archiving deletes nothing. *Policy: `campaign.lifecycle.v1`; default phases: Planning, Build, Production, Review, Launch prep; default statuses: On track, Watch, At risk, Blocked; default launch-preparation phase: Launch prep.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### CAMP-003 — Validation

Core · published · **done**

**Requirement.** A campaign's launch date must not fall before its start date, its health must be a whole number from 0 to 100, and its budget and spend must be zero or greater. Campaign codes are trimmed and unique case-insensitively. A mutation breaking any of these, or clearing the owner, start date, or launch date of an active campaign, is rejected with a validation error naming the field and changes nothing.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### CAMP-004 — Detail and rollups

Core · published · **done**

**Requirement.** Campaign detail shows the campaign's fields, its complete and total deliverable counts, its milestones, its open risks, its unresolved decisions, its comments, and its activity. Those counts are derived: they change only through a mutation to a linked record.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### CAMP-005 — Health

Core · published · **done**

**Requirement.** Health is shown with the operator who last set it and when. A campaign whose health has not been set in the last 14 days is marked stale. *Policy: `campaign.health.v1`; default: health and status change only through an explicit operator edit or an import row that maps the field. A replacement may derive health from linked records; no replacement may set it from AI output, which AI-003 forbids.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### CAMP-006 — Portfolio overview

Core · published · **done**

**Requirement.** Portfolio Overview shows Live campaigns as the count of non-archived campaigns, Needs attention as the count of non-archived campaigns whose status is At risk or Blocked, Open decisions as the count of unresolved decisions on non-archived campaigns, and Portfolio health as the arithmetic mean of non-archived campaign health rounded half up to a whole number, or No data when there are none. It states how many campaigns in that mean are stale under CAMP-005.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/core/features/portfolio`, `tests/ui-launch-walkthrough.mjs`, `tests/helpers/launch-portfolio-screens.mjs`
**Gap.** None.

#### CAMP-007 — Grid

Core · published · **done**

**Requirement.** Any operator can filter, group, sort, and choose visible fields in the campaign grid. Three built-in views ship: All active, every non-archived campaign; Launch prep, every non-archived campaign in the lifecycle policy's launch-preparation phase; and My campaigns, every non-archived campaign owned by the signed-in operator. Each re-queries on open and on refresh, and opening, filtering, grouping, or sorting a view changes no record.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/core/features/campaigns/grid-query.ts`, `src/core/features/portfolio/ui/campaign-grid-controls.tsx`, `src/core/features/portfolio/ui/campaign-grid-results.tsx`, `tests/ui-launch-walkthrough.mjs`, `tests/helpers/launch-grid-view-screens.mjs`
**Gap.** None.

#### CAMP-008 — Custom fields

Core · published · **done**

**Requirement.** An operator can define, edit, and delete campaign custom fields of the types in `seed.json → customFields`, and those fields are available in grid display, filtering, lens conditions, CSV import, and CSV export. Deleting a definition deletes its stored values and is confirmed with the number of campaigns holding one.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-operator-doors.mjs`
**Gap.** None.

#### CAMP-009 — Archiving

Core · published · **done**

**Requirement.** Archiving a campaign is allowed while it has open deliverables, milestones, risks, and decisions, and withdraws its work in one commit: its unresolved decisions leave Decision Queue, its risks and milestones leave every lens and the digest, its incomplete deliverables and milestones stop counting as overdue, it leaves the counts in CAMP-006 and every search that does not ask for archived campaigns, its outstanding readiness requests and every queued automation run whose subject is that campaign or one of its records are canceled without executing an action, and email held under NOTIFY-002 for that campaign is dropped. Archiving completes and resolves nothing.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### CAMP-010 — Restoring

Core · published · **done**

**Requirement.** Restoring returns the campaign and every record archived with it to the state each had at archiving, and creates no notification, readiness request, or automation run for the archived period. CAMP-003 is applied at restore: a campaign whose owner was removed while it was archived must be given a current owner before it becomes active.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### CAMP-011 — Deletion

Core · published · **done**

**Requirement.** Deleting a campaign removes its deliverables, its milestones and their dependencies, its risks, decisions, comments, campaign activity, AI analyses, and import references under `BASE-DATA-003`. Deletion requires typing the campaign code to confirm and cannot be undone. Audit records survive with the campaign reference anonymized.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### CAMP-012 — Risk rating

Core · published · **done**

**Requirement.** A campaign's risk rating is derived as the highest severity among its open risks, or None when it has none, and is shown wherever the campaign is listed.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### CAMP-013 — Bulk edit

Core · published · **done**

**Requirement.** In the campaign grid and in any Grid or Cards lens an operator can select up to 500 records, including every record matching the current conditions, and apply one change to all of them: owner, phase, status, a tag added or removed, a custom-field value, archive, or restore. A bulk change commits for every selected record or none, is rejected naming the first record that fails validation, writes one activity entry on each changed record and one bulk entry naming the operator and the count, and can be undone once within 1 hour, restoring the prior value of every record it changed.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-authority.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** None.

#### CAMP-014 — Duplicating

Core · published · **done**

**Requirement.** Duplicating a campaign copies its fields, tags, custom-field values, deliverables, and milestones under a new unique code, and copies no risks, decisions, comments, activity, notifications, or AI analyses. When the operator supplies a new launch date, every copied date shifts by the difference between it and the original launch date; otherwise dates are copied unchanged. The copy triggers no automation.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

### Deliverables

#### DELIV-001 — Record

Core · published · **done**

**Requirement.** An operator can create, edit, and delete a deliverable. It belongs to exactly one campaign, requires a title and an owner, has an optional due date, and has a state of Open or Complete that starts Open.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### DELIV-002 — Completion

Core · published · **done**

**Requirement.** Completing or reopening a deliverable records the operator and the time, adds a campaign activity entry, and changes the campaign's derived completion count in the same commit.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### DELIV-003 — Overdue

Core · published · **done**

**Requirement.** An Open deliverable with a due date before the current date in the workspace timezone is marked overdue on campaign detail, in every lens and search result that contains it, and in CSV export. A deliverable due today is not overdue.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

### Milestones

#### MILE-001 — Record

Core · published · **done**

**Requirement.** An operator can create, edit, and delete a milestone. It belongs to exactly one campaign, requires a title and an owner, has a type of Launch, Review, Approval, Decision, Event, or Publish, has a status of Not started, On track, Watch, At risk, Blocked, or Complete that starts Not started, and has either a single date or a start and end date whose end does not fall before its start.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### MILE-002 — Timeline lens

Core · published · **done**

**Requirement.** As shipped, Timeline Lens contains every milestone of every non-archived campaign, ordered by date ascending using the start date for a range and then by campaign code. A range is rendered as a range with both dates and a point as a point with one date. Month scale renders one column per calendar month and Quarter scale one per quarter in the workspace timezone; switching scale changes only the columns, never the milestone set. Every item links to its campaign detail and to its milestone detail.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### MILE-003 — Dependencies

Core · published · **done**

**Requirement.** An operator can name existing milestones in any campaign as predecessors of a milestone. A predecessor set that would create a cycle is rejected with a validation error and changes nothing. When a milestone starts before a predecessor ends, both carry a dependency-conflict marker on milestone detail and in Timeline Lens, and setting the later milestone's status to On track while that marker stands requires a reason of at least one non-whitespace character, recorded on the milestone and in campaign activity. Changing one milestone's date never changes another's.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### MILE-004 — Readiness request

Core · published · **done**

**Requirement.** A readiness request is an in-app notification addressed to a milestone's owner, Outstanding until that owner acknowledges it. Within 15 minutes of 08:00 each day in the workspace timezone the shipped readiness automation creates exactly one Outstanding request for every milestone of type Launch that is not Complete, whose campaign is non-archived, and whose date falls within the next 5 days, and that has no Outstanding request. A repeated evaluation creates no duplicate.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-schedules.mjs`
**Gap.** None.

#### MILE-005 — Readiness rescheduling

Core · published · **done**

**Requirement.** Moving a Launch milestone's date out of the five-day window cancels its Outstanding request, and moving it inside the window creates one at the next daily evaluation. Completing or deleting the milestone, or archiving its campaign, cancels an Outstanding request. A milestone whose date has already passed receives no request.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### MILE-006 — Overdue

Core · published · **done**

**Requirement.** An incomplete milestone whose date, or whose range end, falls before the current date in the workspace timezone is marked overdue wherever it appears.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

### Risks

#### RISK-001 — Record

Core · published · **done**

**Requirement.** An operator can create, edit, and delete a risk. It belongs to exactly one campaign, requires a title and an owner, has a severity of Low, Medium, High, or Critical, has an optional due date, carries a signal and a mitigation as free text of at most 2,000 characters each — the signal being the evidence that raised the risk — and has a workflow state.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### RISK-002 — Lifecycle

Core · published · **done**

**Requirement.** An open risk is Watching, In progress, Needs decision, or Escalated. Resolving it requires a resolution note of at least one non-whitespace character and records the operator and the time. Reopening a resolved risk returns it to Watching and keeps the previous resolution in activity.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### RISK-003 — Escalation

Core · published · **done**

**Requirement.** An operator can escalate an open risk with a reason. In one commit the escalation sets the risk's state to Escalated, records the operator, reason, and time, and applies the escalation policy; the response carries any decision the policy created. *Policy: `risk.escalation.v1`; default: escalating a risk of severity Critical creates one unresolved decision of priority Critical linked to that risk unless an unresolved decision is already linked to it, and notifies the campaign owner. Escalating a lower severity creates no decision.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### RISK-004 — Isolation

Core · published · **done**

**Requirement.** Escalating, updating, or resolving a risk changes that risk, the campaign activity entry ACT-001 requires, the campaign's derived rollups, and — when `risk.escalation.v1` fires — the one decision and one notification it creates. No other record changes; a linked decision changes only through `decision.resolution.v1`.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

#### RISK-005 — Shipped lens

Core · published · **done**

**Requirement.** As shipped and before any operator edit, Risks Lens contains exactly the open risks of severity High or Critical whose campaign is non-archived and whose launch date is no later than 30 days from today in the workspace timezone, so a campaign already past its launch date stays in the lens. It orders Critical before High, then earliest due date, then risks without a due date, then campaign code, and shows severity, state, owner, due date, signal, mitigation, and campaign.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** —

### Decisions

#### DEC-001 — Record

Core · published · **done**

**Requirement.** An operator can create, edit, and delete a decision. It belongs to exactly one campaign, links to at most one risk and to at most one decision it supersedes, requires a title and a requester, and has a priority of Critical, High, Medium, or Low, a due time, a recommendation, an impact statement, an optional assignee, and a state of Awaiting approval, In review, Approved, Rejected, or Canceled. Awaiting approval and In review are unresolved; the other three are terminal.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### DEC-002 — Queue

Core · published · **done**

**Requirement.** Decision Queue contains exactly the unresolved decisions on non-archived campaigns. *Policy: `decision.queue-order.v1`; default order: overdue first, then priority Critical, High, Medium, Low, then earliest due time, then earliest creation time.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### DEC-003 — Approval

Core · published · **done**

**Requirement.** Approving an unresolved decision records the approver, the time, the outcome, and an optional rationale, adds a campaign activity entry, applies `decision.resolution.v1`, and removes the decision from Decision Queue, all in one commit.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### DEC-004 — First outcome wins

Core · published · **done**

**Requirement.** A request that approves, rejects, or cancels a decision is a mutation under VIEW-006. The first such outcome to commit is the decision's outcome; a later one against the older version returns 409 and changes nothing.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### DEC-005 — Assignment

Core · published · **done**

**Requirement.** Any operator can assign or reassign an unresolved decision to a current operator, which records the operator and the time and notifies the new assignee. Assignment changes no other field.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### DEC-006 — Changes, rejection, and cancellation

Core · published · **done**

**Requirement.** Requesting changes on an unresolved decision requires a rationale of at least one non-whitespace character, records the operator and the time, and sets the decision to In review. Rejecting or canceling an unresolved decision also requires such a rationale and is a terminal outcome under DEC-004.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### DEC-007 — Linked-risk effect

Core · published · **done**

**Requirement.** A decision outcome changes its linked risk only through the resolution policy, and no other decision action changes a risk. *Policy: `decision.resolution.v1`; default: approving moves a linked risk from Needs decision or Escalated to In progress; requesting changes, rejecting, and canceling leave it unchanged. No decision outcome resolves a risk.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### DEC-008 — Finality

Core · published · **done**

**Requirement.** A terminal decision cannot be edited into another outcome; such a request is rejected and changes nothing. An operator can create a new decision that supersedes it under DEC-001, and each decision links to the other on both details.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

### Lenses

#### LENS-001 — Definition

Core · published · **done**

**Requirement.** A lens has a name, a description, exactly one record type from Campaign, Risk, Milestone, or Decision, at most 20 conditions, a sort order, visible fields, and a display mode valid for its type: Grid for Campaign, Cards for Risk or Decision, Timeline or Agenda for Milestone. A lens with a mode its type does not allow is rejected on save.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### LENS-002 — Preview

Core · published · **done**

**Requirement.** Lens preview evaluates the unsaved definition against non-archived records, reports the exact matching count under VIEW-007 within 2 seconds, changes no record, and shows an explicit zero-results state.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### LENS-003 — Save and share

Core · published · **done**

**Requirement.** Saving a lens makes it available to every operator and records who saved it and when. Sharing produces a URL to the saved lens that requires an operator session; no lens URL is readable without one.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### LENS-004 — Edit and delete

Core · published · **done**

**Requirement.** An operator can edit a lens definition or delete the lens. Neither changes, archives, or deletes any record the lens displays or hides. A shipped lens cannot be deleted.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### LENS-005 — Current results

Core · published · **done**

**Requirement.** Opening or refreshing a lens re-evaluates it against non-archived records, and its result list, count, condition summary, and selected detail all describe that one evaluation.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Saved lens opening and refresh materialize one definition revision, non-archived result set, count, condition summary and selected detail; current authority, edits, archival and explicit empty states are exercised at 1440/390.

#### LENS-006 — Shipped views

Core · published · **done**

**Requirement.** Risks Lens and Timeline Lens ship as saved lenses. Operators can duplicate or edit them, and restoring either returns its definition to exactly the one in RISK-005 or MILE-002 without changing a record.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### LENS-007 — Conditions

Core · published · **done**

**Requirement.** A condition names one field of the lens's record type — campaign custom fields only on a Campaign lens — and one operator from equals, not equals, one of, contains, is empty, is not empty, before, after, and within the next N days, typed to that field: contains applies to text fields only, and the date operators to date fields only. Conditions combine with AND. A condition naming an unknown field, or an operator its field's type does not support, is rejected on preview and on save.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

### Activity and comments

#### ACT-001 — Campaign activity

Core · published · **done**

**Requirement.** Campaign activity is ordered newest first. It records every create, field change, archive, restore, and delete of the campaign and of its deliverables, milestones, risks, decisions, and comments, plus every import and every mutation made by an automation. Each entry carries its type, its subject's ID, the operator or the automation run that acted, the time, and for a field change the field name with its previous and new value. Campaign activity is the operator-visible view of the audit records in `BASE-OPS-005`: deleting a campaign removes this view, and those audit records survive with the campaign reference anonymized.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### ACT-002 — Comments

Core · published · **done**

**Requirement.** An operator can add a plain-text comment to a campaign, and it appears in campaign activity. A comment changes no field of any record and triggers no automation and no AI call. An operator can delete a comment, which leaves a deletion entry in activity.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Plain-text comment creation and versioned deletion, attributed activity, current authority, and complete business/automation/AI isolation through native HTTP commands and 1440/390 screens.

#### ACT-003 — Dates and times

Core · published · **done**

**Requirement.** Every timestamp in the API and the export is ISO 8601 in UTC. Campaign, deliverable, and milestone dates are calendar dates evaluated from the start of that day in the workspace timezone; decision due times are instants. Every relative time exposes its absolute time as its accessible name.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-walkthrough.mjs`
**Gap.** None.

#### ACT-004 — Mentions

Core · published · **done**

**Requirement.** A comment can mention a current operator, which notifies exactly that operator and changes no field of any record. A mention of a removed or erased operator renders as plain text and notifies nobody.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-write-effects.mjs`, `tests/ui-launch-walkthrough.mjs`
**Gap.** Only the mentioned current operator is notified; removed and erased mentions stay plain text without delivery or business-field changes, through native HTTP commands and 1440/390 screens.

### Automations

#### AUTO-001 — Definition

Core · published · **done**

**Requirement.** An automation has a name, one trigger, an ordered list of actions, an enabled state, and a definition version that increments on every edit. A trigger is a product event declared in `seed.json → extensionPoints.events` or a schedule of at most one run per hour, and a shorter schedule is rejected on save. An action is one of `escalate-risk`, `create-decision`, `notify-operator`, `send-email`, `request-ai-analysis`, and `add-activity`, plus any command contributed through `jobs.commands.v1`.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/apps/launch/automations.server.ts`, `src/apps/launch/automation-commands.server.ts`, `src/core/app/composition/automation-commands.server.ts`, `tests/launch-installed-event-control.mjs`, `tests/helpers/launch-automation-definitions.mjs`
**Gap.** None.

#### AUTO-002 — Commit boundary

Core · published · **done**

**Requirement.** An event automation is dispatched within 10 seconds of the mutation that raised its event committing. A rolled-back mutation dispatches nothing. A disabled automation runs on neither events nor schedules and records no run.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-runtime.mjs`
**Gap.** None.

#### AUTO-003 — One run per trigger

Core · published · **done**

**Requirement.** One run exists per automation, definition version, and trigger event or scheduled instant; transport retries are attempts inside that run. Under `BASE-OPS-003`, a redelivered message reuses each action's idempotency key, so no decision, notification, analysis, or activity entry is created twice.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-event-control.mjs`, `tests/launch-installed-runtime.mjs`
**Gap.** None.

#### AUTO-004 — Definition changes

Core · published · **done**

**Requirement.** A run records the definition version that created it. Editing an automation affects only later triggers. Disabling one cancels queued runs that have not started, recording each as Canceled with no action executed.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-event-control.mjs`, `tests/launch-installed-network-cancel.mjs`
**Gap.** None.

#### AUTO-005 — Loop protection

Core · published · **done**

**Requirement.** Every mutation made by an automation carries the ID of the run that made it, and a run inherits its cause's chain of run IDs. An event whose chain already contains a given automation starts no new run of it, and the suppression is recorded on the causing run. A chain is at most 10 runs deep, and an eleventh is recorded as Suppressed and not dispatched. Two runs triggered by the same event may finish in either order and neither waits for the other.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-event-control.mjs`
**Gap.** None.

#### AUTO-006 — Run history

Core · published · **done**

**Requirement.** Every run records its automation version, trigger, subject, queued, started, and finished times, each attempted action with its result, the number of records it affected, and the error code and message of any failure. Run history is retained in full and paged under VIEW-007, and Automation Monitor shows each automation's success rate as finished successful runs divided by finished runs over the trailing 30 days, stating that window.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/core/features/automations/repository.ts`, `src/core/features/automations/service.ts`, `src/core/features/automations/ui/automation-monitor-page.tsx`, `migrations/core/1300_launch_run_history.sql`, `tests/launch-installed-event-control.mjs`, `tests/helpers/launch-run-history.mjs`, `tests/launch-installed-retries.mjs`, `tests/ui-launch-walkthrough.mjs`, `tests/helpers/launch-automation-monitor-screens.mjs`
**Gap.** None.

#### AUTO-007 — Transport retry

Core · published · **done**

**Requirement.** An action with a transport failure known to be safe to retry is retried at 1, 5, 15, 30, and 60 minutes after its first failure. A retry re-executes only actions that have not completed and reuses their idempotency keys. When the fifth retry fails the run is marked Failed. An uncertain external outcome, including an uncertain SendGrid submission, leaves the action and run visibly Unknown with their error code and message; neither automatic nor manual retry resends it. A retained action key alone does not establish provider-side idempotency or a safe resend. The [14 October clarification](docs/launch-runtime.md#uncertain-delivery-contract--14-october-2026) records this owner-accepted exception to the former unconditional transport retry promise.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-retries.mjs`
**Gap.** None.

#### AUTO-008 — Failure that retrying cannot fix

Core · published · **done**

**Requirement.** A validation error, a policy rejection, a schema failure, or a provider refusal fails the run immediately with no retry. Every Failed run is listed in Automation Monitor with its error code and message under `BASE-OPS-004`.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-event-control.mjs`
**Gap.** None.

#### AUTO-009 — Manual retry

Core · published · **done**

**Requirement.** An operator can retry a Failed run. The retry is a new run linked to the original by `retryOf` that reuses the original action idempotency keys, so completed actions do not repeat, and the original run stays Failed and unchanged. Unknown runs are ineligible; manual retry cannot bypass AUTO-007's uncertain-outcome restriction.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-retries.mjs`
**Gap.** None.

#### AUTO-010 — Fan-out

Core · published · **done**

**Requirement.** A mutation that changes many records at once — a bulk edit under CAMP-013 or a committed import under IMPORT-003 — dispatches at most one run per enabled automation, carrying the affected record IDs, rather than one run per record.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-event-control.mjs`
**Gap.** None.

#### AUTO-011 — Shipped automations

Core · published · **done**

**Requirement.** The seed ships four automations. Critical risk escalation triggers when a risk's severity becomes Critical while the risk is open and not already Escalated, and its one action escalates that risk under RISK-003; it is enabled by default. Launch readiness runs on the schedule in MILE-004 and is enabled by default; its lead time, 5 days by default, and its evaluation hour, 08:00 by default, are editable in settings. Campaign brief triggers when a campaign is created or updated, at most once per campaign per hour, skipped when nothing in its AI-002 context changed since the last brief; it is enabled by default and dispatched only while AI is enabled under SET-002. The weekly portfolio digest runs on the schedule in NOTIFY-004 and is disabled by default. No other parameter of a shipped automation is editable, and each can be disabled.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-schedules.mjs`
**Gap.** None.

### Notifications

#### NOTIFY-001 — In-app events

Core · published · **partial**

**Requirement.** An operator receives an in-app notification when a decision is assigned to them, when they are mentioned in a comment, when a Critical risk is escalated on a campaign they own, when a readiness request is created for them, and when an automation run they started fails. A Failed run that no operator started notifies the owner of the campaign it acted on, or every operator when the run has no campaign subject.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-notifications.mjs` / `tests/helpers/notification-in-app-clauses.mjs` / verifyNotificationInAppClauses (push launch-notifications), at 1440/390
**Gap.** The NOTIFY-001 public-door journey proves exact decision-assignee, comment-mention, campaign-owner Critical-risk and readiness-target notices, plus failed-run starter and campaign-owner recipients with public inbox readback at 1440/390. Gap: a subjectless Failed run omits active operators without current Launch memberships; all-active-operator delivery and inbox availability for those operators remain unfulfilled.

#### NOTIFY-002 — Email delivery

Core · published · **partial**

**Requirement.** Every in-app notification has an email counterpart routed by the delivery policy through `mail.sender.v1` against the workspace quiet hours in settings, which default to 18:00–08:00 in the workspace timezone. Authentication email and the weekly digest are never held. *Policy: `notification.delivery.v1`; default: a Critical risk escalation or a decision assignment is emailed within 60 seconds at any hour; every other email raised during quiet hours is held and sent within 60 seconds of quiet hours ending, as one message per operator.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-notifications.mjs` / `tests/helpers/notification-email-policy.mjs`, verifyNotificationEmailPolicy (push launch-notifications)
**Gap.** The NOTIFY-002 public-door journey proves default 18:00–08:00 workspace quiet hours, assignment and Critical escalation mail on a 59-second tick, two held events grouped into one message per operator within 60 seconds of quiet-hours end, and authentication/digest exceptions with exact provider-edge counts at 1440/390. Gap: record-automation producers deliberately request in-app-only delivery, so those in-app notifications have no email counterpart under the clause’s first sentence.

#### NOTIFY-003 — Delivery failure

Core · published · **partial**

**Requirement.** Every outbound email has a delivery record linked to its notification and, when an automation sent it, to that run. A failed send, including an asynchronous bounce, is retried on the AUTO-007 schedule subject to its safe-retry requirement and then marked failed on both the delivery record and the notification, where settings lists it. An uncertain submission remains visibly Unknown under AUTO-007, rather than being treated as a confirmed failure that permits resend. SendGrid acceptance is not proof of mailbox delivery. The in-app notification stays available.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-notifications.mjs` / `tests/helpers/notification-delivery-failures.mjs`, verifyNotificationDeliveryFailures (push launch-notifications)
**Gap.** The NOTIFY-003 public-door journey proves notification-linked delivery records, failed-run notification linkage to its actual automation run, rejected/Unknown outcomes in the inbox and Settings at 1440/390, retained notices, provider acceptance distinct from mailbox delivery, and refusal of automatic or manual Unknown resend. Gap: installation mail has no asynchronous-bounce intake bound to these records; known-safe rate-limited notification sends are not retried on AUTO-007’s schedule; direct Launch send-email actions do not create notification-linked channel delivery records.

#### NOTIFY-004 — Digest

Core · published · **done**

**Requirement.** When enabled, the weekly digest is sent within 15 minutes of 09:00 each Monday in the workspace timezone to the configured recipients, defaulting to every current operator, and once per recipient address however often that address appears. It itemizes non-archived campaigns, launches in the next 30 days, open High and Critical risks, unresolved decisions, and runs that failed in the previous 7 days.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-schedules.mjs`
**Gap.** None.

#### NOTIFY-005 — Inbox

Core · published · **done**

**Requirement.** The notification inbox lists an operator's notifications newest first and the navigation shell shows their unread count. A notification is unread for an operator until that operator opens it, an operator can mark one or all of their notifications read, and one operator's read state never changes another's. A notification whose subject has been archived or deleted is shown as unavailable rather than linking to a missing record.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).
2. Unavailable-subject and outcome clarification: archived, deleted or inaccessible subject content remains neutral and unavailable, with the existing API title Notification unavailable, empty body, subject.available false and absent href.
3. For NOTIFY-009, a currently authorized retained starter can still read the permitted generic operation outcome as recipient-owned outcome metadata, separately from that subject projection, including when progress email is muted.
4. This metadata does not reveal subject names, record content, destinations, protected error details or inaccessible links, grants no access and remains subject to erasure.
5. Muting suppresses mail and never supplies authority for another delivery channel.
6. Additional required evidence: retain the existing unavailable-subject API assertions and inbox rendering assertions at 1440 and 390.
7. For a legitimately removed or inaccessible failed export and a starter with progress mail muted, assert a legible permitted needs-attention outcome, neutral unavailable subject content, no protected link, no mail and no disclosure to another operator.
8. Recheck authority and erasure, including erasure during live import; preserve accepted receipts only where the existing lifecycle policy permits them, and prove no later send or restored debt revives erased content or a recipient.

**Evidence.** `tests/ui-launch-notifications.mjs` / `tests/helpers/launch-inbox-screens.mjs` / verifyInboxScreens (push launch-notifications), at 1440/390: ordering, unread count, opening, one/all reads, recipient isolation, archived/deleted subjects, retained redacted deleted-campaign notices and read state, sent-mail receipts, positively pending and accepted fixture mail, and an unfiltered provider-edge baseline proving zero new sends after deletion beyond every pending due time outside quiet hours and again the next day, including newly assigned delivery groups. The NOTIFY-009 matrix in `tests/helpers/notification-delivery-matrix.mjs` also asserts at 1440 and 390 that an unavailable progress subject keeps this neutral projection while its own retained starter, with progress mail muted or not, reads the generic outcome separately in the API and the rendered row, with no link, mail or disclosure to another operator. DONE proposal UNCOUNTED until ct’s judge.
**Gap.** None.

#### NOTIFY-006 — One per event

Core · published · **done**

**Requirement.** An operator receives at most one in-app notification and one email for a single product event however many of its roles they hold, is never notified of an action they took themselves, and a repeat of the same event on the same subject within 60 minutes updates the existing unread notification instead of creating another.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-notifications.mjs` — Launch walkthrough E10–E17 / verifyNotificationEventScreens (launch-notifications), 1440/390: three-role recipient gets one in-app notice and one durable/provider-edge email; distinct repeated event updates the existing unread notice with unchanged email count; self-action sends the actor neither channel while both other recipients receive each.
**Gap.** None.

#### NOTIFY-007 — Muting

Core · published · **done**

**Requirement.** In settings each operator can mute any notification kind for themselves. Muting stops the email for that kind for that operator only; the in-app notification is still created, and delivery to every other operator is unchanged.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-notifications.mjs` — Launch walkthrough E10–E17 / verifyNotificationPreferencesScreens and its loaded `tests/helpers/notification-delivery-matrix.mjs` / verifyNotificationDeliveryMatrix (push launch-notifications), at 1440/390: all ten kinds mute/unmute in Settings with persisted readback; generated decision-assigned, critical-risk-escalated, readiness, comment-mentioned, automation-failed, decision-overdue and weekly-digest events each retain both recipients’ notices, mute only the first recipient’s email with exact provider-edge counts, restore the next email and never replay muted mail. The digest includes a simultaneous unaffected second recipient. The in-app-only record-automation row asserts, per recipient with the email preference read back on and muted, the in-app notice present, zero delivery rows and zero provider-edge mail: a covered non-email path under ct’s 25 October 08:50Z ruling. Retention and no replay after unmute remain asserted. `tests/launch-installed-schedules.mjs` — NOTIFY-004 enabled Monday digest (push launch-7) additionally asserts weekly mute/unmute and no old-mail replay. The Launch send-email action is a user-authored automation action, not a notification email, so notification muting does not govern it. Connection-outage and product-fenced automation-stop events now pass through the outage matrix with owner-only recipients and exact muted/unmuted mail counts. Resumable native base-import completion and partial failure, and scheduled warehouse-export completion and failure, now use the progress matrix with retained starters, exact muted/unmuted delivery and provider-edge mail, public preference readback, repeat suppression and retained muted notices. A fresh starter receives a failed export without preferences, receives no successful-completion notice until opting in, then receives exactly one; both defaults are discriminated. Settings no longer describes progress as unproduced. DONE proposal, UNCOUNTED until ct’s judge.
**Gap.** None.

#### NOTIFY-008 — Overdue decisions

Core · published · **done**

**Requirement.** A decision still unresolved 15 minutes after its due time notifies its assignee once, or its requester once when it has no assignee. Moving the due time later re-arms that notification once for the new time.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-schedules.mjs`
**Gap.** None.

### AI

#### AI-001 — Analyses

Core · published · **done**

**Requirement.** An operator, or the shipped campaign-brief automation, can request a campaign brief, a risk readout, or a lens proposal. Each result is stored as an immutable AI analysis linked to its campaign, to the lens it was invoked from, or to its lens draft, marked as AI-generated wherever it appears, stamped with the time it was produced, and citing the ID and version of every entity in its input.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-ui.mjs`
**Gap.** None.

#### AI-002 — Context

Core · published · **done**

**Requirement.** *Policy: `ai.campaign-context.v1`; default: a campaign brief receives the campaign's standard fields and its linked deliverables, milestones, open risks, and unresolved decisions; a risk readout receives the result set of the lens it was invoked from, capped at 200 risks; a lens proposal receives the supported field definitions and the operator's prompt. Comment text and custom-field values go to none of the three.*

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-event-control.mjs`
**Gap.** None.

#### AI-003 — Human control

Core · published · **done**

**Requirement.** AI output never changes a field of any record: it never completes a deliverable, moves a milestone, escalates or resolves a risk, resolves a decision, saves a lens, or sends a notification. A lens proposal stays an editable draft until an operator saves it.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-ui.mjs`
**Gap.** None.

#### AI-004 — Provider and failure

Core · published · **done**

**Requirement.** AI calls go through `ai.provider.v1` with a 60-second timeout. A timeout, a response that fails its schema, or an unconfigured or unavailable provider stores no analysis and changes no field of any record. An operator-initiated request shows the provider's error code and message where it was requested; an automation-initiated one fails that run under AUTO-008. Every other automation, notification, mutation, and read proceeds unaffected.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-ai-failures.mjs`
**Gap.** None.

#### AI-005 — Usage

Core · published · **done**

**Requirement.** Every AI call records its feature, model, input and output token counts, reported cost, subject, requesting operator or automation run, duration, and result. Settings shows call counts, token counts, and cost by day and by feature.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-ai-failures.mjs`
**Gap.** None.

#### AI-006 — Daily ceiling

Core · published · **done**

**Requirement.** Settings holds a daily ceiling on AI calls, 200 by default, resetting at 00:00 in the workspace timezone. A call that would exceed it is refused with an error naming the ceiling, stores no analysis, and fails any run that requested it under AUTO-008. Non-AI work is unaffected.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-ai-failures.mjs`
**Gap.** None.

### Import

#### IMPORT-001 — CSV preview

Core · published · **done**

**Requirement.** An operator can import a campaign, deliverable, or milestone CSV within the upload limits under `BASE-INPUT-003` and the row limit in `seed.json → limits`. The file must be UTF-8, comma-delimited, and carry a header row; a byte-order mark is accepted and anything else is rejected with a parse error. Import requires an explicit mapping from columns to fields and, before any record changes and within 60 seconds at the row limit, shows the number of creates, updates, and unchanged rows, every row error, and for each updated row the fields that will change with their stored and incoming values.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** None.

#### IMPORT-002 — Merge keys

Core · published · **done**

**Requirement.** A campaign row creates or updates a campaign by its unique code; a deliverable or milestone row creates or updates by campaign code plus title, and is a row error when that campaign is not already in the workspace. A merge key repeated inside the file, and a reference to an owner or select value that does not exist, are row errors. A value that is empty or only whitespace never overwrites a stored value.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** None.

#### IMPORT-003 — Commit

Core · published · **done**

**Requirement.** Confirm is available only when every row is valid; one invalid row blocks the whole file and there is no partial import. Confirming commits every previewed row in one transaction, records an import record, and writes one activity entry on every campaign it created, updated, or whose deliverables or milestones it changed; any failure rolls back every row. A committed import cannot be rolled back, which is why IMPORT-001 shows every field it will change.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** None.

#### IMPORT-004 — Replay and staleness

Core · published · **done**

**Requirement.** Preview returns a token that expires 30 minutes after it is issued and that confirm requires, together with an idempotency key. A record matched by the preview that changed before confirm makes confirm return 409 and require a new preview. Replaying a confirm with the same key within 24 hours returns the original result and creates no second record and no second activity entry.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** None.

#### IMPORT-005 — Stored file

Core · published · **done**

**Requirement.** The uploaded file is stored with its import record and is downloadable by any operator. Deleting the import record deletes the file within 5 minutes.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** None.

### Settings

#### SET-001 — Settings area

Core · published · **done**

**Requirement.** Settings is one operator-only area with sections for the workspace (name, timezone, currency, quiet hours), operators, notification preferences, custom-field definitions, automations and digest recipients, AI, imports and failed email deliveries, and current usage against every limit in `seed.json → limits`. Changing a setting records the operator and the time and applies to work dispatched after the change; work already dispatched is unaffected.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-operator-doors.mjs`
**Gap.** None.

#### SET-002 — AI configuration

Core · published · **done**

**Requirement.** AI is off until an operator enables it in settings while the configured `ai.provider.v1` adapter has every environment value in `seed.json → env`. While AI is off, an AI request is rejected with a message naming what is missing, the campaign-brief automation is not dispatched, and every other feature works unchanged.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-installed-runtime.mjs`, `tests/launch-installed-ui.mjs`
**Gap.** None.

#### SET-003 — First run and sample data

Core · published · **done**

**Requirement.** *Changed on 19 October 2026: configured workspace details complete first run.* When the installation configuration sets the workspace name, timezone and currency (`WORKSPACE_NAME`, `WORKSPACE_TIMEZONE`, `WORKSPACE_CURRENCY`, as `rer setup` and RER Managed hosting do), those are the owner's confirmed details: first-owner initialization stores them and records first run complete, so the owner's first sign-in opens `/app`. Otherwise a new deployment directs signed-in app visits to `/setup` until the owner confirms workspace details; completion survives setup reruns, and completed `/setup` visits open `/app`. It starts with the operator configured at setup, the configured timezone and currency, the two shipped lenses, the four shipped automations, and no campaigns, and every surface shows the empty state in VIEW-004. An operator can install and remove sample data in one action from settings; removal deletes only records the sample created and is refused, naming them, once any of those records has been edited.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/launch-operator-doors.mjs`
**Gap.** None.

### Data

#### DATA-001 — Export contents

Core · published · **partial**

**Requirement.** In addition to the archive guarantees in `BASE-DATA-001`, the export contains every workspace setting, operator, campaign, tag, custom-field definition and value, deliverable, milestone and dependency, risk, decision and supersede link, lens, comment, activity entry, notification, delivery record, automation definition and run, import record, AI analysis, and AI usage record as JSON, and every stored import file in its original form.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/domains/portability/archive.server.ts`, `tests/rer-retained-archive.mjs`
**Gap.** Installation archive machinery and retained-archive restoration have current push coverage. Full clause-named enumeration of every required Launch entity, setting and original import file remains unproven.

#### DATA-002 — CSV export

Core · published · **done**

**Requirement.** An operator can export the campaign grid or any lens or queue result as CSV containing exactly the visible fields in their displayed order and exactly the records the current conditions select, with dates in the workspace timezone and money in the workspace currency, naming the view, the currency, and the instant it was taken. It is a one-way download and creates no sync relationship with any external system.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `tests/ui-launch-operator-doors.mjs`
**Gap.** None.

#### DATA-003 — Capacity limits

Core · published · **partial**

**Requirement.** A create, invitation, or import that would take the workspace past a limit in `seed.json → limits` is rejected with 409 naming the limit, its value, and the current count, and changes nothing. No record, row, or field is silently dropped or trimmed.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`).

**Evidence.** `src/apps/launch/domain.server.ts`, `tests/records-import-d1.mjs`, `tests/records-manual-release.mjs`
**Gap.** Launch storage guards and import/adoption capacity refusals are implemented and related tests run in CI. Full clause-named create/invitation/import coverage of every declared workspace limit, exact error counts and zero effects remains unproven. Gap: `fieldsPerTable` 500 is declared in code, not `seed.json -> limits`; field 501 is refused as HTTP 400 `validation`, not `capacity_limit`; imports still cap at 80 fields.

### Records, schema and the app model — target

#### RECORDS-008 — Merge import into an existing table

Core · target · **partial**

**Requirement.** An operator with create and update rights on a table imports a CSV file, an .xlsx sheet or a Google Sheet (INTEG-003) into that existing, populated table. They map each column to a field or skip it and choose zero or more merge fields. The preview lists exactly the records that will update, with before and after values; the rows that will create records; unchanged rows; and refused rows with the reason for each. A row whose merge value matches exactly one existing record updates it, and a row that matches none creates one. A merge value that matches several records, or appears twice in the file, is refused rather than guessed. Linked-record columns resolve by the linked table's primary value, the way a person types it. When the operator ticks it, a missing linked record is created. An ambiguous or unknown name is shown on its row. Values convert by field type: US and ISO dates, currency with or without `$` and thousands separators, select labels, checkbox words, multi-select separators and E.164 or US-formatted phones. A column mapped to a field the importer cannot write, to a calculated field or to a hidden field is refused before the preview. Commit rechecks policy and record versions and applies the import in one atomic write. For 7 days the whole import can be undone as ordinary audited writes; a cell that someone changed since is reported as a conflict, not overwritten (VIEW-014). The mapping and merge fields are saved per table and source name, so next week's file is mapped in one step. A scheduled import runs the same mapping through the same preview rules from a Google Sheet, a CSV or JSON URL, or an emailed attachment (INTEG-002's inbound address). Rows that need review hold the run for a person, while a clean run commits on its own. The importer chooses whether import writes fire automations; the default is off, as in RECORDS-005. Every import yields a receipt counting created, updated, unchanged and refused rows.

**Acceptance.**
1. A fixture vendor price list, as CSV and as .xlsx, is merged on SKU into a populated table.
2. The preview and commit update exactly the matching records with the expected values, create the rest, resolve linked records by primary value, and refuse a mapped forbidden field and a repeated SKU.
3. Undo restores every prior value.
4. A cell another operator changed after the import is reported as a conflict on undo.
5. A saved mapping applied to next week's fixture file produces the expected preview.
6. A scheduled Google Sheet import, run at a fixed clock against a recorded API fixture, commits a clean run and holds one with a refused row.

**Evidence.** `tests/records-csv-fence.mjs`, `src/domains/records/csv-mappings.server.ts`, `src/domains/records/csv-typed-values.ts`, `src/ui/records/manual-import-mappings.tsx`, `docs/contract/RECORDS-008/`
**Gap.** Versioned per-person/table/source CSV mappings restore columns and one merge key for next week; preview and commit recheck schema, policy and record versions. US/ISO dates, exact USD/number amounts, checkbox words, select and separated/quoted multi-select labels convert; primary-value links and ambiguous names use current policy. Real 61-vendor create then saved-mapping update is exercised at 1440/390. Workbook and Google Sheets intake now use the same mapping, before/after preview and atomic merge; hourly Sheets merges recheck the configuring owner and pause on lost rights. Gaps: zero or multiple merge keys, missing-link creation, phone normalization, scheduled CSV/JSON URLs and emailed attachments, seven-day undo and automation choice. Currency and multi-select field authoring is recorded under FIELD-001 (`src/ui/records/schema/field-type-label.ts`). Gap (SCALE-002): imports take at most 80 fields and 100 physical columns per table; a wider source table is refused before any write (HTTP 400 `validation` above 80 fields, HTTP 409 `capacity_limit` above 100 physical columns) and cannot move in until SCALE-002.

#### RECORDS-009 — Record templates and duplicate record

Core · target · **partial**

**Requirement.** Any operator with create rights can duplicate a record, optionally with its linked records and attachments. The copy goes through the same policy, validation and automation triggers as a new record, and fields the operator cannot write are left empty. A creator can save record templates per table: preset field values, preset linked records and child records to create with it (a purchase order with its standard line items). Operators apply a template from the grid, a form, an interface button (IFACE-004) or an automation action (AUTO-USER-003).

**Acceptance.**
1. Duplicate journey, with and without links, where a field the operator cannot write is left empty.
2. A template is applied from the grid and from an automation, and it creates its child records in one audited write.

**Evidence.** `src/apps/launch/duplicate.server.ts`
**Gap.** campaign duplication for the Launch template only (CAMP-014; src/apps/launch/duplicate.server.ts); duplicating records and record templates on general bases are absent

#### OWN-001 — Owned installation without seat charges

Core · target · **done**

**Requirement.** Cradle runs in the buyer's own Cloudflare account (Worker, D1, R2, Queues) or on RER Managed hosting, under the MIT license. Adding operators, guests or bases never adds a license fee; the only costs are the buyer's infrastructure and any providers they connect, and Settings shows current usage against every declared limit in `seed.json`. The owner can export everything (RECORDS-006) and leave without a vendor's cooperation.

**Acceptance.**
1. Installer and whole-installation archive round trip on emitted workerd/D1/R2; Settings usage view.

**Evidence.** `scripts/installer/seed.mjs`, `tests/rer-data-roundtrip.mjs`, `tests/rer-retained-archive.mjs`, `tests/ui-launch-operator-doors.mjs`
**Gap.** None.

#### SCALE-001 — Operational scale

Core · target · **partial**

**Requirement.** A base holds at least 250,000 records per table and 500,000 per base, 500 fields per table and 50 tables per base. Grid open, filter, sort and group return the first page within 1 second p95 at those sizes; a single-record write commits within 300 ms p95; formula and rollup reads meet CALC-004. Limits are declared in `seed.json → limits`, measured rather than estimated, and a request beyond one is refused naming the limit, its value and the current count (DATA-003). Larger analytic workloads are served by SYNC-002, not by stretching a request.

**Acceptance.**
1. Declared load profile run against emitted workerd/D1 recording p50/p95/p99 and error rate, then an authorized hosted run.

**Evidence.** `scripts/scale/run.mjs`, `docs/contract/SCALE-001/`, ACCEPTANCE.md
**Gap.** Additive local workerd/D1 loading and authenticated HTTP measured 250,000 records/table, 500,000/base and 50 tables at 80 fields (86 physical columns); all seven diagnostic latency targets passed with zero errors. Gap: the full profile at `15b0403a762f32fccb4b03bb8c668efd9a1fc9bc` was refused at CREATE TABLE (D1_ERROR: too many columns). At 6 columns plus 0-4 per field, D1's limit of 100 columns bars 500 fields until SCALE-002. The 80-field run is diagnostic only. Hosted: NOT RUN. Evidence: `scripts/scale/run.mjs`, `docs/contract/SCALE-001/`, ACCEPTANCE.md. The 80-field diagnostic is not SCALE-001 acceptance.

#### SCALE-002 — Wide tables

Core · target · **missing**

**Requirement.** A table holds 500 fields of any FIELD-001 mix, whatever the engine's limits. Every field is created, written, filtered, sorted, grouped, formula-referenced, imported, exported, restored and read through the API at SCALE-001's sizes and targets. Field 501 is refused per DATA-003 (`limits.fieldsPerTable`). A full-profile base's bytes are measured. A second such base is accepted, or refused naming the storage limit.

**Acceptance.**
1. Emitted workerd/D1 holds a 50-table, 500,000-record base whose largest table has 250,000 records and 500 mixed fields, money included.
2. It proves: - field 500 filtered, sorted and grouped, first page ≤1 s p95; - a write to fields 1 and 500 ≤300 ms p95; - a formula over both fields meeting CALC-004; - field 501 refused; - byte-equal RECORDS-006 return and SNAP-001 restore; - API-USER-002 reads of all 500 fields; - a 500-column RECORDS-005 CSV import; - p50/p95/p99, error rate and bytes recorded; - then a hosted run.

**Evidence.** None yet.
**Gap.** Gap: wide-table storage is not implemented. The maintained installation archive inventories physical tables; its logical extra-payload consumer runs outside the final D1 restore transaction. Atomic logical-table archive/restore support is needed before sharded custody can meet this clause. Every 500-field public-door point, the 25,000-record tier, the 250,000/500,000-record 50-table profile, measured bytes and second-base storage acceptance remain unproven. Hosted: NOT RUN.

### Fields, calculations and attachments

#### FIELD-001 — Complete field types

Core · target · **partial**

**Requirement.** A table can hold:
- single-line text;
- long text, plain or rich, where rich text supports bold, italic, strikethrough, inline code, headings (levels 1–3), bulleted and numbered lists, checklists, block quotes, code blocks and links, stored as Markdown;
- number (integer, or decimal with set precision);
- currency (USD by default, any ISO 4217 code, stored as exact minor units);
- percent;
- date, and date-time with time zone, where each date-time field displays either in each viewer's local time zone or in one fixed time zone for everyone (the workspace zone by default), stores UTC and shows the zone it used;
- duration;
- checkbox;
- single select and multiple select, with colors;
- rating (1–10);
- email;
- US-first phone (stored E.164, shown (555) 123-4567);
- URL;
- user (one or many operators; notification on assignment is FIELD-004);
- linked record (one or many; its record picker is FIELD-005);
- lookup, rollup, count and formula;
- attachment;
- barcode (scanned or typed, a Code 128, UPC, EAN or QR value);
- autonumber;
- created time, last-modified time, created by and last-modified by;
- button (IFACE-004).

Each type validates on every door (UI, form, API, import, automation) and exports and re-imports losslessly.

**Acceptance.**
1. A builder journey creates one field of every type.
2. It writes valid and invalid values through the UI, a public form, REST and CSV, then re-imports the base export with every value equal.
3. A rich-text value using every listed format comes back byte-equal in Markdown after a base JSON export and re-import, a CSV export and re-import, and a REST read and write.
4. A date-time field set to the viewer's local zone shows the same instant as 9:00 AM Eastern to a viewer in New York and 6:00 AM Pacific to a viewer in Los Angeles.
5. Set to a fixed zone, it shows both viewers 9:00 AM Eastern.

**Evidence.** `tests/records-manual-release.mjs` via `tests/helpers/records-phone-journey.mjs` and `tests/helpers/records-typed-field-journey.mjs` (schema and every write door); `tests/records-manual-roundtrip.mjs` via `tests/helpers/records-field-portability.mjs` (JSON and CSV equality); `tests/ui-records-builder.mjs` via `tests/helpers/field-browser.mjs` (1440/390)
**Gap.** The builder now authors US-first Phone fields stored as E.164, displayed with US formatting, edited with tel inputs and carried by typed lookups. UI, authenticated form, REST, CSV and automation writes name and refuse invalid phone values; JSON and view/explicit-correspondence CSV roundtrips retain values. Existing text-bound SMS actions continue; their editor asks for a Phone field. Email accepts one valid address without control characters; rating stores whole values from 1 to a configured maximum of 1–10 (default 5); duration stores whole seconds and is entered and shown as h:mm or h:mm:ss. The builder, record editor and typed lookups carry all three; UI, authenticated form, REST, CSV and automation writes refuse invalid values naming the field, and base JSON/view CSV/explicit-correspondence CSV roundtrips preserve their values. The other authored field types remain as previously recorded. Long/rich text, percent, barcode, autonumber, metadata, buttons, multiple people and authored precision/time-zone formatting remain absent; importing people requires matching active installation identities.

#### FIELD-002 — Field conversion and table deletion with preview

Core · target · **done**

**Requirement.** An owner can convert a field to another type (text to select, select to linked record, number to currency, text to date and so on) and delete a field or table. The impact preview lists every value that converts, every value that would be lost with examples, and every formula, view, form, automation and API key that depends on it; adoption keeps a recovery export and a deleted table or field stays restorable for 30 days (SNAP-002).

**Acceptance.**
1. Conversion matrix test through `release.adopt` with lossy and lossless cases; delete-then-restore journey.

**Evidence.** `tests/records-manual-release.mjs` via `tests/helpers/field-conversion-journey.mjs` (272-pair matrix, all six dependent kinds, recovery and cause-free ranges), `tests/helpers/field-trash-journey.mjs`, `tests/helpers/field-history-restore-journey.mjs` and `tests/helpers/schema-purge-journey.mjs` (30-day linked restore and scheduled physical disposal); `tests/ui-records-builder.mjs` via `tests/helpers/field-browser.mjs` (1440/390) (12 mapped and 260 refused asserted separately)
**Gap.** Reviewed release.adopt covers all 272 ordered type pairs: 12 mapped pairs, including text/phone and linked-record/select, and 260 explicit named refusals with no adoption writes. Converted values, multi-link losses and required-loss refusals are listed with recovery exports. Formula, rollup, view, form, automation and API-key dependents are each named. Fields and linked tables retain 30-day grouped custody; restore returns identities, values, ordered inbound links and original history. The scheduled clock physically disposes expired schema roots, joins/search stores and all release/preview recovery copies, refuses later restore, and preserves live records plus overlapping unexpired custody and foreign keys. Adoption/conversion ranges retain the identical cause-free resyncRequired marker, with no invented patches or converted-value disclosure. Interface dependents remain carried by IFACE-001 (ct, 23 October).

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

**Requirement.** Choosing a linked record is fast and limited to the right records:
- **Search and display.** The picker searches the linked table by its primary field and by other fields the author chooses, and each candidate shows those fields (and an attachment thumbnail when chosen), so similar names can be told apart. It pages through tables at the SCALE-001 limits.
- **Limit to a view.** The author can limit selection to the records in one view of the linked table (for example "Active vendors"). Its filters are evaluated when the picker opens, so a vendor marked inactive stops being offered. Grids, record pages, forms (FORM-001), interfaces (IFACE-001) and the mobile app (MOBILE-001) offer only those records. By default the limit governs pickers only, as Airtable's does; the author can also enforce it on every write door, and then a REST, import or automation write that links a record outside the view is refused naming the field.
- **Create from the picker.** The picker can create a new linked record in place: a short form of the linked table's fields opens, and the new record is created and linked in one audited write. The option is shown only to people who may create records in the linked table, and the author can turn it off per field and per form.
- **Policy.** Candidates obey the chooser's current row and field policy on the linked table, so a record or field they cannot read is never offered, searched or shown.

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

Core · target · **partial**

**Requirement.** An owner or creator writes formulas in a spreadsheet-style language whose syntax and function set match Airtable's formula field reference, so an Airtable formula pastes in unchanged. That covers the operators (`+ - * / & = != < > <= >=`), field references in `{braces}` and every function CALC-005 lists, including WORKDAY and WORKDAY_DIFF with US federal holidays. The editor autocompletes fields and functions, shows the result type, previews results on real records before adoption and names the field and position of any error. A cell whose formula cannot be computed shows why rather than a blank; ERROR() and ISERROR behave as Airtable's do. The author formats the result by its type, as Airtable's formatting tab does: a number with set decimal places and thousands separators; currency (USD by default, any ISO 4217 code) with set places; percent with set places; duration as h:mm, h:mm:ss or h:mm:ss.S; a date in US (10/17/2026), ISO, European or friendly form, with or without a 12- or 24-hour time, in a viewer-local or fixed zone (FIELD-001). The format applies wherever the value is shown: views, interfaces, forms, record pages, print layouts, emails (AUTO-USER-010) and CSV export. Stored values stay raw: REST and JSON export return the raw value, and REST returns the formatted text when asked for it (`cellFormat=string`).

**Acceptance.**
1. A formula builder journey authors one formula from each function family and checks the previewed results.
2. A broken formula shows its positioned error.
3. The evaluator passes CALC-005's reference fixture with every row equal.
4. A formula returning 1234.5 formatted as USD with 2 places shows `$1,234.50` in the grid, an interface and the CSV export, while REST returns `1234.5` and, with `cellFormat=string`, `$1,234.50`.
5. A percent result of 0.125 shows `12.5%`.
6. A date result formatted US with a 12-hour time shows `10/17/2026 3:05 PM` in the field's fixed Eastern zone.
7. Changing the format changes no stored value.

**Evidence.** `tests/records-manual-roundtrip.mjs`, `tests/helpers/records-calculation-journey.mjs`, `src/domains/records/formula-parser.ts`, `src/ui/records/schema/formula-editor.tsx`, `docs/contract/CALC-001/`
**Gap.** The owner authors a bounded Airtable-style subset with field/function suggestions, inferred result types, positioned errors and labeled before/after previews on current records. Arithmetic, comparison, logical, text and day-based date functions run through API/CSV/native JSON exits. Full Airtable function coverage/reference captures and result formatting remain absent. Creator additive schema authority is available under PERM-009; formula-specific creator acceptance remains unproven.

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

**Evidence.** `tests/helpers/records-lookups-journey.mjs`, `tests/helpers/records-collection-lookups.mjs`, `tests/helpers/records-collection-browser.mjs`, `src/domains/records/lookup-types.ts`, `docs/contract/CALC-002/`
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

Core · target · **partial**

**Requirement.** The coverage bar is every function in Airtable's formula field reference (support.airtable.com/docs/formula-field-reference), evaluated with Airtable's results, including its handling of blanks, errors, types and time zones. These are the functions:
- **Logical:** AND, BLANK, ERROR, FALSE, IF, ISERROR, NOT, OR, SWITCH, TRUE and XOR.
- **Text:** the `&` operator, CONCATENATE, ENCODE_URL_COMPONENT, FIND, LEFT, LEN, LOWER, MID, REGEX_EXTRACT, REGEX_MATCH, REGEX_REPLACE, REPLACE, REPT, RIGHT, SEARCH, SUBSTITUTE, T, TRIM and UPPER.
- **Numeric:** ABS, AVERAGE, CEILING, COUNT, COUNTA, COUNTALL, EVEN, EXP, FLOOR, INT, LOG, MAX, MIN, MOD, ODD, POWER, ROUND, ROUNDDOWN, ROUNDUP, SQRT, SUM and VALUE.
- **Date and time:** DATEADD, DATESTR, DATETIME_DIFF, DATETIME_FORMAT, DATETIME_PARSE, DAY, FROMNOW, HOUR, IS_AFTER, IS_BEFORE, IS_SAME, MINUTE, MONTH, NOW, SECOND, SET_LOCALE, SET_TIMEZONE, TIMESTR, TODAY, TONOW, WEEKDAY, WEEKNUM, WORKDAY, WORKDAY_DIFF and YEAR.
- **Array:** ARRAYCOMPACT, ARRAYFLATTEN, ARRAYJOIN, ARRAYSLICE and ARRAYUNIQUE.
- **Record:** CREATED_TIME, LAST_MODIFIED_TIME (with or without field arguments) and RECORD_ID.

There are no exceptions today. An exception can be added only by a contract change that names the function and the reason, and the move-in receipt then counts each formula that uses it. When Airtable adds a function to its reference, it joins this list in the next contract revision. The reference fixture (`tests/fixtures/formulas/airtable-reference.json`) holds at least one row per listed function, plus blank, error, time-zone and US-holiday edge rows. Each row records the formula text, its input field values and the expected value as captured from a real Airtable base, with the capture date. Smartsheet and Quickbase formulas get the same treatment under MIGRATE-002 and MIGRATE-003: every function in each incumbent's published formula reference is covered or named as an exception.

**Acceptance.**
1. The evaluator returns the expected value for every row of the reference fixture through the formula field, REST and CSV export.
2. A fixture-coverage check fails when any listed function has no row, and a translation check fails when any listed function is flagged as untranslatable on move-in.

**Evidence.** `src/domains/records/formulas.ts`
**Gap.** The bounded formula language supports arithmetic and comparison operators, CONCATENATE, COALESCE, IF, AND, OR, NOT, UPPER, LOWER, TRIM, LEN, TRUE, FALSE and BLANK, plus DATEADD and DATETIME_DIFF for days (`src/domains/records/formula-functions.ts`, `src/domains/records/formula-parser.ts`). Money arithmetic retains currency and scale. Formula and rollup authoring ship under CALC-001 and CALC-003; rollup aggregate support does not imply the same function is available in a formula. Full Airtable semantics, the remaining listed functions and the real-Airtable reference fixture remain unverified or absent. No exception to the required coverage is declared.

#### FILE-001 — Attachments with previews

Core · target · **partial**

**Requirement.** An attachment field holds files stored privately in the installation's R2. A browser upload takes files up to 100 MB each. A resumable multipart upload, through the API, the phone apps or the browser for a large file, takes files up to 5 GB each (site-visit video, for example). Both limits are declared in `seed.json → limits` and refused with the limit named. Images, PDFs, video, audio and Office documents show thumbnails and an in-app preview; downloads require current row and field authority and use short-lived links. Files can be added by upload, drag and drop, paste, phone camera (MOBILE-002), public form (FORM-001), API and automation.

**Acceptance.**
1. An upload, preview and download journey runs at 1440 and 390, and a revoked operator's old link is refused.
2. An API upload round trip passes, and so does a resumable multipart upload of a 1 GB fixture that is interrupted and resumed and then arrives equal by checksum.
3. A file over each declared limit is refused naming the limit.

**Evidence.** `src/domains/records/attachments.server.ts`, `src/domains/evidence/attachments.server.ts`
**Gap.** src/domains/records/attachments.server.ts:4 and src/domains/evidence/attachments.server.ts:1 hold attachment custody and record projection; manual bases can author attachment fields for FILE-002 references but cannot upload or preview files, and no preview journey exists

#### FILE-002 — Attachments from connected file stores

Core · target · **partial**

**Requirement.** An attachment can instead reference a file in Google Drive, Microsoft OneDrive/SharePoint, Dropbox, Box or [Chest](https://github.com/just-every/run-chest) through that store's picker, keeping the store's own sharing; Cradle shows name, type and thumbnail and never copies the file unless the owner asks.

**Acceptance.**
1. Picker journeys against each provider's sandbox or a fake at the network edge; the reference survives export.
2. Personal store connections (ct, 23 October) - Any operator who can write an attachment field may connect their own Google Drive, OneDrive/SharePoint, Dropbox or Box account with the same narrowest read scopes.
3. They can then list, search and attach through it. - Any operator who can read an attachment field may connect their own store, but only for previews. - A connection belongs to the person who made it.
4. Its credentials stay sealed in connection custody.
5. No one else can list, search, attach or preview through it, the installation owner included. - The installation owner can turn each provider on or off, narrow who may connect to "base owners and creators" or "installation owner only" (the default is "people who can write an attachment field"), and revoke any connection. - Deprovisioning a person revokes their connections.
6. Erasure keeps the existing rule.
7. Previews follow the store's own sharing (ct, 23 October) - Any reader with current row and field authority sees name, type, size and the store's link. - A thumbnail is fetched on demand, after a recheck of that authority, in this order:   1. through the viewer's own connection to the same provider and account, when the store lets that viewer read the item;   2. otherwise through the attacher's connection, but only if the attacher turned on "Share previews of files I attach with people who can read this field" for that connection.
8. That setting is off by default, offered at attach time, audited and revocable. It covers thumbnails only, never content or download. It ends when the attacher loses read authority on the field or the connection is revoked. 3. otherwise no thumbnail. The cell shows a "connect <store> to preview" state. - Thumbnails are never persisted, and they are served `no-store`.

**Evidence.** `tests/evidence-read-privacy.mjs` via `tests/helpers/file-stores-journey.mjs` and `tests/helpers/file-stores-personal.mjs`; `tests/rer-integrations-archive.mjs` via `tests/helpers/file-store-archive.mjs`; `tests/ui-base-import.mjs` via `tests/helpers/file-stores-browser.mjs` (1440/390)
**Gap.** Personal Google Drive, OneDrive, Dropbox and Box references retain their existing picker, custody, preview-sharing and current-policy guarantees. An explicit base-owner Keep a copy request reads through the attacher's current connection and atomically places verified bytes in ordinary attachment custody; replay does not fetch again, no unasked copy occurs, and store deletion/unsharing does not remove the copy. Downloads follow current row/field policy. Attacher erasure removes only their references and credentials while retaining the owner's copy. The real installation archive/import preserves references and exact copied/uploaded bytes, revokes connection custody and requires reconnect; owner reset erases both ordinary uploaded and copied bytes. FILE-004 keeps its independent return limits. Live store consent is NOT RUN. Gap: Chest has no third-party picker or token door; it remains link-only (FILE-002-CHEST default: no duty move).

#### FILE-003 — Attachments in exports, erasure and migration

Core · target · **partial**

**Requirement.** Base exports, whole-installation archives and Airtable move-in (MIGRATE-001) carry attachment bytes with checksums; erasing a record or person removes their files under `BASE-DATA-003`; the skipped-attachment list of RECORDS-005 becomes empty when every file arrived.

**Acceptance.**
1. Archive round trip with files equal by checksum; erasure test showing no remaining bytes; move-in receipt with zero skipped attachments.

**Evidence.** `tests/rer-data-roundtrip.mjs`, `tests/lifecycle-erasure.mjs`, `src/domains/records/base-transfer/attachment-manifest.ts`
**Gap.** tests/rer-data-roundtrip.mjs carries files in whole-installation archives; tests/lifecycle-erasure.mjs erases R2 files; base JSON export and import list attachments as skipped (src/domains/records/base-transfer/attachment-manifest.ts)

#### FILE-004 — Store references in exits and returns

Core · target · **partial**

**Requirement.** A connected-store reference (FILE-002) leaves every base exit (base JSON, CSV-set, workbook) as a portable reference and returns through every base return (RECORDS-005, the RECORDS-006 copy, INTEG-003 workbook import) without copying bytes, calling a store write, or using anyone's credentials but the returning person's own.

**Shape.** One object per reference, in the field's order, beside FILE-003's `kind:"file"` entries:
```json
{"kind":"store","schema":1,
 "provider":"google-drive|onedrive|dropbox|box|chest",
 "account":"<store's opaque drive/namespace id, or null>",
 "itemId":"<store's stable item id>",
 "name":"…","type":"<MIME>","size":<bytes|null>,"modified":"<ISO 8601 UTC|null>",
 "digest":{"algorithm":"sha256|sha1|md5|quickxor|dropbox-content-hash","value":"…"}|null,
 "link":"<store's own https link on the provider's host, or null>",
 "attachedBy":"<person reference as RECORDS-006 exports people values>",
 "attachedAt":"<ISO 8601 UTC>"}
```
- `digest` is the store's own content hash: Drive sha256, else sha1 or md5; OneDrive sha256, else quickXor; Dropbox content_hash; Box sha1. It is null only where the store gives none (native Google documents, Chest links).
- An export never carries the connection ID, a token or other credential, a thumbnail URL, a temporary or signed download URL, sharing settings, resolution state, or bytes.
- Base JSON holds the array natively. CSV-set and workbook cells hold the same array as canonical JSON text (sorted keys, no whitespace).
- The existing per-view CSV keeps its FILE-002 columns.
- Row and field policy, and RECORDS-006 fencing, apply as to any value. An erased attacher exports as their anonymous label.

**Return.**
- Preview makes no writes. It resolves each reference by a read-only connection-job metadata lookup, only through a connection already held by the returning person for the same provider and account, and it names counts for each outcome.
- Resolved means the item is found and the digest matches. A null digest also resolves, but is marked "unverified".
- Each other outcome lands as a visibly **unresolved** reference: no matching connection; not found or no access; digest changed. An unresolved reference shows its name, type, size, provider and link, with an "Unresolved" badge and no thumbnail. It is listed on the move-in receipt beside the skipped-attachment list.
- Import never prompts for consent mid-job, never binds a reference to another person's connection, and never guesses. A cell that is not a valid array is a row error naming the cell.
- Afterwards, a person with write authority on the field and a matching connection of their own can resolve references. A changed digest is accepted only by explicit per-reference or bulk confirmation, which is recorded and refreshes name, size, modified and digest from the store.
- The portable fields are canonical content, so re-exporting a base whose references are still unresolved reproduces identical objects. Resolution state and connection binding are installation-local, outside the capture envelope.

**Acceptance.**
1. In the emitted Worker, with stores faked only at the network edge: - A base with references from all four stores, a Chest link and a mixed field round-trips through base JSON, CSV-set and workbook.
2. Every export is scanned and holds no connection ID, sealed secret, edge token, thumbnail URL or temporary URL. - Return to a fresh installation with no connection lands every reference unresolved and visible at 1440 and 390. - Connecting the matching store and resolving binds each reference.
3. A digest changed at the edge stays unresolved until confirmed.
4. Another person's connection is never used. - Re-export before resolution gives byte-equal reference objects. - A restricted field is absent. - A malformed cell is refused naming the cell. - The provider sees no write or sharing call.

**Evidence.** `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”), `tests/evidence-read-privacy.mjs`, `tests/ui-base-import.mjs`, `docs/contract/FILE-004/`
**Gap.** Base JSON, CSV-set and workbook export portable store references without connection bindings, credentials, preview URLs or bytes; canonical unresolved returns and copies preserve those objects, show their metadata without thumbnails and list them on the move-in receipt. Own matching-account metadata checks resolve equal digests, mark null digests unverified, and require audited explicit confirmation for changed content; current row/field authority, anonymous attacher export and uploaded-byte refusal are proven. Evidence: `tests/records-base-exits.mjs` (existing launch roundtrip), `tests/evidence-read-privacy.mjs`, `tests/ui-base-import.mjs`, `tests/helpers/store-reference-exits.mjs`, `tests/helpers/store-reference-resolution.mjs`, `docs/contract/FILE-004/`. Gap: automatic import-preview lookup, null-account resolution (including current Dropbox, Box and Chest captures), bulk confirmation and cross-algorithm equality remain unbuilt or unproven. Older references without captured digest metadata or attachment instant require reattachment; uploaded bytes stay FILE-003. Full erasure and archive restoration remain FILE-002 gaps. No real provider call or consent; real consents NOT RUN.

### Views, editing and collaboration

#### VIEW-008 — Spreadsheet-grade grid editing

Core · target · **done**

**Requirement.** In a grid, an operator edits cells inline, moves with the keyboard, selects ranges, copies and pastes ranges to and from Excel and Google Sheets, fills down, expands a row into its record, resizes, freezes, hides and reorders columns, and adds a record from the last row. A paste that breaks validation shows each failing cell and commits nothing until fixed. Undo and redo are VIEW-015. Find in the current view is VIEW-016.

**Acceptance.**
1. Grid browser journey with keyboard-only editing, a pasted 50×5 range from clipboard text and a refused invalid paste.

**Evidence.** `tests/records-grid-range.mjs`, `src/ui/records/record-grid.tsx`, `src/ui/records/grid-interaction.tsx`, `docs/contract/VIEW-008/`
**Gap.** None.

#### VIEW-009 — Kanban

Core · target · **done**

**Requirement.** A kanban view stacks records by any single select, user or single linked-record field, shows chosen fields and an attachment cover on each card, and lets an operator drag a card between stacks (an ordinary update under policy) and reorder within a stack.

**Acceptance.**
1. Board journey drags a card and the record's field changes; a read-only operator cannot drag.
2. With an attachment field chosen as the cover, each card shows its record's first image, fitted or cropped as the view sets, and a card with no attachment shows no cover.
3. For a reader who cannot read that attachment field, no card shows a cover.

**Evidence.** `tests/helpers/records-extended-boards.mjs`, `tests/helpers/records-board-journey.mjs`, `src/ui/records/record-board.tsx`, `docs/contract/VIEW-009/`
**Gap.** Personal card order is retained in the operator’s browser tab; stack moves are ordinary audited record writes.

#### VIEW-010 — Calendar

Core · target · **done**

**Requirement.** A calendar view places records by a date or start/end date range in month, week and day layouts in the workspace time zone; dragging moves the dates; the view can be subscribed to as a private iCal feed URL (revocable) from Google Calendar or Outlook.

**Acceptance.**
1. Calendar journey creates, drags and opens records; the iCal feed returns the view's records and stops after revocation.

**Evidence.** `tests/ui-records-calendar.mjs`, `tests/helpers/records-calendar-feed.mjs`, `src/ui/records/record-calendar.tsx`, `src/domains/records/calendar-feed.server.ts`
**Gap.** None.

#### VIEW-011 — Gallery

Core · target · **done**

**Requirement.** A gallery view shows records as cards led by an attachment cover image, with chosen fields and the same filter, sort and group as other views.

**Acceptance.**
1. Gallery journey at 1440 and 390 with image covers.

**Evidence.** `tests/helpers/records-gallery-journey.mjs`, `tests/ui-records-calendar.mjs`, `src/ui/records/record-gallery.tsx`, `src/ui/records/gallery-cover.tsx`
**Gap.** None.

#### VIEW-012 — Timeline and Gantt

Core · target · **done**

**Requirement.** A timeline view lays records on a time axis by date or range, grouped by any field, with day, week, month, quarter and year zoom. A Gantt layout draws dependencies from a linked-record field, flags a record that starts before its predecessor ends, highlights the critical path, and lets an operator drag bars; moving one record never silently moves another. Baselines snapshot planned dates for comparison.

**Acceptance.**
1. A timeline journey groups records, shows the dependency conflict marker and drags a bar, and a baseline is compared after the move.
2. A Gantt fixture of eight tasks, whose single longest dependency chain is known, highlights exactly those tasks as the critical path.
3. After a task's duration changes so that a different chain becomes longest, the highlighted set becomes exactly that chain.
4. Dragging one bar changes no other record's dates.

**Evidence.** `tests/helpers/records-timeline-journey.mjs`, `tests/records-base-json-metadata-native.mjs`, `src/ui/records/record-timeline.tsx`, `src/domains/records/timeline-baseline.server.ts`, `docs/contract/VIEW-012/`
**Gap.** Date/range axes, arbitrary field groups, five zooms, linked dependencies/conflicts, exact recomputed critical paths, isolated audited moves, undo/redo, policy-projected persisted baselines and portable identity remapping; 1440/390 journeys. Explicit record/axis bounds and unavailable-graph messages.

#### VIEW-013 — Personal, locked and formatted views

Core · target · **done**

**Requirement.** Views are collaborative, personal or locked (only creators may change a locked view). Grouped views show per-group counts and a summary bar with sum, average, min, max, count, empty and percent-filled per column. Conditional formatting colors rows or cells by rules on field values.

**Acceptance.**
1. View journey: personal view hidden from others, locked view refuses edits, summary values checked against the records, color rule applied.

**Evidence.** `tests/helpers/records-view-settings-journey.mjs`, `tests/ui-records-calendar.mjs`, `src/domains/records/view-access.server.ts`, `src/ui/records/view-summary-query.ts`, `docs/contract/VIEW-013/`
**Gap.** None.

#### VIEW-014 — Live multi-user editing

Core · target · **done**

**Requirement.** Two operators in the same view see each other's committed changes and new records within 2 seconds without reloading, see who else is viewing, and a write based on a stale version of a record is refused naming the current value rather than overwriting it.

**Acceptance.**
1. Two-browser journey: an edit in one appears in the other within 2 seconds; a stale concurrent edit shows the conflict.

**Evidence.** `tests/helpers/records-live-journey.mjs`, `tests/helpers/records-presence-journey.mjs`, `tests/records-grid-range.mjs`, `src/ui/records/live-records.tsx`, `src/domains/records/presence.server.ts`, `src/domains/records/conflict.server.ts`, `docs/contract/VIEW-014/`
**Gap.** None.

#### VIEW-015 — Undo and redo

Core · target · **partial**

**Requirement.** In any view, an operator can undo and redo their own recent record changes in that table with Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z or with toolbar buttons. That covers a cell edit, a range paste, a fill, a bulk edit, a drag on a board, calendar or timeline, a record creation and a record deletion. At least the last 50 actions of the session are kept. Each undo or redo is an ordinary audited write under the operator's current policy, and it fires automations as any edit would. Each multi-cell action undoes as one step. An undo whose target cells another person or an automation has changed since is not applied over them. VIEW-014's stale-version rule names each conflicting cell and its current value, applies nothing, and leaves the operator to choose. Record history (COLLAB-002) restores older values beyond the undo stack.

**Acceptance.**
1. A grid journey pastes a 50×5 range, undoes it so every cell has its prior value, then redoes it so every cell has the pasted value.
2. A fill-down, a bulk edit and a deletion are each undone and restored.
3. After a second browser changes one pasted cell, undo reports that cell's conflict and applies nothing.
4. A demoted operator's undo is refused.

**Evidence.** `tests/records-grid-range.mjs`, `tests/helpers/records-history-journey.mjs`, `tests/helpers/records-board-journey.mjs`, `tests/ui-records-calendar.mjs`, `src/ui/records/grid-history.tsx`, `src/domains/records/history-conflicts.server.ts`
**Gap.** Creation/deletion remain outside the stack; deletion is refused pending evidence erasure/recovery support. Undo requires readable prior cells and browser session storage.

#### VIEW-016 — Find in view

Core · target · **done**

**Requirement.** Cmd/Ctrl+F in a grid, board, gallery, calendar or timeline searches the current view's visible fields and records, under the reader's policy. It highlights each match, shows the match count and steps through the matches with Enter and Shift+Enter, scrolling to each one. Global search across bases is VIEW-005.

**Acceptance.**
1. A grid journey on a 5,000-record fixture finds a term and checks the reported count.
2. Stepping through the matches reaches each matching cell.
3. A hidden field's value is never matched.

**Evidence.** `tests/helpers/records-find-journey.mjs`, `tests/helpers/records-browser-summary-find.mjs`, `tests/ui-records-builder.mjs`, `src/ui/records/view-match.tsx`, `docs/contract/VIEW-016/`
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

Core · target · **done**

**Requirement.** Each record shows who changed which field from what to what and when, including changes by automations, imports, API keys and agents, reprojected under the reader's current row and field policy; an authorized operator can restore a prior field value from history as an ordinary audited write.

**Acceptance.**
1. History reads hide fields the reader cannot see; restore-from-history journey.

**Evidence.** `tests/evidence-read-privacy.mjs`, `docs/contract/COLLAB-002/`
**Gap.** None.

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

Core · target · **partial**

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

**Evidence.** `tests/helpers/records-forms-journey.mjs`, `tests/ui-records-builder.mjs`, `src/domains/records/form-actions.server.ts`
**Gap.** None.

#### FORM-003 — Embedded forms and views

Core · target · **missing**

**Requirement.** A form or a read-only view can be embedded in another site (for example a [Pane](https://github.com/just-every/run-pane) site) by iframe or script snippet, restricted to owner-listed origins, showing only the fields and records the share allows.

**Acceptance.**
1. Embed test on an allowed and a refused origin.

**Evidence.** None.
**Gap.** seed.json nonGoals still list public or embeddable views for the current release

#### IFACE-001 — Interface designer

Core · target · **partial**

**Requirement.** An owner or creator builds interface pages from components bound to tables, arranged on a responsive layout of sections and tabs. The components are grid, list, record detail, record picker, kanban, calendar, timeline, gallery, form, chart, number, text, divider, filter controls and buttons. Each page is published to chosen roles or people, and its components only ever show what the viewer's own policy allows. What each component lets a viewer do, and which records a page shows the viewer, are IFACE-007. Every publish creates a numbered version with its author and time. An owner or creator can open any earlier version read-only and restore it, which publishes it as a new version. An interface is previewed as a chosen user (PERM-004) before publishing and is included in exports (RECORDS-006).

**Acceptance.**
1. A designer journey builds and publishes a three-page interface with a section, two tabs and a record picker; a member sees it and a non-member does not.
2. The designer publishes v2, opens v1 read-only showing v1's layout, and restores v1, which becomes v3 with v1's layout and members see it on their next load.
3. Export and restore preserve every version.
4. Moved verbatim from SNAP-002 (ct, 22 October): interfaces stay in a trash for 30 days, restorable by people with the right to delete them, with links and history intact; erasure under `BASE-DATA-003` bypasses the trash.
5. Moved verbatim from FIELD-002 (ct, 23 October): The impact preview lists every value that converts, every value that would be lost with examples, and every formula, view, form, interface, automation and API key that depends on it; adoption keeps a recovery export and a deleted table or field stays restorable for 30 days (SNAP-002).
6. This carried acceptance point applies to interface dependents; the other categories remain FIELD-002.

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
**Gap.** registered record/form actions share command services (src/domains/records/form-actions.server.ts:15); user-configurable buttons absent

#### IFACE-005 — External portals

Core · target · **missing**

**Requirement.** An interface can be shared with external people (clients, vendors, contractors) who sign in by magic link to a portal that shows only the records a rule ties to them (for example, where Vendor email equals the signed-in email), lets them submit and update allowed fields, and never shows the workspace, other bases or other external users. The portal's pages use IFACE-007's controls, so a portal grants an external user only the fields and actions its components make editable, within their policy.

**Acceptance.**
1. Two external users each see only their own rows through the portal and REST; an attempt at another's record is refused.

**Evidence.** None.
**Gap.** no code

#### IFACE-006 — Templates and starting apps

Core · target · **done**

**Requirement.** New bases start from editable templates through the same preview and adoption: Customer relationships, Project tracker and Launch readiness today, plus US SMB operations templates for inventory and orders, vendor and contract register, asset and equipment register, event planning, field operations tracker and content production. A whole base can be duplicated with or without records.

**Acceptance.**
1. Template adoption journey for each template; duplicate-base copy with an identity map.

**Evidence.** `src/ui/records/schema/templates.ts`, `src/domains/records/base-transfer/schema-only.ts`, `tests/helpers/records-operations-templates.mjs`, `tests/helpers/records-browser-templates.mjs`, `docs/contract/IFACE-006/`
**Gap.** None.

#### IFACE-007 — Per-component permissions and viewer filters

Core · target · **missing**

**Requirement.** Each interface component that shows records has user-action settings:
- inline editing on or off;
- adding records on or off;
- deleting records on or off;
- for each field shown in the component and its record details, view-only or editable;
- which buttons and comments are available.

These settings can only narrow what the viewer's base role and row and field rules allow, never widen it. A field marked editable that the viewer's policy makes read-only stays read-only. The server enforces every write made through an interface against both the viewer's policy and the component's settings: the interface's own API calls carry the component's identity, and a write to a field the component marks view-only is refused even when the viewer's role could make it in the grid. Each page, and each component on it, has a record filter: all records, specific conditions, or "Viewer's records", meaning records where the current viewer is in a chosen user field or their email matches a chosen email field. Conditions can also compare a field with the current viewer ("Approver is me", "Region is my region" through a linked person record). The filter applies on the server, so a viewer cannot read a record outside it through the interface, its exports or its API calls.

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

Core · target · **partial**

**Requirement.** Each base has owners, creators, editors, commenters and read-only members, plus custom roles built from actions; operators are added per base or per interface. Base owners and creators adopt schema changes under PERM-009 and author interfaces and automations (AUTO-USER-009). Editors create and change collaborative views without schema adoption (PERM-009). A role change takes effect on the next request everywhere.

**Acceptance.**
1. Role matrix test through REST and UI for each role; demotion fences an open session's next write.
2. A custom role "Purchasing clerk" built from actions (read every table, create and update Orders, comment, no delete, no export) lets its holder do exactly those actions through REST and the UI and refuses delete and export.
3. Removing update from the role refuses that holder's next update.

**Evidence.** `src/domains/authority/member-management.server.ts`, `src/domains/authority/policy.server.ts`, `tests/user-api-keys.mjs`, `tests/evidence-read-privacy.mjs`
**Gap.** explicit memberships and policy-scoped operations (src/domains/authority/member-management.server.ts; src/domains/authority/policy.server.ts; tests/user-api-keys.mjs; tests/evidence-read-privacy.mjs); named base role presets now ship under PERM-009; custom-role authoring and interface membership are absent

#### PERM-002 — Row and field rules

Core · target · **done**

**Requirement.** Rules restrict which records (by condition, including "assigned to me") and which fields each role can read and write; restricted cells are absent from reads, search, history, exports, lookups, formulas shown to that reader and API answers, and cannot be inferred from errors.

**Acceptance.**
1. Policy tests hide rows and fields across reads, history and search.

**Evidence.** `src/domains/authority/policy.server.ts`, `tests/evidence-read-privacy.mjs`, `tests/records-manual-release.mjs` (including “RECORDS-001 RECORDS-002 schema preview permission refusal table preserves restricted rows, fields and shared memberships”), `tests/launch-search-authority.mjs`
**Gap.** None.

#### PERM-003 — Action and schema authority

Core · target · **done**

**Requirement.** Create, update, delete, bulk edit, export, comment, run-button and schema-change rights are separate grants. Schema changes always go through impact-previewed adoption (RECORDS-002) by a role PERM-009 allows to adopt that change.

**Acceptance.**
1. A forbidden action is refused through native and legacy HTTP, and adoption by a person PERM-009 does not allow is refused.

**Evidence.** `src/domains/records/actions.server.ts`, `tests/launch-write-authority.mjs`, `tests/records-manual-release.mjs` (including “RECORDS-001 RECORDS-002 stale data, schema, policy and session preview refusal table is atomic”; “RECORDS-001 RECORDS-002 schema preview permission refusal table preserves restricted rows, fields and shared memberships”), `tests/user-api-keys.mjs`
**Gap.** None.

#### PERM-004 — Preview access as a user

Core · target · **partial**

**Requirement.** An owner can view any base, view or interface as a chosen person or role before saving a rule change, and the preview shows which records and fields that person would gain or lose.

**Acceptance.**
1. Preview journey shows the exact row/field diff a rule change causes for a chosen member.

**Evidence.** `src/domains/authority/policies.server.ts`
**Gap.** policy impact preview (src/domains/authority/policies.server.ts:14); no view-as-user surface

#### PERM-005 — Guests

Core · target · **partial**

**Requirement.** *Tier:* Core · *Cites:* BASE-ACCESS-001, BASE-ACCESS-002, BASE-ACCESS-004, BASE-DATA-003

**Requirement.** An owner can invite a guest by email to one base or interface; guests see nothing else in the installation, cannot invite others and count against no license.

**Acceptance.**
1. Guest journey: one base visible, workspace navigation and search show nothing else.

**Evidence.** `tests/launch-authority-browser.mjs` (emailed guests see one base, isolated navigation and search, cannot invite and use no licenses); `tests/helpers/guest-access-journey.mjs` (guestAccessJourney: native emailed invitation, single-base reads and search, invitation and write refusals, unchanged operator usage and zero guest licenses; finishGuestAccess: removal, erasure and captured-token replay refusal); `tests/helpers/guest-access-browser.mjs` (guestAccessBrowser: Settings invitation, navigation, base picker and positive and negative search at 1440 and 390); `tests/lifecycle-identity-security.mjs` (member erasure retires attributed OIDC custody, retains used grants and preserves accountant mappings)
**Gap.** Product acceptance is asserted through the base alternative. DONE rider 6 remains blocked on Base contract-document tooling adoption: this held pin has no contract-docs generator or declared Lander-Regenerate command, so generated document synchronization cannot be checked.

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

Core · target · **done**

**Requirement.** Operators can sign in through the company's identity provider by OIDC or SAML ([Auth](https://github.com/just-every/run-auth), Okta, Microsoft Entra ID, Google Workspace) and be provisioned and deprovisioned by SCIM 2.0; deprovisioning ends sessions within 1 minute and keeps their records' attribution (OPS-004).

**Acceptance.**
1. OIDC exchange test; SAML and SCIM tests against a local provider at the network edge.

**Evidence.** `tests/auth-oidc.mjs`, `tests/launch-operator-doors.mjs`, `tests/rer-data-roundtrip.mjs`, `tests/ui-base-import.mjs`, `docs/contract/PERM-007/`
**Gap.** —

#### PERM-008 — Admin audit log

Core · target · **partial**

**Requirement.** Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`).

**Acceptance.**
1. Audit export after a scripted sequence of admin actions lists each one once.

**Evidence.** `tests/user-api-keys.mjs`, `tests/helpers/admin-audit-journey.mjs`, `tests/ui-user-automations.mjs`, `tests/helpers/admin-audit-browser.mjs`
**Gap.** split (ct, 24 October 2026) into PERM-010 to PERM-013; share-link issuance stays carried verbatim by PERM-006's Gap (ct, 23 October). PERM-008 is not an sd target on its own. Owners can read recorded command and identity metadata in Settings, filter by person/base/time and export CSV or JSON. Key issue/replay/revoke appears once, schema adoption is present, non-owner human and bearer access is refused, and retained command events anonymize erased actors. Evidence: `tests/user-api-keys.mjs`, `tests/helpers/admin-audit-journey.mjs`, `tests/ui-user-automations.mjs`, `tests/helpers/admin-audit-browser.mjs` (1440/390). Gap: ordinary sign-ins and native invitation/role changes lack durable audit rows; some export and erasure doors are not fully audited; company identity audit rows are deleted during erasure; the complete category-by-category scripted sequence remains unproven. Share-link issuance is inherited from PERM-006, whose current release is a non-goal. Exports over 10,000 matching rows refuse and require a narrower time range.

#### PERM-009 — Who changes schema and views within a base

Core · target · **partial**

**Requirement.** Within a base, adoption works by role:
- **Base owner.** Adopts any schema change through RECORDS-002, without the installation owner.
- **Creator.** Adopts additive changes in a base where they are a creator, on their own and without another person: a new field, table, link, lookup, rollup or formula field, a new select option, a renamed field or table, and help text. The impact preview is still shown, and they still submit `release.adopt`.
- **Destructive changes** go to a base owner's review: deleting a field or table, converting a type with any lossy value (FIELD-002), removing a select option that is in use, and narrowing a validation rule that existing records break. The base owner can allow named creators to adopt destructive changes themselves, and the preview and recovery export still apply.
- **Editors** never change schema; their attempts are refused naming the role that can. They can create, rename, reorder, filter, sort, group, hide fields in, color and delete collaborative views without schema adoption, unless the view is locked (VIEW-013).
- **Commenters and read-only members** create personal views only.

Forms and interfaces are authored by creators and base owners and published without schema adoption. A change to them that alters which fields a form writes is checked against FIELD-003. Every schema adoption and every view change is audited (PERM-008), and a view change is recorded in the view's history.

**Acceptance.**
1. In a role journey, a base creator who is not the installation owner adds a "PO number" field and adopts it alone; the field appears to editors on their next read.
2. The same creator's field deletion waits for the base owner's review, and the base owner adopts it.
3. An editor creates and saves a collaborative view with a filter and grouping, and other members see it with no adoption step.
4. An editor's attempt to add a field is refused through the UI and through the RECORDS-007 or REST schema door.
5. A read-only member can save only a personal view.

**Evidence.** `tests/helpers/records-base-roles-journey.mjs`, `tests/records-manual-release.mjs`, `src/domains/records/manual/base-collaborators.server.ts`, `src/domains/records/manual/service.server.ts`, `docs/contract/PERM-009/`
**Gap.** Explicit base owner, creator, editor, commenter and read-only roles use current policy and version fences. Creators adopt supported additive schemas; field deletion is retained for base-owner review unless the creator has named destructive authority. Adoption preserves base ownership, extends full-base member policies and keeps restricted fields restricted. Editors save collaborative views; commenters and read-only members save personal views only. View saves/deletes/restores are audited with current-policy history. Proven at 1440/390 through native sessions, REST refusal, recovery export and demotion. Remaining: additive select-option changes and help text, persisted view ordering, violating-rule adoption and IFACE-001 interface authoring; creator form/lock and delegated-destructive journeys remain unproven.

#### PERM-010 — Admin audit: keys, schema adoptions and automation changes

Core · target · **done**

**Requirement.** API, proposing, SCIM, webhook and change-subscription keys; manual and proposed schema adoptions; automation create, edit, enable, renew, disable and destination changes. Each row names the acting person, key or feature (`BASE-OPS-005`).
Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`).
Carried (PERM-008, verbatim):

**Acceptance.**
1. Audit export after a scripted sequence of admin actions lists each one once.
2. Audit export after a scripted sequence of admin actions lists each one once.
3. Restricted to the categories above, through every door present in the run.

**Evidence.** `tests/user-api-keys.mjs` via `tests/helpers/admin-audit-actions.mjs` and `tests/helpers/admin-audit-journey.mjs`; `tests/user-webhooks.mjs` via `tests/helpers/change-subscriptions-journey.mjs`; `tests/ui-user-automations.mjs` via `tests/helpers/user-key-browser.mjs` and `tests/helpers/admin-audit-browser.mjs` (1440/390); `tests/helpers/signing-key-rotation.mjs` (prepared deliveries) and `tests/helpers/admin-audit-actions.mjs` (all rotation exports), push automations-native
**Gap.** Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`). Carried (PERM-008, verbatim): *Acceptance:* Audit export after a scripted sequence of admin actions lists each one once. Scope: API, proposing, SCIM, webhook and change-subscription keys; manual and proposed schema adoptions; automation create, edit, enable, renew, disable and destination changes. Each row names the acting person, key or feature (`BASE-OPS-005`). API, proposing, webhook and subscription keys have distinct atomic Rotate commands and text-labelled controls. Replacement secrets appear once; replay cannot recover them. Old API/proposing credentials and old delivery signatures are refused, API rotation carries subscription authority, and signing-key rotation preserves delivery positions. A delivery prepared before rotation may finish with its prior key; later preparations use the current key. SCIM retains its rotation command. Each rotation appears once with actor and both key IDs, without secrets, in the log and filtered CSV/JSON. Schema and automation administration evidence is retained. Prepared webhook and change-subscription deliveries cross rotation with prior-key signatures at the real HTTP receiver; later preparations use current keys. Time-filtered CSV and JSON each contain all five rotation categories exactly once, bind each row to its actor ID/name and complete ordered old/new key-ID pair, and exclude all five replacement secrets. The adminAuditActions assertion “complete ordered old/new key-ID pair” discriminates permuted IDs between rotation rows. Evidence: `tests/user-api-keys.mjs` via `tests/helpers/admin-audit-actions.mjs`; `tests/user-webhooks.mjs` via `tests/helpers/signing-key-rotation.mjs` and `tests/helpers/change-subscriptions-journey.mjs` (push automations-native).

#### PERM-011 — Admin audit survives subject erasure

Core · target · **done**

**Requirement.** Every audit store keeps each row anonymized after subject erasure. Names, emails and IdP-shared identifiers leave rows and exports; each action is listed once.
Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`).
Carried (PERM-008, verbatim):

**Acceptance.**
1. Audit export after a scripted sequence of admin actions lists each one once.
2. Audit export after a scripted sequence of admin actions lists each one once.
3. Restricted to the categories above, through every door present in the run.

**Evidence.** `tests/lifecycle-identity-security.mjs` [BASE-DATA-003 BASE-ACCESS-002] (all stores and shared identifiers); `tests/user-api-keys.mjs` via `tests/helpers/admin-audit-journey.mjs` (anonymous CSV/JSON once); `tests/ui-user-automations.mjs` via `tests/helpers/admin-audit-browser.mjs` (1440/390)
**Gap.** Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`). Carried (PERM-008, verbatim): *Acceptance:* Audit export after a scripted sequence of admin actions lists each one once. Scope: Every audit store keeps each row anonymized after subject erasure. Names, emails and IdP-shared identifiers leave rows and exports; each action is listed once. Proven slice: Member erasure retains command custody and every audit store: admission_audit, oa_auth_audit, company_identity_audit (including SCIM) and operation_audit. Names, emails and attributable OIDC/SCIM shared identifiers leave retained rows and owner CSV/JSON exports; actions remain once and unrelated actors sharing an opaque subject remain unchanged. The log renders the erased actor anonymously at 1440/390.

#### PERM-012 — Admin audit: sign-ins, membership and role changes

Core · target · **partial**

**Requirement.** Email-link, owner-link, OIDC and SAML sign-ins; invitations under every base granted, removals, ownership, roles, policies and grants through Base native doors and SCIM.
Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`).
Carried (PERM-008, verbatim):

**Acceptance.**
1. Audit export after a scripted sequence of admin actions lists each one once.
2. Audit export after a scripted sequence of admin actions lists each one once.
3. Restricted to the categories above, through every door present in the run.

**Evidence.** `tests/auth-oidc.mjs` and `tests/helpers/company-identity-journey.mjs` (email/OIDC/SAML and SCIM); `tests/auth-base-only-runtime.mjs` (owner-link); `tests/lifecycle-identity-security.mjs` (multi-base invitations)
**Gap.** Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`). Carried (PERM-008, verbatim): *Acceptance:* Audit export after a scripted sequence of admin actions lists each one once. Scope: Email-link, owner-link, OIDC and SAML sign-ins; invitations under every base granted, removals, ownership, roles, policies and grants through Base native doors and SCIM. Proven slice: Email and OIDC confirmations use Base afterConfirm; SAML sign-ins are in company identity audit and owner-link consumption retains its existing one-use audit. Multi-base invitations appear once under each granted base, including replay and filtered CSV/JSON. Gap: Base native invitation/cancellation/status/role/domain-rule administration lacks a transaction-composed seed audit hook; the complete ownership/policy/grant door matrix remains unproved.

#### PERM-013 — Admin audit: exports and erasures

Core · target · **partial**

**Requirement.** Every export door, including the audit log's own export; every erasure and purge door, with a scheduled purge naming the feature.
Carried (PERM-008, verbatim): Owners see and export (CSV, JSON) an audit log of sign-ins, membership and role changes, schema adoptions, share-link and key issuance, exports, erasures and automation changes, filterable by person, base and time; the log survives subject erasure in anonymized form (`BASE-OPS-005`).
Carried (PERM-008, verbatim):

**Acceptance.**
1. Audit export after a scripted sequence of admin actions lists each one once.
2. Audit export after a scripted sequence of admin actions lists each one once.
3. Restricted to the categories above, through every door present in the run.

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
**Gap.** update, notify, email, webhook, Slack incoming-webhook, Slack app approval and Twilio SMS actions (`src/domains/automations/effects.server.ts`; `tests/user-automations.mjs` via `tests/helpers/sms-journey.mjs`; `tests/user-webhooks.mjs` via `tests/helpers/slack-app-journey.mjs`); the email action reaches one operator only (AUTO-USER-010); create-record and the remaining actions are absent

#### AUTO-USER-004 — Conditions, branches and repeats

Core · target · **partial**

**Requirement.** A step can run only when conditions hold, an automation can branch into up to 10 paths, and a repeat step runs its actions once for each record found or each item in a list (up to 1,000 per run), with one run record and per-item results.

**Acceptance.**
1. Branching and repeat test where each path's effect is checked and the per-item log names every item.

**Evidence.** `tests/user-automations.mjs` [AUTO-USER-004] via `tests/helpers/automation-control-journey.mjs` (conditions, first-match/otherwise paths, ten/eleven paths, per-item outcomes, continuation, Unknown stopping, current authority, mid-run restart, 1,000 accepted/1,001 refused before effects); `tests/ui-user-automations.mjs` [AUTOMATIONS-USER-UI-001] via `tests/helpers/automation-control-browser.mjs` (item results and saved summary at 1440/390); `docs/contract/AUTO-USER-004/`
**Gap.** Builder UI for conditions, branches and repeats, including builder tests; list-value and nested repeats; saved-view finds; full filter/operator and concurrent-crash matrix; 1,000-write throughput and hosted limits; full control-history export/restore/erasure and individual repeat-item retries. Defaults ADOPTED: owner authoring, found IDs snapshotted before effects, ordinary item failure continues to Partial, Unknown stops without resend.

#### AUTO-USER-005 — Test runs

Core · target · **partial**

**Requirement.** Before enabling, the builder tests the trigger against a chosen real record and each action in turn; external effects in a test run go only to the builder (their own email, a test channel) unless they confirm a live test, so an operator-addressed email reaches the builder instead, showing the recipients it would have used (an AUTO-USER-010 email addressed to a customer or vendor: AUTO-USER-010), and the test result shows each step's input and output.

**Acceptance.**
1. Builder journey tests every step; an external send in test mode reaches only the builder's destination.

**Evidence.** `tests/user-automations.mjs`, `tests/helpers/automation-test-journey.mjs`, `tests/ui-user-automations.mjs`, `tests/helpers/automation-test-browser.mjs`, `docs/contract/AUTO-USER-005/`
**Gap.** Dry updates/notifications, held signed webhook payload, builder-only operator email, trigger mismatch, non-author refusal, replay without resend, unknown outcomes, labelled history, unchanged success rates and confirmed live operator send. Gap: the customer/vendor redirect was moved verbatim into AUTO-USER-010 as an acceptance point (ct, 22 October); other base-owner and creator authorship (AUTO-USER-009), Slack transport and full history custody proof; chooser bounded to 100.

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

Core · target · **partial**

**Requirement.** Who authors and how long an automation runs:
- **Authors.** Base owners and creators create, edit, test, enable, disable, duplicate and delete automations in their bases, with no installation-owner step. Each automation records its author. Editors and below can see run history only when the base owner allows it, and cannot change automations.
- **Lifetime.** An enabled automation runs until someone disables it, with no expiry by default. Each run acts under its author's current authority (base role, row and field rules, connected accounts). When the author is removed from the base, demoted below creator, deprovisioned (PERM-007) or erased, their automations stop producing new effects on the next run. Queued work is fenced, as AUTO-USER-001 states. The base owners are notified in-app and by email, once per author change, with the list of paused automations. A base owner or creator can reassign each one, with one step per automation, to themselves or another creator, and it resumes under the new author's authority from that moment.
- **Expiry policy.** The installation owner can set a maximum lifetime for automations (30, 90, 180 or 365 days, or none, the default), per installation or per base. An automation under such a policy warns its author and the base owners in-app and by email 7 days and 1 day before it expires. Expiry pauses it, records the expiry in run history and never deletes it. Renewing takes one step by an author and restarts the lifetime.
- **Run accounting.** Automation run counts per month are shown against the installation's limits (AUTO-USER-006).

**Acceptance.**
1. An emitted-worker test at a fixed clock covers authorship, lifetime and policy: - A base creator who is not the installation owner authors "New order → notify warehouse" and enables it. - At day 31 and at day 91, a new order still fires it once, and the effect is recorded. - When the creator is demoted to editor, the next new order produces no effect.
2. The base owner is notified once, listing the automation. - The base owner reassigns the automation to themselves, and the next order fires it again. - Under an owner-set 90-day policy, warnings arrive on days 83 and 89, the automation pauses on day 90, and one renewal restores it. - An editor's attempt to create or edit an automation is refused.

**Evidence.** `tests/user-automations.mjs`, `src/domains/automations/configuration.server.ts`, `src/domains/authority/user-delegation.server.ts`
**Gap.** automations fence lost authority and stop new effects (tests/user-automations.mjs; src/domains/automations/configuration.server.ts). Authoring is installation-owner only, with every approval capped at 30 days (src/domains/authority/user-delegation.server.ts:48). Creator authoring, the non-expiring default, the owner-set policy with warnings, and reassignment are absent

#### AUTO-USER-010 — Email to anyone from the installation sender

Core · target · **partial**

**Requirement.** The email action sends from the installation's own sender with no connected mailbox, to customers, vendors, requesters and anyone else, whether or not they are operators:
- **Sender.** Mail leaves from the installation's configured sender address (Base mail, on a domain the owner verified with SPF, DKIM and DMARC at the mail provider), so automations do not depend on anyone's personal mailbox. The author sets a From display name (default: the base name) and an optional Reply-to, which is a static address or a value from the trigger record or an earlier step (for example the record's Owner email).
- **Recipients.** To, CC and BCC each take a list that mixes static addresses the author types in with dynamic values from the trigger record, from records found or created by earlier steps and from repeat items (AUTO-USER-004): email fields, lookups of email fields, user fields (each operator's current email) and text fields holding addresses, including comma-separated lists. A recipient needs no Cradle access. Duplicate addresses are sent once, in the most visible list. Recipients see To and CC, never BCC.
- **Content.** A subject (plain text, up to 200 characters after insertion) and a body written in Markdown, sent as HTML with a plain-text alternative. Both take inserted values from the trigger record and earlier steps, shown as the field displays them (currency, dates in the field's zone, select labels, linked-record names). A record link can be inserted; it opens under the reader's current policy, so a recipient without access reaches sign-in and sees nothing. Inserted values come under the author's current field policy (AUTO-USER-009): a field the author can no longer read fails the run naming the field instead of sending it.
- **Attachments.** The action can attach files from the trigger record's attachment fields (all, or a named field), files from earlier steps, and a REPORT-002 page layout rendered as a PDF for the record (a quote, a packing slip, a work order). Attachments up to 25 MB per message in total (*Policy* default, never above the provider's limit) are attached; larger files are sent as expiring links (7 days by default, revocable), and the run records which.
- **Bounds.** One action run sends one message to at most 50 recipients across To, CC and BCC (*Policy* default; the owner may set 1 to 500, within the provider's per-message limit). A repeat step sends one message per item within AUTO-USER-004's 1,000. Every resolved address is checked before anything is sent: a single address of valid syntax with no header control characters. A blank or malformed value fails the run before sending and names the list, the input and the record, and nothing is sent. An input the author marks "skip when blank" is skipped instead, and the run lists it as skipped.
- **Recipient domains (*Policy*).** By default any domain may receive. The installation owner may set, per installation or per base, an allowlist of recipient domains and a blocklist. A resolved recipient outside them fails the run naming the address, and nothing is sent. The same policy governs INTEG-002 mailbox sends.
- **Suppression and US mail norms.** A hard bounce or spam complaint reported by the provider puts the address on the installation's suppression list. Later sends skip it and the run records the skip; the owner can see and clear the list. An action the author marks as promotional carries an unsubscribe link and the installation's postal address, as CAN-SPAM requires; an unsubscribed address receives no further promotional sends from that base.
- **Authority and history.** Each run acts under its author's current authority (AUTO-USER-009). Removing or demoting an operator stops only the sends addressed to that operator; static and field-resolved addresses keep receiving. Run history records each message's resolved To, CC and BCC, subject, attachment names and sizes, provider message ID and idempotency key. An uncertain provider answer is shown and never resent automatically (AUTO-USER-001, BOUND-004). Test runs follow AUTO-USER-005.

**Acceptance.**
1. An emitted-worker test with a fake only at the mail-provider edge and no Gmail or Microsoft 365 connection: - A new Orders record whose Customer email is `buyer@customer.example`, an address that is not an operator, sends exactly one message from the installation sender with From name "Acme Orders".
2. It goes To that address, CC a static `purchasing@acme.example` and BCC a user field's operator, and its Reply-to is the record's Owner email. - The subject and body contain the inserted order number and the total shown as `$1,234.50`, and the message has HTML and plain-text parts.
3. The BCC address is absent from the delivered headers. - The record's packing-slip PDF arrives attached with an equal checksum.
4. A 30 MB attachment arrives as an expiring link instead, and the run records it. - A record with a blank Customer email fails the run, naming "To: Customer email" and the record, and nothing is sent.
5. The same happens for `bob@` and for a value containing a line break.
6. With "skip when blank" set on CC, a blank CC value is skipped and listed. - Under an owner allowlist of `acme.example` and `customer.example`, a recipient at `other.example` is refused, naming the address, and nothing is sent.
7. A 51st recipient over the default cap fails the run before any send. - After the BCC operator is removed from the base, the next order's message still reaches the Customer email and the CC address, but not that operator. - A hard bounce reported by the fake provider suppresses the address, and the next run records the skip. - A test run (AUTO-USER-005) of the same automation delivers only to the builder's address and lists the recipients it would have used. - In a test run (AUTO-USER-005), an AUTO-USER-010 email addressed to a customer or vendor reaches the builder instead, showing the recipients it would have used. - A builder journey at 1440 and 390 composes the action with To, CC and BCC drawn from fields and typed addresses, and sees the preview for a chosen record.

**Evidence.** `src/domains/automations/effects.server.ts`, `src/domains/automations/contracts.ts`, `tests/user-automations.mjs`
**Gap.** the email action sends through the installation's Base mail sender (`MAIL_FROM`) to one operator chosen by ID, with a static subject and text, rechecking that operator's authority just before dispatch, and records an uncertain answer without resending (src/domains/automations/effects.server.ts:55; src/domains/automations/contracts.ts:7; tests/user-automations.mjs). Field and static addresses, CC and BCC, the From name, Reply-to, inserted values, Markdown, attachments, the caps, the domain policy, suppression and unsubscribe are absent. The test-run acceptance point moved from AUTO-USER-005 is unproven: arbitrary recipients are absent.

### API, webhooks and integrations — target

#### API-USER-002 — Complete REST API

Core · target · **partial**

**Requirement.** A documented REST API (OpenAPI 3.1 per base, generated from the live schema) lists, filters (by condition or formula), sorts, pages, gets, creates, updates, upserts by a merge field and deletes records in batches of up to 100, uploads attachments, reads and writes comments, and reads schema; schema writes go through the RECORDS-007 proposal path. Personal access tokens for operators carry their own policy, with the scopes and lifetime API-USER-004 sets; rate limits are declared per key and answered with 429 and Retry-After.

**Acceptance.**
1. Contract test drives every endpoint from the generated OpenAPI document; a batch over limits is refused whole.

**Evidence.** `tests/user-api-keys.mjs` [API-USER-001] [API-USER-002] via `tests/helpers/rest-api-journey.mjs` (all eight generated-document operations with JSON Schema validation; 100-row create/update/delete, whole-request refusal, one admission/replay, unique upsert, Trash, delete scopes and narrower documents/responses); `docs/contract/API-USER-002/`
**Gap.** Attachment upload and comments in the documented REST namespace; personal tokens and API-USER-004 lifetime policy; formula predicates; per-key rate limits with 429 and Retry-After (no existing per-key REST limit); schema writes beyond RECORDS-007; Settings controls/labels for delete-key issuance; deleted/unreadable-subject receipt replay (current policy refuses it); complete field/type, linked-delete, concurrent-upsert and capacity-race matrix, and hosted scale. Defaults ADOPTED: all-or-nothing batches, separate delete opt-in, current issuer/key/row/field policy, readable REST write fields and conservative unique-value swap refusal. Gap (SCALE-002): unproven above 100 physical columns.

#### API-USER-003 — OAuth for third-party apps

Core · target · **missing**

**Requirement.** Third-party apps (Zapier, Make, Crank, n8n) connect through OAuth 2.0 authorization code with PKCE and per-base scopes the owner approves; tokens are revocable from Settings and every call is audited. Every installation has its own domain, so a connecting app first asks for the installation URL. The installation publishes its endpoints at `/.well-known/oauth-authorization-server` (RFC 8414). Third-party clients such as Zapier and Make are pre-registered with fixed redirect URIs on every installation, and any other client registers itself (RFC 7591) for the owner to approve. Refresh tokens stay valid until revoked or until the owner-set lifetime of API-USER-004 ends.

**Acceptance.**
1. An OAuth flow test with a local client enters the installation URL, discovers the endpoints, then covers consent, scoped access, a refresh after the access token expires, and revocation.
2. A redirect URI that is not registered is refused.

**Evidence.** None.
**Gap.** no code

#### API-USER-004 — Long-lived integration keys and personal access tokens

Core · target · **partial**

**Requirement.** Integrations and scripts do not break on a calendar:
- **Integration keys.** An owner issues API-USER-001 keys with no expiry (active until revoked, the default) or with a chosen expiry date.
- **Personal access tokens.** Each operator creates their own tokens, named and scoped to chosen bases and to read, write, comment or schema-proposal scopes. A token always acts within the operator's current policy, and it never expires by default. Removing, demoting or deprovisioning the operator narrows or ends the token on the next request.
- **Owner policy.** The installation owner may set a maximum lifetime for keys and tokens (30, 90, 180 or 365 days, or none, the default). Keys or tokens that the policy would end are listed before it is saved. Each affected key or token warns its issuer, and the owner for integration keys, in-app and by email 7 days and 1 day before expiry, naming its last-used time. Settings lists every key and token with its scopes, issuer, created, last-used and expiry times, and the owner can revoke any of them; an operator can revoke their own.
- **Storage.** Only digests are stored, and every use is audited (PERM-008).

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
**Gap.** API-key subscription create/list/refresh/delete, sealed once-only secrets, audit-ordered signed cursor windows, current-policy narrowing, id-only deletes, the identical cause-free range marker, narrowed restores and separate 30-day cursor/seven-day subscription expiry are exercised through the emitted Worker. A least-watermark-first bounded sweep reaches 202 public subscriptions while earlier ones keep changing; listing remains bounded to 200. An uncertain acknowledgement stays visibly failed and is never resent: cursor fetch recovers each change once in order, and later changes still ping. A definite HTTP 429 retries the same signed id and immutable body. Base/table/view synchronization and an unavailable view's generic final page and ended/authority_lost safe listing are proven. The 9045 audit-sequence and 9047 deleted-view populated upgrades preserve historical facts, unique ordered sequences, cursor replay and the full 30-day restore window. Person erasure removes an identity-only held record's retained audit identity and values, issuer subscriptions and sealed secrets; whole feed pages, cursor-window rows and integration envelopes are checked. A subscriber learns only activity or uncertainty in its subscribed range, never a resync cause, record identity or prior readability. HMAC-SHA256 integrations.webhook.v1 and its five-minute replay window are unchanged. No real provider call or consent was used. Gap: The complete write-door/base-table-view matrix remains unproven for workbook/Sheets merges and MCP interoperability. A public base/table/view matrix covers create/patch/delete/Trash restore, bulk/undo, range/inverse, authenticated forms, CSV create/update and automation updates under current row/field narrowing. Reviewed base-import application/reversal bypasses admission_audit under RECORDS-005's existing effects suppression; typed Launch/repair/lifecycle audit actions are outside the feed projection; restore queue wakes and restored incoming-link audit coverage remain open. Table-scope final listing after table deletion, archive restore and broader person/record-erasure journeys remain unproven.

#### MCP-001 — Live records for AI assistants

Core · target · **partial**

**Requirement.** Claude, ChatGPT and other MCP clients connect to a Cradle MCP server with an OAuth-scoped or owner-issued key and can search, read, create and update records, run views and propose schema changes, always under that key's policy; the owner can require approval before an agent's writes commit, and every agent call is audited with the client's name.

**Acceptance.**
1. Official MCP SDK client test: allowed read and write, refused out-of-scope table, approval-required write held until approved.

**Evidence.** `src/domains/authority/proposer.server.ts`, `tests/records-agent-proposals.mjs`
**Gap.** the RECORDS-007 proposal door has REST and MCP faces for schema proposals (src/domains/authority/proposer.server.ts:5; tests/records-agent-proposals.mjs); live-record MCP tools absent

#### INTEG-001 — Slack, Microsoft Teams and Nook

Core · target · **done**

**Requirement.** Besides webhook notifications, Cradle installs as a Slack app and a Teams app (OAuth, channel picker) and connects to [Nook](https://github.com/just-every/run-nook): automations post rich record messages with approve/reject buttons whose clicks are policy-checked writes by the clicking person, and record links unfurl for readers allowed to see them: a pasted record link unfurls only when the person who posted it has linked their Cradle account and can read the record, and the unfurl shows only the fields the base owner marked as safe to unfurl and that person can read.

**Acceptance.**
1. Interactive-button test with a fake Slack/Teams/Nook edge: the click updates the record as that person; an unauthorized clicker is refused.
2. Unfurl test at the same edge: a link posted by an operator who can read the record unfurls with its primary field and the unfurl-safe fields.
3. The same link posted by a person without access, or by someone with no linked account, unfurls with no record values, and a field the poster cannot read never appears.

**Evidence.** `tests/user-webhooks.mjs` via `tests/helpers/slack-app-journey.mjs` (each provider) and `tests/helpers/parallel-chat-journey.mjs` (all three installed, linked-person decisions, safe unfurls, selective removal and populated migration 9074); `tests/ui-user-automations.mjs` via `tests/helpers/slack-app-browser.mjs` and `tests/helpers/chat-provider-browser.mjs` (Slack/Teams/Nook at 1440/390)
**Gap.** Slack, Microsoft Teams and Nook recorded network edges prove installation, channel selection, linked-person approve/reject writes, unauthorized/stale/replay refusal and current-policy safe-field unfurls without values for unlinked or unauthorized people. Teams uses Graph OAuth, Adaptive Cards and verified Bot Framework callbacks. Nook explicitly selects the declared Slack-compatible app protocol and scoped token; current public Nook post-only tokens are insufficient, with no fallback or live compatibility claim. Slack messages/unfurls split across bounded text blocks without truncation. Cards, pending OAuth state and pending link codes bind to a unique installation instance, so remove/reinstall cannot revive prior authority; legacy unbound cards require fresh delivery. One installation now keeps Slack, Teams and Nook active together. Each approval uses its named provider and each person links independently; removing one leaves the other two delivering and cannot revive removed cards, OAuth states or link codes. Migration 9074 preserves existing credentials, instances, cards and links. Live installations are NOT RUN non-claims. Reading (ct, 24 October): the unchanged NONGOAL-CHANNELS sentence does not prevent INTEG-001 or INTEG-006 reaching DONE; its removal is not required.

#### INTEG-002 — Gmail and Microsoft 365 mail

Core · target · **partial**

**Requirement.** An operator connects Gmail or Microsoft 365 by OAuth; automations send from that mailbox with AUTO-USER-010's recipients, content, attachments (files from the record's attachment fields and REPORT-002 PDFs), bounds and recipient-domain policy, and sent mail appears in that mailbox's Sent folder. When the connecting operator leaves the base or disconnects the mailbox, its automations pause, the base owners are notified, and each can be switched to another connected mailbox or to the installation sender (AUTO-USER-010) in one step. Each base can have an inbound address whose mail creates or updates records with attachments, sender and thread.

**Acceptance.**
1. Send and inbound-mail tests with fakes at the provider edge: a Gmail send and a Microsoft 365 send each reach a field address and a static CC with the record's PDF attached, equal by checksum; a recipient outside the allowed set is refused.
2. After the connecting operator is removed, the next run produces no send, the base owner is notified once, and switching the automation to the installation sender makes the following run deliver.

**Evidence.** `src/adapters/gmail.server.ts`
**Gap.** scoped Gmail read-only intake (src/adapters/gmail.server.ts:14); Base mail sends notifications; mailbox sending and inbound addresses absent

#### INTEG-003 — Google Sheets and Excel

Core · target · **partial**

**Requirement.** An owner imports .xlsx workbooks and Google Sheets (each sheet a table, types detected, links proposed from repeated values), merges a sheet into an existing table on a key, once or on a schedule (RECORDS-008), and exports any view or base to .xlsx; a Google Sheet can be a synced source (SYNC-001).

**Acceptance.**
1. Workbook import and export round trip with typed values; Sheets import against a recorded API fixture.

**Evidence.** `tests/records-csv-fence.mjs` via `tests/helpers/workbook-journey.mjs`; `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”) via `tests/helpers/base-stream-exits.mjs`; `scripts/scale/stream-export.mjs` (50,000 rows, independent readers; Nightly run 40170915907 (workflow_dispatch on c3cb86781b63c0e89bb152622d6309543e401dbb) job 121101515939 verify-scale-export SUCCESS (UNCOUNTED until DONE)); `tests/ui-base-import.mjs` (CSV-set import preview, guarded adoption, stored resume and undo on desktop and phone) via `tests/helpers/company-workbook-browser.mjs` and `tests/helpers/base-import-hydration.mjs` (1440/390)
**Gap.** Whole-base JSON, CSV-set with complete correspondence and typed XLSX, including legacy JSON/base64 envelopes, stream policy-fenced pages beyond the unchanged intake bounds. Evaluated/computed and relationship reads page underlying records; signed continuation boundaries preserve ordering. Existing typed workbook/Sheets import, keyed merge and percent round trips remain proven. The standalone 50,000-row journey independently checks view CSV/XLSX and all three base formats, typed cells, ZIP checksums, correspondence ordinals, byte lengths and hashes. INTEG-003-SYNC asked whether INTEG-003 may be done while 'a Google Sheet can be a synced source' stays with SYNC-001; ct answered yes (24 Oct 12:52Z), and no synced-source behaviour is claimed here. Hosted memory and real Google consent remain NOT RUN non-claims. The independent 50,000-row boundary journey passes in `scripts/scale/stream-export.mjs`: Nightly run 40170915907 (workflow_dispatch on c3cb86781b63c0e89bb152622d6309543e401dbb) job 121101515939 verify-scale-export SUCCESS (UNCOUNTED until DONE). Python CSV/ZIP/XML/JSON readers assert row counts, typed values, ZIP checksums and correspondence byte lengths/hashes; every correspondence ordinal is exactly 1..50,000, and every identity and primary value matches its CSV position (assertions “Correspondence ordinal”, “Correspondence identity” and “Correspondence primary” in `scripts/scale/stream-export.mjs`). Shifted ordinals and swapped identities/primary values fail independently. The unchanged intake limit remains asserted. Gap: The INTEG-003-tagged portable-installation test `tests/rer-data-roundtrip.mjs` '[PERM-007 INTEG-003 SCALE-001 SC-03 SC-06 SC-08] real rer setup twice, complete generated DB/FILES fresh-install restore, authority hold and confirmed reset' fails with 'Company identity request failed' (400 !== 200 at tests/helpers/company-archive.mjs:4) in nightlies 40159000201 and 40170915907.

#### INTEG-004 — Google Calendar and Outlook

Core · target · **done**

**Requirement.** A date or range field can keep an event in a chosen Google or Outlook calendar in step with the record (create, move, cancel), with the event linking back; changes made in the calendar are shown for review rather than silently written back.

**Acceptance.**
1. Calendar sync test against a recorded provider edge: create, move, cancel and an external edit flagged for review.
2. Sync definition and authority (ct, 23 October) - A base owner or creator turns sync on for one date or date-range field.
3. They choose a calendar connection they control and an owned calendar on it.
4. They also choose the event title field and any further fields to show in the event.
5. The setup screen states that everyone who can see that calendar will see those values. - The definition is captured and versioned like an AUTO-USER-001 definition, and it runs under its author's current authority.
6. If that authority is lost, or the connection is revoked or loses `record.calendar.sync`, no new effects start, and the field shows a stopped state. - A field the author can no longer read leaves later events.
7. The event description carries the record link, which opens only for people with current record authority.
8. Writes are execution effects (ct, 23 October) - Every create, move and cancel is one execution effect of class `record.calendar.sync`, with operation `create|move|cancel`. Its idempotency key comes from (definition, record, event generation). - A connection carries that class only after an explicit, audited approval that names the calendar ID. The resolved credential's account must equal that calendar (the existing `Calendar scope mismatch` guard). - On Google, the event ID comes from the key. On Outlook (Microsoft Graph), the request sends the key as `transactionId` and as a private single-value extended property, and readback finds the event by that property. - An unknown acknowledgement is reconciled by readback only and is never resent automatically. A definite 429 retries the same request. Clearing the date, moving the record to Trash, or deleting it cancels the event. Restoring the record creates a new generation. - Only connection jobs read. No connection job writes to a calendar. Calendar-side edits are reviewed, never written back (ct, 23 October) - A read-only `connection.sync` job reads Cradle-marked events (Google private extended property, Outlook extended property) and compares each one to the last ETag or change key that Cradle wrote. - A move, retitle or deletion made in the calendar opens a review item on the record and in the base's sync list. While that item is open, Cradle starts no further effect on that event. - Someone with write authority on the date field resolves the item. "Apply to record" is an ordinary policy-checked write, and automations fire as usual. "Restore calendar from record" issues a `move` effect. Neither happens automatically. Bulk and import (ct, 23 October) - A bulk edit queues paced effects under AUTO-010-style fan-out, at most one per record per change. - RECORDS-005 import writes start no calendar effect, consistent with their no-automation rule. The sync list counts records not yet on the calendar, and the definition's author can sync them explicitly. Scopes: the narrowest scope that writes events is used and recorded in `docs/contract/INTEG-004/`: Google `calendar.events.owned` plus calendar listing; Outlook `Calendars.ReadWrite`.

**Evidence.** `tests/ui-records-calendar.mjs` via `tests/helpers/record-calendar-journey.mjs`, `tests/helpers/record-calendar-author.mjs`, `tests/helpers/record-calendar-retry.mjs`, `tests/helpers/record-calendar-bulk.mjs`, `tests/helpers/record-calendar-upgrade.mjs` and `tests/helpers/record-calendar-trash.mjs` (journey at 1440/390; author, retry, bulk, upgrade and Trash helpers at 1440 only; mandatory records-calendar-sync push group); `tests/rer-integrations-archive.mjs` via `tests/helpers/record-calendar-archive.mjs`; `tests/helpers/record-calendar-proof.mjs` (push records-calendar-sync, Google/Outlook 1440/390; resolved-credential adapter guards and exact imported-record counts)
**Gap.** Recorded Google and Microsoft Graph edges prove create/move/cancel/review, Graph transactionId/private-property readback/change-key checks, unknown-acknowledgement no-resend, native-author approval independent of the original session within 30 days, current author/field authority, another date writer without export authority, hidden execution-data refusal, external deletion Restore, import-no-effect, bulk pacing, definite-429 same-request retry and creator demotion. Populated pre-9050 upgrade preserves records/schema/custody before public configuration/effects. Trash cancels the known event without exposing the record, and public restoration creates a new generation. A real installation archive restore requires fresh native-owner reconnect/reapproval before new effects. Real Google/Microsoft consent remains NOT RUN. Real provider consent is NOT RUN, a named non-claim. Local public-door assertions cover setup disclosure, versioned retained definition snapshots, lost record-link authority, one effect per create/move/cancel with derived keys, audited calendar approval and preapproval refusal, account-mismatch refusal of a prepared effect before dispatch, Google derived event IDs, refresh with zero writes, base sync list at 1440/390, Apply event/run/notification effect, explicit Restore move with no earlier write, and narrow outgoing consent scopes. Evidence: `tests/helpers/record-calendar-journey.mjs` and `tests/helpers/record-calendar-proof.mjs` via `tests/ui-records-calendar.mjs` (push records-calendar-sync; Google/Outlook, 1440/390). The `resolvedCalendarScopeMismatch` assertion in `tests/helpers/record-calendar-proof.mjs` reaches each actual adapter’s resolved-credential guard, rejects preflight with Calendar scope mismatch and asserts zero transport requests/writes. `tests/helpers/record-calendar-journey.mjs` asserts imported-record notOnCalendar counts exactly 1 before and 2 after, delta 1; both assertions run for Google/Outlook at 1440/390 in push records-calendar-sync.

#### INTEG-005 — CRM, development and payment systems

Core · target · **missing**

**Requirement.** Synced tables (SYNC-001) and automation actions connect Salesforce and HubSpot (accounts, contacts, opportunities; [Orbit](https://github.com/just-every/run-orbit) for the Run Edit Run CRM), Jira, GitHub and [Vector](https://github.com/just-every/run-vector) (issues), and Stripe (customers, payments, invoices read-only; payment links created by action, the processor holding all money).

**Acceptance.**
1. One synced-table and one action test per system against recorded fixtures at the network edge.

**Evidence.** None.
**Gap.** no code

#### INTEG-006 — Twilio SMS

Core · target · **done**

**Requirement.** Automations send SMS through the owner's Twilio account and number to a phone field, with US A2P 10DLC registration status shown, STOP/HELP opt-out honored and recorded on the record, and delivery status written back.

**Acceptance.**
1. SMS action test with a Twilio fake: send, delivery callback, STOP suppresses later sends.

**Evidence.** `tests/records-manual-release.mjs` via `tests/helpers/records-phone-journey.mjs` (typed field and every write door); `tests/user-automations.mjs` via `tests/helpers/sms-journey.mjs` (Phone-field send, signed delivery, STOP/HELP/START and refusal riders); `tests/ui-records-builder.mjs` via `tests/helpers/field-browser.mjs` and `tests/ui-user-automations.mjs` via `tests/helpers/sms-browser.mjs` (1440/390)
**Gap.** Typed Phone fields and typed phone lookups are available to the SMS picker; sends, signed delivery callbacks and STOP/HELP/START run on the Phone field. Existing text-bound actions remain compatible. Twilio registration refusals retain the provider code and message verbatim under current phone-field read authority and cannot be retried. Ambiguous replies retain installation consent without guessed record attribution and appear once in SMS Settings with time, masked number and body. A2P status is display-only; Twilio enforces registration. Signed fixtures at the real HTTP paths provide the required provider evidence; no live Twilio account call was made or required (ct, 24 October 07:11Z). Reading (ct, 24 October): the unchanged NONGOAL-CHANNELS sentence does not prevent INTEG-001 or INTEG-006 reaching DONE; its removal is not required. `tests/helpers/sms-browser.mjs` asserts the exact provider-verified registered and unregistered A2P status lines at both 1440 and 390 through the push `automations` group.

#### INTEG-007 — Zapier, Make and Crank

Core · target · **missing**

**Requirement.** Cradle has a public Zapier app listed in Zapier's App Directory and a public Make app approved in Make's app catalog, both published under Run Edit Run's developer accounts, and a [Crank](https://github.com/just-every/run-crank) connector. Each one connects to any installation by its URL plus OAuth (API-USER-003), so one published app serves every buyer's own domain.
- **Triggers:** new record; new or updated record, optionally only when named fields change; record enters a view; new form submission; and new comment. Each works as an instant webhook trigger over WEBHOOK-USER-002, with polling where the platform needs it.
- **Actions and searches:** create record; update record; create or update a record by a merge field; delete record; find records by formula or field value, with "create if not found"; and add a comment. Each takes base and table pickers, and field inputs are generated from the live schema.
- **Output and policy.** Output keys use record ID, created time and field names, as Airtable's Zapier and Make apps do. When a Zap or scenario switches its app from Airtable to Cradle, its later steps' field mappings carry over by name. The docs page "Moving your Zaps and scenarios" maps each Airtable trigger and action to its Cradle equivalent. Every call runs under the connecting operator's OAuth scopes and current policy.

**Acceptance.**
1. - **Zapier.** The Zapier app's source lives in the repository, and the Zapier Platform CLI's `zapier test` runs every trigger, action and search in it against a local emitted installation, entering the installation URL in the auth fields and connecting through API-USER-003's OAuth.
2. Fakes are allowed only at the network edge, and `zapier validate` passes. - **Make.** The Make app's definition (base, connection, modules, RPCs and webhooks) lives in the repository.
3. Each module runs through Make's app SDK tooling against the same local installation, and one authorized run of a published-app scenario on a hosted preview installation records Make's execution log. - **Crank.** Each trigger and action runs from a local Crank client. - **Moving a Zap.** A fixture Zap of the form Airtable New Record → Slack, re-pointed at Cradle, receives output with the same field-name keys.

**Evidence.** None.
**Gap.** no Zapier, Make or Crank app code. The REST record API it would use is partial (API-USER-002), OAuth is missing (API-USER-003), and the change-subscription door is partial (WEBHOOK-USER-002)

### Move-in, sync and recovery

#### MIGRATE-001 — Airtable move-in

Core · target · **partial**

**Requirement.** With an Airtable personal access token (or a downloaded base export), Cradle reads every table, field, record, link, attachment, comment, view (type, filters, sorts, groups, hidden fields) and form; translates formulas, lookups and rollups into Cradle's language; lists interfaces and automations with a rebuild proposal for each (AGENT-003); and imports through RECORDS-005 review with a receipt naming every loss. The formula bar is measurable. Every formula built only from functions CALC-005 covers must translate and, on every imported record, evaluate equal to the value Airtable showed at export. Only a formula that uses a CALC-005 named exception may be flagged; it is listed with its original text and keeps Airtable's last values as read-only text until someone rewrites it. Any other flag fails the move-in. People, created and modified metadata, comment authors and record ID mapping follow MIGRATE-005. A second run imports only what changed, so the team can work in Airtable until cutover.

**Acceptance.**
1. A recorded-API move-in of a fixture base runs through review.
2. The base has: - every field type, including single and multiple collaborator fields, created-by, last-modified-by, created-time and last-modified-time fields; - CALC-005's reference formulas, attachments and every view type; - a form; - comments with @mentions by three different collaborators.
3. Every covered formula translates, and every one evaluates equal to its exported value on every record; the check fails on any flag.
4. People, metadata and comments meet MIGRATE-005's checks.
5. The form and its fields are present.
6. The receipt shows zero unexplained losses.
7. A delta re-run imports exactly the changed records.
8. Then one authorized real-account run.

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

**Requirement.** Every move-in (MIGRATE-001 to MIGRATE-003, and RECORDS-005 when the source carries people) keeps who did what.
- **People.** The source's collaborators are matched by email to existing operators. The review step lists each unmatched person, and the owner chooses for each one: invite as an operator in a chosen base role, invite as a guest (PERM-005), or keep as a named person without access. A person kept without access stays on the record as a named, non-signing-in person with their source name and email. They appear on the receipt and become a real operator if they are invited later.
- **Values that depend on people** keep their people: user and collaborator field values, created-by and last-modified-by, comment authors and @mentions, and record owners where the source has them. "Assigned to me" filters (PERM-002), "Viewer's records" pages (IFACE-007) and FIELD-004's watching work for matched people from the first day.
- **Times.** Each record's original created and last-modified times are kept as its created-time and last-modified-time values; the import time is recorded separately in its history. "Days since created" formulas therefore evaluate as they did in the source.
- **Comments.** Comments are imported with their author, original timestamp, @mentions and thread order, without notifying anyone.
- **Record ID map.** The receipt includes a downloadable CSV and JSON map from each source record ID (Airtable `rec…`, Smartsheet row ID, Quickbase Record ID#) to its Cradle record ID. The API can read records by their source ID, so external systems that store old IDs can be repointed.

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

Core · target · **done**

**Requirement.** An owner can schedule a full or incremental export of chosen bases to the buyer's BigQuery, Snowflake or R2/S3 bucket as Parquet or CSV for analysis beyond the app. BigQuery and Snowflake are proven against network-edge fakes; no transfer to a real BigQuery or Snowflake account has run.

**Acceptance.**
1. Scheduled export test writes a correct incremental file to a local bucket.

**Evidence.** `tests/launch-operator-doors.mjs` [SYNC-002] via `tests/helpers/warehouse-export-journey.mjs`, `tests/helpers/warehouse-manifest-base.mjs` and `tests/helpers/warehouse-r2-restart.mjs` (push launch shards; four destinations × two formats); `tests/rer-integrations-archive.mjs` via `tests/helpers/warehouse-archive.mjs` (push retained-integrations)
**Gap.** R2/S3 multipart, BigQuery resumable WRITE_APPEND and Snowflake staged COPY deliver oversized individual records and manifests across CSV/Parquet. The scheduled public journey checks exact bytes, rows, checksums, source-field mappings, unchanged watermarks before readback, retained upload/run identities after Worker restart, no duplicate or skipped change, current policy, tombstones, owner-loss pause and complete erasure through bounded cleanup batches. BigQuery session capabilities are sealed; the populated installation archive journey asserts transfer-custody clearing and fresh schedule authority. Real BigQuery/Snowflake account transfers are NOT RUN non-claims. Real BigQuery/Snowflake account transfers are NOT RUN non-claims; network-edge fakes provide the contract proof. `tests/rer-integrations-archive.mjs` via `tests/helpers/warehouse-archive.mjs` (push retained-integrations) seeds completed R2/S3 exports, interrupted transfer custody and populated schedules, exports and imports into a fresh installation. It asserts exported/restored transfer sessions and credentials cleared, each schedule paused until a fresh owner save (with fresh remote credentials), and zero old transfers on restore/cron/queue wake by unchanged provider writes and R2 objects; freshly reauthorized schedules then complete new exports.

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

Core · target · **partial**

**Requirement.** Every records, view, form, interface, comment and automation-history journey works at 390 CSS px and 320 CSS px with no horizontal page overflow, touch targets of at least 24 px and no serious or critical axe findings.

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

Core · target · **missing**

**Requirement.** Native apps for iOS and Android, published under Run Edit Run's store accounts and pointed at the buyer's own installation, browse bases, views and interfaces, edit records, submit forms, comment, scan barcodes, receive push notifications and keep device-only drafts offline that reconcile on reconnect with the same stale-version and authority checks as the web (a draft never becomes a silent success).

**Acceptance.**
1. Device-farm journeys on current iOS and Android: sign-in to a local installation, edit, offline draft and reconcile, push receipt.

**Evidence.** None.
**Gap.** seed.json nonGoals exclude native mobile applications for the current release; device-only drafts exist for repair intake only

### AI in the base

#### AI-FIELD-001 — AI fields

Core · target · **missing**

**Requirement.** An AI field holds the result of a prompt over chosen fields of its record (summarize, classify into the field's options, extract a value, translate, draft a reply). It runs on demand, on change of its input fields or in bulk; it writes only its own field, marks results as AI-generated with the inputs' versions, never overwrites a person's manual edit to it, and counts against the daily AI ceiling.

**Acceptance.**
1. AI field test with a fake provider at the network edge: bulk run, re-run on input change, manual edit preserved, ceiling refusal.

**Evidence.** None.
**Gap.** read-only analysis machinery for the launch template (src/domains/intelligence/service.server.ts) can be reused

#### AI-FIELD-002 — Document extraction

Core · target · **missing**

**Requirement.** An attachment (invoice, W-9, purchase order, receipt, certificate of insurance) can be read into named fields with each value's source location and confidence; low-confidence values are left for a person to confirm and nothing is written until they do or a rule allows it.

**Acceptance.**
1. Extraction test on fixture PDFs: values, source highlights and confirmation gate.

**Evidence.** None.
**Gap.** no code

#### ASSIST-001 — Base assistant

Core · target · **partial**

**Requirement.** In any base, an operator asks questions in plain English ("orders over $5,000 shipped late in Texas this quarter") and gets an answer citing the records it used, drawn only from what that operator may read; the assistant can draft a view, chart, formula (with an explanation) or automation as an unsaved draft the operator saves or discards.

**Acceptance.**
1. Assistant test with a fake provider: cited answer limited to readable records; drafted view saved only by the operator.

**Evidence.** `src/domains/records/manual/proposal-agent.server.ts`, `tests/records-agent-proposals.mjs`
**Gap.** permissioned external schema proposals (src/domains/records/manual/proposal-agent.server.ts; tests/records-agent-proposals.mjs); in-product assistant absent

### Honest boundaries

#### BOUND-001 — Separate products stay separate

Core · target · **done**

**Requirement.** Cradle is the relational database and internal-app builder. It is not a project or work management suite (task inboxes, workload and resource planning across projects; the separate product is [Pegboard](https://run-pegboard.com)), a CRM ([Orbit](https://github.com/just-every/run-orbit)), a survey platform ([Pencil](https://github.com/just-every/run-pencil)), a wiki ([Slate](https://github.com/just-every/run-slate)), file storage ([Chest](https://github.com/just-every/run-chest)), team chat ([Nook](https://github.com/just-every/run-nook)), an issue tracker ([Vector](https://github.com/just-every/run-vector)), an automation platform ([Crank](https://github.com/just-every/run-crank)), an identity provider ([Auth](https://github.com/just-every/run-auth)) or a website builder ([Pane](https://github.com/just-every/run-pane)). It connects to each through the clauses above.

**Acceptance.**
1. Docs and navigation link to the sibling for each named job; no Cradle surface claims it.

**Evidence.** `tests/public-document-runtime.mjs`, `docs/boundaries.md`
**Gap.** None.

#### BOUND-002 — Not a regulated system of record

Core · target · **done**

**Requirement.** Cradle is not an accounting ledger, payroll, EHR or payment processor. The separate payroll product is [Envelope](https://run-envelope.com). Money moves only through the buyer's processor (Stripe); ledgers stay in the buyer's accounting system. Cradle makes no HIPAA, PCI DSS or SOC 2 claim; a covered entity storing PHI needs its own hosting agreement (BAA) and its own assessment.

**Acceptance.**
1. Docs state the boundary; no card number field type exists.

**Evidence.** `tests/public-document-runtime.mjs`, `src/domains/records/validators.ts`, `docs/boundaries.md`
**Gap.** None.

#### BOUND-003 — Bounded compute

Core · target · **partial**

**Requirement.** Formulas, scripts and automations run within declared time and memory bounds inside the Worker. Heavy analytics and long-running jobs run in the buyer's own warehouse or runtime (SYNC-002, API-USER-002), not in Cradle requests.

**Acceptance.**
1. Script and formula limit tests (AUTO-USER-007, CALC-004).

**Evidence.** `src/domains/records/formulas.ts`
**Gap.** formula depth/cycle bounds (src/domains/records/formulas.ts); script sandbox not yet built

#### BOUND-004 — Honest migration and delivery claims

Core · target · **done**

**Requirement.** Cradle never says an app migrated because its rows did, never claims a message reached a person because a provider accepted it, and never resends an uncertain external effect; receipts name every loss and uncertainty.

**Acceptance.**
1. Move-in receipts and uncertain-delivery tests.

**Evidence.** `tests/records-import-receipt.mjs`, `tests/launch-installed-retries.mjs`
**Gap.** None.

#### BOUND-005 — One business per installation

Core · target · **done**

**Requirement.** An installation serves one business with many bases; multiple tenants are separate installations, and moving a base between them uses RECORDS-006.

**Acceptance.**
1. Base copy between two installations by JSON export and reviewed import.

**Evidence.** `tests/records-base-exits.mjs` (“[RECORDS-005 RECORDS-006] actual D1 portable base return matrix preserves native data, reviewed correspondence and independent JSON copies”)
**Gap.** None.

### Notifications (target clauses)

#### NOTIFY-009 — Outage and progress notices

Core · target · **done**

**Requirement.** An integration-connection outage or an automation stop notifies the people who own it, and a long-running import or export reports completion or failure to the person who started it (the notices Airtable, Smartsheet and Quickbase users get), each a generated event through the same matrix with its own mute kind, recipient rules and one-notice-per-event.

**Acceptance.**
1. A clause-tagged test through the launch HTTP transport or emitted worker (`tests/launch-*.mjs`) or the operator walkthrough at 1440 and 390 (`tests/ui-launch-walkthrough.mjs`) generates each event through a real product path and drives it through the notification delivery matrix (`tests/helpers/notification-delivery-matrix.mjs`): an integration-connection outage and an automation stop notify exactly their owners, a long-running import and a long-running export each report completion and failure to exactly the person who started it, each under its own mute kind with one muted and one unmuted recipient, exact provider-edge mail and one notice per event.
2. Retry and outcome clarification: notification-attempt lease expiry alone does not establish import or export failure.
3. A matching active export claim for the same retained execution, version and scheduled slot suppresses premature failure while protected work or automatic safe recovery continues; an unrelated or obsolete claim does not hold another outcome.
4. Successful resume in that protected state produces exactly one completion event, subject to existing completion opt-in and delivery preferences, with no false failure event and no remaining notification debt.
5. An export that repeatedly stops during resume must not remain silently pending forever.
6. Automatic recovery uses a documented finite policy based on durable unsuccessful recovery executions and useful progress, with current ownership and stale-worker fencing.
7. Normal bounded yields and a live slow worker do not count as crashes, and progress accounting must not reset an uncompleted crash sequence indefinitely.
8. The policy protects valid advancing work and does not turn notification-lease expiry, elapsed age or a test budget into terminal failure. When automatic recovery actually stops without completion, the retained authorized starter receives one truthful actionable needs-attention outcome describing that stop and the permitted next step. Safe resume authority and transfer custody are preserved unless an existing authority, erasure or execution-validity rule removes them. Later authorized completion is reported as its actual distinct outcome. Recovery attempts and redeliveries of the same logical outcome create no additional logical events. Additional required evidence: retain every existing NOTIFY-009 acceptance point and the generated-event matrix at 1440 and 390. Discriminate expired-attempt protection with a matching active resumable export claim, a nonmatching claim control and a guard-removal mutation; then prove successful resume with one completion, no false failure and zero debt. Separately drive repeated interrupted resumptions through the documented automatic-recovery policy, proving a truthful actionable report, no duplicate logical outcome and preserved safe-resume authority. A progressing or concurrently active valid execution must not be falsely failed by that policy. Exercise a later authorized successful recovery where supported, preserving event identity, current authority and debt cleanup. Repeat the relevant muted and unmuted phases with exact recipient, durable delivery and provider-edge assertions; use production application code, with network fakes only at permitted paid or network edges and fault injection that does not replace application behavior.

**Evidence.** `tests/ui-launch-notifications.mjs` loads verifyNotificationDeliveryMatrix from `tests/helpers/notification-delivery-matrix.mjs` in push launch-notifications at 1440 and 390, with a muted and an unmuted phase. Connection outages assert exactly the installation owner for their own connection, exactly the second current owner for that author’s connection, and every active installation Base owner for a legacy connection without owner_id, including one muted and one unmuted owner. Expired-approval automation stops assert exactly their author for the installation owner’s automation and a second current owner’s automation. Each outage retains persisted recipient preferences, exact durable delivery and provider-edge mail, one event per transition, repeat suppression, recovery re-arming and voluntary-stop exclusion. Resumable native import and scheduled export each assert completion or failure to exactly their retained starter, with literal title and body in the stored notice, public inbox and provider-edge mail selected by durable receipt. Muting retains the notice and suppresses only that starter’s mail. Default failures, completion opt-in and repeat suppression remain asserted. A committed completion held by an unavailable notification principal delivers once after recovery, with no muted mail or later replay. Failure loss cases refuse a synthetic journal settlement write after real provider refusal or partial import failure: the write-ahead failure remains held while its bounded attempt is live, then recovers exactly one failure notice and one provider-edge mail after the export schedule is removed and without another import resume; later ticks leave no debt or duplicate. Removed or edited export completions and a publicly undone import completion retire without notices or mail. A starter whose destination base membership is withdrawn sees subject.available false, no href, title Notification unavailable and an empty body through the API; the rendered inbox row has no Related record link at 1440 and 390. Public ownership handover discriminates import starters: completion and partial failure are recorded with publication held before handover, then delivered after fresh public step-up and transfer to the original starter through their own sign-in, with exact receipt-selected mail and no notice or mail to the new installation owner. Handover moves base ownership, so the original starter does not resume an unfinished import after transfer. The existing "public erasure before the first installation transfer creates its checkpoint atomically" registration in `tests/lifecycle-erasure.mjs`, loaded by the foundation push group, asserts confirmed erasure inventories and transactionally deletes owed rows naming that starter. Settings no longer describes progress as unproduced. The same matrix discriminates the retry boundary: an expired notification-attempt lease publishes no export failure while the matching active claim for the same run, version and slot still holds it and its automatic recovery continues; a control whose attempt names another execution publishes exactly once; the matching run then resumes through the scheduled door with exactly one completion, no failure event or mail, and no debt or attempt left. Automatic recovery of an interrupted export run is finite. When a later execution finds the run’s 300-second lease expired, the execution that held it ended without completing and is counted in one update fenced by the run’s claim token and lease start; a resume that fails before its claim is counted the same way. An execution that added retained run objects made useful progress and does not use the allowance of two unproductive executions; progress never resets that count, and the fourth unsuccessful execution ends recovery whatever its progress. Two unproductive executions show that the stop repeats at the same point, and four bounds the extra work because every resume uploads the retained objects again. A live execution inside its lease is never counted, and a stale execution cannot clean up, settle or report over the execution that re-claimed its run. When recovery stops, the retained starter receives the existing failure event for that export, version and slot exactly once, titled Export needs attention, saying that automatic recovery stopped and that the export tries again at its next scheduled time; the claim and retained objects are kept, the run is attempted once at each later scheduled slot, and a later completion is its own event. Recovery attempts and redeliveries add no logical event, and publication keeps the current retained starter, mute kind, restore and snapshot fences and erasure guards. The matrix asserts at 1440 and 390, muted and unmuted, the stop reported once with exact recipient, durable delivery and provider-edge mail, the kept claim, and the later completion with no debt or attempt left; a progressing run reported only at the total bound; and a live slow worker held at the provider edge never counted. A progress notice whose subject is unavailable keeps title Notification unavailable, an empty body, subject.available false and no href, while its own retained starter reads the generic outcome separately as outcome metadata in the API and the rendered row, including a muted starter’s removed failed export, with no link, mail or disclosure to another operator. The same lifecycle erasure registration erases a starter whose native import attempt is live: confirmed erasure inventories channel_progress_attempts and channel_progress_owed with true counts and deletes them in its transaction, no later resume or tick applies the import or sends any notice or mail, erasure completes within the five-minute bound, and only the import job receipt remains, with its anonymised starter reference. CT judged NOTIFY-009 DONE-JUSTIFIED at landed main d7dc8100256a244030024bb616a746d7f0ade6d0 (accepted 27 October 2026, 20:15Z). The notification journey’s obsolete-version and obsolete-slot controls at 1440/390, muted and unmuted, make the guard-removal mutation DROP_EXPORT_EVENT_ID_MATCH fail the assertion at D line 518 in all eight cases. Retained coverage is unchanged. Exact-SHA Verify 40560605529, main Verify 40564233971 and Run site 40564234141 succeeded.
**Gap.** None.

### Push further: agents that run the operation

#### AGENT-001 — Build a working base from the owner's files

Core · push-further · **partial**

**Requirement.** Given the owner's spreadsheets, CSVs, documents and (when connected) a Drive or Chest folder, the agent infers entities, field types, links, formulas, views, forms, roles and starter automations, imports a representative sample of real records into a preview, and presents the proposal with side-by-side source and result rows. The owner adopts through RECORDS-002/RECORDS-007; nothing is written to live data before adoption.

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

Core · push-further · **partial**

**Requirement.** After MIGRATE-001/002/003, the agent rebuilds the source's interfaces, automations and permissions as Cradle proposals, runs representative role journeys and record comparisons in both systems, and lists every behavior needing a human decision. Cutover is the owner's explicit step; external effects stay disabled until approved.

**Acceptance.**
1. Fixture Airtable base with an interface and two automations: rebuilt proposals pass the same role journeys; the decision list names each untranslatable item.

**Evidence.** `src/domains/records/base-transfer/service.server.ts`, `src/domains/records/manual/proposal-agent.server.ts`
**Gap.** migration previews, custody and agent schema proposals (src/domains/records/base-transfer/service.server.ts; src/domains/records/manual/proposal-agent.server.ts); behavior reconstruction absent

#### AGENT-004 — Operate a workflow to its outcome

Core · push-further · **partial**

**Requirement.** The owner names an outcome over a view ("every purchase order received and invoiced by month end") and a mandate: which records, which fields the agent may update, which people and channels it may contact, a spend ceiling and an expiry. The agent traces linked records, finds missing evidence, sends approved requests, reads replies, updates allowed fields, and marks a record done only when the outcome is verified, pausing on conflicting authority or an uncertain external result and reporting progress daily.

**Acceptance.**
1. Held-out continuation scenario on fixture records: outcome reached with every action inside the mandate; revocation mid-run stops new effects; an uncertain send is not repeated.

**Evidence.** `src/domains/operations/worker.server.ts`, `src/domains/execution/runtime.server.ts`, `tests/repairs-outcome-http.mjs`
**Gap.** outcome and execution machinery for the included Repairs app (src/domains/operations/worker.server.ts; src/domains/execution/runtime.server.ts; tests/repairs-outcome-http.mjs); no general record-outcome steward

#### AGENT-005 — Repair broken automations and integrations

Core · push-further · **partial**

**Requirement.** When runs fail or a synced or connected system drifts (renamed field, expired token, changed schema, missing external IDs), the agent diagnoses the cause from run history and both sides' records, proposes a minimal fix as a reviewed change, and after adoption confirms both sides reconcile; it never retries an uncertain external effect without verification.

**Acceptance.**
1. Fault-injection test: renamed field breaks an automation; the proposed fix is adopted and the next run succeeds; an uncertain webhook is reconciled, not resent.

**Evidence.** `src/domains/automations/runtime.server.ts`, `src/domains/execution/runtime.server.ts`
**Gap.** failure history and external-effect readback (src/domains/automations/runtime.server.ts; src/domains/execution/runtime.server.ts:42); agent repair absent

#### AGENT-006 — Keep the data clean

Core · push-further · **missing**

**Requirement.** The agent finds likely duplicates, broken or one-sided links, inconsistent spellings of the same value and records that break rules, and proposes merges and normalizations as one reviewed bulk change with the records bulk service's preview, atomic commit and undo; it never merges or rewrites on its own.

**Acceptance.**
1. Fixture base with seeded duplicates and variants: the proposed change fixes exactly them and undoes cleanly.

**Evidence.** None.
**Gap.** bulk preview/commit/undo exists to build on (src/domains/records/bulk.server.ts; tests/records-transport.mjs)

#### AGENT-007 — Agent authority

Core · push-further · **partial**

**Requirement.** Agents act only through owner-issued, expiring, revocable grants naming bases, actions, fields, recipients, spend and quantity; a grant cannot be widened by the agent, by a proposal or by imported text; every agent action is audited with the grant; consequential actions above an owner-set threshold wait for a designated person.

**Acceptance.**
1. Grant tests: out-of-scope action refused, expired and revoked grants stop work, above-threshold action held for the designated approver.

**Evidence.** `tests/records-agent-proposals.mjs`, `tests/repairs-outcome-http.mjs`
**Gap.** proposing keys (RECORDS-007; tests/records-agent-proposals.mjs) and repair mandates with designated-human approval (tests/repairs-outcome-http.mjs)

## Agent surface

None.

## Later

None.

## Field proof register

No field proof is recorded yet.

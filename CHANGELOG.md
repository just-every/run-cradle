# Changelog

## 0.3.0

What an owner gets:

- Fields and calculations: typed fields with business rules and defaults, formulas, conditional rollups, and conditional ordered lookups across linked records, each previewed on real records before adoption. Linked-record pickers search readable labels.
- Views: editable grids with ranges, fill down and recovery; Kanban boards by select, person or link with private covers; private image galleries; calendars by date or instant with private, revocable iCal feeds; timelines and Gantt charts with dependencies, critical paths and baselines; collaborative, personal and locked views with column summaries and colour rules; find across every view.
- Collaboration: record comments and mentions, live editing with scoped presence, and undo shared across editors, bulk changes and views.
- Forms: conditional record forms with pages and guarded answers.
- Starting apps and roles: nine editable starting templates, reviewed whole-base copies with or without records, and base roles where creators propose schema changes the owner reviews.
- Automations: record automations notify in the app, email, call a signed webhook or post to Slack; email waits out quiet hours and every run is recorded. Owners can connect Gmail.
- Launch readiness: campaign, deliverable, milestone, risk, decision, lens and comment clauses completed, with every mutation fenced on the current revision.
- One plain catalogue sentence: "Organize business records, connect related data, and build forms and views for daily work."
- Fixed in the release gate: Records pages failed to load under `rer dev` (a browser import of `seed.json`); own-account hosting with SendGrid or Resend could not deploy (the owner deploy declaration required the Managed relay credentials and never bound the provider key). Docs now name the pinned rer 0.2.63.

Not in this release:

- CONTRACT.md is the full Airtable, Smartsheet and Quickbase replacement target; its Status table reads 111 done, 71 partial and 28 missing of 210 clauses. Dashboards and reports, the complete API, MCP and integrations, sync, mobile and parts of permissions remain partial or missing.
- The landing page's AI briefs need an AI provider key; this release's gate did not exercise a live AI provider.
- A Settings installation archive restores into a local checkout only; a hosted installation is restored base by base through Import a base (base JSON).

Known issues:

- A first `rer deploy` to a new environment can stop part-way through the 118 migrations (`provider-request-budget`, or a transient Cloudflare transport failure). Run the same command again; it resumes.
- rer's deploy check reads the provider key as `MAIL_API_KEY`, while Cradle sends with `MAIL_PROVIDER_API_KEY`: own-account hosts set both to the same key.
- `wrangler d1 export` refuses Cradle's database (FTS5 search tables); use Settings → Export your installation for a hosted backup.
- A base JSON import advances while its stored-import page is open; keep it open, or reopen it, until it says Import completed.
- Recovery CSVs show empty cells as `\N` and links as JSON identities.

Back up first: stop dev and run `rer export --output exports/workspace.rer`, or on a hosted install download Settings → Export your installation → Download verified archive.

Migrations `core/1230` to `core/1280` and `updates/9038` are additive; `1240`, `1260` and `1280` extend existing editor and owner rules with comment and connection actions. RELEASE.json lists each one's upgrade step.

Upgrading a local install: stop dev, run `rer export`, pull, then run `rer install` and `rer dev`.

Screenshot: `.github/assets/release/cradle-0.3.0-records-1440.png` (Records at 1440 px in local dev on the release build).

## 0.2.0

- Send Managed sign-in and automation mail through RER with no customer mail key, using rer 0.2.23 and its Base adapter. Keep SendGrid and Resend for own-account hosting; reject missing hosted mail. Prefill sign-in email from a valid `login_hint` without submitting it.

- Mark credential fixtures and examples explicitly synthetic so hosted source checks accept them.

- Carry the approved landing style through the app: one token set, pill buttons, tabs and chips, white 24px cards, the lime-edged rail, a single table card with a chip toolbar and typed headers, two-column record page and form, schema builder tiles and review, two-column Settings, the public layout with the landing's ribbon pair, and empty and error cards with Cradle artwork. Labels, routes and behaviour are unchanged except the "Not configured" tag on Settings' AI and Email cards; template cards now appear in the empty Records states and the Create base flow. The installer takes Cradle's look through Base's seed theme hook (`public/rer-theme.css`, with the paper mark generated at `public/brand/mark.svg`).
- Finish the style pass against the independent audit: sign-in, 404 and first-run setup sit above one smooth ribbon valley; the installer adds the forest "Manual setup" card, the ribbon valley and the footer from its own browser module (`scripts/installer/ui/seed.mjs`), leaving Base's copies unchanged; phone grids show records on the first screen (compact pills, one sideways chip row, no repeated lookup or initial state); Settings offers Timezone and Currency as selects and keeps pairs on phones; Home's welcome card and the Records chooser draw a real Records screen; a lone relation card matches the field card's height; the rail is easier to read. The landing is unchanged.
- Publish documentation on the site at `/docs` and `/docs/<slug>`, built at build time from the repository's Markdown listed in `docs/site.json`, in the landing's header, footer and type. A broken link or page problem fails the build.
- Erase a removed person only from their own identity places: whole-token rewrites in rows attributed to them, R2 deletion only through ownership. A copy inside a longer word, another person's name or unattributed content refuses with 409 naming the store until the owner edits it or confirms it is kept unchanged; the receipt lists every place touched.

- Reject noncanonical native JSON names and colliding label overrides before review, preserve business whitespace, and report exact source-capacity counts before serialization.

- Review complete CSV-set and native JSON base imports before schema adoption; retain exact originals, durable jobs, reconciliation and conflict-aware reversal.
- Export portable base JSON and one-download table CSV exits alongside existing selected-view CSV. Public, byte-bound CSV correspondence proposes exact duplicate-label targets and typed null cells for explicit owner review. The leaving guide separates full reviewed returns, ordinary CSV display losses and pending installation-archive integration.
- Open the launch operator doors in the app: CSV import with review, CSV export of the grid, lenses and decision queue in visible order, custom-field definitions in Settings, campaign bulk edit with undo, sample data install and removal, and ownership handover (OPS-002). Launch collections page with keyset cursors (VIEW-007); an offset cursor from 0.1.0 restarts from the first page.
- Hand ownership to another active member after a fresh email-link confirmation; the former owner becomes an admin, exactly one owner remains, and the current owner can no longer be removed (migration 9031 enforces it).
- Run launch automations durably: scheduled dispatch, retries only where a failure is known safe to retry, and uncertain sends kept visibly Unknown with no resend (AUTO-007, AUTO-009, NOTIFY-003).
- rer deploy claims the owner itself and the Lobby offers Sign in before workspace setup is completed (HOME-003). Local sign-in uses the checkout key through rer dev; the captured-mail sender and the development outbox page are retired, and no mail is shown in a page.
- Prepare and download a verified installation `.rer` archive from Settings (owner only; RECORDS-006); global search covers every authorized base (VIEW-005); agents with an owner-issued proposing key can propose schema changes the owner adopts (RECORDS-007).
- Add optional identity-provider (OIDC) sign-in, off until the owner configures and approves it, and the opt-in repair outcome flow with owner-issued grants.
- Ignore the local `exports/` folder so a `rer export` archive is never committed by accident, and drop the installer's stale mention of a development outbox.
- Pin rer 0.2.23. Split Verify into parallel shards within 15 minutes; slow installer and clone journeys run nightly and on release tags.

Migrations `core/1220` and `updates/9026` to `9037` are additive; apply them in order. RELEASE.json lists each one's upgrade step.

Upgrading a local install: stop dev, run `rer export`, pull, then run `rer install` and `rer dev`.

Screenshot: `.github/assets/release/cradle-0.2.0-records-1440.png` (Records at 1440 px: the Project tracker template's Projects grid in local dev).

## 0.1.0

Cradle's first release. The wider product acceptance requirements remain open in
[ACCEPTANCE.md](ACCEPTANCE.md).

- Build tables without AI using text, URL, number, date, select, checkbox,
  linked-record and lookup fields. Review affected records and removed values
  before adopting a schema release.
- Work with human labels, linked records, sorted and filtered grids, grouping,
  saved views, kanban boards and authenticated forms.
- Export the selected view to CSV and preview imports before committing them.
- Start from customer relationships, launch readiness or project tracking.
- Open `/` to a public product landing page for Cradle (contract HOME-002, which
  supersedes the owner identity plate HOME-001): a hero of data streaming into one
  Projects screen, then illustrated sections for tables, views, safe schema changes,
  CSV, automations, read-only AI and ownership.
- Require an explicit owner email for Base sign-in. The legacy production mail
  callback and credentials are no longer admitted; literal-loopback development
  identity remains an explicit local option.
- Run all isolated authoring suites through the separate Docker verification
  profile when its host and image are configured.

Preserve applied migration history, existing records, owner customisations and
current policy when updating. See [installation](docs/installation.md) for Base
bootstrap, provider configuration and setup-token removal.

# Changelog

## Unreleased

- Carry the approved landing style through the app: one token set, pill buttons, tabs and chips, white 24px cards, the lime-edged rail, a single table card with a chip toolbar and typed headers, two-column record page and form, schema builder tiles and review, two-column Settings, the public layout with the landing's ribbon pair, and empty and error cards with Cradle artwork. Labels, routes and behaviour are unchanged except the "Not configured" tag on Settings' AI and Email cards; template cards now appear in the empty Records states and the Create base flow. The installer takes Cradle's look through Base's seed theme hook (`public/rer-theme.css`, with the paper mark generated at `public/brand/mark.svg`).
- Finish the style pass against the independent audit: sign-in, 404 and first-run setup sit above one smooth ribbon valley; the installer adds the forest "Manual setup" card, the ribbon valley and the footer from its own browser module (`scripts/installer/ui/seed.mjs`), leaving Base's copies unchanged; phone grids show records on the first screen (compact pills, one sideways chip row, no repeated lookup or initial state); Settings offers Timezone and Currency as selects and keeps pairs on phones; Home's welcome card and the Records chooser draw a real Records screen; a lone relation card matches the field card's height; the rail is easier to read. The landing is unchanged.
- Publish documentation on the site at `/docs` and `/docs/<slug>`, built at build time from the repository's Markdown listed in `docs/site.json`, in the landing's header, footer and type. A broken link or page problem fails the build.
- Erase a removed person only from their own identity places: whole-token rewrites in rows attributed to them, R2 deletion only through ownership. A copy inside a longer word, another person's name or unattributed content refuses with 409 naming the store until the owner edits it or confirms it is kept unchanged; the receipt lists every place touched.

- Reject noncanonical native JSON names and colliding label overrides before review, preserve business whitespace, and report exact source-capacity counts before serialization.

- Review complete CSV-set and native JSON base imports before schema adoption; retain exact originals, durable jobs, reconciliation and conflict-aware reversal.
- Export portable base JSON and one-download table CSV exits alongside existing selected-view CSV. Public, byte-bound CSV correspondence proposes exact duplicate-label targets and typed null cells for explicit owner review. The leaving guide separates full reviewed returns, ordinary CSV display losses and pending installation-archive integration.

- Adopt the already-landed local owner setup and development outbox emailed
  sign-in path, with server-rendered sign-in capabilities and persisted public
  workspace names, including later renames.
- Require additive Base migration 9002 for outbox storage through local setup
  and deployment; preserve all applied SQL. Development mail remains disabled
  in production.
- Show all seven local setup flags on invalid invocation. Keep the configured
  public identity available when its workspace-name query fails, and wait for
  the phone date row to settle before asserting its unchanged compact layout.

These source changes retain version 0.1.0; they do not establish another release
or completion of the wider product acceptance requirements.

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

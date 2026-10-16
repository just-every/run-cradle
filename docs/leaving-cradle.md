# Leaving Cradle and coming back

The records workspace gives you a complete base JSON download, a one-download CSV set, and the existing selected-view CSV. Settings also downloads a whole-installation archive; its restore path is described below. None of these formats asserts that an unnamed destination can restore behavior it does not support.

The move-in receipt of every import job (see [importing](importing.md#move-in-receipt)) restates, from the job, what each of these exits keeps and what the import did not carry. Importing any of them back into Cradle starts no automations, notifications, mail or webhooks; only your later edits do. Hosted runs and real-account exports remain unproven.

## One base JSON file

Open a base and choose **Export base → Download base JSON**. The download has `format: "cradle-base"` and `version: 1`, validated against [cradle-base-v1.schema.json](../schemas/cradle-base-v1.schema.json) and cross-reference rules.

The allowlist contains the base name and portable ID, ordered tables and fields, durable primary-field ID, field types/required/unique flags, ordered select choices including unused ones, link targets/cardinality/on-delete rules, lookup definitions/results, incoming relation metadata, record IDs and typed values, saved grid/board/other native view fields/filter/sort/group/layout/visibility, and authenticated record-create form definitions. Lookup values are exported and checked against their definitions before import, then recomputed natively. MANY links always use an ordered array, with `[]` for no links; null MANY values are refused instead of silently normalized. Business email fields are ordinary record values and remain included.

Base/table/field names and saved-view names must have no leading or trailing whitespace; noncanonical names and colliding label overrides are rejected before review. Business values, option and incoming-relation labels, and form text preserve the whitespace allowed by their native contracts.

The file excludes operators, stored owner email, sessions, credentials, secrets, policies, grants, audit/history, jobs, uploaded-source custody, physical table names, schema/record/internal versions and storage timestamps. Deleted views are excluded. Source-mapped form actions and unsupported field types are refused explicitly. A base export requires current export access to every table, row and field and authority to read every included saved view and form. A private view belonging to another operator makes the complete export fail rather than disappear. Final set/schema/authority fences reject concurrent insertions, deletions, edits or access changes, including changes in initially empty tables.

To come back:

1. Save the original JSON bytes.
2. Open **Records → Import a base**, select **Base JSON**, choose the file under **Cradle base JSON file**, and leave **Base name** blank to preserve its name. Press **Preview import**, review the native mapping, acknowledge the report, then use **Save review and inspect schema impact** and **Adopt schema and start import**.
3. Apply/resume the durable job to completion and inspect the native reconciliation and report.
4. Export the new base as JSON. On a fresh installation every portable ID is preserved. Canonical JSON comparison sorts object keys and excludes **only `envelope.capturedAt`**, the export capture instant; array order, all data and all portable identities remain compared. No installation identity is emitted.
5. On the same installation, imported IDs already exist. The entire copy receives a bijective map of base/table/field/option/record/incoming/view/form IDs. Compare through that complete map, retaining every field and definition in the comparison. No collision is silently merged.

The verification entry is `pnpm test:records:base-exits`. Its native runtime round trips use the actual source export, shared preview/schema-adoption/job pipeline and independent native readback. Prepared module tests alone are not runtime acceptance; see ACCEPTANCE.md for the current evidence boundary.

## Every table in one CSV download

Choose **Export base → Download all tables as CSV**. One ZIP contains one CSV per table, plus `import-options.json`, `correspondence.json` and a plain guide. Filenames have an ordinal and a sanitized table name; path separators, controls and unsafe names cannot create archive paths or overwrite another table. Every native field is included, primary first, including lookup display. Derived incoming columns are included as projections and paired to their canonical source column in the public mapping choices. No ID column, synthetic record or ambiguity token is inserted into a CSV. The separate, public correspondence file carries scoped source identities. If a derived incoming label collides with another column, only its CSV header receives a numbered suffix; the public mapping retains its original label and pair coordinates.

CSV keeps exact text, including leading formula characters. Open it with spreadsheet formula evaluation disabled or import its text columns explicitly as text; ordinary CSV quotation does not prevent a spreadsheet from evaluating those cells.

Links contain the target's raw exported primary value, quoted as an inner comma-separated list. Primary commas, quotes and newlines receive inner quotation in addition to outer CSV quotation. Booleans use `checked`/empty; dates use ISO; numbers use canonical decimal; selects use exact labels. Unused choices are listed in `import-options.json` because a CSV row cannot carry an unused option.

To come back:

1. Unzip the download. Select **CSV set** and all CSVs **together** under **CSV files** in Import a base. Load `import-options.json` under **CSV review choices** and `correspondence.json` under **CSV correspondence**. Both files are needed for the complete typed return; omit them for an ordinary CSV import. The metadata controls do not count toward the 20 CSV tables.
2. Press **Preview import**. Inspect labels, primary columns, types, ISO dates, complete ordered select choices including unused options, link targets/cardinality, reciprocal pairs, incoming projections and lookup coordinates. Incoming projections preserve the one canonical writer and its link order. Ordinary CSVs are limited to 80 columns. Up to 80 native fields and 80 additional incoming columns are supported per table only with complete correspondence that proves every projection against its canonical writer; acceptance is required before saving that schema review.
3. Open **Review CSV correspondence**. For every reference it shows the source CSV row/column, token occurrence, exact label, original match state and candidate rows with their distinguishing values. Inspect the proposed target and the listed null, empty-text and unchecked-false states, then press **Accept all correspondence proposals**. A target can be changed using its selector; changed choices must be accepted again. Loading files never accepts choices.
4. Acknowledge the complete report, select **Save review and inspect schema impact**, inspect the physical plan fingerprint, and choose **Adopt schema and start import**. Apply/resume to completion and inspect reconciliation. Resume retains the original files and accepted decisions; no upload is needed after a restart.
5. Compare all returned records, ordered links and complete option lists through the one-to-one exported-row correspondence. The two distinct `Twin` rows and all nine recorded-API edge links remain distinct. The importer proves lookup values through the chosen target on every row. Saved views/forms and source custody are not carried by CSV; use JSON for those definitions.

The [correspondence schema](../schemas/cradle-csv-correspondence-v1.schema.json) defines filenames, byte lengths, SHA-256 digests, total row ordinals, exact token occurrences with their `referenceText`, target source rows and complete empty-cell state annotations. Ordinals count parsed records, so quoted newlines do not shift them. Required/unique flags and typed null distinctions are applied only with accepted correspondence. Source IDs never select installed destination records or grant permission. Edited/renamed CSVs, incomplete or nonbijective row maps, wrong labels, targets outside the uploaded set and stale acceptance fail before writes. Hashes establish self-consistency, not authenticity. A complete correspondence file is a schema proposal for the owner to review. Empty incoming projections are valid when their opposite canonical link coordinates agree; they add no writable field. The source parser has an absolute 160-column raw bound, while ordinary CSV remains limited to 80 columns and reviewed native fields remain limited to 80.

Ordinary CSV without accepted correspondence still reports duplicate primary labels as ambiguous and never chooses the first match. Its empty cells cannot distinguish null from empty text or unchecked false. In the API edge example, the raw classification stays eight resolved and one ambiguous; explicit reviewed selection separately accounts for the ninth materialized link. Acknowledging ambiguity alone allows the ordinary lossy return and does not accept correspondence. Missing targets cannot be chosen. The original CSV-imported edge base has six links because unresolved and ambiguous source references were never native links to export.

## The current view as CSV

The existing **Export CSV** action exports only the current view's selected records, query order and visible field order, including computed display. Its codec is intentionally different from the base CSV set: `\N` represents null, leading backslashes are escaped, and relations are native JSON references. Import through the existing equivalent-table CSV preview/commit flow. It can match existing native IDs and recompute lookups; it is not a fresh-base cross-installation relationship format. Keep the capture filename/context for workspace currency/timezone semantics.

## Whole-installation archive maintenance

As the installation owner, use Settings → **Export your installation** →
**Prepare archive**, then **Download verified archive**. Keep your source checkout
and customisations separately; the `.rer` download contains data and files.

Or use `rer export --output exports/workspace.rer`. Restore either download in an
empty installation with `rer import --input exports/workspace.rer --yes`, then
`rer dev`; no answers file is required.
These commands cover the installation DB and FILES through Base portability,
including generated-column schema and recomputed values. Stop the app first.
See [installation archives](installation-archives.md) for credential exclusions,
held jobs, fresh owner admission and explicit reapproval. Settings can download
from the hosted installation; the CLI restores into local storage and does not
restore directly into hosted resources. Records JSON and CSV retain their scoped
product paths.

Archives are format version 2 since the Base `da0c3b7` command refresh. An archive exported before that refresh is version 1 and a normal import refuses it (`restore_refused (legacy_archive_unverifiable)`): update the original installation and export again. Cradle's adapter does not yet support Base's `--legacy-v1` recovery.

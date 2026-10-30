# Importing a base

Open **Records → Base ▾ → Import a base**. Import creates a new base; it does not merge
into an existing one. You choose files, review the proposed tables and fields,
review the schema changes, then adopt and run the import. No AI provider or live
connection to your source account is needed.

## Workbook formulas and links

For an Excel workbook or a Google Sheets snapshot, review can preserve uniform
numeric formulas using same-row references, parentheses and addition,
subtraction, multiplication or division. The proposal names the mapped native
fields and compares every source row's cached result with native arithmetic
before offering a formula field. After adoption, input edits recompute it on the
next read. You can instead choose Number or Text to retain cached values.

Exact forward VLOOKUP and XLOOKUP formulas can propose a One linked record field
and a native lookup. The source formula identifies the target worksheet; its
search range must cover the complete imported primary column, without the
header. Target keys must be nonempty and unique, including letter case, and
every source key must match exactly. Every cached lookup result is checked
against its native target value. Arithmetic can also use a verified numeric
lookup, so changing the linked price updates each linked row's total. Repeated
text and numeric key columns can propose links without a lookup formula too.

VLOOKUP requires FALSE or 0 for exact matching. XLOOKUP supports its default
exact forward search, including explicit 0 match mode and 1 search mode; a
missing-value replacement is unsupported. Approximate, wildcard and reverse
searches, partial ranges, formula-valued targets and unreviewed target primary
columns keep their cached values. Choose the appropriate primary column during
review when the workbook uses another search key.

Review and the move-in receipt explain each refused formula. Mixed definitions,
cycles, unsupported references, nonnumeric arithmetic inputs and mismatched
cached results keep their cached values in the chosen field type. Original
workbook bytes or the read-only Google snapshot, including formula coordinates
and definitions, remain in source custody. Other formula families and broader
reference, date and error semantics remain unsupported. Error cells and missing
cached formula results must be corrected in the source before importing.

## Choose your files

Upload **1–20 CSV files together**, one per table, so links can resolve across the
whole selection. For Airtable, choose **Download CSV** from each table's grid view
menu. A view export contains only that view's rows and columns, so choose the full
view you want to move. Keep the originals and keep filenames unchanged between
previews. You can rename destination tables and fields during review.

You can instead upload one Cradle base JSON file from **Export base → JSON**.
This keeps table and field definitions, select choices (including unused ones),
records, links, lookups, saved views and signed-in forms. Types stay as exported;
change them after import if needed. A fresh installation keeps the exported IDs.
If an ID already exists, the copy receives new IDs and its references are updated
together. User accounts, permissions and internal storage details do not transfer.

## Review the mapping

CSV contains values, not full field definitions. Treat the proposed types as
suggestions. Check every table's row totals and every column's name, type and
samples, then review rejected rows, conversions, skipped values and link problems.
The first column is the table's primary field: the name used to identify a row.

| Field | What to check |
| --- | --- |
| Text and URL | Text keeps the exported value. URL requires valid HTTP/HTTPS addresses. People named in a source column stay text; they do not become workspace members. |
| Number | Currency symbols, grouped thousands and accounting parentheses are normalized. `50%` becomes `0.5`. Invalid values reject the row; changed values are listed in the report with their originals. |
| Date | ISO dates such as `2026-10-15` work directly. For slash dates, choose day-first or month-first explicitly. Invalid dates reject the row. |
| Checkbox | CSV accepts `checked` or an empty cell, meaning true or false. Other text rejects the row. |
| Select | Review the full ordered option list. Distinct nonempty CSV values supply the initial choices; add unused choices explicitly if you need them. Empty cells have no selection. |
| Link | Choose **Link**, its target table, and one or multiple records. A column containing client names may initially be proposed as Select; change it to Link and choose Clients. |
| Lookup | Choose the link and the field to look up. Cradle checks every exported value against the calculated result. If they differ, the column stays Text and the report shows the first mismatch. |
| Formula or rollup | Values can become Number or Text. The formula or rollup itself is not recreated. |
| Date-time or multiple select | Values can stay Text, but timezone-aware dates and multiple-select behavior are not recreated. |
| Attachment or button | Skipped by default. Review the count of nonempty cells being skipped. File bytes and button actions are not imported. |

Use **Describe source behavior (optional)** to record known formulas, rollups,
attachments or other source types that CSV cannot describe. This helps the loss
report; it does not recreate the behavior or change the destination type. Known
source multiple-select choices can also be recorded, including unused choices.
Even unchanged text can lose behavior, so these losses still need acknowledgment.

### Resolve links

CSV links match the target table's **exact original primary text**: case and
surrounding spaces matter. For example, a Projects client value of `Tidewater`
needs exactly one accepted Clients row named `Tidewater`. No match is unresolved;
more than one match is ambiguous. A rejected target row cannot receive a link.
Cradle never silently chooses the first match. Correct the source or mapping and
preview again before continuing.

A link cell can contain several comma-separated names. Quote a name containing a
comma, for example `"North, Inc"`; double a quote inside a quoted name. These
quotes are part of the cell's contents, in addition to any outer CSV quoting.
An empty link cell means no link. Self-links and circular links are applied after
the accepted records exist.

For links shown in both directions, one column stores the links and the opposite
column is calculated from it. Review the proposed pair and any disagreements.
Choose explicitly when several pairs are possible. Exported CSV review choices
name the original link column as **Derived incoming source**; its link order is
kept. For ordinary CSV, a proven reciprocal pair uses the single-record side, or
the earlier column when both sides allow the same number of links.

## Returning an exported CSV set

Cradle's all-table CSV ZIP includes two companion files. Upload `import-options.json`
under **CSV review choices**, and `correspondence.json` under **CSV correspondence**.
They help restore types, options, empty values and exact link targets, including
separate records with the same name. See the [leaving guide](leaving-cradle.md).

Loading these files accepts no choices. In **Review CSV correspondence**, check
each proposed row and target, correct any choices, then choose **Accept all
correspondence proposals**. Targets must still match the primary text in the
uploaded table. Changes to files, types, primary fields, targets or choices require
acceptance again. Required/unique settings and distinctions between empty values
are applied only after acceptance. Raw ambiguous-link counts remain visible even
when you have explicitly chosen a target. Extra incoming link columns must agree
with the original links, including empty cells.

## Review, apply, reconcile and return later

1. Check that rows read equal proposed creates plus rejected rows. Review every conversion, skipped column and link problem. Changing the mapping requires a new preview and acknowledgment.
2. Acknowledge the current losses and errors. Preview writes nothing. If asked to refresh your sign-in, open the workspace and return to preview.
3. Review the schema-impact screen and adopt the changes. This creates the base's schema and a saved import job; the job adds records and links in batches.
4. Apply or resume the job. Check its reconciliation and download **report.json**. A finished request alone does not mean the import reconciled: missing, duplicate, extra or mismatched values remain visible.
5. Keep the job ID to return later. Resume uses the saved review and original files, so you do not need to upload them again. A schema review expires after 30 minutes before adoption; changed files, mappings or schema require a fresh review. Signing in again as the same owner preserves the reviewed work while rechecking access.
6. To reverse it, undo a completed job or roll back a partial job. Continue until reversal finishes and inspect conflicts. Unchanged imported records, links, views and forms are reversed; later edits are kept and reported. Records needed by another base may also be kept. Details follow your current access; a restricted dependency is shown as a redacted reason. **The base schema, original files and reports stay.** Undo does not erase that evidence.

## Limits and refused files

The limits are 20 tables, 10,000 rows per table, 10 MiB per CSV file or JSON table,
100,000 Unicode code points per cell and 200 MiB per native JSON file. Ordinary
CSV allows 80 columns per table. A complete exported CSV return can include 80
fields plus 80 calculated incoming columns, with both companion files and explicit
correspondence acceptance. Options alone do not unlock that larger limit. The
whole upload, including companion files, is limited to 201 MiB.

There is also a combined **300,000,000-byte (300 MB)** limit for the saved import
plan, including originals, parsed rows and planned records and links. Preview
shows the measured size and checks available database capacity before saving a
review; adoption checks again. Individually valid files may exceed the combined
limit. If refused, choose a smaller source view or a smaller self-contained set of
tables and review links again. Nothing is silently truncated.

Invalid UTF-8, unsupported JSON versions or field types, unknown properties,
duplicate IDs, broken JSON links and invalid names fail before import writes.
Native names must not have leading/trailing spaces or collide with another name;
they are not silently trimmed. Original file bytes are retained, including line
endings and quoted multiline cells. The [base JSON schema](../schemas/cradle-base-v1.schema.json)
describes the supported format.

## Import writes start no automations

Applying, resuming, undoing or rolling back an import starts no automations,
notifications, email or webhooks. Records you later create or edit by hand trigger
their matching automations as usual. A [whole-installation restore](installation-archives.md)
also sends nothing; restored automations remain disabled until approved again.

## Move-in receipt

From the job, choose **Open move-in receipt** for a printable page or **Download
receipt JSON** for a file. Both read the saved job and originals, so they work for
completed, partial and undone jobs. They show:

- the job state and review date;
- source filenames, sizes and checksums;
- rows read, created and rejected, with reasons and any records or links still to apply;
- resolved, unresolved and ambiguous links, conversions and skipped values;
- reconciliation results and any reversal counts;
- what each export format keeps, and what you must rebuild, keep in the source or decide you no longer need.

A CSV import does not carry source views, interfaces, dashboards, automations,
permissions, comments, history, attachment bytes, button actions, formula or
rollup definitions. Cradle base JSON also keeps its own saved views and forms,
as described above. A successful records transfer is not a whole-business restore.
The receipt's paper checklist does not save your marks.

### Skipped attachments

For skipped attachment columns, **Download attachment list** gives one CSV row per
nonempty skipped cell, with the source file, row, primary value, column and original
cell text. It includes filenames and URLs when they can be read, and marks other
text as unparsed. It downloads no attachment bytes. Save files from your source
before their links expire; Airtable CSV attachment URLs can expire after a few
hours. Check the source's [attachment URL guide](https://support.airtable.com/articles/9671148410-airtable-attachment-url-behavior).

## What has been checked

Local automated checks use synthetic CSV/JSON bases and recorded API responses,
including duplicate names, links, reconciliation, undo, receipts and automation
silence. The import screen has no live source-account or recorded-API upload flow.
These checks and local browser journeys do not establish a real-account import,
a hosted import or full product acceptance.

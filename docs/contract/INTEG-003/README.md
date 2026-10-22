# INTEG-003 evidence notes

`tests/records-csv-fence.mjs` (`[INTEG-003] ...`, via `tests/helpers/workbook-journey.mjs`) proves, on the emitted Worker, that a percentage-formatted workbook column imports as a percent field, that the base export writes it as a numeric cell with a percentage number format (value unchanged), and that the exported workbook and the base JSON export both return it as a percent field.

Before (pristine main `0d77622`) the same import produced a plain number field: `numberFormat` did not exist.

Not done: workbook exports still keep the intake bounds (20 sheets, 10,000 rows per sheet, 80 columns, 10 MiB). View and base export build the whole snapshot, its CSV rows and a base64 workbook in Worker memory, so a larger export needs a streamed export first. No 50,000-row peak-memory measurement was made. INTEG-003 stays partial; the inherited SYNC-001 duty and the note that no real Google call or consent was used stay in CONTRACT.md and ACCEPTANCE.md.

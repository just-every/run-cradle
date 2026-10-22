# Importing and exporting workbooks

Choose **Import a base → Excel workbook (.xlsx)** to review every worksheet as a table. The first row supplies unique column names. Cradle detects numbers, dates and times from Excel number formats, booleans and text. Formula cells use their cached results; Cradle does not execute spreadsheet formulas. Shared strings and inline text are supported. Repeated text values can propose links; duplicate target labels are reported as ambiguous.

The preview writes no records. Review table names, field types, rejected rows and proposed links, then acknowledge the review and adopt it through the existing import process. Originals and import lineage follow the same custody and erasure rules as CSV imports.

Workbook intake is bounded to 10 MiB compressed, 20 MiB expanded, 256 ZIP entries, 20 worksheets, 10,000 data rows per worksheet, 80 columns and a 100:1 decompression ratio. A refusal names the exceeded limit. Encrypted or legacy Excel files, macro-enabled `.xlsm`, malformed XML/ZIP, external relationships and formula cells without cached values must be corrected and saved as a self-contained, macro-free `.xlsx` file.

To merge into an existing table, open its import control, choose a CSV or Excel file and worksheet, reuse or save the column mapping, and choose a unique matching field. Review creates, changes with previous and new values, unchanged rows and rejected rows. Current row/field policy and record versions are checked again at commit.

**Export workbook (.xlsx)** downloads the current view in its record and visible-field order. **Export base → Download workbook (.xlsx)** downloads the authorized tables. Numbers, dates, booleans and currency use typed cells; multi-select labels follow CSV formatting. Leading `=`, `+`, `-` and `@` in text remain literal strings and never become spreadsheet formulas. Redacted cells retain their redaction display.

For Google Sheets, create a **Google Sheets** connection in the base’s existing Connections settings using the spreadsheet ID as its account and resource. Consent requests only `spreadsheets.readonly`. Select that connection in the import controls and read a snapshot before reviewing it. Cached effective values and date formats are read through the fixed Google Sheets API transport. The same worksheet and mapping controls support a once-only merge, **Enable hourly merge**, and **Pause hourly merge**. The configuring owner’s current permissions are checked on every run; lost rights, invalid mappings or unavailable consent pause the schedule. An unchanged repeat changes no records. Restored schedules are paused and OAuth credentials do not transfer.

Current gaps: exports use the workbook intake bounds, so a larger authorized view/base cannot yet be exported as a single workbook. Percentage display formatting is not retained as native field metadata. These keep INTEG-003 partial. Synced Google Sheets tables remain the inherited SYNC-001 obligation, blocked pending the seed non-goal ruling; scheduled merges do not create synced tables.

Proof uses synthetic recorded Sheets API responses. **No real Google call or consent was used; the owner consent click is NOT RUN.**

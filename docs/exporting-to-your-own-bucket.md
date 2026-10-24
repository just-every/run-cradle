# Exporting to your own bucket

Scheduled warehouse exports write CSV or Parquet to the R2 bucket bound to your
installation, your own S3-compatible bucket, a BigQuery dataset, or a Snowflake
schema through your own named S3-compatible external stage. BigQuery and Snowflake
are tested against network-edge fakes; no transfer to a real BigQuery or Snowflake
account has run.

For S3, enter its public HTTPS endpoint, region, bucket and optional prefix in
Settings. Access keys are sealed with the installation's connection encryption
key and never read back. Configure the trusted egress relay and grant object
write, read and delete permissions. Saving new keys replaces the schedule's keys;
removing the schedule removes its keys. Existing objects retain encrypted custody
credentials until their managed copies are erased.

For BigQuery, provide the project, dataset, location, a table prefix and the
service-account key's client email and PKCS8 private key. The dataset must already
exist. The account needs load-job, table creation, query and record-deletion
permissions. Cradle uploads each exact CSV/Parquet file with `WRITE_APPEND`. Small files use
a multipart load job; files above 900,000 bytes use a resumable upload in 768 KiB
chunks into the same deterministic job ID. A lost part acknowledgement is
reconciled against the upload session’s accepted prefix before another part is
sent; a lost final acknowledgement is reconciled against that job ID.

For Snowflake, provide the account identifier, owner user, database, schema, table
prefix, optional warehouse/role, named external stage, RSA PKCS8 private key and
the stage's S3 connection. Create that external stage in your account first; it
must point at the same endpoint, bucket and prefix. Cradle verifies `DESC STAGE`
before dispatch, creates a typed table if needed, and runs `COPY INTO` through the
SQL API with a deterministic request ID. It never copies from an unverified
stage. The configuring user needs stage, table and SQL permissions.

BigQuery and Snowflake use separate tables for each source base/table and schema
revision, under your chosen prefix. This keeps different schemas distinct and
preserves every source field and value. BigQuery files use stable safe aliases
containing the source field ID, with the original label/field ID → uploaded-column
map in each public export manifest and its immutable erasure custody. Every
destination’s manifest includes source field IDs, exact labels and output column
names, so consumers can identify columns across relabeling. Both CSV
and Parquet use the same mapping, so punctuation, duplicate labels or case-only
label differences never silently rename or merge data. SQL identifiers in Snowflake are quoted. Record erasure reconciles any
outstanding load/COPY, deletes matching `_record_id` rows and independently reads
back a zero count before deleting the staged file. A pending or unknown load
cannot be bypassed by an erasure confirmation.

In Settings → **Scheduled bucket exports**, an installation owner chooses the bases, a full or incremental export, a schedule
its file format, destination and time zone. Use an hourly, daily or weekly schedule; schedules more frequent
than hourly are refused. Creating, changing and removing an export are audited.
Removing a schedule stops future runs; it does not erase files already written.

A full run writes the currently readable records in each selected table. An
incremental run writes records created or changed since that table's last
successful watermark, with explicit tombstone rows for deletions. Use those rows
to remove the corresponding records from your analysis copy. An incremental tick
with no changes writes no data file.

Each table's file adds `_record_id` and `_operation` (`upsert` or `delete`) before
the same field order and value formatting as Cradle's CSV export. Parquet uses flat
UTF-8 columns, with numeric and boolean fields stored as typed DOUBLE and BOOLEAN
columns; blank numeric/boolean values and tombstones use nulls. Structured values
retain the CSV text representation. The MIT-licensed, pure-JavaScript
`hyparquet-writer` writes these files inside the Worker. The first
incremental run establishes a full baseline. Tables without export permission
and fields the owner cannot read are omitted; the manifest explains omitted tables. Objects have stable keys:

```text
<export id>/<base>/<table>/<run time>-full.csv
<export id>/<base>/<table>/<run time>-incr.csv
```

Remote exports partition large tables at record boundaries; the manifest lists every
logical file. The `warehouseTransferBytes` / `warehouseBigQueryFileBytes` budgets
(1 MiB / 900,000 bytes) choose these file boundaries. An individual record above
the budget stays whole and uses a multipart or resumable transfer; it is never
truncated. R2 and S3 use 5 MiB upload parts for large objects, including manifests.
S3 readback uses verified 1 MiB byte ranges. Snowflake receives the completed
staged object with one `COPY INTO` under the original deterministic request ID;
transport parts do not become separate table appends. An interrupted S3 part is
retried with the same upload ID and part number, which replaces that unfinished
part rather than adding another object. Ordinary relay requests retain their
1 MiB limit; signed S3 upload parts have a separate bounded 5 MiB envelope.

An unsuccessful transfer never advances the watermark. Partial multipart uploads
are aborted when the invocation can clean them up. Unknown remote load or erasure
outcomes stay in managed custody and require reconciliation; they are not treated
as a successful empty destination.

A run manifest records row counts, each file’s SHA-256 checksum, the watermark
before and after the run, and a schema hash. Cradle advances the watermark only after writing the object and
reading it back successfully. Use the manifest to determine which files belong
to a completed run.

Exports run with the current access of the owner who configured them. Row and
field policies are checked when the run executes: a scheduled export does not
retain earlier permission to read a record or reveal a redacted field. If that
owner loses ownership or is removed, the export pauses and the remaining owners
receive an in-app notice.

Erasing a person also deletes retained export objects that may contain their
values. Erasure is not confirmed while a managed export copy remains. A downstream
copy downloaded or imported into another system is outside Cradle's custody;
you must erase that copy in its destination as well. A destination deletion refusal or
unconfirmed readback leaves the erasure pending and names the destination cause.

Whole-installation archives include the managed export bucket. Restoring an archive
pauses its schedules and clears their watermarks; review and save a schedule as a
current owner to restart it with a fresh full baseline. Remote credentials never
transfer in an archive. Reconnect a restored destination with matching configuration before managed-copy erasure can be confirmed; this also
restores credentials to that schedule's retained object custody. Removed remote
schedules reappear paused after restore so their custody can be reconnected.

Interrupted transfers retain the original upload identity, export time and job
key. After the five-minute invocation lease expires, the next scheduled run
rechecks the configuring owner's current authority and the captured source
revision before resuming. Changed source is retired before a fresh export;
watermarks advance only after complete byte and checksum readback. BigQuery's
resumable session capability stays encrypted in transfer custody. Installation
archives discard live sessions and leases and require destination reconnection.

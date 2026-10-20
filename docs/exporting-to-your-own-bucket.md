# Exporting to your own bucket

Scheduled warehouse exports write CSV files to the R2 bucket bound to your
installation for exports, separately from its file-attachment bucket. R2 and CSV
are the supported destination and format for this export. BigQuery, Snowflake,
remote S3 endpoints and Parquet are not yet shipped.

In Settings → **Scheduled bucket exports**, an installation owner chooses the bases, a full or incremental export, a schedule
and its time zone. Use an hourly, daily or weekly schedule; schedules more frequent
than hourly are refused. Creating, changing and removing an export are audited.
Removing a schedule stops future runs; it does not erase files already written.

A full run writes the currently readable records in each selected table. An
incremental run writes records created or changed since that table's last
successful watermark, with explicit tombstone rows for deletions. Use those rows
to remove the corresponding records from your analysis copy. An incremental tick
with no changes writes no data file.

Each table's CSV adds `_record_id` and `_operation` (`upsert` or `delete`) before
the same field order and value formatting as Cradle's CSV export. The first
incremental run establishes a full baseline. Tables without export permission
and fields the owner cannot read are omitted; the manifest explains omitted tables. Objects have stable keys:

```text
<export id>/<base>/<table>/<run time>-full.csv
<export id>/<base>/<table>/<run time>-incr.csv
```

A run manifest records row counts, the watermark before and after the run, and a
schema hash. Cradle advances the watermark only after writing the object and
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
you must erase that copy in its destination as well.

Whole-installation archives include the managed export bucket. Restoring an archive
pauses its schedules and clears their watermarks; review and save a schedule as a
current owner to restart it with a fresh full baseline.

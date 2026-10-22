# Measured scale

The target remains 250,000 records per table, 500,000 per base, 500 fields per table and 50 tables per base. The full local profile currently stops at table creation: D1 allows 100 physical columns and Cradle’s current storage uses physical columns for scalar fields. A wider storage layout is still needed. Adoption refuses an unsupported width with the physical-column limit and requested count.

A separate 80-field diagnostic loaded the full record and table counts on an Apple M1 Max with 32 GiB RAM. Thirty serial HTTP samples measured p95 grid 21.53 ms, filter 26.02 ms, sort 104.75 ms, group 277.02 ms, formula 22.43 ms, 10,000-link rollup 175.79 ms and write 70.30 ms, with zero errors. These are measured local results at reduced width, not evidence that the full target or a hosted installation passes. ACCEPTANCE.md records the exact SHA, run ID, p50/p95/p99, profile and result files.

The committed harness is `scripts/scale/run.mjs`. Its default always runs the full declared profile; `--diagnostic-80-fields` explicitly selects the reduced width. It starts the emitted workerd Worker with a real local D1 binding and signed-in owner. Additive SQL supplies the load data. All timed operations use HTTP and consume the response. Optional boolean cells are null. No production fallback changes the requested profile.

Requests beyond the record, field and table limits name the limit, value and current count. Transactional triggers enforce record counts, including imports. Counts are derived, omitted from archives and rebuilt for destination storage; existing data survives upgrade.

The **Measured scale** workflow is dispatch-only, outside push Verify. The hosted stage run is **NOT RUN**: this campaign has no authorized stage or Cloudflare credentials. SCALE-001 remains partial because the 500-field storage layout, full-profile measurements and hosted run are outstanding.

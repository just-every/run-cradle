# Measured scale

The operational profile is 250,000 records in one table, 500,000 in one base, 500 fields in one table and 50 tables in one base. The committed harness is `scripts/scale/run.mjs`; **Measured scale** is a dispatch-only workflow, outside push Verify.

It starts the emitted workerd Worker with a real local D1 binding and signed-in owner. Additive SQL supplies the load data. Grid open, filter, sort, grouped view, formula, 10,000-link rollup and single-record writes are timed through HTTP, including response consumption. Results record p50, p95, p99, error rate, exact source SHA, host class and population. The wide table has 496 optional boolean fields in addition to title, amount, stage and a calculated amount. Empty optional cells are reported as part of the profile rather than as populated data.

Limits are checked at schema preview and record creation; physical-table triggers enforce record counts transactionally, including imports. Counts are derived, omitted from archives and rebuilt for destination storage. Existing records are preserved on upgrade.

The local result and exact measured SHA are recorded in ACCEPTANCE.md after the run. The hosted stage run is **NOT RUN**: this campaign has no authorized stage or Cloudflare credentials. SCALE-001 remains partial even if every local latency target passes. Local measurements are not a hosted performance guarantee.

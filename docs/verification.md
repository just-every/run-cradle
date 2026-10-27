# Verification

`rer verify` runs the complete local check, including the installer and portable
fresh-install journeys. Stop dev/preview first and install the pinned Chromium
with `PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright install chromium`.

Push and pull-request CI builds the app once, checks types and the managed setup
specification, then shares that production build across the parallel shards in
`verification.json`. Every push shard must pass the final `verify` job. The hosted
shard calls `rer verify` with only its declared application commands, retaining
rer's production hosted-output and hydration checks. The other shards call the
application runner directly. All invocations retain the 200-test budget check.

Push verification has eight explicitly assigned cost-map shards, each with three
concurrent lanes. `verification.json` records each command or Launch suite file's
weight in seconds, its lane and any exclusive timing-probe policy. Assignments do
not depend on package file order: the Launch file list is expanded from its package
script, and each file runs directly with that script's loader and Node options.
There is no Node `--test-shard` split. An unweighted new file is named in a fatal
plan diagnostic with the default shard (`balanced-8`) and an instruction to add its
weight and explicit assignment. Stale weights and missing or duplicate assignments
also fail before CI emits a matrix. Updating a weight never relocates another unit.

Each lane copies the tracked checkout into a private workspace, shares the production build and dependencies, retains a Git link for real clone
journeys, and owns its temporary/state directories,
receipts and an authority port below Linux’s ephemeral range. Timing-budget probes run exclusively before any of
the job's concurrent lanes start. The runner waits for every unit, preserves any
failure and prints `VERIFY_UNIT` wall timings plus one GitHub notice annotation per
job. `VERIFY_NPROC` and `VERIFY_RESOURCES` report runner CPU and memory capacity.
Browser shards install Chromium; dependency/browser cache keys remain separate
from tool-only shards. Disk cleanup runs only if the runner has less than 20 GiB
free. The nightly tier retains its three original serial shards.

The `launch-notifications` cost-map unit keeps `pnpm test:launch:notifications`
as its command and contract registration. That command runs each declared
accessibility width in a separate Node process concurrently. Each process owns
its listener port, temporary D1 stores, browser and provider captures, including
its own workerd descendants for interruption tests. Within a width, preferences,
the generated-event matrix and event screens retain their order; inbox erasure
still starts with a fresh runtime and unfiltered provider history. The parent
waits for every child to finish cleanup, requires every width to pass and merges
their receipts in declared width order. Scenario and width wall times are printed
as `NOTIFICATION_SCENARIO` and `NOTIFICATION_WIDTH`; no assertion, mutation,
viewport or timeout is removed to obtain concurrency.

The fresh-clone browser installer, dev-identity archive rehearsal and full
portable-installation restore journeys run on
`v*` release tags, nightly at 03:23 UTC, and through manual **Nightly journeys**.
That workflow includes every push shard too. Their 45-minute worker allowance is
separate from the push workers' 12-minute limit. A normal `rer verify` still runs
both tiers. No test or assertion was removed to shorten push CI.

## Timing evidence and target

The successful [Verify run 38794966939](https://github.com/just-every/run-cradle/actions/runs/38794966939)
on `c18a90c12b2c7a61ee949e6738bd235f6fdb5eba` took 33 minutes 54 seconds on
15 October 2026 UTC. Its workers took:

| Worker | Elapsed |
| --- | --- |
| Build | 1 minute 23 seconds |
| Foundation | 32 minutes 21 seconds |
| Launch | 27 minutes 29 seconds |
| Identity | 24 minutes 58 seconds |
| Records | 19 minutes 54 seconds |
| Runtime | 19 minutes 10 seconds |

The archive round trip alone took 15 minutes 53 seconds. Launch tests spent
24 minutes 12 seconds in one serial package command, while the foundation worker
combined repair, browser and Base suites serially. These measurements motivate
the smaller shards and the nightly clone journeys.

The workflow adapts Base's template at
[`98214f2`](https://github.com/runeditrun/base/commit/98214f26fba60aa180888be903a1815f291b1974)
and the worked [Terrace adoption at `491c863`](https://github.com/just-every/run-terrace/commit/491c863a4b8c9a531cad430c5f28b9859f43cbfc):
a declared plan, reusable release/nightly workflow, cancellation of superseded
runs, browser-aware cache keys and one hosted-output worker. Cradle retains a
shared build artifact to avoid rebuilding the app in each worker.

Push Verify targets a total of 10 minutes or less, at most eight shard jobs and a
longest job no more than 1.5 times the mean. The cost-map split needs a completed
GitHub Actions run on the final candidate before that target can be reported as
measured; the previous run is baseline evidence only.

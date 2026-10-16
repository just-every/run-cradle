# Verification

`rer verify` runs the complete local check, including the installer and portable
fresh-install journeys. Stop dev/preview first and install the pinned Chromium
with `PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright install chromium`.

Push and pull-request CI builds the app once, checks types and the managed setup
specification, then shares that production build across the parallel shards in
`verification.json`. Every push shard must pass the final `verify` job. The runtime
shard calls `rer verify` with only its declared application commands, retaining
rer's production hosted-output and hydration checks. The other shards call the
application runner directly. All invocations retain the 200-test budget check.

The launch Node suite is partitioned into four file shards from its package script,
so newly added files join the same public suite automatically. Browser shards
install Chromium; their dependency/browser cache keys are separate from tool-only
shards. Disk cleanup runs only if the runner has less than 20 GiB free.

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

Push Verify targets a total of 15 minutes or less. The new split needs a completed
GitHub Actions run on the final candidate before that target can be reported as
measured; the previous run is baseline evidence only.

# Verify the Cradle contract

CONTRACT.md is the current acceptance and status source. ACCEPTANCE.md and
CLAIMS.md in this directory's parent and this directory respectively are
its generated views. Earlier acceptance receipts and counts are dated records
in CHANGELOG.md; they do not re-judge the current source.

## Regenerate and check

Run from the checkout root:

```sh
node src/base/contract-docs.mjs write
node src/base/contract-docs.mjs check
rer check
```

For a contract rewrite, generate the ID map and check coverage against the
main commit named by both maps. Read every carried-done journey in
[the audit](contract/DONE-AUDIT.md). A source or unit check does not replace
an end-to-end product journey, and a receipt from another commit does not
establish acceptance of the candidate.

## Product verification

The commands in package.json and verification.json define the actual local
suites and Verify shards. Run the affected public-door journeys through the
emitted Worker and its real local stores. Keep paid and network-edge fakes
in tests, distinguish them from provider sandboxes and real accounts, and
retain failure and unchanged-state observations.

Build the public run site with `rer build --site`. Review the changed public
screens at 1440 and 390. Record the exact source commit for local results and
require Verify to finish successfully on that same commit before readiness.

## External receipts

The Field proof register in CONTRACT.md holds real account, hosted installation,
store, client, prospective measurement and human-review receipts. A not-run
row is visible external work, not a substitute for a seeded product journey.

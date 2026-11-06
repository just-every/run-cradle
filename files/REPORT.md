# sd-cradle-c-f198 — retained review outcomes for hourly Sheets imports

RECORDS-010 remains PARTIAL to PARTIAL. The selected acceptance-1 refused-row review and acceptance-3 corresponding receipt-count gap are closed for the existing hourly Google Sheets source. This is not a whole-clause DONE claim.

Product repository: https://github.com/just-every/run-cradle
Branch: cloud/sd-cradle-c-f198
Candidate: 801883df3f7dae49b33514809f185c953fe6434c
Parent main: 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746
PR: none required; the existing Verify workflow runs on branch pushes.

Status counts before and after: 64 done, 138 partial, 55 missing. All 257 Status IDs and 425 pipe-prefixed rows remain. Test registrations remain 174 of 200; no registration was added or removed. The only plan-row change to relay is the RECORDS-010 evidence and remaining-gap update described here; lane files were neither read nor written.

## Result

A scheduled attempt now retains its run and hourly slot identity, preview ID, all four prospective row counts, row-numbered refusal reasons, and separately named applied create and update counts. A refusal pauses the entire attempt before any import write. Its preview remains available in durable storage and its latest outcome survives duplicate ticks and Worker restart.

GET `/api/v1/records/sheets-schedule?id=<schedule-id>` exposes that result with no-store caching. Authentication, current native owner status, current destination import-preview permission, unrestricted row access, readable mapped and label fields, and current authority guards are checked before returning retained source details. Original attempted field identities remain part of the private read fence even if later configuration changes. There is no new provider, recipient or credential authority.

Enabling a schedule reads the source and computes a new preview under current authority. Refused rows return HTTP 400 and leave the prior paused outcome intact. Repairing the provider response alone does not resume the schedule. A current authorized owner can enable a clean fresh preview; the next tick then applies the proposed writes once.

Implementation: `src/domains/records/sheets/schedules.server.ts:17` (outcome model and accounting), line 21 (mapped and label field dependencies), line 22 (current-authority read), line 38 (fresh-preview refusal), and line 49 (retained attempt and atomic hold). HTTP entry: `src/domains/records/sheets/http.server.ts:13`. Existing CSV preview and commit behavior needed no change. The recorded response fixture in `tests/helpers/sheets-provider.mjs` now permits explicit Orders rows and reports their actual grid length.

## Plan executed

1. Read the current clause, Gap, emitted Worker journey, provider fixture, native preview and admission code. Existing proof covered clean, unchanged, duplicate-slot and lost-authority runs; a refused scheduled preview previously became a generic error without review detail or full accounting.
2. Implement retained prospective counts, separate applied writes, row refusals and preview identity, a current-authority outcome read, and refusal of enabling an invalid fresh preview.
3. Extend the single existing CSV, workbook and Sheets integration registration with the controlled scheduled clock, mixed typed fixture, public outcome and record reads, independent persisted values and versions, committed-import and audit snapshots, event snapshots, restart and authority controls.
4. Run the touched registration, build, typecheck and first-party check. Regenerate and check contract views, restore them, regenerate and check the source lock. Preserve all Status rows and existing assertions.
5. Fetch main and rebase the unpublished commit onto its newer analysis-provenance change. No target-file conflict occurred. Regenerate views and lock after replay, preserve main's changes, inspect all candidate commit identities and trailers, and push through the supplied guard. Re-run the touched checks on the exact published SHA. Publish this separate report packet for fleet return.

`PLAN.md` records the initial full plan. One abandoned test-harness experiment tried virtualizing the whole Worker's clock; native SQL credential-expiry guards correctly refused historical credentials. That experiment was fully removed. The retained fixture passes fixed scheduled timestamps beginning 2026-10-24T12:00:00Z through the real scheduled door while leaving real authentication expiry intact. The earlier 08:00 fixture also admitted unrelated shipped readiness work; the retained noon fixture isolates the named hourly Sheets behavior. No production clock or authentication guard was weakened. Other fixture corrections excluded response evaluation timestamps from record-equality comparisons, distinguished reviewed schedule configuration from an applied CSV import, and used a separate native member sign-in for the non-owner refusal instead of changing the sole installation owner.

## Public-door proof and scoped rubric

The existing registration remains `tests/records-csv-fence.mjs:145`, named “[INTEG-003] RECORDS-001 RECORDS-004 RECORDS-008 RECORDS-010 FIELD-005 CSV, workbook and Sheets imports retain review, mapping, scheduled merge and export fences”. It calls the emitted Worker through `tests/helpers/workbook-journey.mjs`, then `tests/helpers/sheets-journey.mjs`. There is no flag hiding this proof from Verify: the retained records-native worker invokes `pnpm test:records:release`.

| Item | Observed door and outcome | Proof |
| --- | --- | --- |
| R1 — clean and unchanged controls | A fixed-clock scheduled invocation creates one and updates one; the public record query independently shows amounts 31, 20, 40 and 45. The next hour reports two unchanged rows and zero applied writes. A duplicate tick performs no provider read. | `tests/helpers/sheets-journey.mjs:16` to line 24 |
| R2 — refusal review and exact accounting | Recorded Orders contain one update from 31 to 32, one create at 50, one unchanged row at 40 and an invalid numeric row. The public outcome is paused with review_required, prospective 1 create, 1 update, 1 unchanged and 1 refused; applied creates and updates are both zero. Physical row 5 names synthetic-cradle-6 with a numeric refusal. The retained preview ID and details match its durable preview, including independent before 31 and after 32. | `tests/helpers/sheets-journey.mjs:25` to line 35; mutation M1 |
| R3 — all-or-nothing hold and durable pause | Public rows and independent physical rows, versions, actual committed imports, record audit and captured events remain identical. Duplicate delivery and a new Worker over the same D1 keep the same outcome and make no new provider request. | `tests/helpers/sheets-journey.mjs:28` to line 38 |
| R4 — current authority | Anonymous read is 401. An otherwise signed-in owner loses import-preview permission and gets 403 without the retained preview identity; enabling is also refused. Hiding Amount independently refuses the retained outcome. A separately signed-in native member gets 403. | `tests/helpers/sheets-journey.mjs:41` to line 54; mutations M2 and M3 |
| R5 — fresh preview before re-enable and recovery | Enabling while the source is invalid returns 400, with the held outcome and records unchanged. Repairing the source alone leaves the schedule paused. Authorized enabling reads it anew without applying rows; the next tick uses a different preview ID and applies exactly one create and one update. Public values then read 32, 20, 40, 45 and 50; duplicate delivery has no effect. Removing import and connection authority still pauses later ticks without changing records. | `tests/helpers/sheets-journey.mjs:39` to line 65; mutation M4 |

PROBE RECORDS-010 acceptance-1 refused-run review: scheduled Worker at 2026-10-24T14:00:00Z with the mixed recorded Orders response -> paused, review_required, retained preview identity, row 5 numeric refusal; every proposed valid write held and every public value and stored version unchanged.

PROBE RECORDS-010 acceptance-3 receipt counts: current-owner GET of the latest schedule -> prospective creates=1 updates=1 unchanged=1 rejected=1; applied creates=0 updates=0. Clean control -> prospective 1,1,0,0 with applied 1,1. Unchanged control -> prospective 0,0,2,0 with applied 0,0.

PROBE RECORDS-010 pause and current-authority recovery: duplicate scheduled ticks and restart -> same retained paused outcome and no provider read; invalid re-enable -> 400; lost destination permission, hidden mapped field or non-owner -> 403; corrected source alone -> still paused; fresh authorized enable and next tick -> new preview and exactly the expected one create and one update.

## Validation

All exact-candidate checks in `checks-receipt.json` passed: the touched registration (1 test, 0 failures), typecheck, first-party contract check, registration budget (174), and source-lock freshness. `build-receipt.json` binds the successful build to the candidate and emitted bundle hash. No UI, migration, deployment specification, provider pin or workflow was changed; browser-width proof and migration-ledger changes are therefore not applicable to this round.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0, followed by restoring ACCEPTANCE.md and docs/CLAIMS.md from origin/main; ledger=none exit=0.

After restoring generated documents, the exact candidate's document check reports only “ACCEPTANCE.md: generated content differs; run contract-docs write.”, exit 1. This is the explicitly permitted stale generated-view condition. Neither generated document is part of the product commit; the lander owns regenerating them. `candidate-view-check.log` records this check. The source lock is fresh on the deliberately restored candidate tree.

Four separate temporary emitted-bundle mutations were each detected by the same public-door registration, with exit 1 and the expected assertion failure. M1 allowed valid writes from a refused scheduled preview; M2 substituted the outcome's required import-preview permission; M3 removed the mapped-field read fence; M4 permitted enabling an invalid fresh preview. `mutations-receipt.json` records each exact change, failure and location. The emitted bundle was restored byte-for-byte to its original hash afterward. These fault probes are report evidence only; no mutation or report file enters the product branch.

The existing clean, unchanged, duplicate-slot, lost-authority, portable export and credential-exclusion assertions remain. Changed assertions now read the expanded outcome through the public route instead of relying only on private result JSON; their previous counts and version guarantees remain. No registration or acceptance assertion was skipped, weakened or placed behind a width or environment condition. New text contains no literal email address or credential-shaped value; real source paths and public API routes were inspected for publication hygiene. The complete publication scan remains a fleet gate, and is not claimed here.

## DONE riders and retained boundary

There is no DONE claim or judge request. For completeness, each supplied rider is accounted for:

1. PASS for the selected outcomes through the named journey; FAIL for whole-clause coverage, because the explicitly omitted source and automation work remains.
2. PASS locally for this data-loss and privacy slice: real populated rows, allowed writes, refused writes with no effect, denied reads, and detected fault probes.
3. The exact-SHA push Verify stopped only at the permitted generated-view check; functional shards were skipped. The journey is included in its command, and exact-SHA local proof passes, but executed CI journey proof and a whole-clause DONE claim are not asserted.
4. PASS: exact-candidate local receipts and unchanged emitted-byte hash; no earlier-SHA runtime proof is substituted.
5. UNCHANGED: the clause retains its RECORDS-008 inheritance and no additional Base-duty completion is claimed.
6. PARTIAL boundary retained: Evidence and Gap updated, no Status row dropped. Generator write and check pass before restoring views; exact candidate view freshness remains for the lander. The historical Judged-from text was not rewritten.
7. PASS: no acceptance sentence, ID, ruling, inherited duty or coverage mapping changed.
8. PASS locally for the touched authority doors, as R4 records. Wider authority combinations remain omitted.
9. PASS as an honest boundary: only recorded network-edge Google responses are claimed; no live consent, hosted scale or external receipt is claimed.
10. PASS as an interim floor: the existing owner requirement is retained and the new read also requires current destination authority; no broader custody, delegation, consent or recipient policy was adopted. The clause remains partial.
11. PENDING fleet custody: publication scanning, guarded landing, main equality and candidate Run site are not claimed. Evidence publication does not signal product acceptance or landing.

Remaining scope is unchanged: ct contract conversion and generated-document synchronization; scheduled CSV and JSON URLs; emailed attachments under INTEG-002; import automation opt-in; broader mapping, version, concurrency and recovery matrices; imports beyond 80 fields or 100 physical columns under SCALE-002; RECORDS-008 linking and undo; AUTO-USER-009 lifetime and authorship and AUTO-USER-010 consent and recipients. Independent whole-clause judgment and release gates remain outside this scoped result. There is no external blocker to the selected POINTS, all of which passed locally.

## Custody and CI

The guarded product push succeeded on attempt 1, with no force push and no default-branch update. All candidate authors, committers and trailers were checked, including every candidate parent. No published history was rewritten. The clone is clean, and the advertised product branch is checked against the full candidate SHA before cleanup.

Verify run: 42154375283, push event, exact candidate 801883df3f7dae49b33514809f185c953fe6434c. The initial discovery at 03:05:50 UTC reported in_progress; the next observation more than 300 seconds later reported completed with conclusion failure. Build job 127684941826 failed only at “Check generated contract documents”: “ACCEPTANCE.md: generated content differs; run contract-docs write.”. The build, type and shard steps after that check were skipped. Aggregate verify job 127685061764 then failed because its dependency results were success, failure and skipped. Both failed-job archives were read exactly once successfully. This is the supplied generated-view exception, not a product-test failure; no workflow retry, dispatch or view-file commit was made. Six GitHub calls were used. The actual discovery, final observation, jobs and archive receipts are in this packet. The earlier starting-main Verify 42123065555 and Run site 42123065870 were successful on 234432f0b726fba470fb6ce4e1816f50cd082601; they are context only and never candidate proof.

The complete explicitly selected non-secret packet is published only to refs/heads/evidence/sd-cradle-c-f198. Publication scanning, guarded landing and candidate Run site remain with the maintained fleet. No product acceptance, main update or live provider proof is implied by that evidence transfer.

Final disposition: selected POINTS complete; RECORDS-010 stays partial. No real product blocker is known. Hand off the exact pushed SHA under the explicit generated-view READY exception; guarded landing and candidate Run site remain pending.

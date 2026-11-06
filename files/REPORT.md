# sd-cradle-c-f209 report

CAMP-008 remains PARTIAL to PARTIAL. The selected populated-select deletion POINTS pass on the source committed at ed307c7bf56f7b2cd3e1f8cec7264489c21c6a2f, branch cloud/sd-cradle-c-f209. Counts remain 64 DONE, 138 PARTIAL, 55 MISSING: 257 Status IDs and 174 test registrations, unchanged. No DONE claim or acceptance-text change is made.

The required base 0918d1f978aa8f6b5b810257fe65c8fb6e832512 already contained the requested implementation and selected assertions. This run preserved it, merged current main 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746 in 576c635640301474e16b4f75020220c6baa80dc7, then repaired the new native proof's fixture isolation in ed307c7bf56f7b2cd3e1f8cec7264489c21c6a2f. Both product pushes succeeded on their first guard attempt. There is no PR: Verify accepts branch pushes. No production source changes are introduced; production source, migrations and dependency pins equal current main.

The concrete change gives the counted-deletion native journey its own emitted Worker, D1 database and cleanup, with an explicit test-listener port. Its two public installation archives stay in that independent fixture. Every deletion, count-refusal, cancellation, stored-value and unrelated-data assertion remains, and the existing warehouse-erasure journey retains its own preconditions and all its assertions. All five native registrations now pass together. No permanent test registration was added, deleted, skipped or narrowed.

Selected proof map:

- Independently authored values: customFieldDeletionFixture in tests/helpers/launch-custom-field-deletion.mjs expects North and South on two campaigns, a null target value on a third campaign, and distinct retained text values on all three, lines 43 to 49. customFieldDeletionJourney authors the two select values through public campaign commands. The browser authors North and South through the shipped campaign editor.
- Exact count and cancel: customFieldDeletionBrowser in tests/helpers/launch-custom-field-deletion-browser.mjs, lines 25 to 33, reads the two-campaign count in Settings, opens the shipped confirmation, observes its two-value Delete control, cancels and compares complete public snapshots unchanged.
- Unsafe command: refuseWrongCount in tests/helpers/launch-custom-field-deletion.mjs, lines 52 to 58, reads a fresh definition version, submits count 1 for two actual values, receives HTTP 400 naming 2 and compares every public definition and campaign detail unchanged.
- Supported deletion: customFieldDeletionBrowser, lines 35 to 46, clicks Delete field and 2 values, checks committed status and affected 2, waits for the selected definition to disappear and verifies the unrelated definition remains.
- Actual stored rows and preservation: assertDeleted in tests/helpers/launch-custom-field-deletion.mjs, lines 79 to 90, independently checks public campaign reads and installation archives before and after deletion. The before archive holds exactly the independently authored North and South values. The after archive removes exactly that definition and those two stored values; unrelated definitions, values, business fields and tags remain identical. This catches orphaned storage that a joined detail read could hide.

The native registration is the retained campaign CSV journey in tests/launch-operator-doors.mjs. The browser registration is Launch operator doors at desktop and phone in tests/ui-launch-operator-doors.mjs. Both remain reached by the existing Verify commands; no workflow was edited.

Final local results, bound by final-proof-inputs.json to the exact committed source:

- Application build, typecheck and first-party check: exit 0 under declared Node 22.20.0 and pnpm 10.12.4.
- Full native operator-door file: 5 registrations pass, 0 fail, exit 0, native-isolated-fixtures.log.
- Full browser operator-door journey: 1 registration passes, 0 fail, exit 0, at 1440 and 390; 31 screenshots and no page errors, browser-final.log and browser-final/doors-receipt.json. System Chromium uses no sandbox through the cloud-only preload; no test assertion or width is changed.
- Contract generator write and check: exit 0. Generated views are then restored whole from origin/main and are not committed. Checking after that restoration names only stale ACCEPTANCE.md, the expected exception.
- Source lock regeneration and check: exit 0, including the final candidate check. No migration changes, so no ledger command is required.
- All candidate identities, commit messages and trailers pass the fleet audit, including the side parent. Every parent retains all 257 Status IDs and 425 table rows. Source lock is fresh and the final working tree is clean.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0 before restoring main views; ledger=none exit=0.

Verification discovery and diagnosis are in receipt.json and github-budget.json. Prior candidate Verify 42162846812 failed only Check generated contract documents, naming ACCEPTANCE.md; the dependent aggregate guard failed and shards skipped. Actual failed-job archives were read once each. No rerun or dispatch was requested. Final candidate CI status is appended below when observed; no successful workflow from a different SHA is claimed.

Existing capacity defect found, reproduced on unchanged main, not fixed in this scope:

Two public installation exports retain 916 snapshot tables. A later public member.erase operation tries to retire all installation custody in one request and throws IMPORT_D1_REQUEST_LIMIT before completion, returning HTTP 500. archive-erasure-probe.log records the candidate diagnostic and main-archive-erasure-probe.log reproduces the same public case on main. The diagnostic scripts are included. The full native suite without this extra archive precondition passes on main, and the warehouse-erasure case passes alone. The new proof had unintentionally shared its durable archive custody with that unrelated journey. Isolating its real installation fixes test contamination without pretending the pre-existing erasure capacity defect is repaired. The defect is routed separately to sd; it adds no production regression to this change. Temporary diagnostic logging existed only in disposable compiled output, was rebuilt away and is absent from the committed source.

Local failure reproduction before the fixture repair: the full native command on 576c635640301474e16b4f75020220c6baa80dc7 exits 1 under Node 22.20.0. The existing warehouse-erasure assertion at tests/helpers/warehouse-export-journey.mjs:49 receives 500 where 503 is expected. Its exact error and underlying limit are retained in native-node22.log and native-diagnostic.log. One fixture repair was made; the full file now passes. No speculative production repair, weakened assertion or third repair round occurred.

Remaining CAMP-008 gaps are unchanged: acceptance 1 still needs definition editing and the complete declared-type, grid, filter, lens-condition and CSV import and export matrix. Acceptance 2 still lacks other-type deletion, concurrent affected-count changes and broader authority and capacity combinations. Existing ct conversion and generated-document synchronization remain the stated release prerequisites. Whole-clause judgment, publication scanning, guarded landing and candidate Run site remain unclaimed.

DONE-RIDERS assessment, with no DONE request:

1. Full clause unproved; the selected acceptance-2 outcomes are proved as mapped above. Acceptance 1 and the named wider matrices remain gaps.
2. The selected destructive path is tested on populated data in its supported and refused forms, with independent snapshots and archive readback.
3. Actual exact-head CI is reported separately; no claim is made that skipped shards passed. The two journeys remain in existing Verify commands.
4. The final proof-input hashes match the committed candidate. Browser and native proof were rerun after the fixture edit.
5. No new inherited-duty completion is claimed.
6. The partial Gap remains explicit. Generator write and check pass, views are restored as required, and the older Judged from entry is not promoted into an unsupported whole-clause judgment.
7. Acceptance text, ct rulings and every parent Status ID are retained.
8. Valid-count and wrong-count owner paths are proved; broader authority remains unclaimed.
9. No provider or legal boundary is claimed.
10. No new policy default or delegated authority is introduced.
11. Main equality, full-history publication scan, guarded landing and candidate Run site remain the fleet's gates.

Pre-handoff self-check: all named selected user outcomes have retained public-door assertions; no existing assertion is removed, narrowed or hidden; deletion preserves unrelated data; no authority, identity-erasure or capture-replay code is changed. No new screen or icon-only control is introduced. The retained browser capture checks horizontal overflow and serious or critical accessibility findings. Publication scan is NOT RUN in cloud and must be COMPLETE with zero findings at landing. No green candidate Run site is claimed.

Plan rows changed: none. The selected POINTS were already present in the required base, then freshly reverified after correcting fixture isolation. A future campaign must name distinct remaining scope or a changed prerequisite. Full actual plan: PLAN.md. Complete actual check outcomes, failures and terminal product provenance: receipt.json. Product custody and evidence publication are separate.

# PROBE CAMP-008 2 native: two stored select values and one unset campaign; current-version wrong count refused unchanged; confirmed deletion removes exactly definition and two values through public reads and archive
PROBE CAMP-008 2 browser 1440: Settings confirms exactly two campaigns, cancellation unchanged, fresh-version wrong count refused unchanged, shipped Delete removes definition and both values; unset campaign and unrelated data intact
PROBE CAMP-008 2 browser 390: Settings confirms exactly two campaigns, cancellation unchanged, fresh-version wrong count refused unchanged, shipped Delete removes definition and both values; unset campaign and unrelated data intact

Final candidate CI: push Verify 42165120309 completed failure on ed307c7bf56f7b2cd3e1f8cec7264489c21c6a2f. Build job 127719720782 fails only Check generated contract documents; aggregate job 127719808906 fails only its dependent all-workers guard. Shards are skipped. This is the permitted generated-view case, not a successful test run. The exact candidate's local contract check names only stale ACCEPTANCE.md, while write then check succeeds before the required main-view restoration.

VERIFY_REPRODUCED {"head":"ed307c7bf56f7b2cd3e1f8cec7264489c21c6a2f","job":127719720782,"command":"node src/base/contract-docs.mjs check","test":"Check generated contract documents","exit":1,"failure":"ACCEPTANCE.md: generated content differs; run contract-docs write.","node":"22.20.0","expectedGeneratedViewFailure":true}

The reproduction above is the expected generated-view check, not a failed product assertion or a source repair. Public copies of failed-job logs omit runner environment listings; actual error and command lines remain.

Final failed-job archive reads succeeded once each: build 127719720782 names only stale ACCEPTANCE.md; aggregate 127719808906 fails the dependent worker guard. All 10 allowed GitHub calls are recorded. No workflow rerun or dispatch occurred. Both public failed-log copies retain the actual commands and errors and omit runner environment listings. Final handoff uses the explicit generated-view exception, with all local touched checks passing.

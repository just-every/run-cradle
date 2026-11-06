# sd-cradle-c-f216 results

CAMP-013 remains PARTIAL → PARTIAL. The required base already contains every selected one-hour, single-use undo assertion. No implementation defect was demonstrated, no new test or acceptance point was added, and no DONE claim is made. This round retained that proof, merged current main, and reran it on the resulting candidate.

Repository: just-every/run-cradle
Branch: cloud/sd-cradle-c-f216
Candidate: 76d830686c4c1eb587f776d30daf9e92369e3a20
Required base: 0fe10fa1ecc655a2f18bc7cb35f8fad7a15a4105
Integrated main: 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746
PR: none required or created; Verify has a push entry point.
Counts before and after: 64 DONE, 138 PARTIAL, 55 MISSING; 257 Status rows retained from both parents. Registrations remain 175 of 200. The required base already added the selected registration; this round adds none. No assertions were removed, narrowed, skipped or placed behind a new width condition.

## Completed plan

Read the inline plan extract, rulings and DONE riders; read the complete CAMP-013 clause and Status Gap, runtime helpers, native journey and bulk implementation. Installed dependencies with the repository pin and ran cloud-wrapped setup and build. Integrated current main with a merge, preserving the already-published base and main history. Generated and checked the contract views, restored both generated files from main, regenerated the source lock last and checked it. Checked every candidate author, committer and trailer, including the base side parent. Pushed only the named branch using the fleet guard. Ran native and browser proof and saved actual receipts outside the product tree. Evidence publication and the completed CI inspection are recorded in their own receipts.

The only new commit is the integration merge. It carries current main's analysis provenance change and its existing assertions. The selected undo implementation, journey and CAMP-013 Evidence and Gap already existed in the required base. Acceptance text, status, homepage, workflow and all broader clause gaps remain unchanged. No migration was added or edited. No plan row or lane file was edited in this cloud workspace; the lane should record this selected scope as already complete and freshly verified.

## Selected proof and observed public outcomes

The retained registration is tests/launch-operator-doors.mjs, line 331: “[CAMP-013] two-campaign bulk status undo restores once before one hour, refuses at and after expiry, and replays without effects”. It calls tests/helpers/launch-bulk-undo.mjs end to end. Public command requests and campaign HTTP readbacks are primary evidence; 17 supplementary table snapshots catch hidden record, activity, admission, event and outbox changes.

- Lines 18–31 create six real campaigns through native commands, with distinct prior statuses independently captured through campaign HTTP reads. Their versions are captured before any bulk operation.
- Lines 32–49 independently control application time T, apply status Blocked to three separate two-campaign batches, assert evaluatedAt equals T and undoExpiresAt equals T plus 3,600,000 ms, and publicly read both changed statuses and incremented versions.
- Lines 53–69 undo the first batch at T plus 3,599,999 ms and publicly read each campaign's own original status, one further version increment and exactly one undo activity entry.
- Lines 71–82 attempt a second undo with a new command ID, require the validation refusal, compare every snapshot and public campaign readback unchanged, then replay the original successful envelope and require the same result with no new record writes or activity.
- Lines 84–92 attempt unused separate batches at T plus 3,600,000 and 3,600,001 ms, require validation refusals, and compare the full snapshots plus each affected campaign's public response unchanged.

PROBE CAMP-013 expiry: native bulk apply at T on three separate two-campaign batches -> each undoExpiresAt is T + 3600000 ms
PROBE CAMP-013 before-expiry: native undo at T + 3599999 ms -> both distinct prior statuses restored, versions advance once
PROBE CAMP-013 single-use: new undo command before expiry -> refused unchanged; original successful command replay -> original result and no writes or activity
PROBE CAMP-013 exact-expiry: native undo at T + 3600000 ms -> refused; both campaigns and all effects unchanged
PROBE CAMP-013 after-expiry: native undo at T + 3600001 ms -> refused; both campaigns and all effects unchanged

These outcomes were freshly exercised in native-undo.log on the candidate: 1 test passed, 0 failed, no skipped tests. The complete existing operator-door file also passed on this exact candidate: 6 tests passed, 0 failed, 0 skipped. Its 183-second run is recorded in native-doors.log and the final local receipt, including the ownership, removal and erasure journey.

## Local verification and browser proof

- Frozen dependency installation, noninteractive owner setup and emitted Worker build: exit 0. The rer package pin remains 0.2.80. The supplied toolchain selected pnpm 10.12.4 and available Node 24.19.0, satisfying the repository's minimum Node 22 requirement; CI uses its pinned Node 22.20.0.
- pnpm check:types: exit 0.
- pnpm exec rer check --profile first-party: exit 0.
- node tests/helpers/test-budget.mjs: exit 0, 175 registrations.
- Selected native HTTP test: exit 0, 1 passed, 0 failed. The complete existing native operator-door file also passed all 6 tests with 0 failures and 0 skips.
- Retained operator browser journey: exit 0, 1 passed, 0 failed, 25 screenshots at 1440 and 390, no page errors. The existing capture helper also checks sideways overflow and serious or critical accessibility findings. Actual browser and doors receipts accompany the four relevant bulk selection and applied screenshots.

Browser execution used /usr/bin/chromium with --no-sandbox via a temporary external preload. No tracked test assertion was changed. No screen was edited. The screenshots were inspected at both widths. All test fixtures and provider edges were synthetic; no live provider or held key was needed.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0

Both generated view files were restored from origin/main after successful write and check. The exact committed views can therefore be stale by design. The source-lock regeneration and check also pass on the exact committed candidate, and the product worktree is clean. Before the merge commit, all 257 Status IDs from each parent remained; all 425 table lines in each parent remained in the staged contract. The merge changes no contract rows.

## CI and custody

Candidate push Verify: 42168637203, event push, exact head 76d830686c4c1eb587f776d30daf9e92369e3a20, completed failure. Failed-job logs confirm the only root failure is build job 127731025403, step “Check generated contract documents”: “ACCEPTANCE.md: generated content differs; run contract-docs write.” The exact command also reproduces locally with exit 1 after restoring main’s generated views. Job 127731133040 then fails its final gate because the build failed and shards were skipped. This is solely the explicitly permitted generated-view exception. Both failed-job archives were read once successfully; no blocked blob download or transport retry was needed. Six GitHub command invocations were used, including one initial discovery with an incorrect full main SHA that returned no runs; that response was not used as evidence. Status discovery was not repeatedly polled. No workflow was edited, dispatched or rerun, and no speculative repair was attempted.

Integrated main has exact-SHA successful Verify 42153995434 and 42151556605, plus Run site 42153995317. Those runs establish the state of the integrated main only; they do not substitute for candidate Verify. Candidate publication scanning, guarded landing, main equality and candidate Run site are unclaimed and remain with the fleet. Evidence publication does not grant READY or landing custody.

## Remaining gaps and DONE riders

Acceptance 1 still needs selection of 500 records, both Grid and Cards lens doors and the complete owner, phase, status, tag, custom-field, archive and restore matrix. Acceptance 2 still needs first-invalid-record atomicity and complete per-record and bulk attribution. Wider undo concurrency and authority combinations remain unproved. Ct contract conversion, generated-document synchronization and independent whole-clause judgment remain explicit release prerequisites. No new policy default was adopted. The planner's selected scope is complete; this report makes no whole-clause DONE claim or judge request.

1. FAIL for whole-clause DONE: the broader acceptance outcomes above remain outside the retained journeys' selected scope.
2. PASS for selected scope: the dangerous undo path succeeds before expiry, then refuses used and expired batches unchanged, using independently captured populated readbacks and snapshots.
3. NOT ESTABLISHED for whole-clause DONE: local candidate proof passes; recorded candidate Verify fails only its permitted generated-view check, which skips downstream shards.
4. PASS locally: native and browser proof run on the exact candidate; no relevant byte changes afterward.
5. UNCHANGED: this round adds no inheritance claim or acceptance text.
6. PARTIAL accurately retained: the Gap preserves omitted work and prerequisites; generator write and check pass, generated views are deliberately restored for the lander.
7. PASS: no acceptance point, rider or clause ID was changed; no row was dropped.
8. PASS only for selected reuse and expiry safety; broader authority combinations stay in the Gap.
9. PASS boundary: synthetic native proof only; no provider, legal, live-account or scale claim.
10. NOT APPLICABLE: no new custody, consent, spending or authority policy choice.
11. PENDING fleet: no landing, scan or candidate Run site claim.

## Pre-handoff self-check

The retained native assertions would fail on a wrong expiry value, failed restoration, wrong restored version, an accepted used or expired undo, or replay writes in the measured records and side effects. No assertion was removed or weakened. Replay was exercised with the original successful command; credential revocation and person erasure remain broader retained journeys and are not claimed as new selected coverage. No new data exposure, outbound action, UI control or email fixture was introduced. No source or test repair was needed. Source lock is fresh. Publication scan status is unestablished in this cloud and belongs to the maintained lander. No external dependency blocks the selected undo proof; the wider clause remains PARTIAL.

## Final handoff

The pushed branch and exact head are confirmed by product-remote.txt. The tree is clean and all local checks and native and browser journeys pass. READY uses the brief’s explicit generated-view exception; it is not a claim that skipped candidate shards ran. The fleet must regenerate views, require its exact-SHA checks and publication scan, then own guarded landing and candidate Run site. The completed selected proof needs no new implementation slice. No claim of clause DONE, publication completion or main equality is made.

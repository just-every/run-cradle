# sd-cradle-c-f214 results

CAMP-009 remains PARTIAL to PARTIAL. The required base already implements every selected queued-run POINT, so this continuation needs no source edit, new assertion, new product commit or plan-row change. It returns the retained work on cloud/sd-cradle-c-f214 at 5dddd01d5ace8d43a44f888031fc69a3f789ff61. No PR is required: Verify has a branch-push entry point. No selected-point blocker was found. No DONE claim is made.

Counts remain 64 DONE, 138 PARTIAL and 55 MISSING, totaling 257 Status rows. Registrations remain 174 of the 200 cap. No existing assertion was removed, narrowed, skipped or moved behind a condition. No new test or duplicate test was added or deleted.

## Plan and scope

The complete executed plan is PLAN.md in this packet. The supplied inline brief, plan extract, rulings index, Cradle rulings and DONE riders were read as the governing context. The full CAMP-009 requirement, both acceptance sentences and its complete Status Gap were read from the required repository pin. Other historical plan entries were treated as context. This run did not read or write any fleet inbox or state file, rebuild the campaign plan, change acceptance text or change a different clause.

Inspection found the selected proof already present in the required base. The meaningful action was to validate the existing candidate and preserve its custody, with all evidence kept outside the product tree. The pinned rer remains 0.2.80; no Base refresh, migration, UI, homepage or logo change occurred.

## Proof map

The existing registration is in `tests/launch-installed-event-control.mjs` at lines 11 to 13: "[CAMP-009] [AUTO-001] [AUTO-003/004] [AUTO-006] definitions version every edit ... archive and disable cancel queued work before any effect ...". It invokes `verifyPublicQueuedCampaignArchive` from `tests/helpers/launch-queued-campaign-archive.mjs`. The following selected-point rubric was scored by executing that registration against the actual emitted Worker and D1. Public commands and public reads establish behavior; supplemental D1 reads only correlate committed event, run and outbox identities. The helper never seeds an artificial automation run or execution row.

1. Owner-authored enabled definitions and committed events: helper lines 8 to 35 create a campaign, its risk and unrelated work, save three enabled add-activity definitions through `launch.automation.save`, then commit the real campaign update, risk update and unrelated risk creation. The two archived effects have distinct activity messages. MET.
2. Queued admission with delivery held: lines 31 to 55 deliver each committed command through the emitted event queue and publicly read exactly one Queued run per automation, the expected event identity, definition version, subject identity, untouched action, zero affected records and no start or finish time. Read-only outbox observations prove execution is still pending. MET.
3. Current-version public archive cancels retained work: lines 57 to 82 read the current campaign revision, call `launch.campaign.archive` with it, read archived lifecycle and the incremented revision, then publicly read both original runs as Cancelled with a finish time and no attempted action. The corresponding execution outboxes are cancelled while unrelated execution remains pending. MET.
4. Retained-message replay cannot execute either canceled effect: lines 83 to 101 repeatedly deliver the same retained execution identities, compare full canceled histories to their retained snapshots and publicly read campaign activity with neither distinguishable effect. MET.
5. Scheduled ticks and Worker restart retain cancellation: lines 102 to 110 cross a scheduled tick, restart the Worker against its existing durable storage, repeat retained execution delivery, cross another tick and confirm histories and absent effects remain unchanged. MET.
6. Unrelated queued work remains live and idempotent: lines 81 to 82 establish it remains queued after archive; lines 95 to 99 establish one Succeeded run, one Complete action and exactly one public activity effect after repeated delivery, both before and after restart. The enclosing registration retains its previous disable, event-erasure, definition-version and run-history assertions. MET for the selected point.

PROBE CAMP-009 queued admission: publicly save enabled owner automations and commit campaign and risk updates; deliver their actual command identities to the emitted event queue while execution delivery is held -> public history shows one Queued run for each, with a Pending unstarted action and a pending execution outbox.
PROBE CAMP-009 archive cancellation: read the current campaign version and submit launch.campaign.archive -> campaign becomes archived at the next version; public campaign and risk histories show Cancelled, zero affected records and unstarted actions; both execution outbox rows are cancelled.
PROBE CAMP-009 replay and restart: deliver retained execution messages twice, cross a scheduled tick, restart the Worker, replay twice again and cross another tick -> canceled histories remain identical and neither distinguishable activity effect appears.
PROBE CAMP-009 unrelated control: retain the unrelated queued execution and deliver it repeatedly -> one Succeeded run, one Complete action and exactly one activity effect before and after restart.

These probes are assertions executed by the retained registration, not new product endpoints. No additional provider, scale, mutation, browser or installation dispatch was introduced. The selected work changes no screen, so there is no changed-screen browser proof to capture. Existing broader browser evidence was read but is not claimed as freshly executed here.

## Whole-clause boundaries

Acceptance 1 is still not fully proved: other child-subject and multi-subject queued runs, in-flight combinations, outstanding readiness cancellation, complete withdrawals from lenses and digests, overdue and portfolio counts, search withdrawals and held NOTIFY-002 mail disposal remain outside the selected proof. Acceptance 2 still needs the complete child-preservation matrix. Existing NOTIFY holds and installation-owner authorship, transport and credential-lifetime restrictions remain unchanged.

Ct contract conversion and generated-document synchronization remain the named release prerequisites; independent whole-clause judgment remains outstanding. They do not block this selected-point validation. The run does not take another clause while CAMP-009 remains assigned. No scope ruling or new policy default was needed.

## Checks and mechanical custody

Dependencies were installed from the frozen lockfile. Noninteractive setup ran through cloud_run with the fleet owner identity and passed. The fleet hook was installed after cloning and reinstalled after dependency and setup steps. The emitted Worker build passed through cloud_run. Typecheck, first-party check and test-budget inventory passed. All five tests in the retained event-control file passed on the exact candidate, with zero failures, skips or cancellations, in 377.496 seconds using Node 22.20.0. The suite also passed its existing duplicate in-flight delivery, bulk and committed-import, definition/history and revoked saved-authority controls. The bulk test logged an intentionally refused mail-provider request from its model-only fake edge; the registration still passed. Full test results and final custody are recorded in RECEIPT.json and the selected raw logs.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock, then node scripts/edition-authoring/cli.mjs check exit=0; views=node src/base/contract-docs.mjs write, then node src/base/contract-docs.mjs check exit=0; ledger=none exit=0.

The generator wrote one derived document and its immediate check passed. Both generated views were then restored whole from origin/main as instructed. The committed-tree check consequently reports exactly "ACCEPTANCE.md: generated content differs; run contract-docs write." with exit 1. This is the permitted generated-view-only failure; neither generated view was committed, and it needs no source repair. The source lock was regenerated last and its check passed with no working-tree change. No migration changed.

Current main was fetched twice and the prescribed rebase was run before candidate publication; both reported the branch up to date. Origin main was 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746. The candidate retains that main and the required base work. All parent Status rows remain; no commit was needed in this continuation, and the working tree is clean.

## CI and release boundaries

The pre-existing exact-SHA push Verify is 42160094905. Plan job 127703450710 passed. Build job 127703505325 failed only at "Check generated contract documents"; its downloaded failed-step log records the stale ACCEPTANCE.md diagnostic above. The dependent aggregate job 127703592042 failed and workers were skipped as a consequence. No runtime assertion failed in that run, no repair was attempted and no duplicate workflow was dispatched or rerun. This is the brief's permitted generated-view exception, not a claim that the runtime shards ran green.

The named product branch was pushed successfully on the first guarded attempt. Its own exact-SHA push Verify 42165957266 completed with the same permitted generated-view-only failure: build job 127722410446 failed at "Check generated contract documents" with the same stale ACCEPTANCE.md diagnostic; dependent aggregate job 127722499768 failed and runtime workers were skipped. The failed build log was read once. Six GitHub calls were used in total, with no status-poll loop. Product push and final branch-run discovery are recorded in RECEIPT.json. Publication scanning is not run by this cloud builder; COMPLETE scan status, guarded landing, resulting main equality and candidate Run site remain the fleet lander's independent gates. No receipt here is a substitute for them.

## DONE riders and self-check

No clause flips to DONE, so no judge request is issued. Row 1 is met only for the selected subset, not for the entire acceptance sentence. Row 2 uses actual populated data and contrasts canceled effects with a successful unrelated effect. Row 3 remains whole-clause unestablished: exact-SHA Verify stopped before its runtime shards because of the permitted generated views. Row 4 uses this exact candidate locally. Row 5 introduces no new inheritance. Row 6 preserves the full partial Gap and Evidence, with generated-view synchronization left for the lander. Row 7 changes no acceptance point. Row 8 claims no wider authority matrix. Row 9 claims no live-provider or legal boundary. Row 10 introduces no policy choice. Row 11 is pending the guarded lander. These are reasons to retain PARTIAL, not to manufacture DONE.

Pre-ready self-check: the selected behavior is exercised on real admitted runs; the old disable and erasure assertions remain in their existing registration; retained execution replay is fenced; no source assertion or visible behavior was changed; no screen was touched; the lock is fresh. Broader revoked-authority, person-erasure and held-mail matrices are not newly claimed. No new fixture, credential, address or provider-shaped key was added to the product. Candidate publication scanning and Run site are explicitly unclaimed.

## Plan return

Plan rows changed: none. CAMP-009 stays PARTIAL to PARTIAL, selected queued-run POINTS already implemented in the required base and freshly verified by this continuation. Keep the complete existing remainder and ct prerequisites held. This is not new DONE throughput and should not be counted as an additional clause promotion.

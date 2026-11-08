# sd-cradle-c-f42-fix1 final report

Pushed `cloud/sd-cradle-c-f42-fix1` at `f167c22c517ef5560ebc5bc3b3e33cc850fb8a80` in just-every/run-cradle. The exact branch ref is confirmed in remote-custody.txt. No PR is required by this seed's declared rules; none was created. The cloud did not land or deploy the product.

The final change removes the added 320 Manual records invocation from the already-full base shard, runs the complete core and ordered supporting journeys in two isolated Node processes, replaces fixed per-capture network-idle delays with rendered-state/font/paint readiness, and waits for the saved heading before testing reload persistence. Supporting fixture migrations call spawnSync; a separate Node event loop prevents those migrations from starving the core browser's existing timers. Every prior registration, assertion and viewport is retained. No timeout is raised and no shard is rebalanced. Settings capacity matches main and is untouched by this fix.

All required measured commands pass on this exact head, with Node 22.20.0, pnpm 10.12.4, real emitted Worker/D1 fixtures and /usr/bin/chromium --no-sandbox. Each runs through cloud_run and `perl -e 'alarm 1200; exec @ARGV' --`.

| Command context | Seconds | Result |
| --- | ---: | --- |
| 320-pixel Manual records command | 358.965 | passed, 5m58.965s |
| CRADLE_RECORDS_BROWSER_WIDTH=1440 pnpm test:records:browser | 380.378 | passed, 6m20.378s |
| CRADLE_RECORDS_BROWSER_WIDTH=390 pnpm test:records:browser | 441.359 | passed, 7m21.359s |

The serial 320 baseline was 568.012 seconds; the final command saves 209.047 seconds (36.8 percent). Even the final 320 command plus the prior 515-second base job totals 873.965 seconds, exceeding the unchanged 720-second allowance, so its extra base-shard invocation remains removed. Standalone 320 proof and the existing other 320 coverage are preserved. These timings measure the actual per-width shard commands; no claim is made about running every width in one unselected local invocation.

Typecheck, source integrity, test budget, source syntax, clean checkout, generated-view restoration and fleet identity/trailer checks pass. Browser screenshots at 1440 and 390 are included, along with full actual command logs and structured core/home/relation receipts. Tests remain 175 -> 175. Clause counts remain 64 done / 138 partial / 55 missing (257 total). MOBILE-001 remains partial -> partial; only its inherited f42 Evidence/Gap differs from main. Main's newer SET-001 judgment is preserved.

Exact-SHA Verify [42450910046](https://github.com/just-every/run-cradle/actions/runs/42450910046) is completed/failure solely because build job 128639768394 reports `ACCEPTANCE.md: generated content differs`; plan passes, shards skip, and aggregate job 128639831360 fails as a consequence. Both failed-job logs were read once. This qualifies for the user's explicit generated-view READY exception. It is not a claim that GitHub ran the browser shards. The Mac lander must regenerate views and run its normal publication/landing gates. The cloud cannot run that publication scan. There are no remaining product blockers. Ten GitHub calls were used.

Product commits and READY custody are separate from report-only evidence publication. The full packet is to be published only at evidence/sd-cradle-c-f42-fix1. Its publication does not land or accept the product. The clone and node_modules are removed after publication; reports remain outside the clone.

CLAIM MOBILE-001 PARTIAL points=none tests=tests/ui-records-builder.mjs#[SNAP-002] Manual records browser journeys and concrete UI review corrections
DEFAULT MOBILE-001: Preserve the existing partial judgment; no whole-clause completion claim.
GAP MOBILE-001: Complete 320/390 coverage of every target journey, including currently unbuilt features and outstanding field reviews, remains unproven.

The original plan and complete execution record, including failed/deferred intermediate attempts, follow. Their intermediate SHA statements are historical; the final candidate above is authoritative.

# sd-cradle-c-f42-fix1 plan and results

Repository: just-every/run-cradle. Product branch: cloud/sd-cradle-c-f42-fix1.

Plan:
1. Start at 8a060233ba158a19cf2ec3a7bf3dc90027a929de and merge fresh origin/main, retaining main judgments and the existing f42 MOBILE-001 evidence/gap only.
2. Measure the complete records browser command and isolated 320-pixel Manual records command, each with a hard 1,200-second Perl alarm. Trace browser checkpoints to identify slow work without weakening assertions or increasing timeouts.
3. Fix the shared bottleneck or remove only the optional added per-shard command if it cannot fit. Preserve registrations, journeys and clause status. Do not rebalance the plan.
4. Run touched checks, typecheck, contract generation/check, restore generated views from main, then regenerate/check the source lock last.
5. Publish the named product branch with fleet identity/hooks, poll exact-SHA Verify within ten calls, and publish this report plus actual non-secret receipts separately under evidence/sd-cradle-c-f42-fix1.

Baseline: 175 test registrations; MOBILE-001 partial; overall 64 done / 138 partial / 55 missing (257 total). No status flips intended.

Publication scan: the cloud cannot run the fleet publication scan; the Mac landing gate retains it. Product diff and selected public evidence are checked locally for credential-shaped values.

Decision: remove only the added 320-pixel Manual records command from the base shard and restore its non-browser flag. The prior exact-SHA main-derived base job took 515 seconds, leaving 205 seconds of the unchanged 720-second job allowance. The added 320 command already exceeded that allowance during normal successful progression. No assertion, registration, width selector, timeout or other shard assignment changes. The 320 command stays available for standalone measured proof; existing 320 Home/detail/calendar/history coverage stays in its existing workers.

Integration: main initially belonged to the required 8a060233ba158a19cf2ec3a7bf3dc90027a929de starting merge, then advanced to 69c49e7 before the candidate commit. Merged fresh main without rebasing published history. Resolved the source lock by regeneration; took main CONTRACT.md whole and reapplied only f42 MOBILE-001 evidence/gap, preserving main SET-001 attribution judgment. Preserve f42 MOBILE-001 partial evidence/gap, with no further source clause edits. Generator write/check passed; generated views restored whole from origin/main before source locking.

Product head: 3c51ebd19e07021a2a517e2228383e5e15d54987. Initial candidate push succeeded; a further timing fix was then published without rewriting it. No PR required by repository rules. All 11 candidate commits, including side parents, pass fleet/owner identities and trailer checks. No OpenAI/Codex coauthors. No raised timeout; timeout diff includes context and an existing newly bounded failure screenshot at 5,000 ms.


Timing diagnosis and further fix: the unmodified 320-pixel command passes in 568.012 seconds (9m28s), exceeding its own eight-minute target and far exceeding the base shard's remaining 205 seconds. The records command does not call Settings capacity; its measurable excess is in the serial records harness. The capacity helper matches main and was left intact. It serializes an approximately six-minute core records flow and approximately three minutes of supporting journeys that own separate runtimes and databases. The existing test now awaits those two independent streams concurrently with Promise.allSettled, propagating either rejection only after both streams finish cleanup. No assertions, registrations or widths are removed. Concurrency is bounded to two streams; every supporting journey still runs in order within its own stream. No CI shard rebalance.

Second product head: 5010e1ffdc38a44c6a3e9bdd2d786c588b9bc614. Pushed with the existing branch history intact after another fresh main fetch/merge (already current). Source lock regenerated last and checked. All 12 candidate commits pass identity and trailer review. Actual exact-head timing receipts follow below.


Measurement method: each command is a real Node 22.20.0/pnpm 10.12.4 run against the emitted local Worker with synthetic data, wrapped by `perl -e 'alarm 1200; exec @ARGV' --`. The browser launcher shim only selects /usr/bin/chromium, adds --no-sandbox, and logs checkpoint/evaluation durations. It changes no assertion, fixture or timeout. The cloud subreaper waits for descendants. Records command measurements select exactly the same 1440 or 390 width as the corresponding CI shard; the separate command selects 320. Results are local cloud measurements, not hosted phone-device or screen-reader proof.

CLAIM MOBILE-001 PARTIAL points=none tests=tests/ui-records-builder.mjs#[SNAP-002] Manual records browser journeys and concrete UI review corrections
DEFAULT MOBILE-001: Preserve partial status and the prior bounded f42 claim; complete coverage is not claimed.
GAP MOBILE-001: Every target journey at both phone widths, including unbuilt features and the remaining field proof register, remains unproven.


Exact-SHA Verify: run 42448917105 on 5010e1ffdc38a44c6a3e9bdd2d786c588b9bc614 completed/failure solely at build job 128633756520, "Check generated contract documents": ACCEPTANCE.md generated content differs. Plan passed; shards skipped; aggregate verify job 128633816533 failed because build failed. Both failed-job logs were read once with gh run view --job --log-failed, within six total GitHub calls. This is the explicit generated-view READY exception, not a claim that the browser shards ran or passed in GitHub. Mac lander must regenerate the views, scan publication, and run Verify on the landed head.

Measured exact-head 320 command: passed in 435.324 seconds (7m15.324s), compared with 568.012 seconds (9m28.012s) serial baseline: 132.688 seconds / 23.36 percent faster. All supporting and core assertions completed. The added base invocation remains removed because 515 + 435.324 = 950.324 seconds, well beyond the unchanged 720-second job limit even before installer overhead.


Full desktop command on the concurrent-stream head: passed in 468.071 seconds (7m48.071s), inside eight minutes. The old phone run was explicitly deferred before it started so it cannot be confused with a final-head receipt.

Final refinement: replace only recordsJourney.capture's repeated 500 ms network-idle wait with document readiness, the existing no-busy-resource condition, loaded font geometry and two requestAnimationFrame paints, then recheck no resource is busy. All accessibility, overflow, touch-target, error and failed-resource assertions remain. Every caller already awaits its relevant public UI transition. This removes repeated fixed silence delays while waiting on actual rendered state. No timeout increased. All three commands will be measured on this final committed head.

Final product head: ce8c534ca856c31b07d9e441b80aeee6b46a8ff2. Third normal push succeeded. No published history rewrite. Fresh main was still 69c49e7 before this commit. Generated documents were again regenerated/checked, restored whole from main, then the source lock was regenerated and checked last. All 13 candidate commits, including side parents, pass identity and complete-message review.


Failed refinement attempt, retained honestly: final-320 on ce8c534ca856c31b07d9e441b80aeee6b46a8ff2 exited 1 in 210.719 seconds. exerciseTemplates timed out waiting for the edited Content production heading after reloading immediately on the record.patch HTTP response. The failure screenshot and HTML subsequently showed the correct saved version-2 heading. The shorter captures exposed a client-save/reload ordering race. Strengthen that test by first waiting for the edited heading in the live client, then reload and retain the identical edited-heading persistence check. No assertion deleted or weakened. Desktop and phone runs for that refinement were not started after the failure. Complete remeasurement follows on the corrected commit.


Confirmed mechanism behind the apparent Playwright timeout: tests/helpers/migrate-fixture.mjs uses spawnSync to run the full native migration runner. During the concurrent in-process supporting stream, that blocks the same Node event loop for approximately 50 seconds, longer than Playwright's existing 30-second wait. The failed snapshot's correct heading is consistent with protocol/timer starvation. Isolate the supporting stream in one child Node process (same runtime, fixtures, viewport environment, ordered helper sequence and inherited output); core stays in the parent. Parent waits for both streams and propagates any nonzero child exit. Concurrency stays two streams, and no assertion, registration or timeout is removed or raised. This fixes the blocking boundary without changing the shared migration helper or its many unrelated callers.

The corrected in-process 320 command on 45a3691577b5897f5792aeb8789524d2da9aa6e9 passed in 406.103 seconds (6m46.103s). The remaining commands were deferred before execution for the process-isolation fix; no desktop/phone timings or structured results are claimed for that head.

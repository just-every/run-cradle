# sd-cradle-c-f195 — Settings save attribution

SET-001 remains PARTIAL → PARTIAL. The selected acceptance-2 operator-and-time proof is closed. No production attribution defect was found, so production code is unchanged. No DONE claim is made.

Repository: just-every/run-cradle
Branch: cloud/sd-cradle-c-f195
Candidate: b721822ff74b1319c2e3fde3c0b38c30c942d3ee
Base: 234432f0b726fba470fb6ce4e1816f50cd082601
PR: none; branch pushes directly trigger Verify.
Before and after: 64 DONE, 138 PARTIAL, 55 MISSING, 257 Status rows; 174 of 200 test registrations. Every parent Status row is preserved in both commits. No existing assertion was removed, narrowed, skipped or moved behind a width condition.

## Plan and result

The full scoped plan is in plan.json. Both acceptance sentences were mapped before implementation. Acceptance 1 requires the complete section inventory and usage against every declared limit; this round deliberately does not claim that inventory. Acceptance 2 requires operator and time attribution plus the already-dispatched versus later-work behavior. The selected work covers attribution, persistence and command replay only; the wider dispatch matrix remains explicit in Gap.

The existing emitted-Worker registration in ./tests/ui-launch-operator-doors.mjs now calls ./tests/helpers/settings-attribution-journey.mjs at line 86. The focused helper reads the saving operator’s known identity before opening the log, captures the actual Settings PATCH body and independent request time bounds, obtains the one new admitted command ID from the separate command_admissions table, and reads that command’s committed status through the public command door. It does not derive the expected actor or timestamp from the audit output. It then reads the owner-authorized public admin audit door and requires one matching settings.update row with that actor and bounded time, including the person and time filtered read. A fresh Settings document and workspace read must show the saved name. Replaying the captured body through its original PATCH route with the admitted idempotency key must return 200 while both durable projections, admission count and audit metadata stay unchanged.

At 1440 the saver is Maya Chen. At 390 it is Alex Successor, the independent installation owner after the existing handover flow. The retained registration also completes its import, export, custom-field, bulk-edit, sample-data and ownership assertions. The passing run recorded 27 screenshots and zero page errors. Both selected Settings screenshots were inspected. The screens remain in the existing look; no UI, tooltip or font change was needed for this proof-only round.

## Runtime probes

PROBE SET-001 acceptance-2 attribution at 1440: Settings save synthetic-cradle-workspace-1440 by Maya Chen (01ARZ3NDEKTSV4RRFFQ69G5FAA), admitted command 01M6QC829KV5D4ENG8XYR3Y5HQ -> one public settings.update entry, actor 01ARZ3NDEKTSV4RRFFQ69G5FAA, timestamp 2026-11-06T02:50:45.434Z within [2026-11-06T02:50:45.344Z, 2026-11-06T02:50:45.473Z]; fresh Settings reload retains name; replay HTTP 200, unchanged settings and workspace versions, no additional admission or audit entry.
PROBE SET-001 acceptance-2 attribution at 390: Settings save synthetic-cradle-workspace-390 by Alex Successor (01M6QC7VBHPFN4F209VEANNZG4), admitted command 01M6QC8YDKGVMNEX2SF3G8A7QP -> one public settings.update entry, actor 01M6QC7VBHPFN4F209VEANNZG4, timestamp 2026-11-06T02:51:14.234Z within [2026-11-06T02:51:14.148Z, 2026-11-06T02:51:14.268Z]; fresh Settings reload retains name; replay HTTP 200, unchanged settings and workspace versions, no additional admission or audit entry.

## Verification

- npx -y @runeditrun/rer build: exit 0, actual emitted Worker built.
- pnpm check:types: exit 0.
- pnpm exec rer check --profile first-party: exit 0, cited Evidence paths resolve.
- node tests/ui-launch-operator-doors.mjs: exit 0, 1 registration passed, 0 failed, 27 screenshots at 1440 and 390. Chromium used /usr/bin/chromium with --no-sandbox through a temporary cloud launcher, outside the product tree.
- node tests/helpers/test-budget.mjs: exit 0, 174 of 200, unchanged.
- Contract generator write and check: exit 0. Its generated views were then restored whole from origin/main and neither view appears in either product commit.
- Source lock regenerated after the final edit and main synchronization; its check exits 0 at the candidate.
- git diff --check: exit 0. Candidate checkout is clean, full history is present, remote product head equals the candidate. Both commits have the required fleet author and committer and no co-author trailers.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock && node scripts/edition-authoring/cli.mjs check exit=0; views=node src/base/contract-docs.mjs write && node src/base/contract-docs.mjs check exit=0; ledger=none exit=0.

The first local browser attempt failed in the newly added helper because it eagerly read a successful response body after the page had navigated away. The failure was response.text: Protocol error (Network.getResponseBody): No resource with given identifier found. The helper now checks the actual response status without reading that discarded body, and independently reads the admitted result. The complete rerun passes. No production behavior, pre-existing assertion, workflow or landing guard was changed to repair it.

The passing browser run used the exact test source subsequently committed to this candidate; no relevant production source, emitted Worker byte or test byte changed afterward. checks-receipt.json records the byte comparison against the candidate. Source-lock output and generated-view checks are local mechanical proof, not publication or landing receipts.

## Assertion sensitivity and riders

These are inspected failure expectations, not claims of executed mutations. A missing or duplicate save fails helper lines 30–31. A mismatched committed result fails lines 34–37. A missing or duplicate public audit row fails lines 40–41. A wrong actor fails lines 43–44. A missing or out-of-bounds timestamp fails lines 45–49. A name that does not survive document reload fails lines 51–57. Another update or audit on replay fails lines 61–67. The proof stays in the existing push Verify launch-operator-doors shard through its unchanged command.

DONE-RIDERS are recorded for scope honesty; no whole-clause claim is submitted:
1. Not met for the whole clause: section and usage inventory and dispatch matrix remain omitted; selected attribution journey passes.
2. Selected proof met: populated real D1 state, actual save, public readbacks and duplicate-command replay; no new dangerous production path is introduced.
3. Candidate exact-SHA Verify is tracked separately below; no claim that an unexecuted CI shard passed.
4. Selected local proof uses the candidate’s identical tested source bytes; the public receipt names actual command IDs and times.
5. No inheritance or acceptance text changed.
6. Evidence and Gap now describe this proof and all retained omissions; generated views are intentionally left for the lander. Existing Judged from provenance is not advanced by this partial proof.
7. Both acceptance sentences remain byte-for-byte unchanged; no ruling or coverage rewrite was needed.
8. The existing current-owner audit door is used. No authority rule changed; no broader permission proof is claimed.
9. No live-provider, legal, scale or device boundary is claimed.
10. No new policy default or authority choice was adopted.
11. Pending guarded lander: publication scan, main equality, landing and candidate Run site are not cloud claims.

## Retained scope and handoff

The complete named-section and current-usage inventory, including separately queued OWN-001 capacities, and the complete already-dispatched versus later-work matrix remain omitted. Existing owner, policy and notification holds stay unchanged. Ct contract conversion and generated-document synchronization remain the brief’s retained release prerequisites. Independent whole-clause judgment, publication scanning, guarded landing and candidate Run site remain unclaimed. These retained boundaries do not block the selected proof-only partial candidate.

Plan row changed: SET-001 only, PARTIAL stays PARTIAL; Evidence adds the retained journey name and focused helper; Gap removes the now-proved attribution omission and explicitly retains the rest. No Mac plan or inbox file was read or written. No other clause was promoted or re-sorted.

Main’s base SHA has successful Verify 42123065555 and Run site 42123065870. Candidate Verify 42153045282 was discovered by exact SHA through REST; its completed failure and the permitted generated-view-only cause are recorded in ci-result.json and ci-jobs.json. Candidate publication scanning has NOT RUN in this cloud and remains mandatory on the lander. Product pushes use only the named cloud branch. This packet is published separately to the evidence ref and is not a product readiness or landing signal.

## Exact-candidate CI result

Verify 42153045282, event push, completed with conclusion failure on b721822ff74b1319c2e3fde3c0b38c30c942d3ee. Build job 127680648075 fails only at Check generated contract documents: `ACCEPTANCE.md: generated content differs; run contract-docs write.` Its subsequent build steps and test shards are skipped. Aggregate job 127680773931 fails because its dependency result is failure. Both failed-job archives were read once, successfully, using the required gh run view archive command. No repair, dispatch or rerun was performed. The exact candidate’s local check after restoring main’s views reproduces the same expected mismatch with exit 1; generator write followed by check passes with exit 0 before the views are restored. This is the expressly permitted generated-view exception for the READY handoff, not a claim that the skipped CI tests ran. The lander must generate the views and run its own exact-SHA Verify before landing. GitHub budget used: 6 commands, with one candidate watcher and a full five-minute interval between discovery and polling. Product blockers: none for this partial proof.

## Evidence return

The initial evidence transfer failed Git authentication twice. Only the launcher bundle was refreshed and the required fleet helper reinstalled; no other credential was sought. Attempt 3 published evidence head 36f3222e097fa457521f3461ee1a68ba4d985c6d. An independent fetch verified its manifest, product head and all 42 file hashes. The complete packet is republished with the actual transfer, custody and round-trip receipts included; the final message names the final evidence head. Product HEAD and index stayed unchanged. The disposable clone is removed after publication and verification, while this packet remains outside it. This recovery did not alter product readiness or waive any landing gate.

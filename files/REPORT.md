# sd-cradle-erasure-custody-1 — implemented and pushed; CI hold

The edition custody redesign is implemented and pushed. Two ordinary public installation exports now retain zero redundant snapshot tables and member erasure returns HTTP 200 with confirmed completion. Populated legacy custody, actual durable-phase failures, restart/retry, archive compatibility, full preview contents and post-erasure restoration have passing evidence. READY is withheld: exact-SHA Verify failed in the unchanged AI/lens UI test described below.

Repo: just-every/run-cradle. Branch: cloud/sd-cradle-erasure-custody-1. Head: **56394db55fc4a49079242515836a71947230256a**. The remote branch independently matches that head, and the product checkout/index are clean. No PR was opened; this repository uses the fleet's guarded landing flow. No main push, landing submission, tag, release, workflow dispatch/rerun or no-op CI commit occurred.

## Mechanism and scope

The complete source-grounded plan was written BEFORE product edits in PLAN.md, including the pre-edit legacy transition refinement. BEFORE.md and retained-before-script.mjs / retained-before-log.txt preserve the supplied main6e9e8d1 provenance. No historical baseline was rerun. RESEARCH.md records the independent read-only mechanism research; the parent was the sole writer. Research was not an acceptance gate.

- **Retained exports:** the edition facade consumes Base's complete archive verifier, then removes only the exact metadata-owned redundant snapshot/sidecar tables. Job metadata, parts, segments, all promised preview content, hashes and downloadable bytes stay intact. The maintained Base archive/import engine and wire format remain unchanged.
- **Populated old storage:** terminal jobs receive inert, exact-owner deletion triggers. Their definitions, full metadata and custody inventory are fenced. Job deletion clears every legacy snapshot row inside the SAME native erasure transaction as identity changes, import-custody retirement, stored parts and restore checkpoint. Failed admission rolls back all data changes. Only empty, unaddressable tables are collected afterward; interrupted collection is resumable. Unknown/orphan custody retains its original atomic DROP path. No budget is raised and native erasure is not split across transactions.
- **Preview compatibility:** new exports explicitly include portability_previews and portability_preview_rows. The first independent after probe caught main's broad portability_% exclusion; the brief requires these contents, so the policy now includes both. Released archives whose authenticated inventory excluded BOTH remain supported under that inventory. The entire CURRENT destination, including current previews, must still be empty before import. A partially inventoried preview archive refuses.

Product paths are limited to lifecycle/portability custody, directly required CLI integration, privacy documentation and sources.lock.json; their exact hashes are in product-provenance.json. No permanent test, UI, workflow, pin or identifier changed. No applied migration file changed, no persistent product table was added and no migration number was consumed. The transition uses runtime schema controls and preserves applied history. Base is unchanged; no shared-Base ownership dependency was identified.

## Actual results

Commands, actual exits, exact producer SHAs and timestamps are in check-receipts.json, exact-check-receipts.json and final-check-receipts.json; complete actual non-secret logs and scripts accompany them.

| Proof | Actual result |
| --- | --- |
| Retained supplied before proof | unchanged main6e9e8d1, two exports, 916 snapshot tables, member.erase 500; root attributes IMPORT_D1_REQUEST_LIMIT. This builder did not rerun it or revalidate root's separate 132 original artifacts. |
| Same ordinary public two-export sequence after | two complete downloadable exports, zero snapshot tables, HTTP 200 confirmed; public CSV preview definition and all preview-row contents match the archive exactly; unrelated controls remain exact. |
| Native-write and checkpoint faults | HTTP 500, identity/current authority unchanged, both downloadable archives byte-identical. |
| Populated prior storage transition | 924 legacy snapshot tables on newer merged source; injected retirement failure returns 500 with archives intact; restart/retry returns confirmed 200, snapshots become zero, unrelated controls stay exact and completed-receipt replay leaves epoch unchanged. This is transition proof, not a historical baseline rerun. |
| Actual interruption after atomic retirement, before collection | on final SHA, 462 tables remain EMPTY, zero person literals and no addressable archive; restart/retry completes collection and confirmed erasure. |
| Verifier failure before compaction | on final SHA, HTTP 400 retains all 462 alternate tables; after restoring only the deliberately corrupted bytes, restart/retry verifies the complete archive and compacts to zero snapshots. |
| Original lifecycle-erasure and identity journeys | all five tests pass, unchanged, on final SHA. |
| Normal prior/current archive import | unchanged retained-archive journey passes: v0.3.0 archive 204 tables / 58 rows / 2 objects; current Platform archive 231 tables / 62 rows / 2 objects. Every archived cell/file matches, unknown/uninventoried archives refuse, migration ledgers remain intact. |
| Old archive nonresurrection | current installation refuses pre-erasure imports; unchanged lifecycle journey also refuses on a fresh target supplied the later trusted journal. Standalone external backups without later erasure knowledge remain an existing limitation. |
| Post-erasure fresh restore | final SHA: confirmed 200, 232 exported tables, no erased identity in the verified archive, complete import, erased principal remains erased, anonymous/unaffected business rows exact, human authority held, zero snapshots. |
| Types / production build / generated docs / source lock | pass on final SHA; generator write/check executed, views restored whole from origin/main, lock regenerated/checked last. Neither generated view is in the product diff. |

One initial complete retained-archive invocation reported generic native_error on current Platform import after its v0.3.0 import passed. The focused native diagnostic then matched all current archive rows/files, and the original journey passed in full on unchanged retry with NO product edit between attempts. The cause remains unreproduced; that failed attempt is retained honestly in retained-exact.log and exact-check-receipts.json. No production fallback or automatic retry was introduced, and no assertion was weakened.

The ordinary two-export receipt was produced at bdda1ec; the only subsequent product change recognized the CLI's recorded old preview exclusions. The final SHA additionally has exact-SHA native phase, lifecycle, retained-archive, build/types and post-erasure restore evidence. All provenance is explicit in the receipts.

## Exact-SHA CI blocker

Verify **42176012080**, https://github.com/just-every/run-cradle/actions/runs/42176012080, completed **failure** on exactly 56394db55fc4a49079242515836a71947230256a. Build, identity, retained-archive, operator-door and the other workers passed. Only actual worker **verify-launch-8**, job **127754795769**, failed; the final aggregate verify job failed because a worker was red.

The actual archived failure log was read ONCE with:

`gh run view 42176012080 --repo just-every/run-cradle --job 127754795769 --log-failed`

It shows `tests/launch-installed-ui.mjs:36:92`: `locator.click: Timeout 30000ms exceeded`, waiting for **Request lens proposal**, which stayed disabled after the test filled the lens description. It also includes workerd TLS certificate-unknown messages; those are observations, not a proven cause. ci-launch-8-failed.log is complete except the fleet sanitizer's secret/URL-query masking. No blocked direct job-log blob download or archive retry occurred.

The test, `src/ui/launch/analysis-panel.tsx:10`, `src/core/features/lenses/ui/lens-builder-page.tsx`, and the workflow are byte-identical to origin/main; ci-source-provenance.json records their Git blobs. This identifies the failure path, not a claim about its historical incidence: no baseline rerun was made. The custody lease expressly forbids product UI/workflow/pin/ID changes and supplies no AI/UI repair authority. No speculative UI change, test weakening, CI rerun or empty commit was used to turn it green.

**Remaining dependency:** an authorized resolution of this AI/lens UI gate and a green required exact-SHA Verify under fleet rules. This run therefore returns BLOCKED for READY/landing, while preserving the complete pushed custody implementation and its evidence. Evidence publication itself is not a READY, acceptance or landing signal.

## Preserved judgments, custody and cleanup

Started from retained-before main 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746; unpublished work rebased onto bf02cc16bc41362d7c5859f1b008f9877eb7db81 before the first save. Subsequent current-main integration used merge only, with no force push or published rewrite. CONTRACT.md is byte-identical to merged main, including all newer search evidence and every complete Gap/Evidence/provenance assertion. DATA-001 and OPS-003 remain partial. All source/stack, independent review, provider and release holds remain.

Before/after status counts: **64 done / 138 partial / 55 missing**. Permanent test count: **174 → 174**, cap 200. **+0 DONE, restorations, releases or clause promotions.** Original lifecycle-erasure.mjs SHA256 remains 2c700e0b997c8b5578ba456655deee9c2f8a620a1bf7f7b2bf989ef814ae6151. Initial/merged/final contract hashes are in invariants.json.

Every candidate author/committer is Run Edit Run fleet <fleet@runeditrun.com>, all candidate messages/trailers were inspected, and both product pushes succeeded through the cloud guard on their first attempts. All four product commits and remote custody are recorded in product-provenance.json and push receipts. No finished work is unpushed. The separate evidence ref carries only reports/receipts, never the product tree.

All owned runtimes completed and test fixtures/diagnostic clones were removed; no live owned browser/server was left. The product clone/dependencies are retained only until final evidence transfer succeeds, then removed; final terminal text records that final cleanup. Actual cleanup receipts are included. No secret, environment dump, private held-out gate material or symlink is selected for publication.

The cloud ran only a new-diff credential-pattern check (all zero), not the fleet's complete full-history publication scan. Independent affected gate, supported review hold, publication NEW0, actual full-green exact-final runtime Verify, guarded main equality and exact-main Run site remain fleet landing requirements. Broader compressed/encoded PDF, real provider and hosted privacy obligations remain explicit unproved gaps; this change awards none of them.

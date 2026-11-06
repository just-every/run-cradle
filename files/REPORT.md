# sd-cradle-erasure-custody-1 — edition custody redesign

2026-11-06. Builder report, not an independent acceptance or landing decision.

Declared write scope: just-every/run-cradle, branch cloud/sd-cradle-erasure-custody-1. Product work is separate from this evidence packet. No main push, PR, landing submission, release, provider change, publication scan, full local suite, baseline rerun, dispatch or CI rerun.

The complete pre-edit mechanism/transition plan and its source-grounded refinements are in PLAN.md. Retained before proof and original provenance are in BEFORE.md. The original lifecycle-erasure journey is unchanged. An independent read-only helper researched Base/edition portability; the parent was the only writer.

## Mechanism

1. New installation exports keep their verified manifest and parts. The edition facade re-verifies the full archive with Base's reader, then removes only the exact metadata-owned redundant snapshot/sidecar tables. No row, preview content, file, receipt, archive hash or download is removed from the retained archive.
2. For populated old storage, exact-owner job-deletion triggers are installed as inert schema controls. Inventory, immutable job metadata and exact trigger definitions are fenced. Deleting terminal jobs wipes every retained snapshot row inside the native erasure transaction with native changes, parts, all import-custody scopes and the restore checkpoint. Failure rolls them all back. Empty unaddressable schema objects are collected afterward; interrupted cleanup is restartable. Unknown/orphan custody retains the original atomic DROP path. This does not raise a budget or split native erasure across transactions.
3. New archives explicitly include portability_previews and portability_preview_rows. The first independent after probe caught current main's broad portability_% exclusion; this was fixed as required by the brief. CLI import recognizes released archives whose authenticated inventory excluded BOTH preview tables and preserves the existing full-empty-destination preflight. An incomplete preview inventory refuses.
4. Current authority, active-transfer refusal, R2 cleanup ordering, unrelated people and import undo custody, later-journal nonresurrection and completed-receipt replay remain in the existing mechanisms.

No applied migration file changed, no persistent schema table was added, and no new migration number was consumed. The old-data transition is runtime schema-only registration plus transactional row erasure and post-commit empty-table collection. Source attribution remains edition-owned; Base is unchanged.

## Source and guarantees

Started from retained-before main 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746. Before the first push, fetched and rebased unpublished work onto bf02cc1 (including newer 37a7234 search evidence); after the save, subsequent updates use merge only. CONTRACT.md is byte-identical to the merged main. All complete Status/Gap/Evidence/provenance and newer assertions are retained. DATA-001 and OPS-003 remain partial; all other source, stack, independent review, provider and release holds remain. +0 DONE, restorations or releases. Broader compressed/encoded PDF, live provider and hosted privacy obligations remain unproved gaps.

Product changes are limited to lifecycle/portability custody, directly required CLI integration, privacy documentation and sources.lock.json. No test, UI, workflow, pin or identifier changes.

## Actual verification

check-receipts.json records commands and exits; actual logs and receipt files accompany it. after-probe.mjs adapts the supplied ordinary-two-export sequence to the current native harness and adds a real public CSV preview plus bounded controls. phase-probe.mjs tests actual emitted durable boundaries. The existing retained-archive journey is run externally with only import-path and fleet identity/hook setup adaptations; its assertions are unchanged.

Terminal provenance, exact-SHA CI, final results and cleanup are appended when complete. No pending result in this paragraph is a pass claim.

## Retained observations

- The supplied before proof has 916 snapshot tables and HTTP 500. The same ordinary two-public-export sequence now has two complete downloadable archives, zero retained snapshot tables, full byte-for-byte preview definition/row content, and HTTP 200 with confirmed erasure. Native-write and checkpoint faults returned 500 with archives byte-identical and identity/authority/control state unchanged.
- Populated legacy storage retained 924 snapshot tables on the newer merged source (not a rerun of the historical baseline). A durable retirement fault returned 500 and preserved both archives exactly; restart/retry completed erasure, removed every snapshot table, refused stale archive imports, preserved unrelated controls and kept replay's epoch unchanged.
- On exact 56394db55fc4a49079242515836a71947230256a, interruption after native retirement but before collection left 462 EMPTY unaddressable tables and zero identity rows. Restart/retry returned confirmed completion. A verifier fault before compaction retained all 462 alternate tables; after restoring only the injected corruption, restart/retry verified the complete archive and compacted them.
- All five unchanged lifecycle/identity tests passed on that exact SHA. Types and the production build passed. The permanent count remains 174/200, with no added, removed, skipped or weakened test.
- Released v0.3.0 import matched 204 tables, 58 rows and two files. The first complete retained-archive invocation later reported generic native_error on current Platform import. A focused diagnostic using the actual Node 22 native transfer engine then imported and matched all 231 tables, 62 rows and two objects. The original retained journey is being repeated unchanged; its actual first failure remains in retained-exact.log and exact-check-receipts.json, not erased or relabelled as success.

Status counts before and after: 64 done / 138 partial / 55 missing. CONTRACT.md SHA256 after main integration is cdf25b010e691b00b54ce80b5b40dad7fd9de96e2511ca05305f58ee79d9ca73, byte-identical to bf02cc16bc41362d7c5859f1b008f9877eb7db81. Original lifecycle-erasure.mjs SHA256 remains 2c700e0b997c8b5578ba456655deee9c2f8a620a1bf7f7b2bf989ef814ae6151. Initial versus merged-main hashes and counts are recorded in invariants.json; only main supplied its newer contract evidence. No own clause judgment changed.

Generated documents were written and checked, then both views restored whole from origin/main. Source lock was regenerated/checked last before each product commit. No view file is in the product diff. Migration ledger files are unchanged; the normal CLI migration/restore journey checks ledger preservation and runtime old-storage transition receipts accompany it.

The cloud performed only a new-diff credential-pattern check (all zero); it did not run the fleet's complete full-history publication scan. The Mac's publication, independent affected gate, review hold, exact-final runtime Verify, guarded main equality and exact-main Run site remain required for landing.

## Completed local results on final product SHA

Final candidate: 56394db55fc4a49079242515836a71947230256a; origin's cloud branch independently confirmed at that SHA with a clean product checkout. No PR is required by this repository's fleet landing flow and none was opened.

The unchanged retained-archive journey passed in full on retry, with no product edit between the failure and retry: released v0.3.0 archive 204 tables / 58 rows / 2 objects; current native Platform archive 231 tables / 62 rows / 2 objects. All archived cells and file bytes matched, unknown/uninventoried archives refused, and migration ledger assertions passed. The first generic native_error remains an unreproduced failed attempt, not a claim of a repaired cause. See retained-exact.log, retained-retry.log, diagnostic-restore.log and final-check-receipts.json.

A separate small post-erasure public-API export/import proof also passed on the final SHA: confirmed HTTP 200 erasure, 232 exported tables, no erased name/email in the verified archive, complete fresh restoration, erased principal still erased, every anonymous and unaffected business row exact, all restored human authority held, and zero retained snapshots. This is post-erasure-restore-receipt.json, not a full local baseline or broader provider/PDF claim.

The exact-SHA local checks therefore finish with types/build, five unchanged lifecycle/identity tests, one unchanged retained-archive journey, actual phase-interruption/verification probes and the post-erasure restore probe passing. Initial failures and all actual command exits remain in the packet. No new permanent tests or migrations were added. No test assertion changed.

Independent review and landing remain outside this builder. The product has been pushed with the cloud guard; exact-SHA Verify run 42176012080 is being polled by the single task watcher within the ten-call budget and 300-second minimum interval. Its terminal receipt will be appended below. Evidence publication is a separate report-only ref and never an acceptance/READY signal.

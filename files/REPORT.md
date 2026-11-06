# sd-cradle-c-f210 results

CAMP-001 remains PARTIAL to PARTIAL. The required predecessor already implements every selected POINT. This continuation retains it and verifies it again, without adding a redundant test, changing acceptance text, promoting a clause or creating an empty product commit.

## Product provenance

Repository: https://github.com/just-every/run-cradle
Branch: cloud/sd-cradle-c-f210
Candidate: b319d67fbee4957a74027c219211e817c8b9e51f
Required predecessor: b319d67fbee4957a74027c219211e817c8b9e51f
Fetched main: 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746, the candidate's direct parent. Fresh integration reports already up to date. No published commit was rewritten. No PR is required: Verify accepts branch pushes.

The predecessor changes only CONTRACT.md, sources.lock.json, tests/helpers/launch-campaign-lifecycle-clauses.mjs and tests/launch-write-effects.mjs. Its implementation uses the existing campaign deletion refusal in src/apps/launch/campaigns.server.ts. The continuation adds no product edits.

Counts before and after: 64 DONE, 138 PARTIAL, 55 MISSING, 257 Status rows. All parent Status IDs remain. Registrations: 174 of 200 before and after. No assertion was removed, narrowed, skipped or moved behind a condition. No duplicate or pin tests were added.

## Selected public-door proof

The existing registration in tests/launch-write-effects.mjs is named "prior full policy covers conservative effects, native campaign validation and campaign record clauses". It invokes verifyCampaignLifecycleClauses in tests/helpers/launch-campaign-lifecycle-clauses.mjs on the emitted production Worker with native HTTP, its D1 database, file store and queue entry points. Only the permitted paid provider edge is substituted.

- Fixture creation, lines 112 to 121: native campaign.create produces the independently named synthetic campaign and an HTTP read independently checks its code and name.
- Current revision, lines 321 to 335: a native edit admits a real event, the Worker queue consumer admits populated pending automation work, and fresh campaign detail supplies the version used by deletion. An assertion proves the version increased after that edit.
- Unsafe request, lines 362 to 369: native launch.campaign.delete carries a wrong-case confirmation and the current revision. It must return HTTP 400, code validation, with a message naming confirmationCode. A stale-version refusal cannot satisfy this assertion.
- Campaign, children and activity, lines 336 to 347 and 370 to 371: before and after public detail and record reads prove populated campaign business values, child values, revisions, rollups and activity unchanged.
- Queued work, lines 320 to 331 and 372: a nonempty Queued run, Pending actions, retained definition and pending execution outbox entry exist before refusal; public history and the complete database comparison prove they survive unchanged.
- Retained files, lines 351 to 358 and 373 to 374: public file metadata and download return the original populated CSV bytes both before and after refusal.
- Admission effects, lines 375 to 376: the refused command has no command admission; all persisted product, authority, activity, audit, event, file and queue state remains exact. Only the routine authentication last_seen_at read timestamp is omitted by the pre-existing snapshot helper.
- Positive control, lines 378 to 392 and 412 to 415: correct typed confirmation completes public deletion, returns confirmed true, removes retained product content and analysis and import references, erases the staged file, anonymizes historical audit content and refuses restoration.

These assertions directly reject a missing confirmation refusal or incorrect unchanged-state behavior. No mutation experiment was added in this continuation. The proof extends the retained registration and remains in the normal Verify suite. There are no changed screens or UI code, so no additional browser capture is owed for this continuation.

## Scope and plan rows

The selected unsafe-deletion POINT was completed by the required predecessor and is being reverified here. No plan row is edited on this cloud VM; the lane should record this continuation as completed selected POINTS with no new implementation and no count change. PLAN.md holds the complete executed plan.

The wider public create, edit and archive matrix, acceptance 2's complete required, optional and custom-field matrix, broader deletion and erasure combinations and CAMP-011's company-policy acceptance are unclaimed. Ct contract conversion and generated-document synchronization remain the brief's unchanged release prerequisites. Independent whole-clause judgment, publication scanning, guarded landing and candidate Run site remain fleet work. This is no whole-clause DONE claim and no judge request is submitted. No new policy ruling or account is required for the selected POINT.

## DONE riders and pre-handoff check

1. Whole-clause coverage: FAIL for a DONE claim; selected unsafe deletion is covered as above, but the recorded wider matrices remain unproved.
2. Dangerous path both ways: PASS for the selected slice, helper lines 362 to 392; unsafe refusal changes nothing and confirmed deletion completes.
3. Exact-SHA Verify: see CI receipt below; the registration is in the ordinary test:launch suite. No green run from a different SHA is substituted.
4. Current evidence: local receipts bind to the unchanged candidate SHA. No source or test byte changes after the run.
5. Inherited duties: unchanged. No new inheritance or Base-duty completion is claimed. CAMP-011 retains its written Base citations.
6. Metadata: PARTIAL and the existing remainder remain explicit. Writer and check pass locally, then generated views are restored from main as instructed. Candidate ACCEPTANCE.md freshness is intentionally left for the lander. Historical Judged from provenance is not represented as a new whole-clause judgment.
7. Acceptance text: PASS, no acceptance sentence changes and all 257 parent Status IDs survive.
8. Authority: selected owner-confirmed deletion is exercised both ways; wider authority and company-policy combinations remain unclaimed.
9. Provider and legal boundaries: no new provider, retention, legal or compliance claim. Only existing permitted test-edge substitution is used.
10. Policy: no new default or widened authority.
11. Landing: PENDING with the fleet; no main equality, complete publication scan or candidate Run site claim.

Pre-handoff: no existing assertion was weakened; no new authority, erasure or replay path was introduced. Existing refusal and irreversible erasure controls remain exercised by the retained journey. No UI rule is implicated by a screen change. Source lock is fresh. Added product text has no email-shaped string and no new provider-shaped key fixture. A cloud-side publication scan is not claimed; the maintained fleet performs it before landing.

## Verification receipts

Setup, emitted build, typecheck, first-party requirement check, contract generator write and check, and source-lock regeneration and check passed locally. The generated writer changed only its stale acceptance view, which was restored whole from origin main. The committed tree is expected to fail only that generated-view freshness check; it must not be committed as a repair. No migration was added or edited, so the migration-ledger check is not applicable.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0, followed by restoring ACCEPTANCE.md and docs/CLAIMS.md from origin main; ledger=none exit=0.

Main baseline is healthy at 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746: Verify 42153995434 and Run site 42153995317 completed success. Candidate CI and final native results are recorded in RESULTS.json and the final receipt below.

The full touched-file run passed all 3 registrations, with 0 failures and 0 skips, exit 0, in 650650.622531 ms. The selected lifecycle registration took 290204.930009 ms. PROBES.txt contains the actual emitted unsafe-deletion probe. The named product branch was published on the first guarded attempt at b319d67fbee4957a74027c219211e817c8b9e51f, and an independent remote-ref read confirms that SHA. No product commits or edits were added in this continuation.


## Final CI and custody receipt

Push Verify 42164091132 on b319d67fbee4957a74027c219211e817c8b9e51f completed failure. Build job 127716410040 fails only at the exact command node src/base/contract-docs.mjs check with: "ACCEPTANCE.md: generated content differs; run contract-docs write." Its archive was read once. The required verify gate job 127716495743 reports the consequent results "success failure skipped"; its archive was read once. Test shards are skipped by the build dependency. This is precisely the documented generated-view exception. It is an allowed READY handoff and is not described as an actually green workflow. No speculative repair, dispatch or rerun was performed. The same command locally gives the same freshness error only after the instructed restore; write and check before restore pass. Six GitHub CLI calls were used in total. CI environment annotations and URL queries are excluded from the published failure excerpts.

The earlier predecessor Verify 42154166532 is also recorded as failed on the same SHA, not substituted for the current branch run. Main Verify 42153995434 and Run site 42153995317 remain successful on main's own SHA, not represented as candidate proof.

There is no selected-scope blocker, no PR, no new product commit, no plan-row edit and no status or count change. Candidate generated-view synchronization, publication scan, independent judgment, guarded landing and Run site stay with the fleet. Product custody and report transport are separate: evidence publication does not constitute acceptance or landing.

PROBE CAMP-001 acceptance 1: native current-version deletion with wrong-case confirmation -> 400 validation naming confirmationCode; 8 public records, populated activity, retained bytes and queued work unchanged.

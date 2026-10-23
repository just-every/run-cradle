# Base trash (partial)

No real provider call or consent was used. Canonical record rows and metadata definitions stay in their original storage. A marker holds the deletion time, original lifecycle, version/schema fences and inverse unlink operations. Ordinary read policy excludes marked records even when archived rows are requested. Base exports omit deleted records, saved views and forms.

`GET /api/v1/records/trash?appId=<base>` lists at most 200 records plus 200 of each metadata kind that the current human session may restore. `POST /api/v1/records/trash/restore` accepts `{commandId,appId,entityId,recordId,version,kind}` (`record`, `view` or `form`). Record and view deletion use their existing commands. `POST /api/v1/records/trash/forms/<id>/delete` accepts `{commandId,appId,version}`. Restore rechecks current deletion authority. A stale version, schema change, missing link target or reused metadata name refuses restoration before mutation. The Settings Trash list uses these same doors.

Retention is 30 days from deletion. The scheduled clock seam claims at most one purge run per kind per hour. Simple record and metadata purges are audited irreversible admissions. A record with files/source custody or a multi-record cascade is visibly held for further custody work, rather than silently dropping its dependencies. These cases remain acceptance gaps.

Installation archives carry canonical held rows, markers and original deletion times. Restore does not reset their clock. Person erasure dynamically registers held canonical records with member identity erasure: identity-only rows are removed with their marker; identity values in retained business records are scrubbed and deletion attribution is anonymized. Erasure is irreversible and bypasses restore. Public archive/restore and broader erasure matrices remain unproven.

Evidence: `tests/records-manual-release.mjs` — `[SNAP-002] RECORDS-001 RECORDS-002 FIELD-003 manual preview, adoption and every record write door enforce typed fields and named rules`, extended by `tests/helpers/record-trash-journey.mjs`. The unchanged registration proves record disappearance, JSON omission, current-policy refusal, restoration of the same identity, values/link/history, saved-view and form delete/restore through their read doors, moved-clock purge, and person erasure with zero trash rows and held bytes for an identity-only record. Browser evidence is `tests/helpers/record-trash-browser.mjs`, invoked by the existing records builder journey: list and one restore pass at 1440 and 390, without page overflow or serious/critical axe findings. The four `trash-list-*.png` and `trash-restored-*.png` images show both end states.

## Gap

Fields and tables have no trash/restore implementation. Interfaces were carved verbatim into IFACE-001 as an acceptance point (ct, 22 October); no interface object is invented here. Full unlink/cascade restoration and purge, dependent formula/form fences, attachment/source purge custody, other released-version upgrades, archive restoration, base/record erasure and complete held-value erasure remain unproven. Trash listing is bounded, not paged. Retention and policy are conservative defaults pending ct's ruling.

## Deletion dialog correction

The previous dialog said “This permanently deletes the record” and “There is no undo”,
and labelled its action “Permanently delete”. The dialog now says that ordinary
deletion moves the record to Trash for 30 days, where people with the right to
delete it can restore it, and labels its action “Move to Trash”. BASE-DATA-003
erasure remains irreversible and bypasses Trash; release files are unchanged.
The browser journey opens and confirms this dialog, proves the deleted end state
and restores the same record at 1440 and 390, with no page overflow or serious/
critical axe findings. Its host's three icon-only mobile navigation controls have
300 ms hover tooltips and immediate keyboard-focus tooltips, scoped to record
detail and deletion states. No test pins the former copy.

The populated pre-9047 deleted-view backfill is proven by `tests/helpers/change-subscriptions-upgrade.mjs`, invoked from `tests/user-webhooks.mjs`: definition and prior timestamps survive, and the migration supplies a full 30-day restore window. Other released-version upgrade coverage remains open.

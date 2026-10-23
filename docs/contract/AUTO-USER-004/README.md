# AUTO-USER-004 — conditions, branches and repeats

Status: partial. Strict saved definitions accept conditional actions, condition
steps, a first-matching branch with up to ten paths and an optional otherwise
path, and repeats over records found by a filter on the definition's table.
Versioned definitions and existing approvals remain the public authoring door.
Conditions use the maintained record filter evaluator over the trigger record's
current readable values. Finds use the ordinary policy-checked record reader.
Every nested action is validated under the same owner and field policy as an
ordered action; no new writer or provider sender is introduced.

All repeat finds are resolved before the first effect. A combined selection over
1,000 items refuses the whole run, including any preceding action, with the count
in run history. The selected IDs and each item's effect keys are durable. Each
key names the run, step, path, item and action. Work is staged and executed in
bounded increments through the existing queue/cron runtime. A later tick or
Worker restart preserves completed item effects and the immutable selection.

An item the author can no longer read is skipped. Its ID is also concealed in
current run-history reads. An item failure is recorded and later items continue;
the run ends Partial and uses the existing failure-alert path. An uncertain
external result stops the repeat, keeps the run Unknown, and never resends that
item. One logical run exposes every selected item's outcome. A saved branch's
choice is durable, and no action from another path runs.

The definition API can author these shapes. The existing builder shows a
read-only saved-step summary; it does not offer editing or a test-panel fallback
for control definitions. Run history shows per-item IDs/outcomes with current
row policy at 1440 and 390. Existing icon tooltips retain 300 ms hover and immediate
keyboard focus on the touched screens.

Proof extends the existing `tests/user-automations.mjs` registration
`[AUTO-USER-001]` with `[AUTO-USER-004]`, through
`tests/helpers/automation-control-journey.mjs`. It checks each branch and the
otherwise effect, conditions after preceding updates, first-match isolation,
ten paths accepted and eleven refused, all found item IDs, item failure and
continuation, Unknown stopping, a second editor making an item unreadable,
restart during an unfinished repeat with exact final record versions, 1,001
items refused before any effect, and 1,000 distinct item results accepted. The
1,000-item case deliberately skips each action; it is not 1,000-write throughput
proof. `tests/ui-user-automations.mjs` (`[AUTOMATIONS-USER-UI-001]`), through
`tests/helpers/automation-control-browser.mjs`, exercises real item results and
the saved summary at both widths, with no overflow, serious/critical axe finding,
console/page error or hydration recovery. Fakes exist only at the provider edge.

Defaults ADOPTED: installation-owner authoring remains unchanged; found IDs are
snapshotted before any effect; ordinary item failure continues and ends Partial;
Unknown stops the repeat and is never resent. No role-matrix text changes.

Gap: builder UI for conditions, branches and repeats, including builder tests;
repeats over a list value; nested repeats; saved-view finds (filtered records on
one table are built); the full filter/operator and concurrent-crash matrix;
1,000-write throughput and hosted platform limits; complete control-history
export/restore/erasure proof; and individual repeat-item retry controls. Wider
creator/base-owner authorship remains AUTO-USER-009's existing gap.

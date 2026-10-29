# AUTO-USER-002 — additional admitted triggers

Status: partial. This round adds selected-field record updates, workspace-zoned
schedules and date-field offsets to the existing record-created/updated door.
Definitions remain strict and versioned. The installation owner's current
approval, credential, membership, row policy and field policy govern every run.
No new public ingress, sender or consent is introduced.

Selected-field updates inspect the existing committed admission audit facts.
An unrelated field or an unchanged named value does not start a run. A selected
field must be readable when approved. A write-only/unavailable before or after
cell does not provide evidence of a named value change and is not used to start
an outbound action.

Schedules support every N minutes, with N at least 15 and a multiple of 15;
hourly, daily, weekly and monthly rules. They use the workspace time zone and an
explicit first-eligible instant. A schedule names a currently readable record
for its actions. The existing every-minute cron admits a durable event and uses
the ordinary automation runtime. Local wall-clock slot identities and the saved
cursor coalesce an outage into one latest eligible run. Restart and repeated
cron delivery do not create another run for the same slot. Repeated DST local
minutes have one identity; a monthly day absent from a month is skipped.

Date offsets find readable records whose date reaches the selected offset in
the workspace calendar, once per record/field/offset date. Current field type
and readability are rechecked. A record hidden by the author's current row rule
never starts a run. The proof uses a read-scoped notification action; the
existing grant door continues to refuse a write approval exceeding its issuer's
row/action scope. No authority policy or lifetime is widened.

The API definition door authors these shapes. The automation screen labels the
saved trigger accurately and shows a read-only summary. Trigger editing and
builder test-panel support are not implemented and do not fall back to a generic
record-created test.

Proof extends `tests/user-automations.mjs`'s existing `[AUTO-USER-001]`
registration with `[AUTO-USER-002]`, through
`tests/helpers/automation-trigger-journey.mjs`. One fixed-clock data-driven
journey covers named/unrelated/no-op changes; each of the five schedule units
before and at its boundary, before its next boundary, after restart and after an
outage; invalid minimum/multiple intervals; and a three-days-before-Due case
with one notification and no hidden-record run, including after authority is
restored. `tests/ui-user-automations.mjs` (`[AUTOMATIONS-USER-UI-001]`), through
`tests/helpers/automation-trigger-browser.mjs`, covers the real saved schedule
summary at 1440 and 390. Providers are faked only at the network edge.

The same trigger journey invokes
`tests/helpers/automation-schedule-boundaries.mjs` for nine workspace-calendar
scenarios in New York. Independent UTC instants and expected local slots cover
15-minute spring-forward coalescing, a skipped daily 02:30 slot, the repeated
hour for minutes, hourly and daily rules, and monthly days 29, 30 and 31 across
leap and non-leap February and April. A missing monthly date does not roll into
the next month; a real leap-day slot runs at its stated local time. Each boundary
checks public completed runs, the record value and one version increment per
run, plus distinct committed patch receipts with the expected slot identities.
Before-boundary controls, repeated delivery and Worker restarts leave no extra
run or effect. The existing local-wall-clock and missed-slot semantics are
unchanged; this adds proof rather than a new scheduling policy.

Defaults ADOPTED: missed slots coalesce, never replay in a burst; minimum interval
15 minutes; workspace time-zone calendar dates; explicit readable schedule
record; one identity for a repeated local slot; skip nonexistent monthly days;
current installation-owner approval only. No role-matrix text changes.

Gap: view enter/leave triggers (the current event capture has no retained
before/after view-membership snapshot); form submitted and button pressed;
inbound signed webhook and inbound email; definitions in base exports (the base
transfer door does not carry automations, so no protected transfer path was
changed); builder editing/testing of the additional triggers; remaining
schedule and date-offset calendar and zone cases; the write-only actor and
field-type matrix; large backlogs and hosted limits; ct contract conversion and
generated-document synchronization; and widened write-grant or creator/base-owner authoring, which
remain under the existing authority and AUTO-USER-009 boundaries. New trigger
restore-disabled proof is not claimed.

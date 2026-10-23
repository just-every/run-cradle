# AUTO-USER-006 — run history and failure alerts

Status: partial. Failed and Unknown record-automation runs notify the enabling
operator through the existing in-app channels and installation mail sender.
The alert contains a plain-language cause and a link that opens that run's
history. It carries no record values. Current delegation, recipient membership,
row access and installation-owner authority are checked before admission and
again before mail dispatch. Another operator receives no alert.

An admission ID derived from the automation, enabling operator, failure code and
workspace-time-zone calendar day claims both notices once. A second failure of
the same kind remains in history without another notice. Per-run observation
receipts prevent handled failures from occupying the next scan. A claimed email
is never resent after a restart or missing acknowledgement; interruption between
claim and send can leave email unsent. The in-app notice remains durable.

Run history explains failure codes, links to each run and offers manual retry
only for a recorded safe transport rejection or an interrupted internal action
known not to have committed. Retry reuses action keys and the original external
request bytes, preserves completed actions and is refused for Unknown outcomes.
A definite receiver refusal and validation failure do not offer retry. Current
owner authority and the durable failed action are rechecked at the retry door.
Safe external attempts are bounded to six in total.

Proof extends the existing registrations in `tests/user-automations.mjs`
(`[AUTO-USER-001] [AUTO-USER-005] [AUTO-USER-006] real admitted record triggers run
notify/email/update once, retain history, and stop disabled or revoked work`),
through `tests/helpers/automation-failure-journey.mjs`, and
`tests/ui-user-automations.mjs` (`[AUTOMATIONS-USER-UI-001]`), through
`tests/helpers/automation-failure-browser.mjs`. The emitted Worker proves one
in-app and one email notice, same-day suppression, current recipient isolation,
record-value omission, a safe retry with immutable bytes and no repeated
completed update, and Unknown refusal/restart without resend. The real run
history and inbox are exercised at 1440 and 390 with no horizontal overflow,
serious/critical axe finding, console error or page error. Provider responses are
faked only at the network edge; no real mail or consent is used.

Defaults ADOPTED: enabling operator only; the workspace time zone's calendar day;
in-app and email only; installation-owner authoring and retry authority remain
unchanged. New failure-alert and retry doors use the existing owner delegation,
current record-read policy and atomic admission boundaries. No broader role is
granted, and no role-matrix text is changed.

Gap: Slack, Teams and Nook alert channels; monthly counts against a declared run
limit (no monthly run limit exists in the installation); full trigger/input/result
and affected-record presentation; complete export/restore/erasure custody;
workspace-day/DST boundary and large-backlog load proof; automatic retry cadence
for user automations; email delivery confirmation and recovery after interruption
between the alert claim and send. Owner-only defaults await ct's ruling.

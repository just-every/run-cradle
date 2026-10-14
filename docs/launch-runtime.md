# Installed launch work

The emitted Worker publishes committed launch events to WORK_QUEUE and also scans
unprocessed events and due work on its scheduled handler. Cloudflare Cron must run
every minute. Scheduled evaluation uses the controller's scheduled time, the
workspace timezone, and retained run keys. Queues are transport: their redelivery
cannot create a second logical run or repeat a completed action.

The four installed definitions retain their fixed actions. Readiness lead days
and evaluation hour use the existing readiness settings command. Weekly digest
must be enabled explicitly; it uses normalized recipients and the local Monday
09:00–09:15 window. Decision overdue reminders evaluate due time plus 15 minutes.
Local development mail writes the actual Base development outbox in the same
transaction as delivery; `rer outbox` displays these notifications.

## Optional read-only AI

Set `AI_PROVIDER_API_KEY` as a Worker secret and `AI_MODEL` as the actual OpenAI
Responses model identifier. In Settings, enable AI and choose the daily call
ceiling. Configuration readiness does not claim a measured successful call.
Manual records, notifications and deterministic automations work without AI.
Campaign brief, risk readout and lens proposal controls are on the existing
campaign, risks lens and lens builder screens. A lens proposal remains a draft
until an operator explicitly saves it. Requests retain current source authority;
comments and custom-field values are excluded from provider context.

Every admitted call reserves one slot atomically across all three features for
the workspace's local date. A request has a 60-second deadline. A lost, refused,
unavailable or invalid provider response produces a visible request failure and
no analysis. It is never blindly resubmitted. Usage retains actual model, tokens,
duration and result. Missing reported cost stays unknown. Completed requests drop
queued credential identifiers; installation archives exclude those identifiers
and cancel pending requests. The usage ledger links to existing requests; erasing
a request removes that link while preserving anonymous historical counts.

A nonempty, trimmed `INSTALLATION_RELEASE_ID` takes precedence as background source provenance.
Otherwise the emitted Worker records the SHA-256 digest of its actual launch,
composition and channel source inputs, embedded at build time. Direct source
loading without the build define or a configured release has no source release;
it does not invent one. Authorized documents and manual work can still compose,
while analysis requests, automation retries, event and queue dispatch, and
scheduled processing retain their existing missing-release refusals.

Owner-defined launch automations retain their approving session identity and
recheck current operator, session, membership, policy and recipient authority.
Save them again after their approving session expires. Transport refusals that
are safe to retry reuse the original action key at 1, 5, 15, 30 and 60 minutes
from first failure. An uncertain external delivery stays Unknown for review and
is never automatically or manually resent. A manual retry of a Failed run creates
a linked run, preserving completed steps and the original run.

## Uncertain delivery contract — 14 October 2026

The owner accepted an explicit exception to AUTO-007's former promise to retry
every transport failure. An uncertain SendGrid submission retains the action and
run as Unknown, with their error code and message visible in Automation Monitor.
It creates no automatic retry and AUTO-009 permits manual retry only for Failed
runs. Known safe transport failures retain the five absolute retry offsets and
the original action keys; completed actions and the original run remain intact.
NOTIFY-003 follows the same distinction between confirmed failure and uncertainty.

An action key is local evidence, not a SendGrid idempotency guarantee. The current
SendGrid adapter provides no reconciliation operation that can authorize resending
an Unknown outcome. Reviewing provider evidence does not itself unlock a Cradle
retry; a future continuation path would need provider-specific reconciliation or
idempotency evidence proving that continuation is safe. A SendGrid acceptance
receipt proves submission acceptance, not mailbox delivery. This clarification
changes retry eligibility only; it adds no provider, authority, data migration or
delivery guarantee. The existing installed retry checks cover safe retry timing,
preserved completed actions, visible Unknown outcomes and rejected manual resend.

## Usage reporting

The configured OpenAI Responses adapter supplies token usage but does not report
an invoice charge. Those calls therefore show Unknown cost, never an estimate or
zero. Aggregation preserves any reported-cost values supplied by a supported
adapter; one missing charge makes that aggregate unknown. Settings filters calls
and aggregates through the caller's current analysis-source visibility.

Settings lists the most recent 100 currently visible calls. Day and feature
aggregates cover all currently visible history, using shared source scopes and
SQL aggregation. Anonymous metrics retained after request erasure are not exposed
as identifiable calls. Events capture the enabled definition versions at commit;
disabled definitions do not acquire old events when enabled later. Installing the
dispatcher marks historical events processed rather than replaying past changes.

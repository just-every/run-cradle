# Change subscriptions

This is partial contract work. No real provider call or consent was used.

All requests use an API-USER-001 key as `Authorization: Bearer <key>`.
Session credentials alone are refused. Each operation rechecks the key, its
issuer's delegation and current table/view policy. A base scope is the
intersection of that base and the tables the key can read.

- `POST /api/v1/change-subscriptions`: `{commandId, appId, entityId?, viewId?, url}`.
  Omit entityId and viewId for a base; supply entityId for a table, or viewId for
  a saved view. The response's `data` contains metadata, `cursor` and a once-only
  `signingKey`. Keep the key privately; it cannot be read again.
- `GET /api/v1/change-subscriptions?appId=<id>`: safe metadata, expiry and delivery
  state for this credential's subscriptions (currently bounded to 200).
- `POST /api/v1/change-subscriptions/<id>/refresh`: `{commandId}`. An active,
  unexpired subscription extends to seven days from the request clock.
- `DELETE /api/v1/change-subscriptions/<id>`: `{commandId}`.
- `GET /api/v1/change-subscriptions/<id>/changes?cursor=<cursor>&through=<cursor>&limit=100`:
  ordered `items`, a continuation `cursor`, the window's `through`, `hasMore`, and
  an optional range-level `resyncRequired` object (schema: `src/domains/change-subscriptions/schema.ts`).
  Limit is 1–200. Omit through to capture the present high-water mark; retain the
  returned through while paging or replaying that window. Fetch from the saved
  continuation to the newest ping's cursor for later changes. Cursor signatures
  bind the subscription, high-water position and time. Altered or foreign
  cursors are refused. An expired/inactive subscription refuses fetch (410).

The audit payload is the only change-value store. An additive audit sequence is
assigned in the same transaction as the record change and survives archives.
No independent payload log is created. Unchanged before/after cells produce no
change notification. Cursor access is retained for **30 days**; an older cursor
returns HTTP 410 `cursor_expired` naming resynchronization, separately from
HTTP 410 `subscription_expired` after seven days without refresh. Audit retention
itself is unchanged. On first fetch, a cursor durably captures its upper audit sequence. Reusing that
cursor returns the same ordered payloads under the same current policy, even
when later commits arrive. The response continuation captures a later window
when it is first used. Window rows hold only signed-cursor digests, subscription
IDs, positions and times, and are removed after 30 days.

Policy is applied at fetch time, conservatively: current unreadable rows have
no payload, fields outside current authority are omitted, and retained relation
or attachment cells use the ordinary server projection. A delete payload has
only its record ID plus change metadata (`id`, `sequence`, `kind: "delete"`).
A restricted-row or view-scoped delete whose current authority cannot be
established produces no delete item; it produces the same range-level marker
for every such uncertainty, even for a row the key could never read:

```json
{"items":[],"cursor":"<continuation>","through":"<window-end>","hasMore":false,"resyncRequired":{"code":"resync_required","message":"Something in this subscribed range could not be narrowed for this key; resynchronize the scope.","from":"<request-cursor>","through":"<continuation>"}}
```

The marker covers only that page's cursor range, contains no record identity,
field, value, table row count or per-record marker, and coalesces uncertainties
in that range. A subscriber can infer only that something in the subscribed
range could not be narrowed for this key; unchanged per-change ping timing/count
reveals range activity, without identifying a record or its prior readability.
This conservative default was approved by ct on 23 October: the signal cannot
hide all range activity. The marker has exactly the same code, message and range
fields for current row/field-policy narrowing and cursor expiry, so the marker
never confirms a restricted delete. HTTP 410 `cursor_expired` remains explicit
and includes that same generic marker, whose through cursor starts after a full
scope resynchronization. A policy-narrowed readable item may accompany a marker;
current unreadable create/update/restore items are omitted and still request resync.
Resynchronize the subscribed scope, save the continuation, then fetch later
changes; replaying a cursor retains the same range, including its marker under
unchanged authority. Paging advances past the range without dropping it or
repeating its delete items. Policy and current row/view membership are rechecked
on every fetch, so a changed policy or row can change readable payloads on replay.

`record.restore` is delivered as `kind: "restore"` in audit commit order, with
the normal change metadata, recordId, entityId and changes. Because restore
retains no separate audit delta, its create-like `changes` use the latest retained
audit after-cell per field before that restore, with null before cells; later
edits cannot rewrite that payload. No second value store is created. A readable
restore with no retained readable field deltas still yields a restore item with
an empty changes list. Every retained cell is projected under current authority.
Current unreadable rows produce no restore payload and the same generic resync
marker/ping as any policy-narrowed change; unreadable fields
are omitted, and relation/file cells use the ordinary projection. A subscriber
told of a delete receives the readable restore on its next range. View membership
is checked against the current view and record. Values never travel in a ping.

The receiver URL must be public HTTPS. The existing trusted egress relay pins
public DNS, verifies TLS, bounds responses and refuses redirects. Creation
requires the relay and private connection-encryption configuration. The signing
key and URL are AES-GCM sealed with subscription-specific associated data.

Each ping body contains `subscriptionId`, `scope`, `changeCount` (one), and the
newest `cursor`. Headers are `webhook-id`, `webhook-tenant` (base),
`webhook-destination` (subscription), `webhook-event` (`record.changed`),
`webhook-timestamp` (Unix seconds) and `webhook-signature` (`v1=<hex>`).
Decode the once-only base64url signing key to bytes. Verify HMAC-SHA-256 over
the UTF-8 encoding of this JSON array, preserving the exact raw body string:

```
["integrations.webhook.v1", tenant, destination, event, id, timestamp, rawBody]
```

Compare signatures in constant time; reject timestamps outside five minutes.
Deduplicate by webhook-id. Durable delivery IDs survive retries. The existing
bounded delivery seam retries explicit 429 responses; rejected, exhausted or
uncertain deliveries are shown as failed. Uncertain transport outcomes do not
authorize an automatic resend. The signed fetch window is the synchronization
truth, not the number of pings.

Queue wakes follow admitted record changes; scheduled scans recover work from
the durable subscription watermark and audit. Expired subscriptions stop and
lose their sealed secret. Current key/delegation policy is rechecked immediately
before transport. Lost authority disables the subscription. Archives preserve
metadata inactive with no secret and never resume sending; issuer erasure
registers deletion of subscription rows and their sealed secrets. Existing audit
erasure redacts the canonical retained values.

## Recovery, fair dispatch and unavailable scopes

The dispatcher serves the 200 oldest durable dispatch positions first, breaking ties
by subscription ID. Each batch advances through the same ordered audit rows;
active subscriptions beyond 200 therefore progress over successive ticks even
while earlier subscriptions keep changing. This reuses the subscription table with an additive dispatch-position column in 9049; no new table is created.
The safe subscription listing retains its existing 200-row bound.

HTTP 429 is a definite refusal: Base queues a bounded retry with the same logical
notification ID and immutable body. Other explicit 4xx refusals except 408 are
terminal rejections. Response loss, relay uncertainty, HTTP 408 or server responses
are uncertain: no automatic resend. The subscription's deliveryState shows failed;
its cursor remains the recovery source, and later changes have independent signed
pings. A subscriber saves the last successfully fetched continuation, fetches the
retained ordered window and deduplicates its change IDs. Unknown outcomes never
authorize resending an external effect under AUTO-007/AUTO-009.

When a still-current key's subscribed view or table becomes unavailable, the
subscription ends, loses its sealed secret and lists as ended/authority_lost.
The changes door returns an empty final captured range with the **same** generic
resyncRequired marker, no new cause, record ID, value or count, and hasMore=false.
Replays retain that range. Current scope-authority uncertainty uses the identical
answer; it does not confirm deletion. A revoked key remains refused, and the
seven-day subscription and 30-day cursor expiries still apply. No final outbound
ping bypasses the lost scope's authority. This conservative default is posted to ct.
View deletion is exercised now; table deletion's final-page proof remains open.

The populated-upgrade journey creates real old-schema audit facts and a deleted
view before 9045/9047, applies every shipped migration, then uses native sign-in,
public subscription/fetch and one-row paging to prove order, replay and fresh
unique sequences. The deleted view receives 30 days from the upgrade clock. This
also closes SNAP-002's specifically named 9047 backfill proof gap.

Person erasure's existing registered Trash cleanup now anonymizes the retained
audit reference and deltas of an identity-only held record in the same admission
that removes its canonical row. The feed consequently returns the existing generic
range marker. The journey checks entire feed responses, cursor windows and delivery
envelopes, and confirms the erased issuer's subscription/window/secret removal.
Broader record-erasure paths remain a gap.

## Remaining acceptance

The complete write-door/base-table-view matrix remains unproven for workbook/Sheets merges and MCP interoperability. `tests/helpers/change-subscriptions-write-doors.mjs` covers create/patch/delete/Trash restore, bulk/undo, range/inverse, authenticated forms, CSV create/update and automation updates under current row/field narrowing. Each door lists the mutation kinds it does not support. Reviewed base-import application/reversal bypasses admission_audit under RECORDS-005's existing effects suppression; typed Launch/repair/lifecycle audit actions are outside the feed projection; restore queue wakes and restored incoming-link audit coverage remain open. Table-scope final listing after table deletion, archive restore and broader person/record-erasure journeys remain unproven. No Zapier, Make or Crank application is supplied (INTEG-007 remains missing).

The existing `tests/user-webhooks.mjs` registration invokes the synchronization
matrix in `tests/helpers/change-subscriptions-deletes.mjs`: unrestricted id-only
delete, view/restricted range signals and replay/paging, signed pings, narrowed
restore and unreadable restore refusal, and a signed cursor at its issuance
clock minus 31 days returning `cursor_expired`. The existing subscription journey
separately moves the scheduled clock eight days and proves `subscription_expired`.

## c12 field/table integration and ct rider

`tests/helpers/field-trash-journey.mjs` proves table-scope final empty range capture and stable replay after restoration while the key remains current. Real issuer-policy changes still revoke old keys; a new current subscription sees no removed field identity or value. Restored records publish the durable queue wake (`tests/helpers/change-subscriptions-deletes.mjs`).

ct approved unavailable-scope semantics on 23 October and requires a generic marker until every write door is projected. Unprojected typed audit facts now signal that same marker. Import Kit custody lacks an audit sequence/time, so every fetched page of a base with retained import custody conservatively carries the marker, including empty pages. No import ping or automation effect is enabled. `tests/helpers/change-subscriptions-imports.mjs` exercises real apply, restart/resume, undo and rollback under base/table/view subscriptions, immutable replay and effect suppression. Ordinary import change projection and the full write-door matrix remain Gap items; no DONE is claimed.

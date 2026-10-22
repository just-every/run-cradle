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
  ordered payloads, a continuation `cursor`, the window's `through` and `hasMore`.
  Limit is 1–200. Omit through to capture the present high-water mark; retain the
  returned through while paging or replaying that window. Fetch from the saved
  continuation to the newest ping's cursor for later changes. Cursor signatures
  bind the subscription, high-water position and time. Altered or foreign
  cursors are refused. An expired/inactive subscription refuses fetch (410).

The audit payload is the only change-value store. An additive audit sequence is
assigned in the same transaction as the record change and survives archives.
No independent payload log is created. Unchanged before/after cells produce no
change notification. Cursor access is retained for **30 days**; an older cursor
is refused with a named window and requires resynchronization. Audit retention
itself is unchanged. On first fetch, a cursor durably captures its upper audit sequence. Reusing that
cursor returns the same ordered payloads under the same current policy, even
when later commits arrive. The response continuation captures a later window
when it is first used. Window rows hold only signed-cursor digests, subscription
IDs, positions and times, and are removed after 30 days.

Policy is applied at fetch time, conservatively: current unreadable rows have
no payload, fields outside current authority are omitted, and retained relation
or attachment cells use the ordinary server projection. A delete payload has
only its record ID plus change metadata. A restricted-row key receives no
delete tombstone when current authority cannot be established from the deleted
row. View membership is checked against the current view and record. Values
never travel in a ping.

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

## Remaining acceptance

Delete delivery, the full write-door matrix, archive restoration and person/
record erasure of retained feed values still need public-door proof. Base/view
scope journeys, deleted-scope final listing, at-least-once delivery after uncertainty and paged subscription listing remain
open. No Zapier, Make or Crank application is supplied (INTEG-007 remains
missing). These obligations are not narrowed by this implementation.

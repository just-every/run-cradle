# INTEG-004 — Google Calendar and Outlook

Status: done (DONE-JUSTIFIED by ct, 25 October 2026). Evidence: `tests/ui-records-calendar.mjs` via `tests/helpers/record-calendar-journey.mjs`, `tests/helpers/record-calendar-author.mjs`, `tests/helpers/record-calendar-retry.mjs`, `tests/helpers/record-calendar-bulk.mjs`, `tests/helpers/record-calendar-upgrade.mjs` and `tests/helpers/record-calendar-trash.mjs` (journey at 1440/390; author, retry, bulk, upgrade and Trash helpers at 1440 only; mandatory records-calendar-sync push group); `tests/rer-retained-archive.mjs` via `tests/helpers/record-calendar-archive.mjs`; `tests/helpers/record-calendar-proof.mjs` (push records-calendar-sync, Google/Outlook 1440/390; resolved-credential adapter guards and exact imported-record counts).

Sync definition and authority (ct, 23 October)
- A base owner or creator turns sync on for one date or date-range field. They choose a calendar connection they control and an owned calendar on it. They also choose the event title field and any further fields to show in the event. The setup screen states that everyone who can see that calendar will see those values.
- The definition is captured and versioned like an AUTO-USER-001 definition, and it runs under its author's current authority. If that authority is lost, or the connection is revoked or loses `record.calendar.sync`, no new effects start, and the field shows a stopped state.
- A field the author can no longer read leaves later events. The event description carries the record link, which opens only for people with current record authority.

Writes are execution effects (ct, 23 October)
- Every create, move and cancel is one execution effect of class `record.calendar.sync`, with operation `create|move|cancel`. Its idempotency key comes from (definition, record, event generation).
- A connection carries that class only after an explicit, audited approval that names the calendar ID. The resolved credential's account must equal that calendar (the existing `Calendar scope mismatch` guard).
- On Google, the event ID comes from the key. On Outlook (Microsoft Graph), the request sends the key as `transactionId` and as a private single-value extended property, and readback finds the event by that property.
- An unknown acknowledgement is reconciled by readback only and is never resent automatically. A definite 429 retries the same request. Clearing the date, moving the record to Trash, or deleting it cancels the event. Restoring the record creates a new generation.
- Only connection jobs read. No connection job writes to a calendar.

Calendar-side edits are reviewed, never written back (ct, 23 October)
- A read-only `connection.sync` job reads Cradle-marked events (Google private extended property, Outlook extended property) and compares each one to the last ETag or change key that Cradle wrote.
- A move, retitle or deletion made in the calendar opens a review item on the record and in the base's sync list. While that item is open, Cradle starts no further effect on that event.
- Someone with write authority on the date field resolves the item. "Apply to record" is an ordinary policy-checked write, and automations fire as usual. "Restore calendar from record" issues a `move` effect. Neither happens automatically.

Bulk and import (ct, 23 October)
- A bulk edit queues paced effects under AUTO-010-style fan-out, at most one per record per change.
- RECORDS-005 import writes start no calendar effect, consistent with their no-automation rule. The sync list counts records not yet on the calendar, and the definition's author can sync them explicitly.

Scopes: the narrowest scope that writes events is used and recorded in `docs/contract/INTEG-004/`: Google `calendar.events.owned` plus calendar listing; Outlook `Calendars.ReadWrite`.

Real Google/Microsoft provider consent is NOT RUN. Recorded network-edge journeys exercise the implemented calendar-sync effect class and review queue for both providers.

## Google and Outlook implementation

See [implementation.md](implementation.md) for the versioned definition, execution-effect, review and authority paths. Google uses `https://www.googleapis.com/auth/calendar.events.owned` plus `https://www.googleapis.com/auth/calendar.calendarlist.readonly`. Outlook uses `Calendars.ReadWrite`. The existing calendar registration exercises recorded Google and Microsoft Graph edges; real provider consent is NOT RUN.

# Capability mechanisms

## Formula display requests

CALC-006 preserves the optional REST query `cellFormat=string`: numeric REST and native JSON values stay raw; the requested display form uses the field’s formatting. The value 1234.5 with USD/two places reads as `$1,234.50`.

## Formula reference custody

CALC-005’s recorded reference rows live at `tests/fixtures/formulas/airtable-reference.json`. Each row retains formula text, input fields, captured expected value and date. This path is mechanism; the clause’s complete published function inventory and fixture bar remain acceptance requirements.

## Connected-store thumbnail transport

FILE-006 thumbnails are fetched on demand, never persisted, and served with `Cache-Control: no-store`. The ordered connection fallback never grants file content or download rights.

## Portable connected-store references

FILE-004 uses this exact ordered portable representation.

One object per reference, in the field's order, beside FILE-003's `kind:"file"` entries:
```json
{"kind":"store","schema":1,
 "provider":"google-drive|onedrive|dropbox|box|chest",
 "account":"<store's opaque drive/namespace id, or null>",
 "itemId":"<store's stable item id>",
 "name":"…","type":"<MIME>","size":<bytes|null>,"modified":"<ISO 8601 UTC|null>",
 "digest":{"algorithm":"sha256|sha1|md5|quickxor|dropbox-content-hash","value":"…"}|null,
 "link":"<store's own https link on the provider's host, or null>",
 "attachedBy":"<person reference as RECORDS-006 exports people values>",
 "attachedAt":"<ISO 8601 UTC>"}
```
- `digest` is the store's own content hash: Drive sha256, else sha1 or md5; OneDrive sha256, else quickXor; Dropbox content_hash; Box sha1. It is null only where the store gives none (native Google documents, Chest links).
- An export never carries the connection ID, a token or other credential, a thumbnail URL, a temporary or signed download URL, sharing settings, resolution state, or bytes.
- Base JSON holds the array natively. CSV-set and workbook cells hold the same array as canonical JSON text (sorted keys, no whitespace).
- The existing per-view CSV keeps its FILE-002 columns.
- Row and field policy, and RECORDS-006 fencing, apply as to any value. An erased attacher exports as their anonymous label.

### Resolution metadata

- Preview makes no writes. It resolves each reference by a read-only connection-job metadata lookup, only through a connection already held by the returning person for the same provider and account, and it names counts for each outcome.
- Resolved means the item is found and the digest matches. A null digest also resolves, but is marked "unverified".
- Each other outcome lands as a visibly **unresolved** reference: no matching connection; not found or no access; digest changed. An unresolved reference shows its name, type, size, provider and link, with an "Unresolved" badge and no thumbnail. It is listed on the move-in receipt beside the skipped-attachment list.
- Import never prompts for consent mid-job, never binds a reference to another person's connection, and never guesses. A cell that is not a valid array is a row error naming the cell.
- Afterwards, a person with write authority on the field and a matching connection of their own can resolve references. A changed digest is accepted only by explicit per-reference or bulk confirmation, which is recorded and refreshes name, size, modified and digest from the store.
- The portable fields are canonical content, so re-exporting a base whose references are still unresolved reproduces identical objects. Resolution state and connection binding are installation-local, outside the capture envelope.

## Calendar sync execution and connection custody

A date or range field can keep an event in a chosen Google or Outlook calendar in step with the record (create, move, cancel), with the event linking back; changes made in the calendar are shown for review rather than silently written back.

Sync definition and authority (ct, 23 October) - A base owner or creator turns sync on for one date or date-range field.
They choose a calendar connection they control and an owned calendar on it.
They also choose the event title field and any further fields to show in the event.
The setup screen states that everyone who can see that calendar will see those values. - The definition is captured and versioned like an AUTO-USER-001 definition, and it runs under its author's current authority.
If that authority is lost, or the connection is revoked or loses `record.calendar.sync`, no new effects start, and the field shows a stopped state. - A field the author can no longer read leaves later events.
The event description carries the record link, which opens only for people with current record authority.
Writes are execution effects (ct, 23 October) - Every create, move and cancel is one execution effect of class `record.calendar.sync`, with operation `create|move|cancel`. Its idempotency key comes from (definition, record, event generation). - A connection carries that class only after an explicit, audited approval that names the calendar ID. The resolved credential's account must equal that calendar (the existing `Calendar scope mismatch` guard). - On Google, the event ID comes from the key. On Outlook (Microsoft Graph), the request sends the key as `transactionId` and as a private single-value extended property, and readback finds the event by that property. - An unknown acknowledgement is reconciled by readback only and is never resent automatically. A definite 429 retries the same request. Clearing the date, moving the record to Trash, or deleting it cancels the event. Restoring the record creates a new generation. - Only connection jobs read. No connection job writes to a calendar. Calendar-side edits are reviewed, never written back (ct, 23 October) - A read-only `connection.sync` job reads Cradle-marked events (Google private extended property, Outlook extended property) and compares each one to the last ETag or change key that Cradle wrote. - A move, retitle or deletion made in the calendar opens a review item on the record and in the base's sync list. While that item is open, Cradle starts no further effect on that event. - Someone with write authority on the date field resolves the item. "Apply to record" is an ordinary policy-checked write, and automations fire as usual. "Restore calendar from record" issues a `move` effect. Neither happens automatically. Bulk and import (ct, 23 October) - A bulk edit queues paced effects under AUTO-010-style fan-out, at most one per record per change. - RECORDS-005 import writes start no calendar effect, consistent with their no-automation rule. The sync list counts records not yet on the calendar, and the definition's author can sync them explicitly. Scopes: the narrowest scope that writes events is used and recorded in `docs/contract/INTEG-004/`: Google `calendar.events.owned` plus calendar listing; Outlook `Calendars.ReadWrite`.

## Zapier validation commands

INTEG-007’s local Zapier app runs each trigger, action and search through `zapier test`; `zapier validate` checks its platform definition. Make module runs use Make app SDK tooling. The real published-app scenario and public catalog receipts remain Field proof register items.

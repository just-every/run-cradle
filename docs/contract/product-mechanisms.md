# Cradle product mechanisms

The contract describes observable outcomes. This document records the formats,
transport controls and operating details used to achieve them. Company policy
decides agent calls according to their server-computed fleet risk classes; a
product capability identifier is not a fleet risk class.

## Schema adoption and proposal custody

Manual schema changes use the impact-preview and `release.adopt` operation. The
saved preview binds the source schema, record state, authority and proposed
changes. Adoption rechecks them and applies the accepted revision atomically.
The release retains the preview hash, and the adoption audit names the actor,
proposal and proposing credential. Recovery exports remain subject to current
record and field authority.

A proposing credential is a one-time machine secret stored as a digest, scoped
to one manual base or a new base, expiring within 30 days and revocable from
Settings. The narrow proposal credential reads authorized schema, prepares
changes and lists, reads or withdraws its own proposals. It does not itself
confer record, administration or adoption authority. A proposal retains source
names, help text and notes as inert text. They cannot create membership, a grant,
a credential, an automation, a connection or an outbound effect. Proposal
custody lasts seven days; a decline can carry a note readable by its proposing
agent. A narrow credential does not set the company's disposition for a
separately authorized adoption tool.

## Delivery relay controls

Webhook and Slack destination URLs are immutable encrypted configuration. A new
webhook signing key is displayed once. Neither later listings nor run history
recover it. Base integrations prepare signatures and classify delivery outcomes.

The trusted relay uses public-DNS-pinned verified TLS and HTTPS-only
destinations. It follows no redirects, bounds requests and responses, and has
finite timeouts. The owner provisions its HTTPS endpoint; shipping a relay
command's source is not evidence that such an endpoint has been provisioned.
Missing required relay configuration is a configuration failure.

## Portable connected-store references

**Shape.** One object per reference, in the field's order, beside FILE-003's `kind:"file"` entries:
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

The schema permits `digest` to be null. Its value is the store's own content
hash: Drive SHA-256, otherwise SHA-1 or MD5; OneDrive SHA-256, otherwise QuickXor;
Dropbox `content_hash`; Box SHA-1. It is null only when the store gives none,
including native Google documents and Chest links.

An export carries no connection ID, token or other credential, thumbnail URL,
temporary or signed download URL, sharing settings, resolution state or file
bytes. Base JSON stores the array natively. CSV-set and workbook cells store
the same array as canonical JSON text with sorted keys and no whitespace. The
ordinary per-view CSV retains its connected-store columns. An erased attacher
is represented by their anonymous label.

Preview performs no writes. A read-only connection-job metadata lookup can use
only a connection the returning person already holds for the same provider and
account. The preview counts every outcome. An item found with an equal digest
resolves; an item with a null digest resolves with an Unverified label. A
missing matching connection, a missing or inaccessible item, or changed digest
leaves a visibly Unresolved reference. It retains its name, type, size,
provider and link, with no thumbnail, and is listed on the move-in receipt
beside skipped attachments.

Import obtains no consent mid-job, uses no other person's connection, and
chooses no ambiguous match. A malformed array is a row error naming its cell.
Afterward, a person with field-write authority and their own matching
connection can resolve references. Confirming changed content is explicit per
reference or in bulk, recorded, and refreshes the name, size, modified time and
digest. Portable fields remain canonical content: re-export before resolution
reproduces identical reference objects. Resolution and connection bindings are
installation-local and outside the capture envelope.

## Connected-store preview custody

A personal connection belongs to its connecting person. Credentials are sealed;
no other person, including the installation owner, browses or previews through
it. The installation owner can disable a provider, narrow who may connect and
revoke connections. Deprovisioning a person revokes their connections.

Readers with current row and field authority see a reference's name, type,
size and store link. Thumbnail retrieval first uses the viewer's own connection
to the same provider and account when the store allows the viewer to read the
item. Otherwise it can use the attacher's connection only when the attacher
has enabled “Share previews of files I attach with people who can read this
field.” The setting is off until chosen, is offered at attach time, is audited
and revocable, and covers thumbnails only. It does not grant content or
download access. It ends when the attacher loses field-read authority or the
connection is revoked. With neither route available the cell offers “Connect
store to preview.” Thumbnails are never persisted and are served `no-store`.

## Calendar sync execution

A base owner or creator enables sync for one date or date-range field, chooses
a controlled connection and owned calendar, and chooses the title and other
fields shown in the event. Setup states that everyone with access to the
calendar will see those values. The definition is versioned and captured like
an automation definition, and runs under its author's current authority. Loss
of that authority, connection revocation or loss of the calendar-write
capability stops new effects and shows the field's stopped state. A field the
author can no longer read is absent from later events.

A create, move or cancel is an execution effect with capability identifier
`record.calendar.sync` and operation `create`, `move` or `cancel`. Its
idempotency identity binds the definition, record and event generation. A
connection's authorization names the calendar. Its resolved credential account
must match that calendar. These capability identifiers are not fleet risk
classes: a call exposing or changing an outside calendar carries external and
any other classes its actual facts add, and company policy decides it.

Google event IDs derive from the idempotency identity. Microsoft Graph receives
it as `transactionId` and as a private single-value extended property;
reconciliation finds the event by that property. An unknown acknowledgment is
reconciled only by readback and is not automatically resent. A definite 429 can
retry the same request. Clearing the date, trashing or deleting the record
cancels its event. Restoring the record begins a new generation. Connection
jobs read; execution effects write.

A read-only `connection.sync` job compares Cradle-marked events against the
last ETag or change key Cradle wrote. An outside move, retitle or deletion
opens a review item on the record and base sync list. While it remains open,
no new effect starts for that event. Resolving it by Apply to record is an
ordinary write that fires normal automations. Restore calendar from record
creates a move effect. Agent equivalents carry their server-computed classes
and the company's policy decides them.

Bulk changes queue paced effects, at most one per record per change. Reviewed
base-import content writes create no calendar effects, consistent with their
no-automation rule. The sync list counts records absent from the calendar; the
definition's author can explicitly sync them. The narrow Google scopes are
`calendar.events.owned` plus calendar listing; Outlook uses
`Calendars.ReadWrite`.

## Installation document and first-run transport

The public run site is built from `src/site/pages.tsx` through `rer build
--site`; it owns product landing content. An installed `/` uses Base's shared
Lobby, with edition identity from `src/identity.ts`. Its durable owner-claim
record is `oa_bootstrap`. `/setup/state` reads that record and returns exactly
`{"state":"unclaimed"}` or `{"state":"claimed"}`, without a session and with
`no-store`. The Lobby runs no script and is the same for every visitor.

Base operator-auth bootstraps the configured first owner atomically on an empty
auth store using the deployment setup token; neither mail nor an existing owner
session is a prerequisite. Replacing the token does not reset the setup ledger.
Cradle maps admitted identities onto its product IDs and policy, and prepared
mutations fence session revocation.

A local owner runs `rer dev`, which establishes a Base dev session through the
checkout key. Optional `rer setup` writes private credential files with mode
0600. Configured workspace name, time zone and currency are persisted as
confirmed first-run details at initialization; otherwise the signed-in owner
completes them in setup. Missing required owner-email configuration fails
closed. Hosted sign-in needs its explicitly configured mail sender and exposes
no captured-mail inbox or outbox page. The sign-in form accepts a complete
email in `login_hint`, declared by the app sign-in deployment surface.

## Formula reference custody

The formula reference fixture records formula text, its input field values and
expected values captured from an actual incumbent base, together with capture
date. Every supported function has a row, including blank, error, time-zone and
US federal-holiday edges. The Airtable reference lives at
`tests/fixtures/formulas/airtable-reference.json`. The product's function and
translation promises remain in its contract; a fixture filename is not proof
that the reference capture or evaluator journey has run.

## Further transport and implementation records

### APP-SCOPE-001

Existing operators retain exactly their legacy launch rights. Enabling repair navigation in `src/ext/config.ts` grants no record visibility or actions and does not activate mandates, providers or background work. New scopes require explicit owner mapping.
Repeated setup and legacy mapping preserve explicit scopes and revocations.

### DOCS-001

Every page listed in `docs/site.json` is served without a session at `/docs` (the first page) or `/docs/<slug>`, rendered from its Markdown file inside the same header and footer as the product page (HOME-002), with the Docs link marked as the current page, and with each page's source linked on GitHub at `https://github.com/just-every/run-cradle/edit/main/<file>`. The installed instance's header and footer also link `/signin`; the run site serves the same pages statically without it.

### DOCS-001

The docs show no record content and add no sessionless path beyond `/docs` and `/docs/`.

### DOCS-001

Public document runtime and built-site tests through `/`, `/docs`, `/setup` and `/signin`.

### API-USER-003

The installation publishes its endpoints at `/.well-known/oauth-authorization-server` (RFC 8414).

### SCALE-002

`limits.fieldsPerTable`

# Cradle API v1

Use **Settings → API keys** while signed in as the installation owner. Select an
application and record type, choose read access or access to create and update, and set a
7, 14 or 30 day expiry. Copy the key once into your service's private settings.
Cradle stores its digest. The listing contains its scope, expiry and revocation
state. Revoke it from the same panel. Keys do not sign into the browser.
Writable keys can separately opt into record deletion. This option starts
unchecked and is cleared when read access is selected. The retained listing
shows the actions actually granted to each key.

## Generated record API

Fetch `GET /api/v1/apps/{appId}/openapi.json` for the live OpenAPI 3.1 document.
It describes the currently readable fields and the operations below. Each table
uses the prefix `/api/v1/apps/{appId}/rest/entities/{entityId}`.

| Method and suffix | Purpose |
| --- | --- |
| `GET /api/v1/apps/{appId}/rest/entities/{entityId}` | Read the table schema |
| `POST /query` | Filter, sort and page records |
| `GET /records/{recordId}` | Read one record |
| `POST /records` | Create a record with `commandId`, `schemaVersion` and `values` |
| `PATCH /records/{recordId}` | Update with `commandId`, current `version` and `changes` |
| `DELETE /records/{recordId}` | Move to Trash with `commandId`, current `version` and `confirmation` equal to the record ID |
| `POST /batch` | Atomically create, update or delete up to 100 rows |
| `PUT /upsert` | Create or update by a readable, writable scalar unique `mergeFieldId` |
| `GET /records/{recordId}/comments` | Read or search the record's comments |
| `POST /records/{recordId}/comments` | Add a comment with `commandId`, `recordVersion`, `body` and optional `mentions` |
| `PATCH /records/{recordId}/comments/{commentId}` | Edit your comment with its current `version` and the add-comment fields |
| `DELETE /records/{recordId}/comments/{commentId}` | Delete your comment with `commandId`, `recordVersion` and comment `version` |
| `POST /records/{recordId}/attachments` | Begin a private upload for one writable attachment field |
| `PUT /records/{recordId}/attachments/{fileId}/content` | Upload the exact declared bytes |
| `GET /records/{recordId}/attachments/{fileId}/content` | Download verified bytes with current record and field visibility |

Queries accept an optional `formula` string using the shipped formula language,
for example `AND({Approved}, {Count} > 3)`. A condition `filter` can narrow it
further. Formula queries scan at most 10,000 currently readable candidate records;
larger queries are refused rather than returning an incomplete result. Hidden
fields and unavailable formula dependencies are refused. The response includes
only the selected readable fields, even when the formula needs other fields.
Continue with the returned cursor and the same query. A changed query, data or
authority requires a fresh first page.

Each authenticated credential has a durable limit of 120 requests in a 60-second
window shared across this namespace and its generated document. The document
declares this limit in `x-cradle-rate-limit`. Excess requests return HTTP 429 and
`Retry-After` in seconds before admitting any write. A different credential has
its own window. Native browser sessions do not use this credential limit.

Comment reads follow the record's current visibility. Comment writes use native
comment permissions, and only the author can edit or delete. Ordinary record
keys grant no comment write authority. Use a current native session for those
writes, with the installation Origin and its CSRF token.

Uploads currently require a workspace owner session, plus current read and write
access to the chosen attachment field. Ordinary record keys cannot upload.
Begin with `commandId`, `fieldId`, `filename`, `mediaType`, `bytes` and `sha256`.
Send the bytes to the returned `uploadUrl` using its declared Content-Type and
the same current owner session, Origin and CSRF token. The upload verifies its
length, media signature and checksum before making content available. Then link
`[{"fileId":"<returned ID>"}]` with an ordinary record update to that original
field. Files cannot be reused as another record's attachment. Reads remain
subject to current record and field visibility, including after key revocation.

The existing proposal door remains the only way to propose schema changes;
record keys cannot adopt schemas. Personal tokens and longer key lifetimes are
not available through this API. Automatic linked-record cascade and unlink
policies are not authored by the current manual builder. Its restricted links
must be explicitly cleared before deleting a referenced record.

## Rotate a key

Use **Rotate** beside an active API or proposing key, **Rotate signing key** in
the webhook action editor, or **Rotate subscription** in API-key Settings. The
replacement secret is shown once. Save it in the receiver or service before
closing that result. Rotation preserves an API key's authority and expiry and
carries its change subscriptions to the replacement credential.

The REST commands accept a fresh `commandId`:

| Command | Additional input |
| --- | --- |
| `POST /api/user-keys/:id/rotate` | `appId` |
| `POST /api/proposer-keys/:id/rotate` | None |
| `POST /api/user-automations/destinations/:id/rotate` | `appId`, `entityId` |
| `POST /api/v1/change-subscriptions/:id/rotate` | The subscription's API bearer key |
| `POST /api/v1/change-subscriptions/owner/:id/rotate` | Owner session and `appId` |

Issuing the replacement and retiring the old credential share one guarded
transaction. A repeated committed command returns a conflict; it never recovers
the secret. Subsequent authentication rejects the retired API or proposing key.
A write already committed stays committed. A delivery prepared before a signing
key rotation may finish using the retired key; subsequent preparations and retries
use the current signing key. Subscription cursors and delivery positions remain
unchanged.

The owner audit log and CSV/JSON exports record one `api-key.rotate`,
`proposing-key.rotate`, `webhook.rotate`, `subscription.rotate` or `scim.rotate`
event per rotation, with the actor and retired/replacement key IDs. Secret values
and digests are never audit metadata. SCIM retains its existing rotation command.

Send `Authorization: Bearer $CRADLE_KEY` over your installation's HTTPS origin.
Keep the key out of URLs, logs and source files. Local trials use their selected
loopback origin. Exported installations never carry active API keys.

Reads return `{ "data": ..., "meta": { "requestId", "apiVersion",
"evaluatedAt", "consistencyToken" } }`. Errors return an `error` with a safe
`code` and `message`. Unavailable metadata is omitted; an inaccessible record or
command is refused. Current app, row, field and issuer policy applies to every
request. Changing issuer policy, membership, owner role or authentication epoch
withdraws the prepared key approval; issue a new key after review.

| Request | Result |
| --- | --- |
| `GET /api/v1/apps` | Accessible applications in `data.items` |
| `GET /api/v1/apps/:appId/entities` | Accessible schemas and field IDs |
| `POST /api/v1/apps/:appId/entities/:entityId/query` | Records; JSON query supports `limit`, `fields`, `filter`, `sort` and `cursor` |
| `GET /api/v1/apps/:appId/entities/:entityId/records/:recordId` | Current `data.record`, with its `ref`, `version` and typed field cells |
| `POST /api/v1/commands/record.create` | Admitted create, for a write key |
| `POST /api/v1/commands/record.patch` | Admitted versioned update, for a write key |

For example, after placing your private key in `CRADLE_KEY` and the installation
address in `CRADLE_ORIGIN`:

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $CRADLE_KEY" \
  "$CRADLE_ORIGIN/api/v1/apps"
```

Use the returned application, schema, field and record identifiers rather than
guessing them. A record patch has this JSON shape; replace the bracketed values
with the actual IDs and version read from the API:

```json
{
  "commandId": "<new ULID>",
  "expected": [{
    "ref": { "appId": "<app>", "entityId": "<entity>", "recordId": "<record>" },
    "version": 3
  }],
  "input": {
    "ref": { "appId": "<app>", "entityId": "<entity>", "recordId": "<record>" },
    "changes": { "<field ID>": "Updated value" }
  }
}
```

For `record.create`, `input` contains `appId`, `entityId` and a `values` map. Its
expected revision uses the current schema: `entityId` is
`00000000000000000000000001`, `recordId` is the actual target entity ID, and
`version` is that schema's current version. Record cells follow the schema:
numbers use decimal strings, booleans use JSON booleans, selects use option IDs,
and links use record references.

An admitted command returns `data.state` and `data.value`. Retain its command ID
and exact request until you have the outcome. Repeating the same committed
request returns its original result; reusing the ID for changed input is refused.
A stale expected version requires a new read and an explicit conflict decision.
The API does not silently overwrite another change. A write key cannot manage
members, policy, grants, other keys or the owner.

Key management and automation-definition routes are browser-owner operations at
`/api/user-keys` and `/api/user-automations`; they require the actual owner session
and CSRF token, and cannot be invoked by an API key.

A **proposing key**, issued in the same panel, is a different kind of key: it
lets an agent propose a new base or a schema change for you to review, and it
reaches only the proposal door. See [Agent proposals](agent-proposals.md).

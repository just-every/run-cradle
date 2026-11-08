# Cradle API v1

Use **Settings → API keys** while signed in as the installation owner. Select an
application and record type, choose read or read/create/update access, and set a
7, 14 or 30 day expiry. Copy the key once into your service's private settings.
Cradle stores its digest. The listing contains its scope, expiry and revocation
state. Revoke it from the same panel. Keys do not sign into the browser.

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
can be used for nothing else. See [Agent proposals](agent-proposals.md).

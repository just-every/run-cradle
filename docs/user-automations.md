# Record automations

Open **Automations**, select an application and record type, and create a record
automation. Choose **record created** or **record updated**, then add ordered
actions: notify a member, email a member, update a field, send a signed webhook,
or post a Slack message. Approve it for up to 30 days. Save again to renew or edit
it. Disable cancels queued runs and stops further actions. Existing runs keep
the definition version captured when their triggering change committed.

Run history shows each action and its final outcome. Current owner, policy,
record, credential and recipient authority is rechecked before effects. A member
must still be able to read the triggering record to receive a notification or
email. Message text is an explicit literal; there is no executable template or
arbitrary code. Updates to read-only or computed fields are refused. A causal
chain cannot execute the same automation again; suppressed runs remain visible.

Local email appears in the ordinary Base development outbox. Hosted email needs
the installation's configured verified mail sender. Webhook bodies contain the
record reference, event, version and delivery identity, rather than record field
values. Slack sends the owner's explicitly approved literal message.

Save an HTTPS receiver in the action editor. Its URL and signing key are
encrypted at rest. Copy the webhook signing key when first shown; it cannot be
recovered later. Saving a new destination rotates the configuration. Verify
receipts with Base integrations' `verifyWebhook`, using the original body bytes,
the key decoded from base64url, expected application ID as `tenant` and the
saved destination ID. The `webhook-*` headers bind the body, event, tenant,
destination, delivery ID and timestamp. Keep accepted delivery identities to
reject receiver-side duplicate processing. A body or destination change fails
verification.

An **Unknown** action may already have been accepted. The automation does not
resend it. Check the receiver's delivery receipt before taking further action.
Failures before dispatch and rejected responses are recorded separately.

## Trusted egress relay

Webhook and Slack actions require an operator-owned HTTPS relay. Set
`EGRESS_RELAY_URL` to its exact `/v1/deliver` endpoint and keep a random credential
of at least 32 characters in `EGRESS_RELAY_SECRET` on both Cradle and the relay.
The installation's managed `CONNECTION_ENCRYPTION_KEY` encrypts destinations.
Run setup after upgrading to generate that private key if it is missing.

The supplied source command runs a loopback listener behind the operator's
HTTPS reverse proxy:

```sh
pnpm run egress:relay
```

Load the relay credential through the process's private environment and use
`EGRESS_RELAY_PORT` to choose its loopback port (default 8789). The command does
not create hosting, certificates or a deployment. Stop it with Ctrl-C.

The real relay uses the vendored Base `NodePinnedTransport`: it validates all
DNS answers, pins a public address to verified TLS, permits HTTPS only, and never
follows redirects. Destination requests are limited to 1 MiB, responses to
64 KiB, and DNS/transport phases to five seconds each. Relay input is bounded to
2 MiB and 15 seconds; Cradle's fixed relay fetch has a 15-second abort and a
bounded streamed response. Missing or invalid configuration is a visible failure
and never selects an ordinary direct-fetch alternative. Relay provisioning and
live receiver acceptance belong to the operator.

# Record approvals and link previews in chat

In **Settings → Chat app**, the installation owner selects Slack, Microsoft Teams
or Nook. One provider is active at a time. App secrets are encrypted and never
returned by Settings. Replacing credentials requires a fresh installation.

Each person links their own signed-in Cradle account using the one-time
`/cradle-link` command shown in Settings. A channel approval writes as the person
who clicks, under their current record and field authority. A stale record, an
unlinked person, or a person who has lost access cannot apply a decision. Links
are isolated by provider and workspace; changing providers does not convert a
Slack identity into a Teams or Nook identity.

The automation author selects a channel and an editable field, and chooses the
Approve and Reject values. The message shows both values before the decision.
Messages and previews can span multiple text blocks without truncation. Slack
sections stay within 3,000 characters and messages within 50 blocks. Text above
that message budget is refused before a delivery is claimed. An uncertain send
is retained as unknown and is never automatically resent.

Only a current base owner chooses fields safe for previews. A preview always
rechecks the linked poster's current row and field policy. Unlinked or unauthorized
posters receive no record values, and fields outside the poster's current read
scope are omitted even when an owner previously marked them safe.

## Slack

Configure the Slack client ID, client secret and signing secret, then install by
OAuth. Required bot scopes are `chat:write`, `channels:read`, `groups:read`,
`links:read`, `links:write` and `commands`. Settings shows the redirect and callback
URLs. The channel picker includes channels the bot has joined.

## Microsoft Teams

Configure the Microsoft app client ID, client secret and tenant ID. Installation
uses that tenant's Microsoft OAuth consent for `Team.ReadBasic.All`,
`Channel.ReadBasic.All` and `ChannelMessage.Send`. The picker lists the connected
person's joined teams and channels, and Graph sends an Adaptive Card. An expired
or revoked delegated token fails visibly; install again to reauthorize it.

Use the interaction URL as the Bot Framework messaging endpoint. It accepts
linking commands, card submissions and `composeExtension/queryLink` invokes.
Callbacks require an RS256 Bot Framework token with the configured app audience,
Microsoft issuer, current lifetime and configured Teams tenant. Signing keys come
only from Microsoft's fixed Bot Framework discovery and key endpoints. Preview
invokes return a policy-filtered Adaptive Card rather than posting another message.

## Nook

Configure the installation's public HTTPS origin, app ID, scoped app token and
app signing secret. The declared app protocol uses `/api/slack/auth.test`,
`conversations.list`, `chat.postMessage` and `chat.unfurl`, with Slack-compatible
signed command, interaction and link-event callbacks. `auth.test` must report the
workspace and the scopes listed for Slack above before installation completes.
The origin cannot contain a path, query or fragment, and all calls pass through
the trusted HTTPS relay's public-DNS and size checks.

This requires Nook's app Web API, interactivity and unfurl protocol. A post-only
Nook integration token is insufficient; Cradle does not fall back to its native
message-post route or invent unsupported permissions.

## Switching and restoration

Switching providers invalidates old pending message decisions. A random installation
binding also prevents removing and reinstalling the same workspace from reviving an
old card, even if its numeric version happens to match. The installation-binding
upgrade intentionally refuses cards sent by older versions: those cards have no
provable binding. Request a fresh delivery explicitly; the upgrade never resends
an old message automatically. Approval definitions
retain their provider, so an old action cannot send through a newly selected
provider until the author reviews it and selects a channel for that provider.
A message already accepted by an external provider cannot be recalled by switching.

Installation archives exclude app credentials, tokens, OAuth state and account
links. Pending exported decisions are retired. After restoration, configure the
provider again, install it and link native people again before enabling new effects.

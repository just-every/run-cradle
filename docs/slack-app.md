# Slack app automations and record previews

The installation owner configures a Slack app in Settings → Slack app. Set the connection-encryption key and the trusted HTTPS egress relay first. Use the client ID, client secret and signing secret from the owner's Slack app. Cradle encrypts the secrets and OAuth token and never returns them through Settings. Replacing credentials disconnects the installation until the owner installs the app again.

In the Slack app configuration, use the OAuth callback, interaction, event and link-command URLs shown in Settings. Enable interactivity, subscribe to `link_shared`, add the installation's own host to the app's unfurl domains, and configure the `/cradle-link` slash command. The installation requests `chat:write`, `channels:read`, `groups:read`, `links:read`, `links:write` and `commands`. Install through the Settings button and select the owner's Slack workspace. Invite the bot to each destination channel; the channel picker shows channels it has joined.

Each person links their own account from Settings. Generate the one-time command, run it in the installed Slack workspace, then refresh the link. No email-address matching links accounts. Issuing another code revokes an older unused code; unlinking revokes outstanding codes as well as the account link. An inactive, removed or changed native account cannot continue using its old link.

Choose **Slack app approval** in an automation, select a channel, and compose the message and approval field's two values. Slack receives the record's readable primary field, the composed message, the exact field changes behind Approve and Reject, and a link back to Cradle. A send is claimed durably before its single network attempt. An uncertain acknowledgement stays unknown and is not automatically resent.

A button uses the clicking person's current Cradle policy. It cannot borrow the app owner's authority. The stored choices, original message and record version bind the decision; a changed record, applied decision, unlinked person or unauthorized person leaves the record unchanged. Slack signatures and a five-minute replay window protect incoming requests. Successful writes and their audit entries name the clicking native person.

A base owner chooses additional preview-safe fields under **Record-link previews** in Settings. A pasted record link previews only its primary field and those additional fields that the linked poster can currently read. Current ownership of the saved field selection is checked too. Unlinked or unauthorized posters receive no record values. Previews use plain text.

Slack's block limits bound this slice. An approval whose primary field, composed text or field-choice description exceeds its 3,000-character section limit is refused before sending. A preview whose allowed projection exceeds 3,000 characters shares no values. Larger multi-block messages and previews remain unbuilt. Microsoft Teams and Nook integrations remain unbuilt.

Installation archives exclude Slack configuration, OAuth state and account-link credentials. Pending approval choices restore retired, and automations restore disabled; reconnect and review before enabling new work. Local provider acceptance uses a network-edge fake; no live Slack app consent has been exercised.

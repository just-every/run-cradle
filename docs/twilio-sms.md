# Twilio SMS automations

The installation owner connects their own Twilio account in Settings → Twilio SMS. Configure the installation connection-encryption key and trusted HTTPS egress relay first. The relay must run this checkout's current relay implementation, which supports the provider's GET and POST requests. Credentials are encrypted, never returned to the browser, and can be replaced or removed in Settings.

Save the Account SID, Auth Token and either a sending number or Messaging Service SID. Settings reads the associated US A2P 10DLC campaign and brand registration status from Twilio. Registration status is informational; Twilio decides whether a message may be sent. Set the incoming-message webhook shown in Settings on the sending number in Twilio.

In an automation, choose **Send SMS**, a readable text field containing the recipient's phone number, and a message. **Insert record value** inserts a field reference. A lookup with a text result is also supported. Phone values normalize to E.164; ten-digit numbers use the US country code. Blank or invalid values fail the run with the field and record identified. The phone field type itself remains part of FIELD-001.

Sending rechecks the automation's current record and export authority. A durable claim precedes the single Twilio request. An uncertain acknowledgement is shown as unknown and is never resent automatically. Delivery callbacks update run history and the record's history. Callback URLs expire after 24 hours, and Twilio signatures are required.

STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE and OPTOUT suppress further sends to that number throughout the installation. START, YES and UNSTOP remove the suppression. HELP and INFO are recorded. Inbound signatures are checked, then the message is read back from Twilio to verify its account, direction, content, sender, recipient and freshness. A replay changes nothing.

Native SMS does not identify the outgoing message being answered. When one record matches that sending/recipient number pair, the reply is recorded on that record. If multiple records match, consent still updates the installation suppression list, but Cradle records a generic inbound receipt instead of attributing the reply to a guessed record. This shared-number attribution remains an INTEG-006 gap.

Local acceptance uses a network-edge Twilio fake. No live Twilio account or provider consent has been exercised.

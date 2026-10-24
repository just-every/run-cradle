-- Owner-managed Twilio credentials and durable one-attempt SMS custody.
CREATE TABLE sms_installation (
 id TEXT PRIMARY KEY CHECK(id='installation'), owner_id TEXT NOT NULL,
 account_sid TEXT NOT NULL, from_value TEXT NOT NULL, sealed_json TEXT NOT NULL,
 version INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE sms_messages (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, command_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, app_id TEXT NOT NULL, entity_id TEXT NOT NULL, record_id TEXT NOT NULL,
 field_id TEXT NOT NULL, recipient TEXT NOT NULL, sender TEXT NOT NULL,
 provider_sid TEXT UNIQUE, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX sms_messages_recipient ON sms_messages(recipient,created_at);
CREATE TABLE sms_suppressions (recipient_hash TEXT PRIMARY KEY, updated_at INTEGER NOT NULL);
CREATE TABLE sms_webhook_receipts (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);
CREATE TABLE sms_inbound_events (receipt_id TEXT PRIMARY KEY, recipient_hash TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL);

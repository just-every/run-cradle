-- One owner-managed Slack app installation; people link without email inference.
CREATE TABLE slack_app_installation (
 id TEXT PRIMARY KEY CHECK(id='installation'), owner_id TEXT NOT NULL,
 client_id TEXT NOT NULL, sealed_json TEXT NOT NULL, bot_sealed_json TEXT,
 team_id TEXT, team_name TEXT, version INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE slack_app_oauth_states (
 state_hash TEXT PRIMARY KEY, actor_id TEXT NOT NULL, session_id TEXT NOT NULL,
 config_version INTEGER NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE slack_app_link_codes (
 code_hash TEXT PRIMARY KEY, principal_id TEXT NOT NULL, authentication_epoch INTEGER NOT NULL,
 base_operator_id TEXT NOT NULL, base_operator_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE slack_app_links (
 team_id TEXT NOT NULL, slack_user_id TEXT NOT NULL, principal_id TEXT NOT NULL,
 authentication_epoch INTEGER NOT NULL, base_operator_id TEXT NOT NULL,
 base_operator_version INTEGER NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(team_id,slack_user_id), UNIQUE(team_id,principal_id)
);
CREATE TABLE slack_app_unfurl_fields (
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 fields_json TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(app_id,entity_id)
);
CREATE TABLE slack_app_actions (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, author_id TEXT NOT NULL,
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, record_id TEXT NOT NULL,
 record_version INTEGER NOT NULL, field_id TEXT NOT NULL, approve_json TEXT NOT NULL,
 reject_json TEXT NOT NULL, team_id TEXT NOT NULL, channel_id TEXT NOT NULL,
 config_version INTEGER NOT NULL, delivery_state TEXT NOT NULL,
 choice_state TEXT NOT NULL, message_ts TEXT, created_at INTEGER NOT NULL,
 applied_at INTEGER, applied_by TEXT
);
CREATE INDEX slack_app_actions_record ON slack_app_actions(app_id,entity_id,record_id);
CREATE TABLE slack_app_webhook_receipts (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL);

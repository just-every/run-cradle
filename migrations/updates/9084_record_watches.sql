CREATE TABLE record_watches (
 id TEXT PRIMARY KEY, operator_id TEXT NOT NULL, principal_id TEXT NOT NULL,
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, target_kind TEXT NOT NULL,
 target_id TEXT NOT NULL, source TEXT NOT NULL, enabled INTEGER NOT NULL,
 mode TEXT NOT NULL, channels_json TEXT NOT NULL, version INTEGER NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(operator_id,app_id,entity_id,target_kind,target_id,source)
);
CREATE INDEX record_watches_subject ON record_watches(app_id,entity_id,enabled);
CREATE TABLE record_watch_events (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL, operator_id TEXT NOT NULL,
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, record_id TEXT NOT NULL,
 watch_id TEXT, assignment_field_id TEXT, actor_id TEXT, kind TEXT NOT NULL, mode TEXT NOT NULL, channels_json TEXT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, required_fields_json TEXT NOT NULL, notification_id TEXT,
 created_at INTEGER NOT NULL, due_at INTEGER NOT NULL, completed_at INTEGER,
 UNIQUE(event_id,operator_id)
);
CREATE INDEX record_watch_events_due ON record_watch_events(completed_at,due_at);
CREATE TABLE record_watch_chat_deliveries (
 id TEXT PRIMARY KEY, notification_id TEXT NOT NULL, operator_id TEXT NOT NULL,
 provider TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL, provider_receipt TEXT,
 UNIQUE(notification_id,provider)
);

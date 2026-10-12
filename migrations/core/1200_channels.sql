CREATE TABLE channel_preferences (
 operator_id TEXT PRIMARY KEY REFERENCES operators(id), version INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 timezone TEXT, muted_json TEXT NOT NULL DEFAULT '[]', digest_enabled INTEGER, progress_enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE channel_notifications (
 notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
 app_id TEXT NOT NULL, campaign_id TEXT, subject_type TEXT NOT NULL, event_kind TEXT NOT NULL,
 last_event_at INTEGER NOT NULL, failure TEXT
);
CREATE TABLE channel_events (
 event_id TEXT NOT NULL, operator_id TEXT NOT NULL REFERENCES operators(id),
 notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 PRIMARY KEY(event_id,operator_id)
);
CREATE TABLE channel_deliveries (
 id TEXT PRIMARY KEY, notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
 operator_id TEXT NOT NULL REFERENCES operators(id), campaign_id TEXT, kind TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('held','queued','dispatching','accepted','delivered','failed','unknown','cancelled','muted')),
 due_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL,
 run_id TEXT, attempt_id TEXT, receipt_id TEXT, provider_id TEXT, error_code TEXT, error_message TEXT,
 attempts INTEGER NOT NULL DEFAULT 0, group_id TEXT, schedule_key TEXT UNIQUE
);
CREATE INDEX channel_delivery_due ON channel_deliveries(state,due_at,id);
CREATE INDEX channel_delivery_campaign ON channel_deliveries(campaign_id,state);
CREATE INDEX channel_notification_repeat ON channel_notifications(event_kind,last_event_at);
CREATE TABLE channel_digest_settings (
 id TEXT PRIMARY KEY CHECK(id='digest'), enabled INTEGER NOT NULL DEFAULT 0, recipients_json TEXT,
 version INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO channel_digest_settings VALUES('digest',0,NULL,1,0);

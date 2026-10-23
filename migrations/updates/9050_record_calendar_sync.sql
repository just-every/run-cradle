-- Google record sync configuration and event bindings; provider credentials remain in custody.
CREATE TABLE record_calendar_definitions (
 id TEXT PRIMARY KEY, app_id TEXT NOT NULL, entity_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 connection_id TEXT NOT NULL, calendar_id TEXT NOT NULL, definition_json TEXT NOT NULL,
 actor_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX record_calendar_field ON record_calendar_definitions(app_id,entity_id,json_extract(definition_json,'$.startFieldId'));
CREATE TABLE record_calendar_versions (
 id TEXT PRIMARY KEY, definition_id TEXT NOT NULL, definition_version INTEGER NOT NULL,
 definition_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(definition_id,definition_version)
);
CREATE TABLE record_calendar_events (
 id TEXT PRIMARY KEY, definition_id TEXT NOT NULL, record_id TEXT NOT NULL,
 generation INTEGER NOT NULL DEFAULT 1, event_id TEXT, etag TEXT, state TEXT NOT NULL,
 attempt_id TEXT, review_json TEXT, last_record_version INTEGER,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(definition_id,record_id)
);
CREATE TABLE record_calendar_catalogues (
 connection_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, calendars_json TEXT NOT NULL,
 checked_at TEXT NOT NULL
);
CREATE TABLE record_calendar_changes (
 id TEXT PRIMARY KEY, definition_id TEXT NOT NULL, record_id TEXT NOT NULL, command_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(definition_id,record_id,command_id)
);

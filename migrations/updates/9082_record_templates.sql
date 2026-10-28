CREATE TABLE record_templates (
 id TEXT PRIMARY KEY, app_id TEXT NOT NULL, entity_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, name TEXT NOT NULL, definition_json TEXT NOT NULL,
 version INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX record_templates_table ON record_templates(app_id,entity_id);

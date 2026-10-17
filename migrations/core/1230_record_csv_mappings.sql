-- Recurring imports retain their source mapping without rewriting import history.
CREATE TABLE record_csv_mappings (
 id TEXT PRIMARY KEY NOT NULL,
 app_id TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 source_name TEXT NOT NULL,
 version INTEGER NOT NULL,
 detail_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(app_id, entity_id, owner_id, source_name)
);

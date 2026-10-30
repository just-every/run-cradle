CREATE TABLE record_update_buttons (
 id TEXT PRIMARY KEY,
 app_id TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 field_id TEXT NOT NULL,
 value_json TEXT NOT NULL CHECK (json_valid(value_json)),
 name TEXT NOT NULL,
 confirmation INTEGER NOT NULL CHECK (confirmation IN (0,1)),
 version INTEGER NOT NULL CHECK (version > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX record_update_buttons_table ON record_update_buttons(app_id,entity_id);

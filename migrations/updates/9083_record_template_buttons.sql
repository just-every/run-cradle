CREATE TABLE record_template_buttons (
 id TEXT PRIMARY KEY,
 app_id TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 template_id TEXT NOT NULL REFERENCES record_templates(id),
 name TEXT NOT NULL,
 confirmation INTEGER NOT NULL CHECK (confirmation IN (0,1)),
 version INTEGER NOT NULL CHECK (version > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX record_template_buttons_table ON record_template_buttons(app_id,entity_id);

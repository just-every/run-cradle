CREATE TABLE record_interfaces (
 id TEXT PRIMARY KEY,
 app_id TEXT NOT NULL,
 author_id TEXT,
 version INTEGER NOT NULL CHECK (version > 0),
 definition_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 deleted_at INTEGER,
 expires_at INTEGER
);
CREATE INDEX record_interfaces_base ON record_interfaces(app_id,deleted_at,id);
CREATE TABLE record_interface_versions (
 interface_id TEXT NOT NULL REFERENCES record_interfaces(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK (version > 0),
 author_id TEXT,
 definition_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(interface_id,version)
);

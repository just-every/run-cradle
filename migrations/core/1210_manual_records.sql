-- Manual, deterministic schema releases are distinct from source-runner releases.
CREATE TABLE manual_record_bases (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL,
 version INTEGER NOT NULL, release_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE manual_record_previews (
 id TEXT PRIMARY KEY NOT NULL, app_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 state TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE manual_record_releases (
 id TEXT PRIMARY KEY NOT NULL, app_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 preview_id TEXT NOT NULL UNIQUE, detail_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE record_csv_previews (
 id TEXT PRIMARY KEY NOT NULL, app_id TEXT NOT NULL, entity_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, detail_json TEXT NOT NULL, expires_at TEXT NOT NULL, command_id TEXT
);

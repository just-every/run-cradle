-- Additive: retains every released installation row and existing resource identity.
CREATE TABLE warehouse_exports (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES authority_principals(id),
 bases_json TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('full','incremental')),
 local_rule TEXT NOT NULL, timezone TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'active',
 version INTEGER NOT NULL DEFAULT 1, watermark_json TEXT NOT NULL DEFAULT '{}',
 last_slot TEXT, running_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
-- Custody precedes object creation, including manifests and interrupted runs.
CREATE TABLE warehouse_objects (object_key TEXT PRIMARY KEY, export_id TEXT NOT NULL, run_id TEXT NOT NULL, created_at TEXT NOT NULL);

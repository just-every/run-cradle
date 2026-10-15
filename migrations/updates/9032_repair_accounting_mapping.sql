-- Explicit owner/accountant configuration. No credentials or inferred ledger defaults.
CREATE TABLE repair_accounting_mappings (
 connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version > 0),
 mapping_json TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);

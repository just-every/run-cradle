CREATE TABLE release_recovery_evidence (
 id TEXT PRIMARY KEY,
 app_id TEXT NOT NULL,
 source_hash TEXT NOT NULL,
 evidence_hash TEXT NOT NULL,
 evidence_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);

CREATE TABLE construction_runner_erasures (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 app_id TEXT NOT NULL,
 artifact_hash TEXT NOT NULL,
 state TEXT NOT NULL,
 created_at TEXT NOT NULL,
 completed_at TEXT
);

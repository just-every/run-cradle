-- A durable reservation prevents an erasure receipt racing an R2 writer.
CREATE TABLE lifecycle_file_writes (
 id TEXT PRIMARY KEY, object_key TEXT NOT NULL, started_at TEXT NOT NULL
);

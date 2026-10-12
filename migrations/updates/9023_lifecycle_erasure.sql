-- Durable seed-owned cleanup receipts. Applied history is unchanged.
CREATE TABLE lifecycle_erasures (
 id TEXT PRIMARY KEY, app_id TEXT NOT NULL, subject_kind TEXT NOT NULL,
 subject_id TEXT NOT NULL, anonymous_label TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','complete')),
 requested_at TEXT NOT NULL, completed_at TEXT,
 UNIQUE(subject_kind,subject_id)
);
CREATE TABLE lifecycle_erasure_blobs (
 erasure_id TEXT NOT NULL REFERENCES lifecycle_erasures(id),
 object_key TEXT NOT NULL, deleted_at TEXT,
 PRIMARY KEY(erasure_id,object_key)
);

CREATE TABLE operation_source_invalidations(case_id TEXT NOT NULL,source_id TEXT NOT NULL,source_version INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(case_id,source_id,source_version));

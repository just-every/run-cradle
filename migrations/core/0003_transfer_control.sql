-- Installation-only restore authorization. Excluded from the business archive.
CREATE TABLE runtime_transfer_credentials (
 id TEXT PRIMARY KEY NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 target_origin TEXT NOT NULL,
 job_id TEXT NOT NULL UNIQUE,
 manifest_hash TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 semantic_hash TEXT NOT NULL,
 commit_command_id TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','consumed')),
 version INTEGER NOT NULL CHECK(version>0),
 consumed_at TEXT
);

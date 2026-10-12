CREATE TABLE connection_jobs (
 id TEXT PRIMARY KEY, command_id TEXT NOT NULL UNIQUE, connection_id TEXT NOT NULL REFERENCES provider_connections(id),
 action TEXT NOT NULL, actor_json TEXT NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 lease_owner TEXT, lease_expires_at TEXT, result_json TEXT, failure_json TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX connection_jobs_due ON connection_jobs(state,lease_expires_at);

CREATE TABLE command_admissions (
 command_id TEXT PRIMARY KEY NOT NULL, batch_nonce TEXT NOT NULL UNIQUE,
 actor_id TEXT NOT NULL, actor_kind TEXT NOT NULL, app_id TEXT NOT NULL,
 action TEXT NOT NULL, input_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('admitted','committed')),
 result_json TEXT, access_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX command_actor_app ON command_admissions(actor_id,app_id,created_at,command_id);
CREATE TABLE admission_assertions (nonce TEXT NOT NULL, sequence INTEGER NOT NULL, ok INTEGER NOT NULL CHECK(ok=1), PRIMARY KEY(nonce,sequence));
CREATE TABLE admission_audit (
 id TEXT PRIMARY KEY NOT NULL, command_id TEXT NOT NULL REFERENCES command_admissions(command_id),
 actor_id TEXT NOT NULL, actor_kind TEXT NOT NULL, app_id TEXT NOT NULL, action TEXT NOT NULL,
 subject_json TEXT, changes_json TEXT NOT NULL, source_ids_json TEXT NOT NULL, personal_refs_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX admission_audit_subject ON admission_audit(app_id,created_at,id);
CREATE TABLE admission_events (
 id TEXT PRIMARY KEY NOT NULL, command_id TEXT NOT NULL REFERENCES command_admissions(command_id), app_id TEXT NOT NULL,
 name TEXT NOT NULL, version INTEGER NOT NULL, subject_json TEXT, payload_json TEXT NOT NULL, cause_run_ids_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX admission_events_order ON admission_events(created_at,id);
CREATE TABLE admission_outbox (
 id TEXT PRIMARY KEY NOT NULL, command_id TEXT NOT NULL REFERENCES command_admissions(command_id), app_id TEXT NOT NULL,
 action TEXT NOT NULL, version INTEGER NOT NULL, input_json TEXT NOT NULL, not_before TEXT NOT NULL, grant_id TEXT, subject_json TEXT,
 source_release_id TEXT NOT NULL, cause_run_ids_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','dispatched','cancelled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX admission_outbox_due ON admission_outbox(state,not_before,id);

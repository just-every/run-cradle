CREATE TABLE execution_runs (
 id TEXT PRIMARY KEY, app_id TEXT NOT NULL, origin_command_id TEXT NOT NULL,
 request_json TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('queued','running','waiting','completed','failed','cancelled','partial','unknown','suppressed')),
 version INTEGER NOT NULL DEFAULT 1, control_epoch INTEGER NOT NULL, lease_owner TEXT, lease_expires_at TEXT, lease_epoch INTEGER NOT NULL DEFAULT 0,
 next_wake_at TEXT, retry_of TEXT REFERENCES execution_runs(id), first_failure_at TEXT, retry_count INTEGER NOT NULL DEFAULT 0,
 cause_identity TEXT NOT NULL, failure_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(origin_command_id)
);
CREATE INDEX execution_runs_due ON execution_runs(state,next_wake_at,id);
CREATE TABLE execution_attempts (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES execution_runs(id), command_id TEXT NOT NULL, connection_id TEXT NOT NULL,
 action TEXT NOT NULL, provider TEXT NOT NULL, idempotency_key TEXT NOT NULL, input_hash TEXT NOT NULL, sealed_input TEXT,
 state TEXT NOT NULL CHECK(state IN ('prepared','dispatching','confirmed','refused','partial','unknown')), version INTEGER NOT NULL DEFAULT 1,
 lease_epoch INTEGER NOT NULL, reservation_ids_json TEXT NOT NULL, started_at TEXT, finished_at TEXT, first_possible_effect_at TEXT,
 external_id TEXT, receipt_id TEXT, next_check_at TEXT, unknown_deadline TEXT NOT NULL, custodian_id TEXT NOT NULL, escalated_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX execution_attempts_run ON execution_attempts(run_id,id);
CREATE INDEX execution_attempts_due ON execution_attempts(state,next_check_at,id);
CREATE TABLE execution_receipts (
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES execution_attempts(id), provider TEXT NOT NULL, external_id TEXT,
 status TEXT NOT NULL CHECK(status IN ('confirmed','refused','partial','unknown')), evidence_file_id TEXT, observed_at TEXT NOT NULL,
 reconciled_at TEXT, method TEXT, message TEXT NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE execution_run_attempts (run_id TEXT NOT NULL REFERENCES execution_runs(id),attempt_id TEXT NOT NULL REFERENCES execution_attempts(id),PRIMARY KEY(run_id,attempt_id));
CREATE TABLE execution_model_profiles (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, profile_json TEXT NOT NULL,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE execution_model_calls (id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES execution_runs(id),profile_id TEXT NOT NULL REFERENCES execution_model_profiles(id),call_json TEXT NOT NULL,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);

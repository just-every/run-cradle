-- Test runs have no automatic execution/recovery path, including after restore.
CREATE TABLE record_automation_tests (
 id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, record_id TEXT NOT NULL,
 definition_version INTEGER NOT NULL, record_version INTEGER NOT NULL,
 mode TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL,
 result_json TEXT NOT NULL, confirmation_hash TEXT NOT NULL
);
CREATE INDEX record_automation_tests_history ON record_automation_tests(automation_id,created_at,id);

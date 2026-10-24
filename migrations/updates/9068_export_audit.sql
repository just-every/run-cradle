-- Metadata-only custody for read exports that have no command admission.
CREATE TABLE operation_audit (
 id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT,
 app_id TEXT,
 action TEXT NOT NULL,
 feature TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX operation_audit_time ON operation_audit(created_at,id);
CREATE INDEX operation_audit_actor ON operation_audit(actor_id,created_at);

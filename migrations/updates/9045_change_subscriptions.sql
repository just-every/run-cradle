-- The audit payload remains canonical; the portable sequence is assigned inside
-- the same transaction as its fact, after earlier transactions have committed.
ALTER TABLE admission_audit ADD COLUMN change_sequence INTEGER;
UPDATE admission_audit SET change_sequence=rowid;
CREATE UNIQUE INDEX admission_audit_sequence ON admission_audit(change_sequence);
CREATE TRIGGER admission_audit_assign_sequence AFTER INSERT ON admission_audit
WHEN NEW.change_sequence IS NULL BEGIN
 UPDATE admission_audit SET change_sequence=(SELECT COALESCE(MAX(change_sequence),0)+1 FROM admission_audit) WHERE id=NEW.id;
END;
CREATE TABLE record_change_subscriptions (
 id TEXT PRIMARY KEY, app_id TEXT NOT NULL, entity_id TEXT, view_id TEXT,
 principal_id TEXT NOT NULL, credential_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 sealed_json TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 state TEXT NOT NULL, last_sequence INTEGER NOT NULL, delivery_state TEXT NOT NULL
);
CREATE INDEX record_change_subscriptions_key ON record_change_subscriptions(credential_id,app_id);

-- Cursor windows contain positions only, never another copy of record values.
CREATE TABLE record_change_windows (
 cursor_hash TEXT PRIMARY KEY, subscription_id TEXT NOT NULL,
 through_sequence INTEGER NOT NULL, captured_at INTEGER NOT NULL
);
CREATE INDEX record_change_windows_subscription ON record_change_windows(subscription_id);

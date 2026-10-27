-- Additive: a progress notice owed to a job's starter is written in the same
-- commit as the job's outcome and deleted only by the notification admission
-- that publishes it, so a failed publication is retried on a later tick.
CREATE TABLE channel_progress_owed (
 event_id TEXT PRIMARY KEY,
 subject_type TEXT NOT NULL CHECK(subject_type IN ('base-import','warehouse-export')),
 subject_id TEXT NOT NULL,
 starter_id TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('completed','failed')),
 created_at TEXT NOT NULL
);
-- Native import completion commits inside the import kit's own batch; the owed
-- completion notice joins that same atomic state change.
CREATE TRIGGER channel_progress_owed_import AFTER UPDATE OF state ON ik_jobs
WHEN NEW.state='completed' AND OLD.state<>'completed'
BEGIN
 INSERT OR IGNORE INTO channel_progress_owed(event_id,subject_type,subject_id,starter_id,outcome,created_at)
 VALUES('base-import:'||NEW.id||':completed','base-import',NEW.id,NEW.principal_id,'completed',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

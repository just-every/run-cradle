-- A write-ahead failure fact is held while its bounded attempt is live.
-- No personal reference is added: the event belongs to channel_progress_owed.
CREATE TABLE channel_progress_attempts (
 event_id TEXT PRIMARY KEY,
 token TEXT NOT NULL,
 live_until TEXT NOT NULL
);
-- The import kit owns the completion batch; remove its speculative failure in
-- that same commit, alongside 9076's completion fact, without changing the kit.
CREATE TRIGGER channel_progress_attempt_completed AFTER UPDATE OF state ON ik_jobs
WHEN NEW.state='completed' AND OLD.state<>'completed'
BEGIN
 DELETE FROM channel_progress_owed WHERE subject_type='base-import' AND subject_id=NEW.id AND outcome='failed';
END;

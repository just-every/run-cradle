-- Flat D1 read cost for the minute cron and routine requests: schema facts proven once,
-- a launch-event cursor, and indexes that match the scheduled queries.
CREATE TABLE schema_verifications (
 kind TEXT NOT NULL, name TEXT NOT NULL, fingerprint TEXT NOT NULL,
 PRIMARY KEY(kind,name)
);

-- Every launch event at or below after_rowid is dispatched. after_id names the event at that
-- rowid, so a cursor that no longer matches its row (restored or rewritten events) is ignored.
CREATE TABLE launch_event_cursor (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), after_rowid INTEGER NOT NULL, after_id TEXT
);
INSERT INTO launch_event_cursor(singleton,after_rowid,after_id)
 SELECT 1,start.value,(SELECT id FROM admission_events WHERE rowid=start.value)
 FROM (SELECT coalesce((SELECT min(e.rowid)-1 FROM admission_events e WHERE e.app_id='00000000000000000000000700'
   AND NOT EXISTS(SELECT 1 FROM launch_event_dispatches d WHERE d.event_id=e.id)),(SELECT coalesce(max(rowid),0) FROM admission_events)) AS value) start;

CREATE INDEX execution_attempts_action_created ON execution_attempts(action,created_at);
CREATE INDEX record_calendar_changes_pending ON record_calendar_changes(state,created_at,id);
CREATE INDEX launch_analysis_requests_state ON launch_analysis_requests(state,updated_at);
CREATE INDEX launch_model_calls_state ON launch_model_calls(state);
CREATE INDEX record_change_windows_captured ON record_change_windows(captured_at);
CREATE INDEX lifecycle_erasures_state ON lifecycle_erasures(state,requested_at);

ALTER TABLE activity_entries ADD COLUMN automation_run_id TEXT;
CREATE TABLE launch_automation_actions(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES automation_runs(id),position INTEGER NOT NULL,idempotency_key TEXT NOT NULL,state TEXT NOT NULL,result_json TEXT,error_code TEXT,error_message TEXT,started_at INTEGER,finished_at INTEGER,UNIQUE(run_id,position));
CREATE TABLE launch_brief_context(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,context_hash TEXT NOT NULL,last_requested_at INTEGER NOT NULL);
CREATE INDEX launch_runs_state ON automation_runs(state,queued_at,id);

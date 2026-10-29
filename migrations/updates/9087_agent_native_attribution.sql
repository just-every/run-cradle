-- Native command custody preserves the preparer separately from its sponsor and approvers.
CREATE TABLE cradle_agent_activity (
 command_id TEXT PRIMARY KEY REFERENCES command_admissions(command_id),
 agent_id TEXT NOT NULL, agent_name TEXT NOT NULL,
 sponsor_id TEXT NOT NULL, sponsor_name TEXT NOT NULL, label TEXT NOT NULL,
 operation_id TEXT NOT NULL, approvers_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX cradle_agent_activity_sponsor ON cradle_agent_activity(sponsor_id);

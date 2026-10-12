ALTER TABLE automation_runs ADD COLUMN initiated_by_id TEXT REFERENCES operators(id);

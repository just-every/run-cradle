-- Additive: retains every released run and action row.
-- Run history pages by queued time per automation, and Automation Monitor counts the
-- runs finished in its trailing 30-day window.
CREATE INDEX launch_runs_history ON automation_runs(automation_id,queued_at,id);
CREATE INDEX launch_runs_finished ON automation_runs(finished_at,automation_id,state);
-- An uncertain outcome is final for its run (AUTO-007); record when that run finished.
UPDATE automation_runs SET finished_at=updated_at WHERE state='Unknown' AND finished_at IS NULL;

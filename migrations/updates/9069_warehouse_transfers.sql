-- Multipart and resumable custody survives a Worker interruption. Session
-- capabilities are sealed; archive export removes all live transfer state.
ALTER TABLE warehouse_objects ADD COLUMN transfer_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE warehouse_exports ADD COLUMN running_started_at TEXT;
ALTER TABLE warehouse_exports ADD COLUMN running_at TEXT;
ALTER TABLE warehouse_exports ADD COLUMN running_slot TEXT;
ALTER TABLE warehouse_exports ADD COLUMN running_revision INTEGER;

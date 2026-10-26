-- Automatic recovery of an interrupted export run is finite. Each unsuccessful
-- execution is counted on the run's claim, with the retained objects seen at its
-- lease, and the slot at which recovery stopped. All are cleared with the claim.
-- No personal reference is added: counts and a schedule slot only.
ALTER TABLE warehouse_exports ADD COLUMN running_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE warehouse_exports ADD COLUMN running_stalls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE warehouse_exports ADD COLUMN running_objects INTEGER NOT NULL DEFAULT 0;
ALTER TABLE warehouse_exports ADD COLUMN running_stopped_slot TEXT;

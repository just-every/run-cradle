-- Preserve all R2 schedules and custody. Each object retains its own immutable
-- destination and sealed credential snapshot even after a schedule is changed.
ALTER TABLE warehouse_exports ADD COLUMN destination_json TEXT NOT NULL DEFAULT '{"kind":"r2"}';
ALTER TABLE warehouse_exports ADD COLUMN sealed_json TEXT;
ALTER TABLE warehouse_objects ADD COLUMN destination_json TEXT NOT NULL DEFAULT '{"kind":"r2"}';
ALTER TABLE warehouse_objects ADD COLUMN sealed_json TEXT;

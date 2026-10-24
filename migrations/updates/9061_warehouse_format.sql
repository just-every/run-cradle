-- Existing schedules retain CSV and their watermark until an owner changes them.
ALTER TABLE warehouse_exports ADD COLUMN format TEXT NOT NULL DEFAULT 'csv' CHECK(format IN ('csv','parquet'));

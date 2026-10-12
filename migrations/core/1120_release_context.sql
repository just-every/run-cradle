ALTER TABLE live_app_releases ADD COLUMN schema_version INTEGER;
ALTER TABLE live_app_releases ADD COLUMN control_epoch INTEGER;
ALTER TABLE construction_applications ADD COLUMN construction_release_id TEXT;
ALTER TABLE construction_applications ADD COLUMN schema_version INTEGER;
ALTER TABLE construction_applications ADD COLUMN control_epoch INTEGER;

ALTER TABLE record_views ADD COLUMN deleted_at INTEGER;
ALTER TABLE record_views ADD COLUMN expires_at INTEGER;
ALTER TABLE record_views ADD COLUMN purge_state TEXT NOT NULL DEFAULT 'held';
ALTER TABLE record_forms ADD COLUMN owner_id TEXT;
ALTER TABLE record_forms ADD COLUMN deleted_at INTEGER;
ALTER TABLE record_forms ADD COLUMN expires_at INTEGER;
ALTER TABLE record_forms ADD COLUMN purge_state TEXT NOT NULL DEFAULT 'held';
-- Previously deleted views enter a full restore window at upgrade.
UPDATE record_views SET deleted_at=unixepoch()*1000,expires_at=(unixepoch()+2592000)*1000 WHERE visibility='deleted';

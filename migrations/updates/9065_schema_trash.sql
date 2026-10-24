-- Schema deletions share the existing Trash clock, authority and maintenance path.
ALTER TABLE record_trash ADD COLUMN kind TEXT NOT NULL DEFAULT 'record' CHECK(kind IN ('record','field','table'));
ALTER TABLE record_trash ADD COLUMN detail_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX record_trash_kind_expiry ON record_trash(kind,expires_at);


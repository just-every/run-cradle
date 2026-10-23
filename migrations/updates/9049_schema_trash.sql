-- Schema deletions share the existing Trash clock, authority and maintenance path.
ALTER TABLE record_trash ADD COLUMN kind TEXT NOT NULL DEFAULT 'record' CHECK(kind IN ('record','field','table'));
ALTER TABLE record_trash ADD COLUMN detail_json TEXT NOT NULL DEFAULT '{}';
CREATE INDEX record_trash_kind_expiry ON record_trash(kind,expires_at);

-- Rotate dispatch independently of audit activity in any one base.
ALTER TABLE record_change_subscriptions ADD COLUMN last_dispatch_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX record_change_dispatch_order ON record_change_subscriptions(state,last_dispatch_at,id);

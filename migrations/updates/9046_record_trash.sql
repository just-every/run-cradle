CREATE TABLE record_trash (
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, record_id TEXT NOT NULL,
 group_id TEXT NOT NULL, actor_id TEXT, deleted_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, record_version INTEGER NOT NULL,
 schema_version INTEGER NOT NULL, prior_lifecycle TEXT NOT NULL,
 links_json TEXT NOT NULL, purge_state TEXT NOT NULL,
 PRIMARY KEY(app_id,entity_id,record_id)
);
CREATE INDEX record_trash_group ON record_trash(group_id);
CREATE INDEX record_trash_expiry ON record_trash(expires_at);
CREATE TABLE record_trash_maintenance (id TEXT PRIMARY KEY,last_hour INTEGER NOT NULL);

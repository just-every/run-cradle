CREATE TABLE record_schemas (id TEXT PRIMARY KEY NOT NULL,app_id TEXT NOT NULL,version INTEGER NOT NULL,physical_revision TEXT NOT NULL,schema_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX record_schema_app ON record_schemas(app_id,id);
CREATE TABLE record_views (id TEXT PRIMARY KEY NOT NULL,app_id TEXT NOT NULL,entity_id TEXT NOT NULL,owner_id TEXT NOT NULL,version INTEGER NOT NULL,visibility TEXT NOT NULL,definition_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX record_views_app ON record_views(app_id,owner_id,id);
CREATE TABLE record_forms (id TEXT PRIMARY KEY NOT NULL,app_id TEXT NOT NULL,entity_id TEXT NOT NULL,version INTEGER NOT NULL,definition_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE record_previews (id TEXT PRIMARY KEY NOT NULL,app_id TEXT NOT NULL,entity_id TEXT NOT NULL,actor_id TEXT NOT NULL,input_hash TEXT NOT NULL,input_json TEXT NOT NULL,expected_json TEXT NOT NULL,expires_at TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE record_undo (id TEXT PRIMARY KEY NOT NULL,command_id TEXT NOT NULL,app_id TEXT NOT NULL,actor_id TEXT NOT NULL,inverse_json TEXT NOT NULL,expires_at TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);

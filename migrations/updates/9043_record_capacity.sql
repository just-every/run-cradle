-- Derived counts for every physical generation; active record_schemas select the live base.
CREATE TABLE record_capacity (
 table_id TEXT PRIMARY KEY, app_id TEXT NOT NULL, entity_id TEXT NOT NULL,
 schema_version INTEGER NOT NULL, physical_revision TEXT NOT NULL, row_count INTEGER NOT NULL CHECK(row_count>=0)
);
CREATE INDEX record_capacity_base ON record_capacity(app_id,entity_id,schema_version,physical_revision);

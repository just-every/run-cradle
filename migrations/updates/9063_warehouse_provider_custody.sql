-- The object key deterministically identifies a provider job/request. Schema
-- and row IDs exist before dispatch and survive unknown provider responses.
ALTER TABLE warehouse_objects ADD COLUMN metadata_json TEXT;
ALTER TABLE warehouse_objects ADD COLUMN dispatch_state TEXT NOT NULL DEFAULT 'prepared' CHECK(dispatch_state IN ('prepared','dispatching','confirmed'));

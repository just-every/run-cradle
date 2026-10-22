-- Import snapshots contain source data, never OAuth credentials.
CREATE TABLE record_sheet_snapshots (
 job_id TEXT PRIMARY KEY REFERENCES connection_jobs(id),
 connection_id TEXT NOT NULL REFERENCES provider_connections(id),
 actor_id TEXT NOT NULL,
 source_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX record_sheet_snapshots_actor ON record_sheet_snapshots(actor_id);
CREATE TABLE record_sheet_schedules (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, connection_id TEXT NOT NULL REFERENCES provider_connections(id),
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, sheet TEXT NOT NULL, mapping_json TEXT NOT NULL, merge_field_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','paused')), version INTEGER NOT NULL DEFAULT 1,
 last_slot TEXT, last_started_at INTEGER, running_id TEXT, result_json TEXT, created_at TEXT NOT NULL,
 UNIQUE(app_id,entity_id,connection_id,sheet)
);
-- Existing full-base owner rules gain the read-only source-intake action;
-- narrower rules and explicit denials are preserved.
UPDATE authority_policies SET rules_json=(
 SELECT json_group_array(json(CASE WHEN json_extract(r.value,'$.effect')='allow'
 AND EXISTS(SELECT 1 FROM json_each(r.value,'$.actions') a WHERE a.value='import.preview')
 AND NOT EXISTS(SELECT 1 FROM json_each(r.value,'$.actions') a WHERE a.value='connection.sync')
 THEN json_insert(r.value,'$.actions[#]','connection.sync') ELSE r.value END))
 FROM json_each(authority_policies.rules_json) r
),version=version+1
WHERE id IN (SELECT m.policy_id FROM authority_memberships m JOIN manual_record_bases b ON b.id=m.app_id AND b.owner_id=m.principal_id);

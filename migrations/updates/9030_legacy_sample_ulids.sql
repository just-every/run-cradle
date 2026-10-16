-- The sample fixture shipped before the sample command gave two lenses, four
-- automations and one notification read IDs outside the ULID alphabet (I, L, O).
-- Installations that adopted those rows could not name them in typed commands.
-- Rewrite exactly those seven IDs and every column that references them; the
-- historical JSON in admission receipts keeps the old literal as history.
PRAGMA defer_foreign_keys = true;
CREATE TABLE legacy_sample_ulid_map(old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL UNIQUE);
INSERT INTO legacy_sample_ulid_map(old_id,new_id) VALUES
 ('01ARZ3NDEKTSV4RRFFQ69G5FIA','01ARZ3NDEKTSV4RRFFQ69G5FPA'),
 ('01ARZ3NDEKTSV4RRFFQ69G5FIB','01ARZ3NDEKTSV4RRFFQ69G5FPB'),
 ('01ARZ3NDEKTSV4RRFFQ69G5FLA','01ARZ3NDEKTSV4RRFFQ69G5FQA'),
 ('01ARZ3NDEKTSV4RRFFQ69G5FLB','01ARZ3NDEKTSV4RRFFQ69G5FQB'),
 ('01ARZ3NDEKTSV4RRFFQ69G5FLC','01ARZ3NDEKTSV4RRFFQ69G5FQC'),
 ('01ARZ3NDEKTSV4RRFFQ69G5FLD','01ARZ3NDEKTSV4RRFFQ69G5FQD'),
 ('01ARZ3NDEKTSV4RRFFQ69G5FOA','01ARZ3NDEKTSV4RRFFQ69G5FRA');
UPDATE lenses SET id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=lenses.id) WHERE id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE launch_lens_history SET lens_id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=lens_id) WHERE lens_id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE launch_analyses SET lens_id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=lens_id) WHERE lens_id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE automations SET id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=automations.id) WHERE id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE automation_runs SET automation_id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=automation_id) WHERE automation_id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE launch_automation_authorities SET automation_id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=automation_id) WHERE automation_id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE authority_delegations SET automation_id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=automation_id) WHERE automation_id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE record_automation_bindings SET automation_id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=automation_id) WHERE automation_id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE record_automation_versions SET automation_id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=automation_id) WHERE automation_id IN (SELECT old_id FROM legacy_sample_ulid_map);
UPDATE notification_reads SET id=(SELECT new_id FROM legacy_sample_ulid_map WHERE old_id=notification_reads.id) WHERE id IN (SELECT old_id FROM legacy_sample_ulid_map);
DROP TABLE legacy_sample_ulid_map;

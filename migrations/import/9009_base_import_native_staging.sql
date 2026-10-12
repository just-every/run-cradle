-- Additive Base import-kit upgrade, production source 34004320ffd1e48d2432198be80326d1e0fd5ab4.
-- Preserve the previously applied migration bytes and existing import jobs.

CREATE TABLE IF NOT EXISTS ik_d1_custody_revisions (job_id TEXT PRIMARY KEY REFERENCES ik_jobs(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0,seal TEXT);

INSERT OR IGNORE INTO ik_d1_custody_revisions(job_id) SELECT id FROM ik_jobs;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_receipt_revision AFTER UPDATE OF revision ON ik_d1_custody_revisions BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_receipt_insert BEFORE INSERT ON ik_d1_custody_revisions WHEN NEW.seal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id AND stream_id=NEW.seal) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_RECEIPT_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_receipt_seal BEFORE UPDATE OF seal ON ik_d1_custody_revisions WHEN NEW.seal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id AND stream_id=NEW.seal) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_RECEIPT_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_jobs_insert AFTER INSERT ON ik_jobs BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_jobs_update AFTER UPDATE ON ik_jobs BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.id OR job_id=NEW.id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_jobs_delete AFTER DELETE ON ik_jobs BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_plan_chunks_insert AFTER INSERT ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_plan_chunks_update AFTER UPDATE ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_plan_chunks_delete AFTER DELETE ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_plan_index_insert AFTER INSERT ON ik_d1_plan_index BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_plan_index_update AFTER UPDATE ON ik_d1_plan_index BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_plan_index_delete AFTER DELETE ON ik_d1_plan_index BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_originals_insert AFTER INSERT ON ik_originals BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_originals_update AFTER UPDATE ON ik_originals BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_originals_delete AFTER DELETE ON ik_originals BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_original_chunks_insert AFTER INSERT ON ik_d1_original_chunks BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_original_chunks_update AFTER UPDATE ON ik_d1_original_chunks BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_original_chunks_delete AFTER DELETE ON ik_d1_original_chunks BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_original_sets_insert AFTER INSERT ON ik_original_sets BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_original_sets_update AFTER UPDATE ON ik_original_sets BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_original_sets_delete AFTER DELETE ON ik_original_sets BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_indexed_jobs_insert AFTER INSERT ON ik_d1_indexed_jobs BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_indexed_jobs_update AFTER UPDATE ON ik_d1_indexed_jobs BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_indexed_jobs_delete AFTER DELETE ON ik_d1_indexed_jobs BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_reversal_reports_insert AFTER INSERT ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_reversal_reports_update AFTER UPDATE ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_reversal_reports_delete AFTER DELETE ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_provenance_insert AFTER INSERT ON ik_provenance BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_provenance_update AFTER UPDATE ON ik_provenance BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_provenance_delete AFTER DELETE ON ik_provenance BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_sources_insert AFTER INSERT ON ik_sources BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_sources_update AFTER UPDATE ON ik_sources BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_sources_delete AFTER DELETE ON ik_sources BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_entries_insert AFTER INSERT ON ik_d1_entries BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_entries_update AFTER UPDATE ON ik_d1_entries BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_entries_delete AFTER DELETE ON ik_d1_entries BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_history_insert AFTER INSERT ON ik_d1_history BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_history_update AFTER UPDATE ON ik_d1_history BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_d1_history_delete AFTER DELETE ON ik_d1_history BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_batches_insert AFTER INSERT ON ik_batches BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_batches_update AFTER UPDATE ON ik_batches BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_ik_batches_delete AFTER DELETE ON ik_batches BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_pages_insert AFTER INSERT ON ik_d1_stream_pages BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_pages_update AFTER UPDATE ON ik_d1_stream_pages BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_pages_delete AFTER DELETE ON ik_d1_stream_pages BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_stream_update BEFORE UPDATE ON ik_d1_streams BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id IN (SELECT job_id FROM ik_d1_stream_pages WHERE stream_id=OLD.id); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_receipt_stream_delete BEFORE DELETE ON ik_d1_streams BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id IN (SELECT job_id FROM ik_d1_stream_pages WHERE stream_id=OLD.id); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_job_insert AFTER INSERT ON ik_jobs BEGIN INSERT INTO ik_d1_custody_revisions(job_id) VALUES(NEW.id); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_job_update AFTER UPDATE OF plan_json ON ik_jobs BEGIN UPDATE ik_d1_custody_revisions SET revision=revision+1 WHERE job_id=OLD.id OR job_id=NEW.id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_chunks_insert AFTER INSERT ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_revisions SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_chunks_update AFTER UPDATE ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_revisions SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_chunks_delete AFTER DELETE ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_revisions SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TABLE IF NOT EXISTS ik_d1_native_staging (id TEXT PRIMARY KEY,generation TEXT NOT NULL,destination TEXT NOT NULL,namespace TEXT NOT NULL,mapping_version TEXT NOT NULL,principal_id TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES ik_jobs(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,job_fence INTEGER NOT NULL,action TEXT NOT NULL,values_count INTEGER NOT NULL,chunks_count INTEGER NOT NULL,identities INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0,registered_revision INTEGER,sealed_revision INTEGER,UNIQUE(destination,principal_id,job_id,action));

CREATE TABLE IF NOT EXISTS ik_d1_native_staging_index (stage_id TEXT NOT NULL REFERENCES ik_d1_native_staging(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,source_identity TEXT NOT NULL,target_identity TEXT NOT NULL,PRIMARY KEY(stage_id,ordinal,target_identity));

CREATE INDEX IF NOT EXISTS ik_d1_native_staging_source ON ik_d1_native_staging_index(source_identity,stage_id);

CREATE INDEX IF NOT EXISTS ik_d1_native_staging_target ON ik_d1_native_staging_index(target_identity,stage_id);

CREATE TABLE IF NOT EXISTS ik_d1_native_staging_values (stage_id TEXT NOT NULL REFERENCES ik_d1_native_staging(id) ON DELETE CASCADE,value_ordinal INTEGER NOT NULL,ordinal INTEGER NOT NULL,body TEXT NOT NULL,body_hash TEXT NOT NULL,body_size INTEGER NOT NULL,value_chunks INTEGER NOT NULL,PRIMARY KEY(stage_id,value_ordinal,ordinal));

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_binding BEFORE UPDATE OF id,generation,destination,namespace,mapping_version,principal_id,job_id,fingerprint,job_fence,action,values_count,chunks_count,identities ON ik_d1_native_staging BEGIN SELECT RAISE(ABORT,'IMPORT_NATIVE_STAGE_BINDING_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_index_insert AFTER INSERT ON ik_d1_native_staging_index BEGIN UPDATE ik_d1_native_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_index_update AFTER UPDATE ON ik_d1_native_staging_index BEGIN UPDATE ik_d1_native_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_index_delete AFTER DELETE ON ik_d1_native_staging_index BEGIN UPDATE ik_d1_native_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_values_insert AFTER INSERT ON ik_d1_native_staging_values BEGIN UPDATE ik_d1_native_staging SET revision=revision+1,sealed_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_values_update AFTER UPDATE ON ik_d1_native_staging_values BEGIN UPDATE ik_d1_native_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_values_delete AFTER DELETE ON ik_d1_native_staging_values BEGIN UPDATE ik_d1_native_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_index_custody_insert AFTER INSERT ON ik_d1_native_staging_index BEGIN DELETE FROM ik_d1_native_staging_values WHERE stage_id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_index_custody_update AFTER UPDATE ON ik_d1_native_staging_index BEGIN DELETE FROM ik_d1_native_staging_values WHERE stage_id=OLD.stage_id OR stage_id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_index_custody_delete AFTER DELETE ON ik_d1_native_staging_index BEGIN DELETE FROM ik_d1_native_staging_values WHERE stage_id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_native_staging_values_registered BEFORE INSERT ON ik_d1_native_staging_values WHEN NOT EXISTS(SELECT 1 FROM ik_d1_native_staging WHERE id=NEW.stage_id AND registered_revision IS NOT NULL) BEGIN SELECT RAISE(ABORT,'IMPORT_NATIVE_STAGE_INDEX_REQUIRED'); END;

-- Additive Base import-kit upgrade, production source 34004320ffd1e48d2432198be80326d1e0fd5ab4.
-- Preserve the previously applied migration bytes and existing import jobs.

CREATE TABLE IF NOT EXISTS ik_d1_publication_fences (stream_id TEXT NOT NULL,job_id TEXT PRIMARY KEY);

CREATE INDEX IF NOT EXISTS ik_d1_publication_fence_stream ON ik_d1_publication_fences(stream_id);

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_jobs_insert BEFORE INSERT ON ik_jobs WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_jobs_update BEFORE UPDATE ON ik_jobs WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.id OR job_id=NEW.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_jobs_delete BEFORE DELETE ON ik_jobs WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_streams_insert BEFORE INSERT ON ik_d1_streams WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE stream_id=NEW.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_streams_update BEFORE UPDATE ON ik_d1_streams WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE stream_id=OLD.id OR stream_id=NEW.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_streams_delete BEFORE DELETE ON ik_d1_streams WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE stream_id=OLD.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_plan_chunks_insert BEFORE INSERT ON ik_d1_plan_chunks WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_plan_chunks_update BEFORE UPDATE ON ik_d1_plan_chunks WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_plan_chunks_delete BEFORE DELETE ON ik_d1_plan_chunks WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_plan_index_insert BEFORE INSERT ON ik_d1_plan_index WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_plan_index_update BEFORE UPDATE ON ik_d1_plan_index WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_plan_index_delete BEFORE DELETE ON ik_d1_plan_index WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_originals_insert BEFORE INSERT ON ik_originals WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_originals_update BEFORE UPDATE ON ik_originals WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_originals_delete BEFORE DELETE ON ik_originals WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_original_chunks_insert BEFORE INSERT ON ik_d1_original_chunks WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_original_chunks_update BEFORE UPDATE ON ik_d1_original_chunks WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_original_chunks_delete BEFORE DELETE ON ik_d1_original_chunks WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_original_sets_insert BEFORE INSERT ON ik_original_sets WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_original_sets_update BEFORE UPDATE ON ik_original_sets WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_original_sets_delete BEFORE DELETE ON ik_original_sets WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_indexed_jobs_insert BEFORE INSERT ON ik_d1_indexed_jobs WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_indexed_jobs_update BEFORE UPDATE ON ik_d1_indexed_jobs WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_indexed_jobs_delete BEFORE DELETE ON ik_d1_indexed_jobs WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_reversal_reports_insert BEFORE INSERT ON ik_d1_reversal_reports WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_reversal_reports_update BEFORE UPDATE ON ik_d1_reversal_reports WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_reversal_reports_delete BEFORE DELETE ON ik_d1_reversal_reports WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_provenance_insert BEFORE INSERT ON ik_provenance WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_provenance_update BEFORE UPDATE ON ik_provenance WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_provenance_delete BEFORE DELETE ON ik_provenance WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_sources_insert BEFORE INSERT ON ik_sources WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_sources_update BEFORE UPDATE ON ik_sources WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_sources_delete BEFORE DELETE ON ik_sources WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_entries_insert BEFORE INSERT ON ik_d1_entries WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_entries_update BEFORE UPDATE ON ik_d1_entries WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_entries_delete BEFORE DELETE ON ik_d1_entries WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_history_insert BEFORE INSERT ON ik_d1_history WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_history_update BEFORE UPDATE ON ik_d1_history WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_history_delete BEFORE DELETE ON ik_d1_history WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_batches_insert BEFORE INSERT ON ik_batches WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_batches_update BEFORE UPDATE ON ik_batches WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_batches_delete BEFORE DELETE ON ik_batches WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_stream_pages_insert BEFORE INSERT ON ik_d1_stream_pages WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE stream_id=NEW.stream_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_stream_pages_update BEFORE UPDATE ON ik_d1_stream_pages WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE stream_id=OLD.stream_id OR stream_id=NEW.stream_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_ik_d1_stream_pages_delete BEFORE DELETE ON ik_d1_stream_pages WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE stream_id=OLD.stream_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_parent_update BEFORE UPDATE ON ik_d1_streams WHEN EXISTS(SELECT 1 FROM ik_d1_stream_pages p JOIN ik_d1_publication_fences f ON f.job_id=p.job_id WHERE p.stream_id=OLD.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_parent_delete BEFORE DELETE ON ik_d1_streams WHEN EXISTS(SELECT 1 FROM ik_d1_stream_pages p JOIN ik_d1_publication_fences f ON f.job_id=p.job_id WHERE p.stream_id=OLD.id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_child_page_insert BEFORE INSERT ON ik_d1_stream_pages WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_child_page_update BEFORE UPDATE ON ik_d1_stream_pages WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id OR job_id=NEW.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_publication_child_page_delete BEFORE DELETE ON ik_d1_stream_pages WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences WHERE job_id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TABLE IF NOT EXISTS ik_d1_staging (id TEXT PRIMARY KEY, generation TEXT NOT NULL, destination TEXT NOT NULL, namespace TEXT NOT NULL, mapping_version TEXT NOT NULL, principal_id TEXT NOT NULL, fingerprint TEXT NOT NULL, operation_key TEXT NOT NULL, total INTEGER NOT NULL, pages INTEGER NOT NULL, layout_hash TEXT NOT NULL, reversal_policy TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, registered_revision INTEGER, sealed_revision INTEGER, UNIQUE(destination,principal_id,operation_key));

CREATE TABLE IF NOT EXISTS ik_d1_staging_pages (stage_id TEXT NOT NULL REFERENCES ik_d1_staging(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, job_id TEXT NOT NULL UNIQUE, total INTEGER NOT NULL, fingerprint TEXT NOT NULL, plan_json TEXT NOT NULL, body_hash TEXT NOT NULL, body_size INTEGER NOT NULL, chunks INTEGER NOT NULL, identities INTEGER NOT NULL, index_hash TEXT NOT NULL, policy_hash TEXT NOT NULL, inline_plan INTEGER NOT NULL CHECK(inline_plan IN (0,1)), PRIMARY KEY(stage_id,ordinal));

CREATE TABLE IF NOT EXISTS ik_d1_staging_chunks (stage_id TEXT NOT NULL REFERENCES ik_d1_staging(id) ON DELETE CASCADE, page_ordinal INTEGER NOT NULL, ordinal INTEGER NOT NULL, body TEXT NOT NULL, body_hash TEXT NOT NULL, body_size INTEGER NOT NULL, PRIMARY KEY(stage_id,page_ordinal,ordinal));

CREATE TABLE IF NOT EXISTS ik_d1_staging_index (stage_id TEXT NOT NULL REFERENCES ik_d1_staging(id) ON DELETE CASCADE, page_ordinal INTEGER NOT NULL, ordinal INTEGER NOT NULL, source_identity TEXT NOT NULL, target_identity TEXT NOT NULL, PRIMARY KEY(stage_id,page_ordinal,ordinal,target_identity));

CREATE INDEX IF NOT EXISTS ik_d1_staging_source ON ik_d1_staging_index(source_identity,stage_id);

CREATE INDEX IF NOT EXISTS ik_d1_staging_target ON ik_d1_staging_index(target_identity,stage_id);

CREATE TABLE IF NOT EXISTS ik_d1_staging_originals (stage_id TEXT NOT NULL REFERENCES ik_d1_staging(id) ON DELETE CASCADE, original_key TEXT NOT NULL, name TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY(stage_id,original_key));

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_binding BEFORE UPDATE OF id,generation,destination,namespace,mapping_version,principal_id,fingerprint,operation_key,total,pages,layout_hash,reversal_policy ON ik_d1_staging BEGIN SELECT RAISE(ABORT,'IMPORT_STAGE_BINDING_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_pages_insert AFTER INSERT ON ik_d1_staging_pages BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_pages_update AFTER UPDATE ON ik_d1_staging_pages BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_pages_delete AFTER DELETE ON ik_d1_staging_pages BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_index_insert AFTER INSERT ON ik_d1_staging_index BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_index_update AFTER UPDATE ON ik_d1_staging_index BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_index_delete AFTER DELETE ON ik_d1_staging_index BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL,registered_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_chunks_insert AFTER INSERT ON ik_d1_staging_chunks BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_chunks_update AFTER UPDATE ON ik_d1_staging_chunks BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_chunks_delete AFTER DELETE ON ik_d1_staging_chunks BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_originals_insert AFTER INSERT ON ik_d1_staging_originals BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_originals_update AFTER UPDATE ON ik_d1_staging_originals BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_originals_delete AFTER DELETE ON ik_d1_staging_originals BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_index_custody_insert AFTER INSERT ON ik_d1_staging_index WHEN EXISTS(SELECT 1 FROM ik_d1_staging_chunks WHERE stage_id=NEW.stage_id) OR EXISTS(SELECT 1 FROM ik_d1_staging_originals WHERE stage_id=NEW.stage_id) BEGIN DELETE FROM ik_d1_staging_chunks WHERE stage_id=NEW.stage_id; DELETE FROM ik_d1_staging_originals WHERE stage_id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_index_custody_update AFTER UPDATE ON ik_d1_staging_index WHEN EXISTS(SELECT 1 FROM ik_d1_staging_chunks WHERE stage_id=OLD.stage_id OR stage_id=NEW.stage_id) OR EXISTS(SELECT 1 FROM ik_d1_staging_originals WHERE stage_id=OLD.stage_id OR stage_id=NEW.stage_id) BEGIN DELETE FROM ik_d1_staging_chunks WHERE stage_id=OLD.stage_id OR stage_id=NEW.stage_id; DELETE FROM ik_d1_staging_originals WHERE stage_id=OLD.stage_id OR stage_id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_index_custody_delete AFTER DELETE ON ik_d1_staging_index WHEN EXISTS(SELECT 1 FROM ik_d1_staging_chunks WHERE stage_id=OLD.stage_id) OR EXISTS(SELECT 1 FROM ik_d1_staging_originals WHERE stage_id=OLD.stage_id) BEGIN DELETE FROM ik_d1_staging_chunks WHERE stage_id=OLD.stage_id; DELETE FROM ik_d1_staging_originals WHERE stage_id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_chunks_registered BEFORE INSERT ON ik_d1_staging_chunks WHEN NOT EXISTS(SELECT 1 FROM ik_d1_staging WHERE id=NEW.stage_id AND registered_revision IS NOT NULL) BEGIN SELECT RAISE(ABORT,'IMPORT_STAGE_INDEX_REQUIRED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_originals_registered BEFORE INSERT ON ik_d1_staging_originals WHEN NOT EXISTS(SELECT 1 FROM ik_d1_staging WHERE id=NEW.stage_id AND registered_revision IS NOT NULL) BEGIN SELECT RAISE(ABORT,'IMPORT_STAGE_INDEX_REQUIRED'); END;

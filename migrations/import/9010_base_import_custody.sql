-- Additive Base import-kit upgrade, production source 34004320ffd1e48d2432198be80326d1e0fd5ab4.
-- Preserve the previously applied migration bytes and existing import jobs.

CREATE TABLE IF NOT EXISTS ik_d1_custody_states (job_id TEXT PRIMARY KEY REFERENCES ik_jobs(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0);

INSERT OR IGNORE INTO ik_d1_custody_states(job_id) SELECT id FROM ik_jobs;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_monotonic BEFORE UPDATE ON ik_d1_custody_states WHEN NEW.job_id IS NOT OLD.job_id OR NEW.revision<=OLD.revision BEGIN SELECT RAISE(ABORT,'IMPORT_CUSTODY_STATE_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_delete BEFORE DELETE ON ik_d1_custody_states WHEN EXISTS(SELECT 1 FROM ik_jobs WHERE id=OLD.job_id) BEGIN SELECT RAISE(ABORT,'IMPORT_CUSTODY_STATE_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_publication BEFORE UPDATE ON ik_d1_custody_states WHEN EXISTS(SELECT 1 FROM ik_d1_publication_fences f JOIN ik_d1_custody_revisions r ON r.job_id=f.job_id WHERE (f.job_id=OLD.job_id OR f.job_id=NEW.job_id) AND r.seal IS NOT NULL) BEGIN SELECT RAISE(ABORT,'IMPORT_PUBLICATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_receipt AFTER UPDATE ON ik_d1_custody_states BEGIN UPDATE ik_d1_custody_revisions SET seal=NULL WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_create AFTER INSERT ON ik_jobs BEGIN INSERT INTO ik_d1_custody_states(job_id) VALUES(NEW.id); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_jobs_insert AFTER INSERT ON ik_jobs BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_jobs_update AFTER UPDATE ON ik_jobs BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.id OR job_id=NEW.id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_jobs_delete AFTER DELETE ON ik_jobs BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_plan_chunks_insert AFTER INSERT ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_plan_chunks_update AFTER UPDATE ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_plan_chunks_delete AFTER DELETE ON ik_d1_plan_chunks BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_creation_plans_insert AFTER INSERT ON ik_d1_creation_plans BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_creation_plans_update AFTER UPDATE ON ik_d1_creation_plans BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_creation_plans_delete AFTER DELETE ON ik_d1_creation_plans BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_plan_index_insert AFTER INSERT ON ik_d1_plan_index BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_plan_index_update AFTER UPDATE ON ik_d1_plan_index BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_plan_index_delete AFTER DELETE ON ik_d1_plan_index BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_originals_insert AFTER INSERT ON ik_originals BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_originals_update AFTER UPDATE ON ik_originals BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_originals_delete AFTER DELETE ON ik_originals BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_original_chunks_insert AFTER INSERT ON ik_d1_original_chunks BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_original_chunks_update AFTER UPDATE ON ik_d1_original_chunks BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_original_chunks_delete AFTER DELETE ON ik_d1_original_chunks BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_original_sets_insert AFTER INSERT ON ik_original_sets BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_original_sets_update AFTER UPDATE ON ik_original_sets BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_original_sets_delete AFTER DELETE ON ik_original_sets BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_indexed_jobs_insert AFTER INSERT ON ik_d1_indexed_jobs BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_indexed_jobs_update AFTER UPDATE ON ik_d1_indexed_jobs BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_indexed_jobs_delete AFTER DELETE ON ik_d1_indexed_jobs BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_reversal_reports_insert AFTER INSERT ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_reversal_reports_update AFTER UPDATE ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_reversal_reports_delete AFTER DELETE ON ik_d1_reversal_reports BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_provenance_insert AFTER INSERT ON ik_provenance BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_provenance_update AFTER UPDATE ON ik_provenance BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_provenance_delete AFTER DELETE ON ik_provenance BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_sources_insert AFTER INSERT ON ik_sources BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_sources_update AFTER UPDATE ON ik_sources BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_sources_delete AFTER DELETE ON ik_sources BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_entries_insert AFTER INSERT ON ik_d1_entries BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_entries_update AFTER UPDATE ON ik_d1_entries BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_entries_delete AFTER DELETE ON ik_d1_entries BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_history_insert AFTER INSERT ON ik_d1_history BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_history_update AFTER UPDATE ON ik_d1_history BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_history_delete AFTER DELETE ON ik_d1_history BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_batches_insert AFTER INSERT ON ik_batches BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_batches_update AFTER UPDATE ON ik_batches BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_batches_delete AFTER DELETE ON ik_batches BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_stream_pages_insert AFTER INSERT ON ik_d1_stream_pages BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_stream_pages_update AFTER UPDATE ON ik_d1_stream_pages BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_stream_pages_delete AFTER DELETE ON ik_d1_stream_pages BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_stream_update BEFORE UPDATE ON ik_d1_streams BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT job_id FROM ik_d1_stream_pages WHERE stream_id=OLD.id); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_stream_delete BEFORE DELETE ON ik_d1_streams BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT job_id FROM ik_d1_stream_pages WHERE stream_id=OLD.id); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_erased_sources_insert AFTER INSERT ON ik_d1_erased_sources BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT i.job_id FROM ik_d1_plan_index i JOIN ik_jobs j ON j.id=i.job_id WHERE i.source_identity=NEW.identity AND j.destination=NEW.destination); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_erased_sources_update AFTER UPDATE ON ik_d1_erased_sources BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT i.job_id FROM ik_d1_plan_index i JOIN ik_jobs j ON j.id=i.job_id WHERE (i.source_identity=OLD.identity AND j.destination=OLD.destination) OR (i.source_identity=NEW.identity AND j.destination=NEW.destination)); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_erased_sources_delete AFTER DELETE ON ik_d1_erased_sources BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT i.job_id FROM ik_d1_plan_index i JOIN ik_jobs j ON j.id=i.job_id WHERE i.source_identity=OLD.identity AND j.destination=OLD.destination); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_erased_targets_insert AFTER INSERT ON ik_d1_erased_targets BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT i.job_id FROM ik_d1_plan_index i JOIN ik_jobs j ON j.id=i.job_id WHERE i.target_identity=NEW.identity AND j.destination=NEW.destination); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_erased_targets_update AFTER UPDATE ON ik_d1_erased_targets BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT i.job_id FROM ik_d1_plan_index i JOIN ik_jobs j ON j.id=i.job_id WHERE (i.target_identity=OLD.identity AND j.destination=OLD.destination) OR (i.target_identity=NEW.identity AND j.destination=NEW.destination)); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_custody_state_ik_d1_erased_targets_delete AFTER DELETE ON ik_d1_erased_targets BEGIN UPDATE ik_d1_custody_states SET revision=revision+1 WHERE job_id IN (SELECT i.job_id FROM ik_d1_plan_index i JOIN ik_jobs j ON j.id=i.job_id WHERE i.target_identity=OLD.identity AND j.destination=OLD.destination); END;

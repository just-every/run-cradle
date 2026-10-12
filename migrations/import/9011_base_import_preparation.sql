-- Additive Base import-kit upgrade, production source 34004320ffd1e48d2432198be80326d1e0fd5ab4.
-- Preserve the previously applied migration bytes and existing import jobs.

CREATE TABLE IF NOT EXISTS ik_d1_preparation_receipts (stage_id TEXT PRIMARY KEY REFERENCES ik_d1_staging(id) ON DELETE CASCADE, generation TEXT NOT NULL, codec_id TEXT, header_hash TEXT NOT NULL, header_size INTEGER NOT NULL, header_chunks INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS ik_d1_staging_headers (stage_id TEXT NOT NULL REFERENCES ik_d1_staging(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, body TEXT NOT NULL, body_hash TEXT NOT NULL, body_size INTEGER NOT NULL, PRIMARY KEY(stage_id,ordinal));

CREATE TRIGGER IF NOT EXISTS ik_d1_preparation_receipts_insert AFTER INSERT ON ik_d1_preparation_receipts BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_headers_insert AFTER INSERT ON ik_d1_staging_headers BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_preparation_receipts_update AFTER UPDATE ON ik_d1_preparation_receipts BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_headers_update AFTER UPDATE ON ik_d1_staging_headers BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id OR id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_preparation_receipts_delete AFTER DELETE ON ik_d1_preparation_receipts BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_headers_delete AFTER DELETE ON ik_d1_staging_headers BEGIN UPDATE ik_d1_staging SET revision=revision+1,sealed_revision=NULL WHERE id=OLD.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_preparation_receipt_immutable BEFORE UPDATE ON ik_d1_preparation_receipts BEGIN SELECT RAISE(ABORT,'IMPORT_PREPARATION_CHANGED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_staging_headers_registered BEFORE INSERT ON ik_d1_staging_headers WHEN NOT EXISTS(SELECT 1 FROM ik_d1_staging WHERE id=NEW.stage_id AND registered_revision IS NOT NULL) BEGIN SELECT RAISE(ABORT,'IMPORT_STAGE_INDEX_REQUIRED'); END;

CREATE TRIGGER IF NOT EXISTS ik_d1_preparation_privacy_insert AFTER INSERT ON ik_d1_staging_index BEGIN DELETE FROM ik_d1_staging_headers WHERE stage_id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_preparation_privacy_update AFTER UPDATE ON ik_d1_staging_index BEGIN DELETE FROM ik_d1_staging_headers WHERE stage_id=OLD.stage_id OR stage_id=NEW.stage_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_preparation_privacy_delete AFTER DELETE ON ik_d1_staging_index BEGIN DELETE FROM ik_d1_staging_headers WHERE stage_id=OLD.stage_id; END;

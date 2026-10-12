-- Additive Base import-kit upgrade, production source 34004320ffd1e48d2432198be80326d1e0fd5ab4.
-- Preserve the previously applied migration bytes and existing import jobs.

CREATE TABLE IF NOT EXISTS ik_d1_streams (id TEXT PRIMARY KEY, destination TEXT NOT NULL, namespace TEXT NOT NULL, mapping_version TEXT NOT NULL, principal_id TEXT NOT NULL, fingerprint TEXT NOT NULL, operation_key TEXT NOT NULL, total INTEGER NOT NULL, layout_hash TEXT NOT NULL, state TEXT NOT NULL, UNIQUE(destination,principal_id,operation_key));

CREATE TABLE IF NOT EXISTS ik_d1_stream_pages (stream_id TEXT NOT NULL REFERENCES ik_d1_streams(id), ordinal INTEGER NOT NULL, job_id TEXT NOT NULL UNIQUE REFERENCES ik_jobs(id), total INTEGER NOT NULL, erased_records INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(stream_id,ordinal));

CREATE TRIGGER IF NOT EXISTS ik_d1_stream_page_delete AFTER DELETE ON ik_d1_stream_pages BEGIN UPDATE ik_d1_streams SET state='invalid' WHERE id=OLD.stream_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_stream_page_update AFTER UPDATE OF stream_id,ordinal,job_id,total ON ik_d1_stream_pages BEGIN UPDATE ik_d1_streams SET state='invalid' WHERE id=OLD.stream_id OR id=NEW.stream_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_stream_page_insert AFTER INSERT ON ik_d1_stream_pages BEGIN UPDATE ik_d1_streams SET state='invalid' WHERE id=NEW.stream_id; END;

CREATE TABLE IF NOT EXISTS ik_d1_erased_sources (destination TEXT NOT NULL, identity TEXT NOT NULL, PRIMARY KEY(destination,identity));

CREATE TABLE IF NOT EXISTS ik_d1_erased_targets (destination TEXT NOT NULL, identity TEXT NOT NULL, PRIMARY KEY(destination,identity));

CREATE TABLE IF NOT EXISTS ik_d1_indexed_jobs (job_id TEXT PRIMARY KEY REFERENCES ik_jobs(id), fingerprint TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS ik_d1_plan_index (job_id TEXT NOT NULL REFERENCES ik_jobs(id), ordinal INTEGER NOT NULL, source_identity TEXT NOT NULL, target_identity TEXT NOT NULL, PRIMARY KEY(job_id,ordinal,target_identity));

CREATE INDEX IF NOT EXISTS ik_d1_plan_index_source ON ik_d1_plan_index(source_identity,job_id);

CREATE INDEX IF NOT EXISTS ik_d1_plan_index_target ON ik_d1_plan_index(target_identity,job_id);

CREATE TRIGGER IF NOT EXISTS ik_d1_plan_index_insert AFTER INSERT ON ik_d1_plan_index BEGIN DELETE FROM ik_d1_indexed_jobs WHERE job_id=NEW.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_plan_index_delete AFTER DELETE ON ik_d1_plan_index BEGIN DELETE FROM ik_d1_indexed_jobs WHERE job_id=OLD.job_id; END;

CREATE TRIGGER IF NOT EXISTS ik_d1_plan_index_update AFTER UPDATE ON ik_d1_plan_index BEGIN DELETE FROM ik_d1_indexed_jobs WHERE job_id=OLD.job_id OR job_id=NEW.job_id; END;

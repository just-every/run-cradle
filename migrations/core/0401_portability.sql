CREATE TABLE portability_previews(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, app_id TEXT NOT NULL, entity_id TEXT NOT NULL, file_id TEXT NOT NULL, mapping_json TEXT NOT NULL, preview_json TEXT NOT NULL, input_hash TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, committed_command_id TEXT);
CREATE TABLE portability_jobs(id TEXT PRIMARY KEY, kind TEXT NOT NULL, actor_id TEXT NOT NULL, state TEXT NOT NULL, manifest_json TEXT NOT NULL, progress_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT);
CREATE TABLE portability_parts(job_id TEXT NOT NULL REFERENCES portability_jobs(id), part_index INTEGER NOT NULL, sha256 TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY(job_id,part_index));
CREATE TABLE portability_fences(name TEXT PRIMARY KEY, job_id TEXT NOT NULL);
CREATE TABLE portability_steps(job_id TEXT PRIMARY KEY, progress_json TEXT NOT NULL);

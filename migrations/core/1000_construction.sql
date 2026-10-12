CREATE TABLE construction_candidates (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), state TEXT NOT NULL, source_hash TEXT NOT NULL, parent_release_id TEXT, detail_json TEXT NOT NULL CHECK(json_valid(detail_json)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX construction_candidates_app ON construction_candidates(app_id,created_at,id);
CREATE TABLE construction_evaluations (id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES construction_candidates(id), app_id TEXT NOT NULL, source_hash TEXT NOT NULL, state TEXT NOT NULL, detail_json TEXT NOT NULL CHECK(json_valid(detail_json)), created_at TEXT NOT NULL);
CREATE INDEX construction_evaluations_candidate ON construction_evaluations(candidate_id,source_hash);

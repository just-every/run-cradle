CREATE TABLE app_improvements(id TEXT PRIMARY KEY,app_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),state TEXT NOT NULL,cohort_id TEXT NOT NULL,detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX app_improvements_cohort ON app_improvements(app_id,cohort_id,created_at);

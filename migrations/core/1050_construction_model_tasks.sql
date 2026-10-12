CREATE TABLE construction_model_tasks (
 request_id TEXT PRIMARY KEY,
 principal_id TEXT NOT NULL,
 input_hash TEXT NOT NULL,
 task_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);

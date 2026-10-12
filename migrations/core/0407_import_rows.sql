CREATE TABLE portability_preview_rows (id TEXT PRIMARY KEY NOT NULL,preview_id TEXT NOT NULL REFERENCES portability_previews(id),row_number INTEGER NOT NULL,record_id TEXT NOT NULL,content TEXT NOT NULL,UNIQUE(preview_id,row_number));
CREATE INDEX portability_preview_record ON portability_preview_rows(record_id,preview_id);

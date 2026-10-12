CREATE TABLE repair_stores_evidence(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES repair_stores(id) ON DELETE CASCADE,value TEXT NOT NULL REFERENCES evidence_files(id),position INTEGER NOT NULL,UNIQUE(record_id,value));
CREATE INDEX repair_stores_evidence_reverse ON repair_stores_evidence(value,record_id);
CREATE TABLE repair_assets_evidence(id TEXT PRIMARY KEY,record_id TEXT NOT NULL REFERENCES repair_assets(id) ON DELETE CASCADE,value TEXT NOT NULL REFERENCES evidence_files(id),position INTEGER NOT NULL,UNIQUE(record_id,value));
CREATE INDEX repair_assets_evidence_reverse ON repair_assets_evidence(value,record_id);

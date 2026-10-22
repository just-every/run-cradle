-- Additive: a connection used to pick files from a person's own file store belongs to that person.
-- Existing connections keep a NULL owner and are never offered to the chooser.
ALTER TABLE provider_connections ADD COLUMN owner_id TEXT;
CREATE INDEX provider_connections_owner ON provider_connections(owner_id,adapter_id);
-- One request and its answer per connection job; the row is deleted when the answer is read.
-- It holds metadata or one small thumbnail in transit, never a credential and never a stored copy.
CREATE TABLE file_store_requests (
 job_id TEXT PRIMARY KEY REFERENCES connection_jobs(id),
 connection_id TEXT NOT NULL REFERENCES provider_connections(id),
 actor_id TEXT NOT NULL,
 request_json TEXT NOT NULL,
 result_json TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX file_store_requests_age ON file_store_requests(created_at);

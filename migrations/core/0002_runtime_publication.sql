-- Transfer metadata only; the admitted outbox remains the authority for effects.
CREATE TABLE runtime_queue_publications (
 command_id TEXT PRIMARY KEY NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('published','unknown')),
 attempts INTEGER NOT NULL CHECK(attempts>0),
 checked_at TEXT NOT NULL,
 error_code TEXT
);

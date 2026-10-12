-- Local dev identity for an existing Cradle store (Base operator-auth schema/dev-sessions.sql), last in the ordered inventory.
-- SQLite cannot change a CHECK in place, so oa_sessions is rebuilt with 'dev' admitted,
-- keeping every row, column, index and constraint. Unlike the reference seed, Cradle has
-- one table that refers to oa_sessions: cradle_base_sessions (the product session handle
-- of each Base session). It is held, dropped before its parent and recreated unchanged,
-- so every mirrored session keeps its id and stays bound to the same Base session.
-- The file is also safe on a store created with the current schema/operator-auth.sql.
CREATE TABLE cradle_base_sessions_dev_hold AS SELECT base_id, session_id FROM cradle_base_sessions;
DROP TABLE cradle_base_sessions;
CREATE TABLE oa_sessions_dev_rebuild (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
 operator_id TEXT NOT NULL REFERENCES oa_operators(id), operator_version INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('native','review','oidc','password','dev')),
 source_token_id TEXT UNIQUE REFERENCES oa_tokens(id),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
INSERT INTO oa_sessions_dev_rebuild(id,token_hash,operator_id,operator_version,kind,source_token_id,created_at,expires_at,revoked_at)
 SELECT id,token_hash,operator_id,operator_version,kind,source_token_id,created_at,expires_at,revoked_at FROM oa_sessions;
DROP TABLE oa_sessions;
ALTER TABLE oa_sessions_dev_rebuild RENAME TO oa_sessions;
CREATE INDEX oa_sessions_operator ON oa_sessions(operator_id);
CREATE TABLE cradle_base_sessions (
 base_id TEXT PRIMARY KEY REFERENCES oa_sessions(id),
 session_id TEXT NOT NULL UNIQUE REFERENCES authority_sessions(id)
);
INSERT INTO cradle_base_sessions(base_id,session_id) SELECT base_id,session_id FROM cradle_base_sessions_dev_hold;
DROP TABLE cradle_base_sessions_dev_hold;
CREATE TABLE IF NOT EXISTS oa_dev_credentials (
 credential TEXT NOT NULL, id TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(credential, id)
);

-- Proposing keys bind a connector credential to its issuing owner and one base; proposals are inert review artifacts.
CREATE TABLE authority_schema_proposers (
 principal_id TEXT PRIMARY KEY NOT NULL REFERENCES authority_principals(id),
 issuer_id TEXT NOT NULL REFERENCES authority_principals(id),
 issuer_epoch INTEGER NOT NULL,
 base_operator_id TEXT NOT NULL,
 base_operator_version INTEGER NOT NULL,
 app_id TEXT NOT NULL,
 label TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 revoked_at INTEGER
);
CREATE INDEX authority_schema_proposers_issuer ON authority_schema_proposers(issuer_id,created_at);
CREATE TABLE record_schema_proposals (
 id TEXT PRIMARY KEY NOT NULL,
 app_id TEXT NOT NULL,
 proposer_id TEXT NOT NULL,
 credential_id TEXT NOT NULL,
 issuer_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','adopted','declined','withdrawn')),
 summary TEXT NOT NULL,
 detail_json TEXT NOT NULL,
 preview_hash TEXT NOT NULL,
 note TEXT,
 release_id TEXT,
 decided_by TEXT,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 decided_at TEXT
);
CREATE INDEX record_schema_proposals_issuer ON record_schema_proposals(issuer_id,created_at);
CREATE INDEX record_schema_proposals_proposer ON record_schema_proposals(proposer_id,created_at);

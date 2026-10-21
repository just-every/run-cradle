-- Company identity is opt-in. Configuration, credentials and login attempts never transfer.
CREATE TABLE company_identity_config (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), entity_id TEXT NOT NULL,
 sso_url TEXT NOT NULL, certificate TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
 generation INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE company_scim_credentials (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL,
 owner_version INTEGER NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE company_scim_users (
 operator_id TEXT PRIMARY KEY REFERENCES oa_operators(id), external_id TEXT,
 deleted INTEGER NOT NULL DEFAULT 0, given_name TEXT NOT NULL DEFAULT '', family_name TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
CREATE TABLE company_saml_requests (
 id TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, generation INTEGER NOT NULL,
 auth_generation INTEGER NOT NULL, expires_at INTEGER NOT NULL, return_to TEXT NOT NULL
);
CREATE TABLE company_saml_assertions (assertion_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE company_identity_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operator_id TEXT, action TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE execution_model_bindings (
 profile_id TEXT NOT NULL REFERENCES execution_model_profiles(id),principal_id TEXT NOT NULL,
 connection_id TEXT NOT NULL REFERENCES provider_connections(id),grant_id TEXT NOT NULL,grant_version INTEGER NOT NULL,
 custodian_id TEXT NOT NULL,max_output_tokens INTEGER NOT NULL,version INTEGER NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(profile_id,principal_id)
);

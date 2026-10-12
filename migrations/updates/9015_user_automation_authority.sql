-- New user-facing delegations retain the issuer's actual policy snapshot.
-- Older machine credentials keep their independently approved authority.
CREATE TABLE authority_delegations (
 principal_id TEXT PRIMARY KEY REFERENCES authority_principals(id),
 issuer_id TEXT NOT NULL REFERENCES authority_principals(id),
 issuer_epoch INTEGER NOT NULL,
 app_id TEXT NOT NULL,
 issuer_membership_version INTEGER NOT NULL,
 issuer_policy_id TEXT NOT NULL REFERENCES authority_policies(id),
 issuer_policy_version INTEGER NOT NULL,
 base_operator_id TEXT NOT NULL REFERENCES oa_operators(id),
 base_operator_version INTEGER NOT NULL,
 label TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('api-key','automation')),
 grant_id TEXT REFERENCES authority_grants(id),
 automation_id TEXT REFERENCES automations(id),
 created_at INTEGER NOT NULL,
 revoked_at INTEGER
);
CREATE INDEX authority_delegations_issuer ON authority_delegations(issuer_id,app_id);

CREATE TABLE record_automation_bindings (
 automation_id TEXT PRIMARY KEY REFERENCES automations(id),
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES authority_principals(id)
);
CREATE TABLE record_automation_versions (
 automation_id TEXT NOT NULL REFERENCES automations(id), definition_version INTEGER NOT NULL,
 definition_json TEXT NOT NULL, principal_id TEXT NOT NULL REFERENCES authority_principals(id),
 credential_id TEXT, created_at INTEGER NOT NULL,
 PRIMARY KEY(automation_id,definition_version)
);
-- This singleton exists only during the native atomic admission transaction.
CREATE TABLE record_automation_context (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), command_id TEXT NOT NULL,
 app_id TEXT NOT NULL, cause_run_ids_json TEXT NOT NULL
);
CREATE TABLE record_automation_events (
 id TEXT PRIMARY KEY, command_id TEXT NOT NULL REFERENCES command_admissions(command_id),
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, record_id TEXT NOT NULL,
 event TEXT NOT NULL, record_version INTEGER NOT NULL, definitions_json TEXT NOT NULL,
 cause_run_ids_json TEXT NOT NULL, created_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','complete')),
 UNIQUE(command_id,app_id,entity_id,record_id,event)
);
CREATE INDEX record_automation_events_pending ON record_automation_events(state,created_at);
CREATE TABLE record_automation_triggers (
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, table_name TEXT NOT NULL,
 PRIMARY KEY(app_id,entity_id)
);
CREATE TABLE record_automation_destinations (
 id TEXT PRIMARY KEY, app_id TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES authority_principals(id),
 kind TEXT NOT NULL CHECK(kind IN ('webhook','slack')), sealed_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, revoked_at INTEGER
);

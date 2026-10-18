CREATE TABLE manual_base_roles (
 app_id TEXT NOT NULL REFERENCES manual_record_bases(id),
 principal_id TEXT NOT NULL REFERENCES authority_principals(id),
 role TEXT NOT NULL CHECK(role IN ('owner','creator','editor','commenter','read-only')),
 destructive INTEGER NOT NULL DEFAULT 0 CHECK(destructive IN (0,1)),
 policy_id TEXT NOT NULL REFERENCES authority_policies(id),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(app_id,principal_id)
);

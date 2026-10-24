-- Key identities are metadata only; credential values and digests never enter the audit.
ALTER TABLE company_identity_audit ADD COLUMN key_ids_json TEXT;

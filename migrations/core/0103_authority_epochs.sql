ALTER TABLE authority_grants ADD COLUMN issuer_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE authority_grants ADD COLUMN delegate_epoch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE authority_credentials ADD COLUMN authentication_epoch INTEGER NOT NULL DEFAULT 0;

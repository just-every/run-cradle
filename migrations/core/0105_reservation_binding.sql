ALTER TABLE authority_reservations ADD COLUMN app_id TEXT;
ALTER TABLE authority_reservations ADD COLUMN action TEXT;
ALTER TABLE authority_reservations ADD COLUMN owner_principal_id TEXT;
ALTER TABLE authority_reservations ADD COLUMN attempt_id TEXT;
ALTER TABLE authority_reservations ADD COLUMN input_hash TEXT;
ALTER TABLE authority_reservations ADD COLUMN binding_hash TEXT;
CREATE INDEX authority_reservations_attempt ON authority_reservations(attempt_id,command_id);

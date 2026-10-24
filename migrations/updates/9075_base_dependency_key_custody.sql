-- Adopt Base's dependency-key custody contract without changing released rows.
-- Existing signing keys remain eligible for Base's atomic plaintext upgrade;
-- the installation secret stays in private settings and is never stored here.
ALTER TABLE rer_dependency_installation
 ADD COLUMN keys_sealed INTEGER NOT NULL DEFAULT 0 CHECK (keys_sealed IN (0, 1));
ALTER TABLE rer_dependency_installation
 ADD COLUMN key_ids TEXT NOT NULL DEFAULT '[]'
 CHECK (json_valid(key_ids) AND json_type(key_ids) = 'array');

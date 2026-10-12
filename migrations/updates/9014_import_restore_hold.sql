-- Historical imports retain their custody; restored work requires an explicit continuation.
ALTER TABLE ik_jobs ADD COLUMN cradle_restore_hold INTEGER NOT NULL DEFAULT 0;

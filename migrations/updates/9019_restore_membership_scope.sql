-- Archive source scope is retained without making an imported membership active.
ALTER TABLE authority_memberships ADD COLUMN cradle_restore_active INTEGER NOT NULL DEFAULT 0;

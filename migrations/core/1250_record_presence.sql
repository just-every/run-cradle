-- Short-lived activity handles only: no names, emails, credentials or record content.
-- Installation archives exclude this table; presence is never admitted as a command.
CREATE TABLE record_presence (
 id TEXT PRIMARY KEY NOT NULL,
 scope_key TEXT NOT NULL,
 app_id TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 view_id TEXT,
 principal_id TEXT NOT NULL REFERENCES authority_principals(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES authority_sessions(id) ON DELETE CASCADE,
 base_session_id TEXT,
 authentication_epoch INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(scope_key,principal_id)
);
CREATE INDEX record_presence_expiry ON record_presence(expires_at);
CREATE INDEX record_presence_person ON record_presence(principal_id);
-- Remove activity immediately on removal/erasure, even with no future heartbeats.
CREATE TRIGGER record_presence_forget_person AFTER UPDATE OF state ON authority_principals
WHEN NEW.state<>'active'
BEGIN
 DELETE FROM record_presence WHERE principal_id=NEW.id;
END;

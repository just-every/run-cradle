-- Existing credentials and migration history remain intact. Preview sharing always starts off.
ALTER TABLE provider_connections ADD COLUMN share_previews INTEGER NOT NULL DEFAULT 0 CHECK(share_previews IN (0,1));
-- Preserve prior identities and credentials; only a fresh provider response can verify an account.
ALTER TABLE provider_connections ADD COLUMN account_verified INTEGER NOT NULL DEFAULT 0 CHECK(account_verified IN (0,1));
CREATE TABLE file_store_policies (
 provider TEXT PRIMARY KEY NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 connect_role TEXT NOT NULL DEFAULT 'writers' CHECK(connect_role IN ('writers','base-authors','installation-owner')),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
INSERT INTO file_store_policies(provider,created_at,updated_at) VALUES
 ('google-drive',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('onedrive',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('dropbox',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('box',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

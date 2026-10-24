-- Expand one legacy app into independently managed provider installations.
-- Keep credential ciphertext, installation instance, cards, links and consent intact.
CREATE TABLE slack_app_installation_next (
 id TEXT PRIMARY KEY CHECK(id IN ('slack','teams','nook')), owner_id TEXT NOT NULL,
 client_id TEXT NOT NULL, sealed_json TEXT NOT NULL, bot_sealed_json TEXT,
 team_id TEXT, team_name TEXT, version INTEGER NOT NULL, updated_at TEXT NOT NULL,
 provider TEXT NOT NULL UNIQUE CHECK(provider IN ('slack','teams','nook')),
 api_origin TEXT, instance_id TEXT, CHECK(id=provider)
);
INSERT INTO slack_app_installation_next
 SELECT provider,owner_id,client_id,sealed_json,bot_sealed_json,team_id,team_name,
 version,updated_at,provider,api_origin,instance_id FROM slack_app_installation;
DROP TABLE slack_app_installation;
ALTER TABLE slack_app_installation_next RENAME TO slack_app_installation;

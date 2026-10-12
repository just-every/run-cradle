-- Internal transport principal has no app memberships, grants or user-discoverable app.
INSERT INTO authority_principals(id,kind,human_id,state,authentication_epoch,initial_owner,created_at,updated_at,version) VALUES('00000000000000000000000001','system',NULL,'active',1,0,0,0,1);
ALTER TABLE authority_magic_tokens ADD COLUMN mail_input_hash TEXT;

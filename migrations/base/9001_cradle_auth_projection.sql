-- Product identities are projections of Base operators, never credentials.
-- Existing product IDs and history remain unchanged on adoption.
CREATE TABLE cradle_base_operators (
 base_id TEXT PRIMARY KEY REFERENCES oa_operators(id),
 principal_id TEXT NOT NULL UNIQUE REFERENCES authority_principals(id)
);
CREATE TABLE cradle_base_sessions (
 base_id TEXT PRIMARY KEY REFERENCES oa_sessions(id),
 session_id TEXT NOT NULL UNIQUE REFERENCES authority_sessions(id)
);
INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at)
 SELECT o.id,lower(o.email),o.name,CASE WHEN p.initial_owner=1 THEN 'owner' ELSE 'member' END,
 CASE WHEN o.active=1 AND p.state='active' THEN 'active' ELSE 'inactive' END,1,o.created_at
 FROM operators o JOIN authority_principals p ON p.human_id=o.id;
INSERT INTO cradle_base_operators(base_id,principal_id)
 SELECT o.id,p.id FROM operators o JOIN authority_principals p ON p.human_id=o.id;
INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at)
 SELECT 1,'imported-existing-installation',unixepoch('subsec')*1000
 WHERE EXISTS(SELECT 1 FROM operators);
CREATE TRIGGER cradle_project_base_operator AFTER INSERT ON oa_operators
 BEGIN
 INSERT INTO operators(id,created_at,updated_at,version,name,email,active)
 VALUES('01'||substr(hex(randomblob(12)),1,24),NEW.created_at,NEW.created_at,1,NEW.display_name,NEW.email,NEW.status='active');
 INSERT INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at)
 SELECT id,'human',id,CASE WHEN NEW.status='active' THEN 'active' ELSE 'invited' END,
 NEW.role='owner' AND NOT EXISTS(SELECT 1 FROM authority_principals WHERE initial_owner=1),created_at,updated_at
 FROM operators WHERE email=NEW.email;
 INSERT INTO cradle_base_operators(base_id,principal_id)
 SELECT NEW.id,id FROM operators WHERE email=NEW.email;
 END;
CREATE TRIGGER cradle_update_base_operator AFTER UPDATE OF status,role ON oa_operators
 BEGIN
 UPDATE operators SET active=NEW.status='active',version=version+1,updated_at=unixepoch('subsec')*1000
 WHERE id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=NEW.id);
 UPDATE authority_principals SET state=CASE WHEN NEW.status='active' THEN 'active' WHEN NEW.status='invited' THEN 'invited' ELSE 'removed' END,
 authentication_epoch=authentication_epoch+1,version=version+1,updated_at=unixepoch('subsec')*1000
 WHERE id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=NEW.id);
 END;

CREATE TABLE cradle_restore (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), pending INTEGER NOT NULL DEFAULT 0,
 source_owner_id TEXT, current_owner_id TEXT
);
INSERT INTO cradle_restore(singleton,current_owner_id)
 SELECT 1,(SELECT id FROM authority_principals WHERE initial_owner=1 LIMIT 1);
CREATE TABLE cradle_restore_owner_admissions (
 id TEXT PRIMARY KEY, source_owner_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 base_operator_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
DROP TRIGGER cradle_project_base_operator;
CREATE TRIGGER cradle_project_base_operator AFTER INSERT ON oa_operators BEGIN
 INSERT OR IGNORE INTO operators(id,created_at,updated_at,version,name,email,active)
 VALUES('01'||substr(hex(randomblob(12)),1,24),NEW.created_at,NEW.created_at,1,NEW.display_name,NEW.email,NEW.status='active');
 UPDATE operators SET active=NEW.status='active',name=NEW.display_name,updated_at=NEW.created_at,version=version+1 WHERE email=NEW.email;
 INSERT OR IGNORE INTO authority_principals(id,kind,human_id,state,initial_owner,created_at,updated_at)
 SELECT id,'human',id,CASE WHEN NEW.status='active' THEN 'active' ELSE 'invited' END,0,created_at,updated_at FROM operators WHERE email=NEW.email;
 UPDATE authority_principals SET state=CASE WHEN NEW.status='active' THEN 'active' ELSE 'invited' END,
 initial_owner=CASE WHEN NEW.role='owner' AND NOT EXISTS(SELECT 1 FROM authority_principals WHERE initial_owner=1) THEN 1 ELSE initial_owner END,
 authentication_epoch=authentication_epoch+1,version=version+1,updated_at=NEW.created_at
 WHERE human_id=(SELECT id FROM operators WHERE email=NEW.email);
 INSERT INTO cradle_base_operators(base_id,principal_id) SELECT NEW.id,p.id FROM authority_principals p JOIN operators o ON o.id=p.human_id WHERE o.email=NEW.email;
 UPDATE cradle_restore SET current_owner_id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=NEW.id)
 WHERE singleton=1 AND NEW.role='owner' AND EXISTS(SELECT 1 FROM authority_principals WHERE id=(SELECT principal_id FROM cradle_base_operators WHERE base_id=NEW.id) AND initial_owner=1);
END;

-- Guest identity survives revocation and erasure so neither can grant wider access.
CREATE TABLE authority_guests (
 principal_id TEXT PRIMARY KEY REFERENCES authority_principals(id),
 app_id TEXT NOT NULL,
 invitation_delivered INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL
);
CREATE TRIGGER cradle_guest_membership_insert BEFORE INSERT ON authority_memberships
 WHEN EXISTS(SELECT 1 FROM authority_guests WHERE principal_id=NEW.principal_id AND app_id<>NEW.app_id)
 BEGIN SELECT RAISE(ABORT,'guest_scope'); END;
CREATE TRIGGER cradle_guest_membership_update BEFORE UPDATE OF app_id,principal_id ON authority_memberships
 WHEN EXISTS(SELECT 1 FROM authority_guests WHERE principal_id=NEW.principal_id AND app_id<>NEW.app_id)
 BEGIN SELECT RAISE(ABORT,'guest_scope'); END;
CREATE TRIGGER cradle_guest_native_role BEFORE UPDATE OF role ON oa_operators
 WHEN NEW.role<>'member' AND EXISTS(SELECT 1 FROM cradle_base_operators m JOIN authority_guests g ON g.principal_id=m.principal_id WHERE m.base_id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'guest_role'); END;

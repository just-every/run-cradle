-- The installation always keeps an active owner (OPS-002). Base's last-owner triggers count
-- only Base owners, so a Base co-owner could deactivate, demote or remove the operator that
-- projects to the installation owner. Refuse that unless the same transaction has already
-- made another active principal the installation owner, as member.transfer-ownership does.
CREATE TRIGGER cradle_preserve_installation_owner_update BEFORE UPDATE OF status,role ON oa_operators
 WHEN OLD.role='owner' AND OLD.status='active' AND (NEW.role!='owner' OR NEW.status!='active')
 AND EXISTS(SELECT 1 FROM cradle_base_operators m JOIN authority_principals p ON p.id=m.principal_id
  WHERE m.base_id=OLD.id AND p.state='active' AND p.initial_owner=1)
 AND NOT EXISTS(SELECT 1 FROM authority_principals p WHERE p.state='active' AND p.initial_owner=1
  AND p.id!=(SELECT principal_id FROM cradle_base_operators WHERE base_id=OLD.id))
 BEGIN SELECT RAISE(ABORT, 'last_owner'); END;
CREATE TRIGGER cradle_preserve_installation_owner_delete BEFORE DELETE ON oa_operators
 WHEN EXISTS(SELECT 1 FROM cradle_base_operators m JOIN authority_principals p ON p.id=m.principal_id
  WHERE m.base_id=OLD.id AND p.state='active' AND p.initial_owner=1)
 AND NOT EXISTS(SELECT 1 FROM authority_principals p WHERE p.state='active' AND p.initial_owner=1
  AND p.id!=(SELECT principal_id FROM cradle_base_operators WHERE base_id=OLD.id))
 BEGIN SELECT RAISE(ABORT, 'last_owner'); END;

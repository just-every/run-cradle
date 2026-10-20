-- An erased operator cannot be undone (OPS-005). Base's operator routes change status and role
-- directly, and cradle_update_base_operator projects an active status back onto the principal.
-- Refuse any status or role change on the Base operator of an erased principal.
CREATE TRIGGER cradle_preserve_erased_operator BEFORE UPDATE OF status,role ON oa_operators
 WHEN EXISTS(SELECT 1 FROM cradle_base_operators m JOIN authority_principals p ON p.id=m.principal_id
  WHERE m.base_id=OLD.id AND p.state='erased')
 BEGIN SELECT RAISE(ABORT, 'operator_erased'); END;

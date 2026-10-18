-- Comment deletion is part of the retained comment capability. Preserve the
-- existing entity, principals, row/field restrictions and allow/deny effects.
UPDATE authority_policies
SET rules_json = (
 SELECT json_group_array(json(CASE
  WHEN EXISTS(SELECT 1 FROM json_each(rule.value, '$.actions') WHERE value='launch.comment.create')
   AND NOT EXISTS(SELECT 1 FROM json_each(rule.value, '$.actions') WHERE value='launch.comment.delete')
  THEN json_insert(rule.value, '$.actions[#]', 'launch.comment.delete')
  ELSE rule.value END)) FROM json_each(authority_policies.rules_json) rule
), version=version+1
WHERE app_id='00000000000000000000000700'
 AND EXISTS(SELECT 1 FROM json_each(rules_json) rule
  WHERE EXISTS(SELECT 1 FROM json_each(rule.value,'$.actions') WHERE value='launch.comment.create')
  AND NOT EXISTS(SELECT 1 FROM json_each(rule.value,'$.actions') WHERE value='launch.comment.delete'));

-- Existing manual-base editors gain separate comment actions under the same
-- exact principal, row and allow/deny rules. Read-only and delegated rules stay
-- unchanged. Advancing the policy version invalidates previously frozen grants.
UPDATE authority_policies AS policy
SET rules_json=(
 SELECT json_group_array(json(
  CASE WHEN EXISTS(SELECT 1 FROM json_each(rule.value,'$.actions') WHERE value='record.patch')
  THEN json_set(rule.value,'$.actions',json((
   SELECT json_group_array(action) FROM (
    SELECT value AS action FROM json_each(rule.value,'$.actions')
    UNION SELECT 'comment.add' UNION SELECT 'comment.edit' UNION SELECT 'comment.delete'
   )
  ))) ELSE rule.value END
 )) FROM json_each(policy.rules_json) AS rule
),version=version+1
WHERE EXISTS(SELECT 1 FROM manual_record_bases base WHERE base.id=policy.app_id)
AND EXISTS(SELECT 1 FROM authority_memberships member JOIN authority_principals principal ON principal.id=member.principal_id
 WHERE member.policy_id=policy.id AND principal.kind='human')
AND EXISTS(SELECT 1 FROM json_each(policy.rules_json) AS rule,json_each(rule.value,'$.actions') AS action WHERE action.value='record.patch');

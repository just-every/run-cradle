-- Existing installation owners receive the same connection setup rights as new owners.
-- Preserve membership revocations, row restrictions, denies and non-owner policies.
UPDATE authority_policies
SET rules_json = (
  SELECT json_group_array(json(CASE
    WHEN json_extract(rule.value, '$.effect') = 'allow'
      AND json_array_length(json_extract(rule.value, '$.principals')) = 1
      AND json_extract(rule.value, '$.rows.kind') = 'all'
      AND json_array_length(json_extract(rule.value, '$.rows.conditions')) = 0
      AND EXISTS (
        SELECT 1 FROM json_each(rule.value, '$.principals') actor
        JOIN authority_principals owner ON owner.id = json_extract(actor.value, '$.id')
        JOIN authority_memberships membership ON membership.principal_id = owner.id
        WHERE json_extract(actor.value, '$.kind') = 'human'
          AND owner.initial_owner = 1 AND owner.state = 'active'
          AND membership.app_id = authority_policies.app_id
          AND membership.policy_id = authority_policies.id AND membership.state = 'active'
      )
    THEN json_insert(rule.value,
      '$.actions[#]', 'connection.read',
      '$.actions[#]', 'connection.configure',
      '$.actions[#]', 'connection.begin-consent',
      '$.actions[#]', 'connection.check',
      '$.actions[#]', 'connection.revoke')
    ELSE rule.value END))
  FROM json_each(authority_policies.rules_json) rule
), version = version + 1
WHERE EXISTS (
  SELECT 1 FROM authority_memberships membership
  JOIN authority_principals owner ON owner.id = membership.principal_id
  WHERE membership.policy_id = authority_policies.id AND membership.app_id = authority_policies.app_id
    AND membership.state = 'active' AND owner.initial_owner = 1 AND owner.state = 'active'
);

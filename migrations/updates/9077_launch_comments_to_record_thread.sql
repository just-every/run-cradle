-- Retire Launch's second thread. The empty historical shape permits a safe
-- reapplication after the source table has already been retired.
CREATE TABLE IF NOT EXISTS comments (
 id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
 author_id TEXT NOT NULL REFERENCES operators(id), body TEXT NOT NULL,
 deleted_at INTEGER
);
INSERT INTO evidence_comments (
 id, app_id, entity_id, record_id, author_id, author_kind, author_label,
 body, mentions_json, version, created_at, updated_at, deleted_at
)
SELECT c.id, '00000000000000000000000700', '00000000000000000000000701',
 c.campaign_id, COALESCE(p.id, o.id), COALESCE(p.kind, 'human'), o.name,
 c.body, '[]', c.version,
 strftime('%Y-%m-%dT%H:%M:%fZ', c.created_at/1000.0, 'unixepoch'),
 strftime('%Y-%m-%dT%H:%M:%fZ', c.updated_at/1000.0, 'unixepoch'),
 strftime('%Y-%m-%dT%H:%M:%fZ', c.deleted_at/1000.0, 'unixepoch')
FROM comments c JOIN operators o ON o.id=c.author_id
LEFT JOIN authority_principals p ON p.human_id=o.id AND p.kind='human'
WHERE NOT EXISTS (SELECT 1 FROM evidence_comments e WHERE e.id=c.id);

-- Translate actions in their original rule, retaining deterministic rule IDs,
-- principals, effects, entity, row/field restrictions and all other properties.
-- The old surface never offered edit, so this update grants no comment.edit.
UPDATE authority_policies
SET rules_json=(
 SELECT json_group_array(json(json_set(rule.value, '$.actions', json((
  SELECT json_group_array(action) FROM (
   SELECT DISTINCT CASE value
    WHEN 'launch.comment.create' THEN 'comment.add'
    WHEN 'launch.comment.delete' THEN 'comment.delete'
    ELSE value END AS action
   FROM json_each(rule.value, '$.actions')
  )
 ))))) FROM json_each(authority_policies.rules_json) rule
), version=version+1
WHERE EXISTS (
 SELECT 1 FROM json_each(rules_json) rule, json_each(rule.value, '$.actions') action
 WHERE action.value IN ('launch.comment.create','launch.comment.delete')
);
DROP TABLE comments;

-- Metadata-only redaction custody: never retain the prior comment body.
CREATE TABLE IF NOT EXISTS evidence_comment_redactions (
 id TEXT PRIMARY KEY NOT NULL, comment_id TEXT NOT NULL UNIQUE,
 app_id TEXT NOT NULL, entity_id TEXT NOT NULL, record_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, actor_kind TEXT NOT NULL, reason TEXT NOT NULL,
 created_at TEXT NOT NULL
);
-- Reuse each rule's existing record restrictions. Denials remain denials.
-- A current workspace owner/admin session is also required at admission time.
UPDATE authority_policies
SET rules_json=(SELECT json_group_array(json(CASE
 WHEN EXISTS(SELECT 1 FROM json_each(rule.value,'$.actions') WHERE value='comment.delete')
  AND NOT EXISTS(SELECT 1 FROM json_each(rule.value,'$.actions') WHERE value='comment.redact')
  AND (json_extract(rule.value,'$.effect')='deny' OR EXISTS(
   SELECT 1 FROM json_each(rule.value,'$.principals') principal
   JOIN cradle_base_operators projection ON projection.principal_id=json_extract(principal.value,'$.id')
   JOIN oa_operators operator ON operator.id=projection.base_id
   WHERE json_extract(principal.value,'$.kind')='human' AND operator.role IN ('owner','admin') AND operator.status='active'))
 THEN json_insert(rule.value,'$.actions[#]','comment.redact') ELSE rule.value END))
 FROM json_each(authority_policies.rules_json) rule), version=version+1
WHERE EXISTS(SELECT 1 FROM json_each(rules_json) rule
 WHERE EXISTS(SELECT 1 FROM json_each(rule.value,'$.actions') WHERE value='comment.delete')
 AND NOT EXISTS(SELECT 1 FROM json_each(rule.value,'$.actions') WHERE value='comment.redact')
 AND (json_extract(rule.value,'$.effect')='deny' OR EXISTS(
  SELECT 1 FROM json_each(rule.value,'$.principals') principal
  JOIN cradle_base_operators projection ON projection.principal_id=json_extract(principal.value,'$.id')
  JOIN oa_operators operator ON operator.id=projection.base_id
  WHERE json_extract(principal.value,'$.kind')='human' AND operator.role IN ('owner','admin') AND operator.status='active')));

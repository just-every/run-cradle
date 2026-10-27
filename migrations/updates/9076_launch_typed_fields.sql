-- Type the retained Launch template without rewriting records, versions or authority.

-- Separate choice reads keep every compound SELECT within D1's engine limit.

WITH patches AS (
 SELECT json_extract(value, '$[0]') AS field_id, json_extract(value, '$[1]') AS old_type,
        json_extract(value, '$[2]') AS patch
 FROM json_each('[["00000000000000000000007101","text","{\"type\":\"text\",\"required\":true}"],["00000000000000000000007102","text","{\"type\":\"person\",\"required\":true}"],["00000000000000000000007104","date","{\"type\":\"date\",\"required\":true}"],["00000000000000000000007109","number","{\"type\":\"number\",\"numberFormat\":\"percent\",\"label\":\"Reported health\"}"],["00000000000000000000007110","number","{\"type\":\"money\",\"label\":\"Budget\"}"],["00000000000000000000007111","number","{\"type\":\"money\",\"label\":\"Spend\"}"],["00000000000000000000007200","text","{\"type\":\"relation\",\"relation\":{\"ownerAppId\":\"00000000000000000000000700\",\"entityId\":\"00000000000000000000000701\",\"cardinality\":\"one\",\"onDelete\":\"restrict\"}}"],["00000000000000000000007202","text","{\"type\":\"person\"}"],["00000000000000000000007300","text","{\"type\":\"relation\",\"relation\":{\"ownerAppId\":\"00000000000000000000000700\",\"entityId\":\"00000000000000000000000701\",\"cardinality\":\"one\",\"onDelete\":\"restrict\"}}"],["00000000000000000000007302","text","{\"type\":\"person\"}"],["00000000000000000000007400","text","{\"type\":\"relation\",\"relation\":{\"ownerAppId\":\"00000000000000000000000700\",\"entityId\":\"00000000000000000000000701\",\"cardinality\":\"one\",\"onDelete\":\"restrict\"}}"],["00000000000000000000007402","text","{\"type\":\"person\"}"],["00000000000000000000007500","text","{\"type\":\"relation\",\"relation\":{\"ownerAppId\":\"00000000000000000000000700\",\"entityId\":\"00000000000000000000000701\",\"cardinality\":\"one\",\"onDelete\":\"restrict\"}}"],["00000000000000000000007501","text","{\"type\":\"relation\",\"relation\":{\"ownerAppId\":\"00000000000000000000000700\",\"entityId\":\"00000000000000000000000704\",\"cardinality\":\"one\",\"onDelete\":\"restrict\"}}"],["00000000000000000000007502","text","{\"type\":\"relation\",\"relation\":{\"ownerAppId\":\"00000000000000000000000700\",\"entityId\":\"00000000000000000000000705\",\"cardinality\":\"one\",\"onDelete\":\"restrict\"}}"],["00000000000000000000007504","text","{\"type\":\"person\"}"],["00000000000000000000007505","text","{\"type\":\"person\"}"],["00000000000000000000007507","text","{\"type\":\"instant\"}"],["00000000000000000000007900","text","{\"type\":\"relation\",\"relation\":{\"ownerAppId\":\"00000000000000000000000700\",\"entityId\":\"00000000000000000000000703\",\"cardinality\":\"one\",\"onDelete\":\"restrict\"}}"],["00000000000000000000007901","text","{\"type\":\"person\"}"]]')
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN p.field_id IS NOT NULL AND json_extract(f.value, '$.type') = p.old_type
         THEN json_patch(f.value, p.patch) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f
  LEFT JOIN patches p ON p.field_id = json_extract(f.value, '$.id')
  ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id IN ('00000000000000000000000701', '00000000000000000000000702',
             '00000000000000000000000703', '00000000000000000000000704',
             '00000000000000000000000705', '00000000000000000000000709');

-- Retain distinct historical campaigns.phase choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Planning"},{"id":"00000000000000000000000002","label":"Build"},{"id":"00000000000000000000000003","label":"Production"},{"id":"00000000000000000000000004","label":"Review"},{"id":"00000000000000000000000005","label":"Launch prep"}]')
), extra_values AS (
 SELECT phase AS stored_value, 100000 + row_number() OVER (ORDER BY phase COLLATE BINARY) AS ordinal
 FROM campaigns
 WHERE phase IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = phase)
 GROUP BY phase
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Planning"},{"id":"00000000000000000000000002","label":"Build"},{"id":"00000000000000000000000003","label":"Production"},{"id":"00000000000000000000000004","label":"Review"},{"id":"00000000000000000000000005","label":"Launch prep"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007107' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000701';

-- Retain distinct historical campaigns.status choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"On track"},{"id":"00000000000000000000000002","label":"Watch"},{"id":"00000000000000000000000003","label":"At risk"},{"id":"00000000000000000000000004","label":"Blocked"}]')
), extra_values AS (
 SELECT status AS stored_value, 100000 + row_number() OVER (ORDER BY status COLLATE BINARY) AS ordinal
 FROM campaigns
 WHERE status IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = status)
 GROUP BY status
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"On track"},{"id":"00000000000000000000000002","label":"Watch"},{"id":"00000000000000000000000003","label":"At risk"},{"id":"00000000000000000000000004","label":"Blocked"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007108' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000701';

-- Retain distinct historical deliverables.state choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Open"},{"id":"00000000000000000000000002","label":"Complete"}]')
), extra_values AS (
 SELECT state AS stored_value, 100000 + row_number() OVER (ORDER BY state COLLATE BINARY) AS ordinal
 FROM deliverables
 WHERE state IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = state)
 GROUP BY state
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Open"},{"id":"00000000000000000000000002","label":"Complete"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007204' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000702';

-- Retain distinct historical milestones.type choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Launch"},{"id":"00000000000000000000000002","label":"Review"},{"id":"00000000000000000000000003","label":"Approval"},{"id":"00000000000000000000000004","label":"Decision"},{"id":"00000000000000000000000005","label":"Event"},{"id":"00000000000000000000000006","label":"Publish"}]')
), extra_values AS (
 SELECT type AS stored_value, 100000 + row_number() OVER (ORDER BY type COLLATE BINARY) AS ordinal
 FROM milestones
 WHERE type IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = type)
 GROUP BY type
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Launch"},{"id":"00000000000000000000000002","label":"Review"},{"id":"00000000000000000000000003","label":"Approval"},{"id":"00000000000000000000000004","label":"Decision"},{"id":"00000000000000000000000005","label":"Event"},{"id":"00000000000000000000000006","label":"Publish"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007303' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000703';

-- Retain distinct historical milestones.status choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Not started"},{"id":"00000000000000000000000002","label":"On track"},{"id":"00000000000000000000000003","label":"Watch"},{"id":"00000000000000000000000004","label":"At risk"},{"id":"00000000000000000000000005","label":"Blocked"},{"id":"00000000000000000000000006","label":"Complete"}]')
), extra_values AS (
 SELECT status AS stored_value, 100000 + row_number() OVER (ORDER BY status COLLATE BINARY) AS ordinal
 FROM milestones
 WHERE status IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = status)
 GROUP BY status
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Not started"},{"id":"00000000000000000000000002","label":"On track"},{"id":"00000000000000000000000003","label":"Watch"},{"id":"00000000000000000000000004","label":"At risk"},{"id":"00000000000000000000000005","label":"Blocked"},{"id":"00000000000000000000000006","label":"Complete"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007304' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000703';

-- Retain distinct historical risks.severity choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Low"},{"id":"00000000000000000000000002","label":"Medium"},{"id":"00000000000000000000000003","label":"High"},{"id":"00000000000000000000000004","label":"Critical"}]')
), extra_values AS (
 SELECT severity AS stored_value, 100000 + row_number() OVER (ORDER BY severity COLLATE BINARY) AS ordinal
 FROM risks
 WHERE severity IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = severity)
 GROUP BY severity
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Low"},{"id":"00000000000000000000000002","label":"Medium"},{"id":"00000000000000000000000003","label":"High"},{"id":"00000000000000000000000004","label":"Critical"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007403' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000704';

-- Retain distinct historical risks.state choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Watching"},{"id":"00000000000000000000000002","label":"In progress"},{"id":"00000000000000000000000003","label":"Needs decision"},{"id":"00000000000000000000000004","label":"Escalated"},{"id":"00000000000000000000000005","label":"Resolved"}]')
), extra_values AS (
 SELECT state AS stored_value, 100000 + row_number() OVER (ORDER BY state COLLATE BINARY) AS ordinal
 FROM risks
 WHERE state IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = state)
 GROUP BY state
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Watching"},{"id":"00000000000000000000000002","label":"In progress"},{"id":"00000000000000000000000003","label":"Needs decision"},{"id":"00000000000000000000000004","label":"Escalated"},{"id":"00000000000000000000000005","label":"Resolved"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007407' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000704';

-- Retain distinct historical decisions.priority choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Critical"},{"id":"00000000000000000000000002","label":"High"},{"id":"00000000000000000000000003","label":"Medium"},{"id":"00000000000000000000000004","label":"Low"}]')
), extra_values AS (
 SELECT priority AS stored_value, 100000 + row_number() OVER (ORDER BY priority COLLATE BINARY) AS ordinal
 FROM decisions
 WHERE priority IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = priority)
 GROUP BY priority
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Critical"},{"id":"00000000000000000000000002","label":"High"},{"id":"00000000000000000000000003","label":"Medium"},{"id":"00000000000000000000000004","label":"Low"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007506' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000705';

-- Retain distinct historical decisions.state choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Awaiting approval"},{"id":"00000000000000000000000002","label":"In review"},{"id":"00000000000000000000000003","label":"Approved"},{"id":"00000000000000000000000004","label":"Rejected"},{"id":"00000000000000000000000005","label":"Cancelled"}]')
), extra_values AS (
 SELECT state AS stored_value, 100000 + row_number() OVER (ORDER BY state COLLATE BINARY) AS ordinal
 FROM decisions
 WHERE state IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = state)
 GROUP BY state
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Awaiting approval"},{"id":"00000000000000000000000002","label":"In review"},{"id":"00000000000000000000000003","label":"Approved"},{"id":"00000000000000000000000004","label":"Rejected"},{"id":"00000000000000000000000005","label":"Cancelled"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007510' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000705';

-- Retain distinct historical launch_readiness.state choices after the template's choices.
WITH source_options AS (
 SELECT CAST(key AS INTEGER) AS ordinal, json(value) AS option FROM json_each('[{"id":"00000000000000000000000001","label":"Outstanding"},{"id":"00000000000000000000000002","label":"Acknowledged"}]')
), extra_values AS (
 SELECT state AS stored_value, 100000 + row_number() OVER (ORDER BY state COLLATE BINARY) AS ordinal
 FROM launch_readiness
 WHERE state IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM source_options o WHERE json_extract(o.option, '$.label') = state)
 GROUP BY state
), options AS (
 SELECT ordinal, option FROM source_options
 UNION ALL
 SELECT ordinal, json_object('id', '00000000000000000000' || printf('%06d', ordinal),
        'label', CASE WHEN stored_value = '' THEN 'Empty choice' ELSE stored_value END, 'retainedValue', stored_value) FROM extra_values
), patch AS (
 SELECT json_set('{"type":"select","options":[{"id":"00000000000000000000000001","label":"Outstanding"},{"id":"00000000000000000000000002","label":"Acknowledged"}]}', '$.options', json((
   SELECT json_group_array(json(option)) FROM (SELECT option FROM options ORDER BY ordinal)
 ))) AS value
)
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.fields', json((
 SELECT json_group_array(json(updated_field)) FROM (
  SELECT CASE WHEN json_extract(f.value, '$.id') = '00000000000000000000007902' AND json_extract(f.value, '$.type') = 'text'
         THEN json_patch(f.value, (SELECT value FROM patch)) ELSE f.value END AS updated_field
  FROM json_each(record_schemas.schema_json, '$.fields') f ORDER BY CAST(f.key AS INTEGER)
 )
)))
WHERE app_id = '00000000000000000000000700'
  AND physical_revision = 'launch-retained-v1'
  AND id = '00000000000000000000000709';

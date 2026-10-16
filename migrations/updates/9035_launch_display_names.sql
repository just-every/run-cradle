-- Correct retained Launch readiness display names without changing record identities,
-- field types, schema versions, data or authority. Explicit primary fields select their human titles. Fresh setup uses the same labels.
UPDATE record_schemas
SET schema_json = json_set(schema_json,
    '$.label', CASE json_extract(schema_json, '$.label')
            WHEN 'campaign' THEN 'Campaigns'
            WHEN 'deliverable' THEN 'Deliverables'
            WHEN 'milestone' THEN 'Milestones'
            WHEN 'risk' THEN 'Risks'
            WHEN 'decision' THEN 'Decisions'
            WHEN 'lens' THEN 'Lenses'
            WHEN 'automation' THEN 'Automations'
            WHEN 'customField' THEN 'Custom fields'
            WHEN 'readiness' THEN 'Readiness requests'
            ELSE json_extract(schema_json, '$.label') END,
    '$.fields', json((SELECT json_group_array(json(updated_field)) FROM (
        SELECT json_set(value, '$.label', CASE json_extract(value, '$.label')
            WHEN 'code' THEN 'Code'
            WHEN 'name' THEN 'Name'
            WHEN 'ownerId' THEN 'Owner'
            WHEN 'startDate' THEN 'Start date'
            WHEN 'launchDate' THEN 'Launch date'
            WHEN 'objective' THEN 'Objective'
            WHEN 'statusSummary' THEN 'Status summary'
            WHEN 'phase' THEN 'Phase'
            WHEN 'status' THEN 'Status'
            WHEN 'health' THEN 'Reported health (%)'
            WHEN 'budgetMinor' THEN 'Budget (minor units)'
            WHEN 'spendMinor' THEN 'Spend (minor units)'
            WHEN 'campaignId' THEN 'Campaign'
            WHEN 'title' THEN 'Title'
            WHEN 'dueDate' THEN 'Due date'
            WHEN 'state' THEN 'State'
            WHEN 'type' THEN 'Type'
            WHEN 'endDate' THEN 'End date'
            WHEN 'conflictReason' THEN 'Conflict reason'
            WHEN 'severity' THEN 'Severity'
            WHEN 'signal' THEN 'Signal'
            WHEN 'mitigation' THEN 'Mitigation'
            WHEN 'resolutionNote' THEN 'Resolution note'
            WHEN 'riskId' THEN 'Risk'
            WHEN 'supersedesId' THEN 'Supersedes decision'
            WHEN 'requesterId' THEN 'Requester'
            WHEN 'assigneeId' THEN 'Assignee'
            WHEN 'priority' THEN 'Priority'
            WHEN 'dueAt' THEN 'Due at'
            WHEN 'recommendation' THEN 'Recommendation'
            WHEN 'impact' THEN 'Impact'
            WHEN 'rationale' THEN 'Rationale'
            WHEN 'description' THEN 'Description'
            WHEN 'recordType' THEN 'Record type'
            WHEN 'display' THEN 'Display'
            WHEN 'enabled' THEN 'Enabled'
            WHEN 'milestoneId' THEN 'Milestone'
            WHEN 'tags' THEN 'Tags'
            ELSE json_extract(value, '$.label') END) AS updated_field
        FROM json_each(record_schemas.schema_json, '$.fields') ORDER BY CAST(key AS INTEGER)
    )))
)
WHERE app_id = '00000000000000000000000700'
  AND version = 1 AND physical_revision = 'launch-retained-v1';

-- Use names/titles for record links and detail headings instead of storage references or codes.
UPDATE record_schemas
SET schema_json = json_set(schema_json, '$.primaryFieldId', CASE id
    WHEN '00000000000000000000000701' THEN '00000000000000000000007101'
    WHEN '00000000000000000000000702' THEN '00000000000000000000007201'
    WHEN '00000000000000000000000703' THEN '00000000000000000000007301'
    WHEN '00000000000000000000000704' THEN '00000000000000000000007401'
    WHEN '00000000000000000000000705' THEN '00000000000000000000007503'
    WHEN '00000000000000000000000706' THEN '00000000000000000000007600'
    WHEN '00000000000000000000000707' THEN '00000000000000000000007700'
    WHEN '00000000000000000000000708' THEN '00000000000000000000007800'
END)
WHERE app_id = '00000000000000000000000700'
  AND version = 1 AND physical_revision = 'launch-retained-v1'
  AND id IN ('00000000000000000000000701', '00000000000000000000000702',
    '00000000000000000000000703', '00000000000000000000000704',
    '00000000000000000000000705', '00000000000000000000000706',
    '00000000000000000000000707', '00000000000000000000000708');

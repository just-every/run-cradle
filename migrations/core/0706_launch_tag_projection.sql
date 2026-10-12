-- Read-only source projection for the retained standard campaign tags field.
CREATE VIEW launch_campaign_tag_projection AS
SELECT id,campaign_id AS record_id,tag AS value,ROW_NUMBER() OVER(PARTITION BY campaign_id ORDER BY tag,id)-1 AS position FROM campaign_tags;

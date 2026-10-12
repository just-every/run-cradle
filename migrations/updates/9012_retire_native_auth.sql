-- Credentials from the retired native auth path never admit a new request.
-- Historical identities, attribution, event records and migration history remain.
UPDATE authority_sessions SET revoked_at=COALESCE(revoked_at,unixepoch('subsec')*1000)
 WHERE token_hash NOT LIKE 'base:%';
UPDATE execution_attempts SET sealed_input=NULL,version=version+1,
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE action='auth.magic-link.send' AND sealed_input IS NOT NULL;
UPDATE admission_outbox SET state='cancelled',
 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE state='pending' AND json_extract(input_json,'$.runId') IN
 (SELECT DISTINCT run_id FROM execution_attempts WHERE action='auth.magic-link.send');

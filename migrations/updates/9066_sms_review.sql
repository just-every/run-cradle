-- Preserve provider refusals and owner review of replies with no safe record attribution.
ALTER TABLE sms_messages ADD COLUMN provider_error_json TEXT;
ALTER TABLE sms_inbound_events ADD COLUMN sender_mask TEXT;
ALTER TABLE sms_inbound_events ADD COLUMN body TEXT;
ALTER TABLE sms_inbound_events ADD COLUMN unattributed INTEGER NOT NULL DEFAULT 0 CHECK(unattributed IN (0,1));
CREATE INDEX sms_inbound_review ON sms_inbound_events(unattributed,created_at,receipt_id);

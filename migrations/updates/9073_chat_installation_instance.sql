-- A removed/recreated installation must never revive an old external card even
-- when its integer configuration version and workspace ID happen to match.
ALTER TABLE slack_app_installation ADD COLUMN instance_id TEXT;
UPDATE slack_app_installation SET instance_id=lower(hex(randomblob(16))) WHERE id='installation';
-- Legacy cards have no provable installation binding. Leave them NULL so they
-- refuse rather than guessing from a reusable workspace/version pair.
ALTER TABLE slack_app_actions ADD COLUMN installation_instance TEXT;

-- Old pending consent states require a fresh installation attempt.
ALTER TABLE slack_app_oauth_states ADD COLUMN installation_instance TEXT;

ALTER TABLE slack_app_link_codes ADD COLUMN installation_instance TEXT;

-- One explicitly selected chat app; switching requires fresh provider consent.
ALTER TABLE slack_app_installation ADD COLUMN provider TEXT NOT NULL DEFAULT 'slack' CHECK(provider IN ('slack','nook','teams'));
ALTER TABLE slack_app_installation ADD COLUMN api_origin TEXT;

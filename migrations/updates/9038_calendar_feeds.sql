-- Calendar subscriptions are credentials, excluded from installation archives.
CREATE INDEX authority_calendar_feed_lookup ON authority_credentials(audience, principal_id, json_extract(scopes_json, '$[0].calendarViewId'));

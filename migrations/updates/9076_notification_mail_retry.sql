-- Retain the first confirmed safe refusal across schedules and restarts.
ALTER TABLE channel_deliveries ADD COLUMN first_failure_at INTEGER;

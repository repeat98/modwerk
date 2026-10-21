-- The sign-up invitation after a guest's firmware download replaces the sign-in prompt before building.
-- Additive counters tolerate older Workers while frontend and API deployments finish.
ALTER TABLE usage_daily ADD COLUMN download_signup_shown INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN download_signup_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_daily ADD COLUMN download_follows_claimed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_hourly ADD COLUMN download_signup_shown INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_hourly ADD COLUMN download_signup_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_hourly ADD COLUMN download_follows_claimed INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO usage_meta(key,value) VALUES('download_signup_started',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

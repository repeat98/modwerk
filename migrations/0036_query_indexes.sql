-- Indexes for queries that scanned whole tables: the hourly expiry sweeps, a reporter's own
-- issues, withdrawn like notifications and a member's own posts.
CREATE INDEX IF NOT EXISTS rate_limits_expires ON rate_limits(expires);
CREATE INDEX IF NOT EXISTS auth_sessions_expires ON auth_sessions(expiresAt);
CREATE INDEX IF NOT EXISTS auth_verifications_expires ON auth_verifications(expiresAt);
CREATE INDEX IF NOT EXISTS push_deliveries_created ON push_deliveries(created_at);
CREATE INDEX IF NOT EXISTS issues_reporter ON issues(reporter_id,created_at);
CREATE INDEX IF NOT EXISTS notifications_post ON notifications(post_id,actor_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_module ON notifications(module_id,actor_id) WHERE module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS forum_posts_user ON forum_posts(user_id);
-- Deleting a notification or a signup event cascades into push_deliveries; without these the
-- cascade scans the whole queue each time.
CREATE INDEX IF NOT EXISTS push_deliveries_notification ON push_deliveries(notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_deliveries_signup ON push_deliveries(signup_id) WHERE signup_id IS NOT NULL;

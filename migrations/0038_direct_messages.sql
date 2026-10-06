-- Direct messages between two members (owner decision of 6 October 2026, see docs/DECISIONS.md).
-- A conversation is one pair of members (pair_key orders the two IDs), each side keeps its own read
-- marker, and messages are plain text. Blocks and reports are private. Nothing here is public, and the
-- administrator can read a conversation only after one of its members has reported it.
ALTER TABLE users ADD COLUMN messages_enabled INTEGER NOT NULL DEFAULT 1 CHECK(messages_enabled IN (0,1));
CREATE TABLE conversations (
 id TEXT PRIMARY KEY,
 pair_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE conversation_members (
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id),
 last_read_at TEXT,
 PRIMARY KEY(conversation_id,user_id)
);
CREATE INDEX conversation_members_user ON conversation_members(user_id);
CREATE TABLE messages (
 id TEXT PRIMARY KEY,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX messages_conversation ON messages(conversation_id,created_at);
CREATE INDEX messages_user ON messages(user_id);
CREATE TABLE message_blocks (
 user_id TEXT NOT NULL REFERENCES users(id),
 blocked_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,blocked_id)
);
CREATE INDEX message_blocks_blocked ON message_blocks(blocked_id);
CREATE TABLE message_reports (
 id TEXT PRIMARY KEY,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL,
 resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX message_reports_conversation ON message_reports(conversation_id);
-- Activity email gets a "messages" topic, on by default like the others.
ALTER TABLE notification_preferences ADD COLUMN messages INTEGER NOT NULL DEFAULT 1 CHECK(messages IN (0,1));
-- The bell gets a 'message' kind. SQLite cannot widen a CHECK, so the table is rebuilt as in migration 0034.
-- Pending device pushes reference notifications; they are delivered every minute, so clearing them here is harmless.
DELETE FROM push_deliveries WHERE notification_id IS NOT NULL;
-- Renaming a table makes SQLite re-check every trigger, so both push triggers are dropped here and recreated below, as in 0034.
DROP TRIGGER push_signup_fanout;
DROP TRIGGER push_activity_fanout;
CREATE TABLE notifications_v4 (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL CHECK(kind IN ('reply','mention','bug_report','post_like','module_comment','module_rating','module_like','issue_comment','issue_resolved','issue_closed','issue_reopened','module_update','message')),
 actor_id TEXT REFERENCES users(id),
 thread_id TEXT REFERENCES forum_threads(id),
 post_id TEXT REFERENCES forum_posts(id),
 module_id TEXT,
 comment_id TEXT,
 issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
 github_actor TEXT,
 excerpt TEXT,
 delivery_id TEXT,
 module_version TEXT,
 message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
 seen INTEGER NOT NULL DEFAULT 0 CHECK(seen IN (0,1)),
 emailed INTEGER NOT NULL DEFAULT 0 CHECK(emailed IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO notifications_v4(id,user_id,kind,actor_id,thread_id,post_id,module_id,comment_id,issue_id,github_actor,excerpt,delivery_id,module_version,seen,emailed,created_at)
SELECT id,user_id,kind,actor_id,thread_id,post_id,module_id,comment_id,issue_id,github_actor,excerpt,delivery_id,module_version,seen,emailed,created_at FROM notifications ORDER BY rowid;
DROP TABLE notifications;
ALTER TABLE notifications_v4 RENAME TO notifications;
CREATE INDEX notifications_user ON notifications(user_id,seen,created_at);
CREATE INDEX notifications_mail ON notifications(user_id,created_at) WHERE emailed=0;
CREATE INDEX notifications_comment ON notifications(comment_id) WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_once ON notifications(user_id,kind,actor_id,COALESCE(post_id,module_id)) WHERE kind IN ('post_like','module_rating','module_like');
CREATE UNIQUE INDEX notifications_delivery ON notifications(user_id,delivery_id) WHERE delivery_id IS NOT NULL;
CREATE INDEX notifications_issue ON notifications(issue_id) WHERE issue_id IS NOT NULL;
CREATE INDEX notifications_post ON notifications(post_id,actor_id) WHERE post_id IS NOT NULL;
CREATE INDEX notifications_module ON notifications(module_id,actor_id) WHERE module_id IS NOT NULL;
CREATE INDEX notifications_message ON notifications(message_id) WHERE message_id IS NOT NULL;
-- Both triggers recreated unchanged from migration 0034.
CREATE TRIGGER push_signup_fanout AFTER INSERT ON signup_events
BEGIN
 INSERT OR IGNORE INTO push_deliveries(subscription_id,signup_id)
 SELECT s.id,NEW.user_id FROM push_subscriptions s JOIN users u ON u.id=s.user_id
 WHERE s.signups=1 AND u.is_admin=1 AND u.email_verified=1 AND u.suspended=0;
END;
CREATE TRIGGER push_activity_fanout AFTER INSERT ON notifications
BEGIN
 INSERT OR IGNORE INTO push_deliveries(subscription_id,notification_id)
 SELECT s.id,NEW.id FROM push_subscriptions s JOIN users u ON u.id=s.user_id
 WHERE s.activity=1 AND u.email_verified=1 AND u.suspended=0 AND
 (s.user_id=NEW.user_id OR EXISTS(SELECT 1 FROM auth_accounts g JOIN users d ON d.github_id=g.accountId
 WHERE g.userId=s.user_id AND g.providerId='github' AND d.id=NEW.user_id));
END;

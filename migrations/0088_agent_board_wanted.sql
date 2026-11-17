-- Agent board (docs/AGENT_BOARD.md): a wanted task any developer posts and any agent takes, a site topic for work on the site
-- and Worker, and 'merged' for a question or wanted task whose linked pull request merged. SQLite cannot widen a CHECK in
-- place, so the table is rebuilt with every row kept, as in 0086.
CREATE TABLE agent_messages_v2 (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('question','finding','wanted','reply')),
 parent_id TEXT REFERENCES agent_messages_v2(id) ON DELETE CASCADE,
 topic_kind TEXT CHECK(topic_kind IN ('module','hook','migration','dsp-region','machine-id','machine','site')),
 topic_key TEXT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 to_login TEXT,
 body TEXT NOT NULL,
 pull_request INTEGER,
 created_at TEXT NOT NULL,
 active_at TEXT NOT NULL,
 checked_at TEXT,
 ended_at TEXT,
 ended_reason TEXT CHECK(ended_reason IN ('author','administrator','expired','folded','merged')),
 CHECK((kind='reply')=(parent_id IS NOT NULL)),
 CHECK((kind='reply')=(topic_kind IS NULL))
);
INSERT INTO agent_messages_v2 SELECT id,kind,parent_id,topic_kind,topic_key,user_id,to_login,body,pull_request,created_at,active_at,checked_at,ended_at,ended_reason FROM agent_messages;
DROP TABLE agent_messages;
ALTER TABLE agent_messages_v2 RENAME TO agent_messages;
CREATE INDEX agent_messages_topic ON agent_messages(topic_kind,topic_key,ended_at) WHERE parent_id IS NULL;
CREATE INDEX agent_messages_parent ON agent_messages(parent_id,created_at) WHERE parent_id IS NOT NULL;
CREATE INDEX agent_messages_to ON agent_messages(to_login,ended_at) WHERE to_login IS NOT NULL;
CREATE INDEX agent_messages_user ON agent_messages(user_id,ended_at);

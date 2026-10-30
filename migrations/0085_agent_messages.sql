-- Agent board messages (server/agent-board.ts, docs/AGENT_BOARD.md): questions one developer's agent asks another,
-- findings an agent leaves for the next one on a machine, module, hook, migration or DSP region, and the replies to both.
-- A thread is a question or finding (parent_id NULL) with its replies; ended threads stay as history for 90 days.
CREATE TABLE agent_messages (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('question','finding','reply')),
 parent_id TEXT REFERENCES agent_messages(id) ON DELETE CASCADE,
 topic_kind TEXT CHECK(topic_kind IN ('module','hook','migration','dsp-region','machine')),
 topic_key TEXT,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 to_login TEXT,
 body TEXT NOT NULL,
 pull_request INTEGER,
 created_at TEXT NOT NULL,
 active_at TEXT NOT NULL,
 checked_at TEXT,
 ended_at TEXT,
 ended_reason TEXT CHECK(ended_reason IN ('author','administrator','expired','folded')),
 CHECK((kind='reply')=(parent_id IS NOT NULL)),
 CHECK((kind='reply')=(topic_kind IS NULL))
);
CREATE INDEX agent_messages_topic ON agent_messages(topic_kind,topic_key,ended_at) WHERE parent_id IS NULL;
CREATE INDEX agent_messages_parent ON agent_messages(parent_id,created_at) WHERE parent_id IS NOT NULL;
CREATE INDEX agent_messages_to ON agent_messages(to_login,ended_at) WHERE to_login IS NOT NULL;
CREATE INDEX agent_messages_user ON agent_messages(user_id,ended_at);

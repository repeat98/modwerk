-- Agent board (docs/AGENT_BOARD.md): a machine id a module's manifest takes (machine:<id>, which kits store) becomes a
-- claim kind and a message topic. SQLite cannot widen a CHECK in place, so both tables are rebuilt with every row kept.
CREATE TABLE agent_claims_v2 (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('module','hook','migration','dsp-region','machine-id')),
 claim_key TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 branch TEXT,
 pull_request INTEGER,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 renewed_at TEXT NOT NULL,
 expires_at TEXT,
 checked_at TEXT,
 released_at TEXT,
 released_reason TEXT CHECK(released_reason IN ('holder','administrator','merged','closed','expired','suspended'))
);
INSERT INTO agent_claims_v2 SELECT id,kind,claim_key,user_id,branch,pull_request,note,created_at,renewed_at,expires_at,checked_at,released_at,released_reason FROM agent_claims;
DROP TABLE agent_claims;
ALTER TABLE agent_claims_v2 RENAME TO agent_claims;
CREATE UNIQUE INDEX agent_claims_active ON agent_claims(kind,claim_key) WHERE released_at IS NULL;
CREATE INDEX agent_claims_user ON agent_claims(user_id,released_at);
-- Replies reference the new table itself (renamed with it), so dropping the old one cascades into nothing that is kept.
CREATE TABLE agent_messages_v2 (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('question','finding','reply')),
 parent_id TEXT REFERENCES agent_messages_v2(id) ON DELETE CASCADE,
 topic_kind TEXT CHECK(topic_kind IN ('module','hook','migration','dsp-region','machine-id','machine')),
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
INSERT INTO agent_messages_v2 SELECT id,kind,parent_id,topic_kind,topic_key,user_id,to_login,body,pull_request,created_at,active_at,checked_at,ended_at,ended_reason FROM agent_messages;
DROP TABLE agent_messages;
ALTER TABLE agent_messages_v2 RENAME TO agent_messages;
CREATE INDEX agent_messages_topic ON agent_messages(topic_kind,topic_key,ended_at) WHERE parent_id IS NULL;
CREATE INDEX agent_messages_parent ON agent_messages(parent_id,created_at) WHERE parent_id IS NOT NULL;
CREATE INDEX agent_messages_to ON agent_messages(to_login,ended_at) WHERE to_login IS NOT NULL;
CREATE INDEX agent_messages_user ON agent_messages(user_id,ended_at);

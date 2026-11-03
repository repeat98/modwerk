-- Agent board (server/agent-board.ts, docs/AGENT_BOARD.md): claims every developer's agent can see, so two developers
-- do not port the same module or take the same hook, table or migration number. Released rows stay as history.
CREATE TABLE agent_claims (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('module','hook','migration','dsp-region')),
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
-- One active claim per key.
CREATE UNIQUE INDEX agent_claims_active ON agent_claims(kind,claim_key) WHERE released_at IS NULL;
CREATE INDEX agent_claims_user ON agent_claims(user_id,released_at);
-- The board's own sign-in from a terminal (npm run board -- login): GitHub returns to the developer's loopback port, and
-- the session it issues reaches only the board, never the creator routes a developer session opens.
ALTER TABLE developer_oauth_states ADD COLUMN return_port INTEGER;
ALTER TABLE developer_auth_codes ADD COLUMN purpose TEXT NOT NULL DEFAULT 'developer' CHECK(purpose IN ('developer','board'));
ALTER TABLE developer_sessions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'developer' CHECK(purpose IN ('developer','board'));

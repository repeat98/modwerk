-- Agent sessions a developer chose to share with the owner (docs/AGENT_SESSIONS.md): the conversation of one
-- coding-agent session, scrubbed on the developer's computer and checked again by the Worker, gzip and base64 in `data`.
-- Readable by the developer who shared it and by administrators; deleted after 90 days, by the developer, on
-- suspension and with the account.
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  branch TEXT,
  note TEXT NOT NULL DEFAULT '',
  entries INTEGER NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  consent_version TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX agent_sessions_user ON agent_sessions(user_id, created_at);
CREATE INDEX agent_sessions_created ON agent_sessions(created_at);

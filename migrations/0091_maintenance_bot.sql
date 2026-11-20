-- The maintenance bot (docs/MAINTENANCE_BOT.md). Each row is one action the bot proposed for GitHub. The tier, set by
-- the trusted policy script and never by the model, decides what happens: `notify` runs at once and is reported,
-- `window` runs at `due_at` unless the owner stops it in Telegram, and `ask` runs only after the owner approves.
CREATE TABLE maintenance_bot_actions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  target INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('notify','window','ask')),
  summary TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','running','vetoed','done','failed','expired')),
  due_at INTEGER NOT NULL,
  telegram_message_id INTEGER,
  decided_at INTEGER,
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX maintenance_bot_actions_status ON maintenance_bot_actions(status, due_at);
CREATE INDEX maintenance_bot_actions_updated ON maintenance_bot_actions(updated_at);
-- `paused` (the owner's /pause in Telegram) and `fingerprint` (open PRs and issues at the last model run).
CREATE TABLE maintenance_bot_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

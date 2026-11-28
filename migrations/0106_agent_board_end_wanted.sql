-- The agent board has no wanted tasks any more: shared jobs are GitHub issues (docs/AGENT_BOARD.md). End the live ones;
-- the kind, priority and parent columns stay so the table is not rebuilt.
UPDATE agent_messages SET ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),ended_reason='administrator'
  WHERE kind='wanted' AND parent_id IS NULL AND ended_at IS NULL;

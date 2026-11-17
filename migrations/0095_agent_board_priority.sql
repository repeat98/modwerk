-- Agent board (docs/AGENT_BOARD.md): a wanted task's priority, set by its author and changed by its author or an administrator.
-- Tasks posted before it read as normal.
ALTER TABLE agent_messages ADD COLUMN priority TEXT CHECK(priority IN ('high','normal','low'));

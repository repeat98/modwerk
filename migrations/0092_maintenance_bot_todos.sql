-- The maintenance bot's to-do list for the owner (docs/MAINTENANCE_BOT.md): work only a session at the owner's
-- computer can do, each with the /modwerk-* command that does it. The bot adds them; /modwerk-todo reads and ticks
-- them off. `id` is derived from the item and the command, so the bot proposing the same work again changes nothing.
CREATE TABLE maintenance_bot_todos (
  id TEXT PRIMARY KEY,
  target INTEGER NOT NULL,
  command TEXT NOT NULL,
  note TEXT NOT NULL,
  urgent INTEGER NOT NULL DEFAULT 0 CHECK(urgent IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','dropped')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX maintenance_bot_todos_open ON maintenance_bot_todos(status, urgent, created_at);

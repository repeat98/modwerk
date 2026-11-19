-- Preserve the old read boundary and track later reads by the message that ended the page.
ALTER TABLE conversation_members ADD COLUMN last_read_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL;
UPDATE conversation_members SET last_read_message_id=(
  SELECT m.id FROM messages m WHERE m.conversation_id=conversation_members.conversation_id
    AND m.created_at<=conversation_members.last_read_at ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1
) WHERE last_read_at IS NOT NULL;

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function normalizeMessage(message, guildId, previous = {}) {
  const result = { ...previous, id: message.id, guildId, channelId: message.channel_id || previous.channelId }
  if ('author' in message) result.author = {
    id: message.author.id,
    username: message.author.username,
    displayName: message.member?.nick || message.author.global_name || message.author.username,
    bot: Boolean(message.author.bot),
  }
  if ('content' in message) result.content = message.content
  if ('timestamp' in message) result.createdAt = message.timestamp
  if ('edited_timestamp' in message) result.editedAt = message.edited_timestamp
  if ('message_reference' in message) result.replyTo = message.message_reference?.message_id || null
  if ('attachments' in message) result.attachments = message.attachments.map(item => ({
    id: item.id, name: item.filename, url: item.url, contentType: item.content_type, size: item.size,
  }))
  if ('embeds' in message) result.embeds = message.embeds
  result.deleted = false
  result.url = `https://discord.com/channels/${guildId}/${result.channelId}/${result.id}`
  return result
}

export function openStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(join(directory, 'messages.sqlite'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL, kind TEXT NOT NULL, received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_guild ON events(guild_id, seq);
  `)
  const lookup = db.prepare('SELECT data FROM messages WHERE id = ?')
  const upsert = db.prepare(`INSERT INTO messages VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
  const event = db.prepare('INSERT INTO events(guild_id, message_id, kind, received_at) VALUES (?, ?, ?, ?)')

  function write(id, kind, build) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const old = lookup.get(id)
      const message = build(old ? JSON.parse(old.data) : {})
      const data = JSON.stringify(message)
      if (old?.data !== data) {
        upsert.run(message.id, message.guildId, message.channelId, data)
        event.run(message.guildId, message.id, kind, new Date().toISOString())
      }
      db.exec('COMMIT')
      return message
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  return {
    put(message, guildId, kind = 'message') {
      return write(message.id, kind, previous => {
        if (kind === 'history' && (previous.deleted || (previous.editedAt &&
          (!message.edited_timestamp || Date.parse(message.edited_timestamp) < Date.parse(previous.editedAt))))) return previous
        return normalizeMessage(message, guildId, previous)
      })
    },
    remove(id, guildId, channelId) {
      // Tombstones replace content, including for earlier inbox events referencing this message.
      return write(id, 'delete', () => ({ id, guildId, channelId, deleted: true }))
    },
    search(guildId, { query, channelId, before, limit = 50 }) {
      const conditions = ["guild_id = ?", "json_extract(data, '$.deleted') = 0",
        "instr(lower(coalesce(json_extract(data, '$.content'), '')), lower(?)) > 0"]
      const args = [guildId, query]
      if (channelId) { conditions.push('channel_id = ?'); args.push(channelId) }
      if (before) {
        conditions.push('(length(id) < length(?) OR (length(id) = length(?) AND id < ?))')
        args.push(before, before, before)
      }
      const rows = db.prepare(`SELECT data FROM messages WHERE ${conditions.join(' AND ')}
        ORDER BY length(id) DESC, id DESC LIMIT ?`).all(...args, limit).reverse()
      const messages = rows.map(row => JSON.parse(row.data))
      return { messages, nextBefore: messages[0]?.id || null }
    },
    inbox(guildId, { after, channelId, limit = 50 } = {}) {
      const conditions = ['e.guild_id = ?']
      const args = [guildId]
      if (after !== undefined) {
        conditions.push('e.seq > ?')
        args.push(after)
      }
      if (channelId) {
        conditions.push('m.channel_id = ?')
        args.push(channelId)
      }
      const direction = after === undefined ? 'DESC' : 'ASC'
      const rows = db.prepare(`SELECT e.seq, e.kind, e.received_at, m.data
        FROM events e JOIN messages m ON e.message_id = m.id
        WHERE ${conditions.join(' AND ')} ORDER BY e.seq ${direction} LIMIT ?`).all(...args, limit)
      if (after === undefined) rows.reverse()
      return {
        events: rows.map(row => ({ cursor: row.seq, kind: row.kind, receivedAt: row.received_at, message: JSON.parse(row.data) })),
        nextCursor: rows.at(-1)?.seq ?? after ?? 0,
      }
    },
    close() { db.close() },
  }
}

export function recordDispatch(store, packet, guildId) {
  const message = packet.d
  if (message?.guild_id !== guildId) return
  switch (packet.t) {
    case 'MESSAGE_CREATE': store.put(message, guildId, 'create'); break
    case 'MESSAGE_UPDATE': store.put(message, guildId, 'update'); break
    case 'MESSAGE_DELETE': store.remove(message.id, guildId, message.channel_id); break
    case 'MESSAGE_DELETE_BULK':
      for (const id of message.ids) store.remove(id, guildId, message.channel_id)
      break
  }
}

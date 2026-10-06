import type { Database, User } from './platform'
import { needMember, throttle } from './auth'
import { HttpError, jsonBody, required, response } from './security'
import { SYSTEM_AUTHOR } from './module-threads'
import { notifyMessage } from './notifications'
import { MESSAGE_MAX_LENGTH } from '../src/community/forum-contract'

const PAGE = 100
type Other = { id: string; username: string; display_name: string; avatar: string | null; messages_enabled: number }
type Row = { id: string; user_id: string; body: string; hidden: number; created_at: string }
const pairKey = (a: string, b: string) => [a, b].sort().join(':')
// Only verified, active members with a finished sign-up can be messaged; the official account cannot.
const ACTIVE = "u.email_verified=1 AND u.suspended=0 AND u.username IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=u.id)"

/** One member's view of their conversation with another: who it is, whether either side blocks the other, and whether sending is possible. */
async function conversationWith(db: Database, me: User, username: string) {
  const other = await db.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_id AS avatar,u.messages_enabled FROM users u WHERE u.username=? COLLATE NOCASE AND ${ACTIVE}`).bind(username).first<Other>()
  if (!other || other.id === me.id || other.id === SYSTEM_AUTHOR) throw new HttpError(404, 'Member not found.')
  const conversation = await db.prepare('SELECT id FROM conversations WHERE pair_key=?').bind(pairKey(me.id, other.id)).first<{id: string}>()
  const blocks = (await db.prepare('SELECT user_id FROM message_blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)').bind(me.id, other.id, other.id, me.id).all<{user_id: string}>()).results
  const blocked = blocks.some(block => block.user_id === me.id), blockedBy = blocks.some(block => block.user_id === other.id)
  // Being blocked looks the same as the other member turning messages off; neither is announced.
  return { other, conversationId: conversation?.id ?? null, blocked, canSend: !blocked && !blockedBy && !!other.messages_enabled }
}

/** Direct messages: an inbox, one conversation per pair of members, blocking, private reports and the member's own on/off switch. */
export async function messageRoutes(request: Request, db: Database, user: User | null): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (!path.startsWith('/api/forum/messages')) return null
  const me = needMember(user)
  if (path === '/api/forum/messages/settings') {
    if (request.method !== 'PATCH') throw new HttpError(405, 'Choose a supported action.')
    const body = await jsonBody(request)
    if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'Choose on or off.')
    await db.prepare('UPDATE users SET messages_enabled=? WHERE id=?').bind(Number(body.enabled), me.id).run()
    return response({ enabled: body.enabled })
  }
  if (path === '/api/forum/messages' && request.method === 'GET') {
    // A conversation whose other member deleted their account disappears with their messages.
    const rows = (await db.prepare(`SELECT c.id,c.updated_at,u.username,u.display_name AS displayName,u.avatar_id AS avatar,
      (SELECT substr(m.body,1,160) FROM messages m WHERE m.conversation_id=c.id AND m.hidden=0 ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS excerpt,
      (SELECT m.user_id=? FROM messages m WHERE m.conversation_id=c.id AND m.hidden=0 ORDER BY m.created_at DESC,m.rowid DESC LIMIT 1) AS mine,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.hidden=0 AND m.user_id<>? AND (me.last_read_at IS NULL OR m.created_at>me.last_read_at)) AS unread
      FROM conversation_members me JOIN conversations c ON c.id=me.conversation_id
      JOIN conversation_members them ON them.conversation_id=c.id AND them.user_id<>me.user_id JOIN users u ON u.id=them.user_id
      WHERE me.user_id=? AND u.username IS NOT NULL ORDER BY c.updated_at DESC LIMIT 100`).bind(me.id, me.id, me.id).all()).results
    const settings = await db.prepare('SELECT messages_enabled FROM users WHERE id=?').bind(me.id).first<{messages_enabled: number}>()
    return response({ conversations: rows, enabled: !!settings?.messages_enabled })
  }
  const match = path.match(/^\/api\/forum\/messages\/([a-z0-9_]{3,24})(?:\/(block|report))?$/i)
  if (!match) throw new HttpError(404, 'Not found.')
  const action = match[2], view = await conversationWith(db, me, match[1])
  if (!action && request.method === 'GET') {
    const messages = view.conversationId ? (await db.prepare('SELECT id,user_id,body,hidden,created_at FROM messages WHERE conversation_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?').bind(view.conversationId, PAGE).all<Row>()).results.reverse() : []
    // Opening the conversation reads it: the unread count and the bell entries for it clear together.
    if (view.conversationId) await db.batch([
      db.prepare('UPDATE conversation_members SET last_read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND user_id=?').bind(view.conversationId, me.id),
      db.prepare("UPDATE notifications SET seen=1 WHERE user_id=? AND kind='message' AND seen=0 AND message_id IN (SELECT id FROM messages WHERE conversation_id=?)").bind(me.id, view.conversationId),
    ])
    return response({ member: { username: view.other.username, displayName: view.other.display_name, avatar: view.other.avatar }, messages: messages.map(item => ({ id: item.id, mine: item.user_id === me.id, body: item.hidden ? '' : item.body, hidden: !!item.hidden, created_at: item.created_at })), blocked: view.blocked, canSend: view.canSend, hasMore: messages.length === PAGE })
  }
  if (request.method !== 'POST') throw new HttpError(405, 'Choose a supported action.')
  await throttle(db, 'messages:' + me.id, 60)
  const body = await jsonBody(request)
  if (action === 'block') {
    if (typeof body.blocked !== 'boolean') throw new HttpError(400, 'Choose on or off.')
    if (body.blocked) await db.prepare('INSERT OR IGNORE INTO message_blocks(user_id,blocked_id) VALUES(?,?)').bind(me.id, view.other.id).run()
    else await db.prepare('DELETE FROM message_blocks WHERE user_id=? AND blocked_id=?').bind(me.id, view.other.id).run()
    return response({ blocked: body.blocked })
  }
  if (action === 'report') {
    if (!view.conversationId) throw new HttpError(400, 'There is no conversation to report yet.')
    await db.prepare('INSERT INTO message_reports(id,conversation_id,user_id,reason) VALUES(?,?,?,?)').bind(crypto.randomUUID(), view.conversationId, me.id, required(body.reason, 'Reason', 1000)).run()
    return response({ ok: true }, 201)
  }
  if (!view.canSend) throw new HttpError(403, view.blocked ? 'Unblock this member to message them.' : 'This member is not accepting messages.')
  const text = required(body.body, 'Message', MESSAGE_MAX_LENGTH)
  let conversationId = view.conversationId
  const statements = []
  if (!conversationId) {
    await throttle(db, 'conversations:' + me.id, 10, 86400)
    conversationId = crypto.randomUUID()
    statements.push(
      db.prepare('INSERT INTO conversations(id,pair_key) VALUES(?,?)').bind(conversationId, pairKey(me.id, view.other.id)),
      db.prepare('INSERT INTO conversation_members(conversation_id,user_id) VALUES(?,?),(?,?)').bind(conversationId, me.id, conversationId, view.other.id),
    )
  }
  const id = crypto.randomUUID()
  statements.push(
    db.prepare('INSERT INTO messages(id,conversation_id,user_id,body) VALUES(?,?,?,?)').bind(id, conversationId, me.id, text),
    db.prepare('UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(conversationId),
    db.prepare('UPDATE conversation_members SET last_read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND user_id=?').bind(conversationId, me.id),
    notifyMessage(db, id, conversationId, me.id, view.other.id),
  )
  await db.batch(statements)
  return response({ id }, 201)
}

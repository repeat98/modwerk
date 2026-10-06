import { MENTION_SOURCE } from '../src/community/forum-contract'
import type { Database, Env, Statement, User } from './platform'
import { needMember, throttle } from './auth'
import { HttpError, jsonBody, response } from './security'
import { communityModule } from '../src/community/modules'
import { moduleDevelopers } from './bug-reports'
import { SYSTEM_AUTHOR } from './module-threads'
import { emailReady } from './email'
import { ANNOUNCEMENT_PREFIX, announcementItems, announcementUnread, markAnnouncementsRead } from './announcements'
import type { NotificationItem, NotificationPreferences } from '../src/community/notification-contract'

const newId = 'lower(hex(randomblob(16)))'

/** A member also receives what is addressed to the GitHub developer identity matching their GitHub sign-in.
 * Both sides were proven through GitHub OAuth, so the link needs no typed handle. Binds the member ID twice. */
export const RECIPIENTS = "SELECT ? UNION SELECT d.id FROM users d JOIN auth_accounts g ON g.providerId='github' AND g.accountId=d.github_id WHERE g.userId=? AND d.github_id IS NOT NULL"

/** Members whose usernames appear as @name, capped so one post cannot page the whole forum. */
export function mentionedUsernames(body: string) {
  const names = new Set<string>()
  for (const match of body.matchAll(new RegExp(MENTION_SOURCE, 'g'))) {
    names.add(match[1].toLowerCase())
    if (names.size === 10) break
  }
  return [...names]
}

/** Mentions are created before replies so a follower who is also mentioned gets one notification. */
export function notifyMentions(db: Database, body: string, threadId: string, postId: string, authorId: string): Statement[] {
  const names = mentionedUsernames(body)
  if (!names.length) return []
  return [db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,thread_id,post_id,module_id) SELECT ${newId},u.id,'mention',?,t.id,?,t.module_id FROM users u JOIN forum_threads t ON t.id=? WHERE lower(u.username) IN (${names.map(() => '?').join(',')}) AND u.email_verified=1 AND u.suspended=0 AND u.id<>? AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=u.id) AND EXISTS(SELECT 1 FROM forum_posts WHERE id=?)`).bind(authorId, postId, threadId, ...names, authorId, postId)]
}

export function notifyReplies(db: Database, threadId: string, postId: string, authorId: string) {
  return db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,thread_id,post_id,module_id) SELECT ${newId},f.user_id,'reply',?,t.id,?,t.module_id FROM forum_follows f JOIN users u ON u.id=f.user_id JOIN forum_threads t ON t.id=f.thread_id WHERE f.thread_id=? AND f.user_id<>? AND u.suspended=0 AND NOT EXISTS(SELECT 1 FROM auth_accounts g WHERE g.userId=? AND g.providerId='github' AND g.accountId=u.github_id) AND EXISTS(SELECT 1 FROM forum_posts WHERE id=?) AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.post_id=? AND n.user_id=f.user_id)`).bind(authorId, postId, threadId, authorId, authorId, postId, postId)
}

export function notifyPostLike(db: Database, postId: string, actorId: string, liked: boolean) {
  // Unliking withdraws a notification nobody has seen or been emailed yet, so quick toggles stay silent.
  if (!liked) return db.prepare("DELETE FROM notifications WHERE kind='post_like' AND post_id=? AND actor_id=? AND seen=0 AND emailed=0").bind(postId, actorId)
  return db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,thread_id,post_id,module_id) SELECT ${newId},p.user_id,'post_like',?,p.thread_id,p.id,t.module_id FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.user_id<>? AND u.suspended=0 AND u.username IS NOT NULL ON CONFLICT DO NOTHING`).bind(actorId, postId, actorId)
}

/** Comments, ratings and likes on a catalog module reach its current, claimed maintainers. */
export function notifyModuleMaintainers(db: Database, moduleId: string, kind: 'module_comment' | 'module_rating' | 'module_like', actorId: string, commentId: string | null = null): Statement[] {
  const module = communityModule(moduleId)
  if (!module) return []
  const { recipients, values } = moduleDevelopers(module, actorId)
  return [db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,module_id,comment_id) SELECT ${newId},user_id,?,?,?,? FROM (${recipients}) WHERE 1 ON CONFLICT DO NOTHING`).bind(kind, actorId, module.id, commentId, ...values)]
}
/** One bell entry per conversation until the recipient reads it: further messages while the first is unread stay quiet. */
export function notifyMessage(db: Database, messageId: string, conversationId: string, senderId: string, recipientId: string) {
  return db.prepare(`INSERT INTO notifications(id,user_id,kind,actor_id,message_id) SELECT ${newId},?,'message',?,? WHERE NOT EXISTS(SELECT 1 FROM notifications n JOIN messages m ON m.id=n.message_id WHERE n.user_id=? AND n.kind='message' AND n.seen=0 AND m.conversation_id=?)`).bind(recipientId, senderId, messageId, recipientId, conversationId)
}
export function withdrawModuleLike(db: Database, moduleId: string, actorId: string) {
  return db.prepare("DELETE FROM notifications WHERE kind='module_like' AND module_id=? AND actor_id=? AND seen=0 AND emailed=0").bind(moduleId, actorId)
}

/** Notifications whose content was hidden or removed, or whose actor was suspended, are not shown or mailed. */
export const VISIBLE = "(n.thread_id IS NULL OR t.hidden=0) AND (n.post_id IS NULL OR p.hidden=0) AND (n.kind<>'module_comment' OR c.id IS NOT NULL) AND (a.id IS NULL OR a.suspended=0 OR a.username IS NULL) AND (n.kind<>'message' OR (dm.id IS NOT NULL AND dm.hidden=0))"
export const ITEM_SQL = `SELECT n.id,n.kind,n.seen,n.created_at,n.thread_id,n.post_id,n.module_id,n.module_version,a.username AS actor,a.avatar_id AS actor_avatar,a.id='${SYSTEM_AUTHOR}' AS actor_official,COALESCE(t.title,i.title,m.name) AS title,
 CASE WHEN n.kind IN ('reply','mention','bug_report') THEN substr(p.body,1,200) WHEN n.kind='module_comment' THEN substr(c.body,1,200) WHEN n.kind='issue_comment' THEN substr(n.excerpt,1,200) WHEN n.kind='message' THEN substr(dm.body,1,200) END AS excerpt,
 CASE WHEN n.kind='module_rating' THEN r.value END AS rating,n.issue_id,n.github_actor,COALESCE(i.github_url,m.href) AS url,
 (SELECT CAST(COUNT(*)/30 AS INTEGER) FROM forum_posts preceding WHERE preceding.thread_id=p.thread_id AND (preceding.created_at<p.created_at OR (preceding.created_at=p.created_at AND preceding.rowid<p.rowid))) AS post_page
 FROM notifications n LEFT JOIN users a ON a.id=n.actor_id LEFT JOIN forum_threads t ON t.id=n.thread_id LEFT JOIN forum_posts p ON p.id=n.post_id
 LEFT JOIN comments c ON c.id=n.comment_id LEFT JOIN ratings r ON n.kind='module_rating' AND r.module_id=n.module_id AND r.user_id=n.actor_id
 LEFT JOIN issues i ON i.id=n.issue_id LEFT JOIN module_releases m ON n.kind='module_update' AND m.module_id=n.module_id AND m.version=n.module_version LEFT JOIN messages dm ON dm.id=n.message_id`
type Row = Omit<NotificationItem, 'seen' | 'actorOfficial' | 'actorAvatar'> & { seen: number; actor_official: number | null; actor_avatar?: string | null }
export const toItem = ({ actor_official, actor_avatar, seen, ...row }: Row): NotificationItem => ({ ...row, seen: !!seen, actorOfficial: !!actor_official, actorAvatar: actor_avatar ?? null })

export const PREFERENCE_DEFAULTS = { emailEnabled: true, frequency: 'hours', replies: true, likes: true, modules: true, bugs: true, updates: true, messages: true } as const
type PreferenceRow = { email_enabled: number; frequency: 'hours' | 'daily'; replies: number; likes: number; modules: number; bugs: number; updates: number; messages: number }
export function preferencesFrom(row: PreferenceRow | null): Omit<NotificationPreferences, 'emailAvailable'> {
  if (!row) return { ...PREFERENCE_DEFAULTS }
  return { emailEnabled: !!row.email_enabled, frequency: row.frequency, replies: !!row.replies, likes: !!row.likes, modules: !!row.modules, bugs: !!row.bugs, updates: !!row.updates, messages: !!row.messages }
}

async function unsubscribeMac(secret: string, userId: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('modwerk-activity-unsubscribe-v1:' + userId))), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** A long-lived, single-purpose link: it can only turn activity email off. Rotating AUTH_SECRET invalidates it. */
export async function unsubscribeToken(secret: string, userId: string) { return userId + '.' + await unsubscribeMac(secret, userId) }
async function unsubscribeUser(secret: string, value: unknown) {
  if (typeof value !== 'string' || value.length > 200) return null
  const split = value.lastIndexOf('.'), userId = value.slice(0, split), mac = value.slice(split + 1)
  if (split < 1 || !/^[a-f0-9]{64}$/.test(mac)) return null
  const expected = await unsubscribeMac(secret, userId)
  let difference = 0
  for (let index = 0; index < 64; index++) difference |= expected.charCodeAt(index) ^ mac.charCodeAt(index)
  return difference ? null : userId
}
export async function savePreferences(db: Database, userId: string, values: Partial<Omit<NotificationPreferences, 'emailAvailable'>>) {
  const current = preferencesFrom(await db.prepare('SELECT * FROM notification_preferences WHERE user_id=?').bind(userId).first<PreferenceRow>()), next = { ...current, ...values }
  await db.prepare('INSERT INTO notification_preferences(user_id,email_enabled,frequency,replies,likes,modules,bugs,updates,messages,changed_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email_enabled=excluded.email_enabled,frequency=excluded.frequency,replies=excluded.replies,likes=excluded.likes,modules=excluded.modules,bugs=excluded.bugs,updates=excluded.updates,messages=excluded.messages,changed_at=excluded.changed_at')
    .bind(userId, Number(next.emailEnabled), next.frequency, Number(next.replies), Number(next.likes), Number(next.modules), Number(next.bugs), Number(next.updates), Number(next.messages)).run()
  return next
}

/** One-click unsubscribe (RFC 8058): mail clients post here without an Origin or session; the signed token authorizes it. */
export async function unsubscribe(request: Request, env: Env, db: Database) {
  if (!env.AUTH_SECRET) throw new HttpError(503, 'Email settings are not available yet.')
  await throttle(db, 'unsubscribe-ip:' + (request.headers.get('CF-Connecting-IP') ?? 'local'), 30)
  const query = new URL(request.url).searchParams.get('token')
  const token = query ?? (request.headers.get('Content-Type')?.includes('application/json') ? (await jsonBody(request)).token : null)
  const userId = await unsubscribeUser(env.AUTH_SECRET, token)
  if (!userId) throw new HttpError(400, 'This unsubscribe link is not valid. Change email settings in your account instead.')
  // A deleted account has nothing left to unsubscribe and must not regain a stored preference.
  if (await db.prepare('SELECT id FROM auth_users WHERE id=?').bind(userId).first()) await savePreferences(db, userId, { emailEnabled: false })
  return response({ ok: true })
}

export async function notificationRoutes(request: Request, env: Env, db: Database, user: User | null): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (!path.startsWith('/api/notifications')) return null
  const member = needMember(user)
  if (path === '/api/notifications/unread' && request.method === 'GET') {
    const row = await db.prepare(`SELECT COUNT(*) AS unread FROM (${ITEM_SQL} WHERE n.user_id IN (${RECIPIENTS}) AND n.seen=0 AND ${VISIBLE})`).bind(member.id, member.id).first<{ unread: number }>()
    return response({ unread: (row?.unread ?? 0) + await announcementUnread(db, member.id) })
  }
  if (path === '/api/notifications' && request.method === 'GET') {
    const rows = (await db.prepare(`${ITEM_SQL} WHERE n.user_id IN (${RECIPIENTS}) AND ${VISIBLE} ORDER BY n.created_at DESC,n.rowid DESC LIMIT 50`).bind(member.id, member.id).all<Row>()).results
    // Announcements are not mailed and not addressed to anyone in particular; they join the newest entries.
    const items = [...rows.map(toItem), ...await announcementItems(db, member.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50)
    return response({ items, unread: rows.filter(row => !row.seen).length + await announcementUnread(db, member.id) })
  }
  if (path === '/api/notifications' && request.method === 'PATCH') {
    const body = await jsonBody(request)
    if (body.ids === undefined) {
      await db.prepare(`UPDATE notifications SET seen=1 WHERE seen=0 AND user_id IN (${RECIPIENTS})`).bind(member.id, member.id).run()
      await markAnnouncementsRead(db, member.id, null)
    } else {
      if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 50 || body.ids.some(id => typeof id !== 'string' || id.length > 64)) throw new HttpError(400, 'Choose up to 50 notifications.')
      const ids = body.ids as string[], announced = ids.filter(id => id.startsWith(ANNOUNCEMENT_PREFIX)), activity = ids.filter(id => !id.startsWith(ANNOUNCEMENT_PREFIX))
      if (activity.length) await db.prepare(`UPDATE notifications SET seen=1 WHERE id IN (${activity.map(() => '?').join(',')}) AND user_id IN (${RECIPIENTS})`).bind(...activity, member.id, member.id).run()
      await markAnnouncementsRead(db, member.id, announced)
    }
    return response({ ok: true })
  }
  if (path === '/api/notifications/preferences') {
    if (request.method === 'PATCH') {
      const body = await jsonBody(request), values: Partial<Omit<NotificationPreferences, 'emailAvailable'>> = {}
      for (const key of ['emailEnabled', 'replies', 'likes', 'modules', 'bugs', 'updates', 'messages'] as const) {
        if (body[key] === undefined) continue
        if (typeof body[key] !== 'boolean') throw new HttpError(400, 'Choose on or off for each email setting.')
        values[key] = body[key]
      }
      if (body.frequency !== undefined) {
        if (body.frequency !== 'hours' && body.frequency !== 'daily') throw new HttpError(400, 'Choose how often to receive activity email.')
        values.frequency = body.frequency
      }
      await throttle(db, 'notification-preferences:' + member.id, 60)
      return response({ ...await savePreferences(db, member.id, values), emailAvailable: emailReady(env) } satisfies NotificationPreferences)
    }
    if (request.method === 'GET') return response({ ...preferencesFrom(await db.prepare('SELECT * FROM notification_preferences WHERE user_id=?').bind(member.id).first<PreferenceRow>()), emailAvailable: emailReady(env) } satisfies NotificationPreferences)
  }
  throw new HttpError(404, 'Notification route not found.')
}

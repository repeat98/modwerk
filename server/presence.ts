import type { Database } from './platform'

/** A member counts as online while their last poll is this recent. The bell polls every 60 s while the tab is visible. */
export const ONLINE_SECONDS = 300
/** Presence is rewritten at most this often, so a minute's poll usually writes nothing. */
const WRITE_SECONDS = 120
const DAY_SECONDS = 86400

/** Called from the bell's unread poll. The first sighting of a member on a UTC day adds one to that day's
 * aggregate count; the presence row keeps only the latest time and is overwritten, never appended. */
export async function notePresence(db: Database, userId: string, now = Date.now()) {
  const seconds = Math.floor(now / 1000), dayStart = seconds - seconds % DAY_SECONDS
  const day = new Date(dayStart * 1000).toISOString().slice(0, 10)
  // One batch is one transaction, so two concurrent polls cannot both count the same member as new today.
  await db.batch([
    db.prepare('INSERT INTO member_activity_daily(day,members) SELECT ?,1 WHERE NOT EXISTS(SELECT 1 FROM member_presence WHERE user_id=? AND seen_at>=?) ON CONFLICT(day) DO UPDATE SET members=members+1').bind(day, userId, dayStart),
    db.prepare('INSERT INTO member_presence(user_id,seen_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at WHERE member_presence.seen_at<=excluded.seen_at-? OR member_presence.seen_at<?').bind(userId, seconds, WRITE_SECONDS, dayStart),
  ])
}

/** At most this many names are listed; the rest stay in the count. */
export const ONLINE_LIST = 12
/** Public: the number of members online, and the names of those who show themselves in the online list (an account
 * setting, on by default). Members who opted out stay in the count. Suspended members drop out at once; accounts that
 * have not finished signing up (unverified, or a social sign-up still choosing its name) are never counted or named. */
export async function membersOnline(db: Database, now = Date.now()) {
  const since = Math.floor(now / 1000) - ONLINE_SECONDS
  const [row, listed] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS online FROM member_presence p JOIN users u ON u.id=p.user_id WHERE p.seen_at>=? AND u.suspended=0 AND u.email_verified=1 AND u.username IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=u.id)').bind(since).first<{ online: number }>(),
    db.prepare('SELECT u.username,u.avatar_id AS avatar FROM member_presence p JOIN users u ON u.id=p.user_id WHERE p.seen_at>=? AND u.suspended=0 AND u.email_verified=1 AND u.username IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=u.id) AND u.show_online=1 ORDER BY p.seen_at DESC,u.username LIMIT ?').bind(since, ONLINE_LIST).all<{ username: string; avatar: string | null }>(),
  ])
  const online = row?.online ?? 0
  return { online, members: listed.results, more: Math.max(0, online - listed.results.length) }
}

/** Hourly: a last-seen time goes 31 days after the visit. Daily counts name no one and stay, so the first
 * collected day remains known and quiet days read as zero rather than as missing. */
export async function cleanupPresence(db: Database, now = Date.now()) {
  await db.prepare('DELETE FROM member_presence WHERE seen_at<?').bind(Math.floor(now / 1000) - 31 * DAY_SECONDS).run()
}

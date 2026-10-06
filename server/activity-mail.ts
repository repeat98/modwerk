import type { Database, Env } from './platform'
import { digest, HttpError } from './security'
import { throttle } from './auth'
import { emailReady, recordMail } from './email'
import { SUPPORT_EMAIL } from '../src/support'
import { renderActivityEmail } from './activity-email-template'
import { ITEM_SQL, RECIPIENTS, toItem, unsubscribeToken, VISIBLE } from './notifications'
import { DIGEST_HOURS, EMAIL_SETTING, type NotificationItem } from '../src/community/notification-contract'

/** Matches SQLite CURRENT_TIMESTAMP so stored times compare as text. */
const sqlTime = (value: Date) => value.toISOString().replace('T', ' ').slice(0, 19)
const hoursBefore = (now: Date, hours: number) => sqlTime(new Date(now.getTime() - hours * 3600000))
/** Activity mail shares the provider quota with verification and recovery. The free tier allows 100 a day and
 * account mail keeps 80 of them, so activity defaults to 15; raise ACTIVITY_MAIL_DAILY_LIMIT after upgrading. */
export function activityMailLimit(env: Env) {
  const value = Number(env.ACTIVITY_MAIL_DAILY_LIMIT ?? 15)
  return Number.isInteger(value) && value >= 0 && value <= 100000 ? value : 15
}
const ITEMS_PER_DIGEST = 40, MEMBERS_PER_RUN = 50

type Candidate = { id: string; email: string; replies: number; likes: number; modules: number; bugs: number; updates: number; messages: number }

/** Run hourly: at most one digest per member per 6 or 24 hours, covering what they have not already seen in the bell. */
export async function sendActivityDigests(env: Env, db: Database, now = new Date()) {
  if (!emailReady(env) || !env.AUTH_SECRET || !env.APP_URL) return { sent: 0 }
  // Anything read in the bell, or older than a week, is never mailed later.
  await db.prepare('UPDATE notifications SET emailed=1 WHERE emailed=0 AND (seen=1 OR created_at<?)').bind(hoursBefore(now, 24 * 7)).run()
  // A short wait lets a burst arrive as one digest and lets members who are online read it in the bell first.
  const settled = hoursBefore(now, 1 / 6)
  const candidates = (await db.prepare(`SELECT a.id,a.email,COALESCE(p.replies,1) AS replies,COALESCE(p.likes,1) AS likes,COALESCE(p.modules,1) AS modules,COALESCE(p.bugs,1) AS bugs,COALESCE(p.updates,1) AS updates,COALESCE(p.messages,1) AS messages
    FROM auth_users a JOIN users u ON u.id=a.id LEFT JOIN notification_preferences p ON p.user_id=a.id
    WHERE a.emailVerified=1 AND u.suspended=0 AND u.username IS NOT NULL AND COALESCE(p.email_enabled,1)=1
    AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=a.id)
    AND (p.last_digest_at IS NULL OR p.last_digest_at<CASE COALESCE(p.frequency,'hours') WHEN 'daily' THEN ? ELSE ? END)
    AND EXISTS(SELECT 1 FROM notifications n WHERE n.emailed=0 AND n.created_at<=? AND n.user_id IN (SELECT a.id UNION SELECT d.id FROM users d JOIN auth_accounts g ON g.providerId='github' AND g.accountId=d.github_id WHERE g.userId=a.id AND d.github_id IS NOT NULL))
    ORDER BY p.last_digest_at IS NOT NULL,p.last_digest_at LIMIT ?`).bind(hoursBefore(now, DIGEST_HOURS.daily), hoursBefore(now, DIGEST_HOURS.hours), settled, MEMBERS_PER_RUN).all<Candidate>()).results
  const limit = activityMailLimit(env), app = new URL(env.APP_URL)
  let sent = 0
  for (const member of candidates) {
    const pending = (await db.prepare(`SELECT id FROM notifications WHERE user_id IN (${RECIPIENTS}) AND emailed=0 AND created_at<=? LIMIT 500`).bind(member.id, member.id, settled).all<{ id: string }>()).results.map(row => row.id)
    const rows = (await db.prepare(`${ITEM_SQL} WHERE n.user_id IN (${RECIPIENTS}) AND n.emailed=0 AND n.created_at<=? AND ${VISIBLE} ORDER BY n.created_at DESC,n.rowid DESC LIMIT 500`).bind(member.id, member.id, settled).all<Parameters<typeof toItem>[0]>()).results
    const wanted: NotificationItem[] = rows.map(toItem).filter(item => !!member[EMAIL_SETTING[item.kind]])
    const wantedIds = new Set(wanted.map(item => item.id)), unwanted = pending.filter(id => !wantedIds.has(id))
    const included = wanted.slice(0, ITEMS_PER_DIGEST)
    // Turned-off kinds and hidden content are settled without a message.
    if (!included.length) { if (unwanted.length) await markEmailed(db, unwanted); continue }
    try {
      await throttle(db, 'activity-mail:daily', limit, 86400)
      await throttle(db, 'activity-mail:monthly', limit * 30, 30 * 86400)
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) { await recordMail(db, 'activity', 'limited'); break }
      throw error
    }
    const token = await unsubscribeToken(env.AUTH_SECRET, member.id)
    const settings = new URL(app); settings.hash = 'account/notifications'
    const page = new URL(app); page.hash = 'account/unsubscribe/' + token
    const inbox = new URL(app); inbox.hash = 'account'
    const message = renderActivityEmail(included, { app: app.href, notifications: inbox.href, settings: settings.href, unsubscribe: page.href }, wanted.length - included.length)
    const oneClick = env.AUTH_BASE_URL ? new URL('/api/notifications/unsubscribe?token=' + encodeURIComponent(token), env.AUTH_BASE_URL).href : null
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'activity-' + await digest(member.id + ':' + included.map(item => item.id).join(',')) },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [member.email], reply_to: SUPPORT_EMAIL, ...message, ...(oneClick ? { headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) }),
    }).catch(() => null)
    // Never log provider bodies, addresses or content.
    await recordMail(db, 'activity', result?.ok ? 'accepted' : 'failed')
    if (!result?.ok) continue
    sent++
    await markEmailed(db, [...included.map(item => item.id), ...unwanted])
    await db.prepare('INSERT INTO notification_preferences(user_id,last_digest_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_digest_at=excluded.last_digest_at').bind(member.id, sqlTime(now)).run()
  }
  return { sent }
}
async function markEmailed(db: Database, ids: string[]) {
  // Chunks stay within D1's bound-parameter limit.
  for (let start = 0; start < ids.length; start += 90) {
    const chunk = ids.slice(start, start + 90)
    await db.prepare(`UPDATE notifications SET emailed=1 WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).run()
  }
}

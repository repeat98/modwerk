import type { Database, Env } from './platform'
import { digest, HttpError } from './security'
import { mailLimits, reserveMailBudget } from './mail-budget'
import { emailReady, recordMail } from './email'
import { SUPPORT_EMAIL } from '../src/support'
import { renderActivityEmail } from './activity-email-template'
import { ITEM_SQL, RECIPIENTS, toItem, VISIBLE } from './notifications'
import { unsubscribeToken } from './unsubscribe'
import { DIGEST_HOURS, EMAIL_SETTING, type NotificationItem } from '../src/community/notification-contract'
import { parseReleaseNotes } from '../src/community/module-release-notes'
import { MODULE_UPDATE_CATCHUP, renderModuleUpdateCatchup } from './module-update-catchup'

/** Matches SQLite CURRENT_TIMESTAMP so stored times compare as text. */
const sqlTime = (value: Date) => value.toISOString().replace('T', ' ').slice(0, 19)
const hoursBefore = (now: Date, hours: number) => sqlTime(new Date(now.getTime() - hours * 3600000))
export function activityMailLimit(env: Env) { return mailLimits(env, 'activity').daily }
const ITEMS_PER_DIGEST = 40, MEMBERS_PER_RUN = 50

type Candidate = { id: string; email: string; replies: number; likes: number; modules: number; bugs: number; updates: number; messages: number; updates_due: number }

/** Run hourly: activity follows the chosen interval; module releases collect for a day and mail at most once per 24 hours, carrying any pending likes. */
export async function sendActivityDigests(env: Env, db: Database, now = new Date()) {
  if (!emailReady(env) || !env.AUTH_SECRET || !env.APP_URL) return { sent: 0 }
  // Anything read in the bell, or older than a week, is never mailed later.
  await db.prepare('UPDATE notifications SET emailed=1 WHERE emailed=0 AND (seen=1 OR created_at<?)').bind(hoursBefore(now, 24 * 7)).run()
  // Reading or receiving a newer release settles older versions for email, while every bell entry stays intact.
  await db.prepare(`UPDATE notifications AS n SET emailed=1 WHERE n.emailed=0 AND n.kind='module_update' AND EXISTS(
    SELECT 1 FROM notifications newer WHERE newer.user_id=n.user_id AND newer.kind='module_update' AND newer.module_id=n.module_id
    AND (newer.seen=1 OR newer.emailed=1) AND (newer.created_at>n.created_at OR (newer.created_at=n.created_at AND newer.rowid>n.rowid)))`).run()
  // A short wait lets a burst arrive as one digest and lets members who are online read it in the bell first.
  const settled = hoursBefore(now, 1 / 6)
  // Releases collect for a day from the oldest unsent one, so the day's releases arrive together, and never within a day of the last module digest.
  // An approved catch-up needs no new collection day, but still respects any previous digest and the chosen interval.
  const candidates = (await db.prepare(`WITH members AS (SELECT a.id,a.email,COALESCE(p.replies,1) AS replies,COALESCE(p.likes,1) AS likes,COALESCE(p.modules,1) AS modules,COALESCE(p.bugs,1) AS bugs,COALESCE(p.updates,1) AS updates,COALESCE(p.messages,1) AS messages,p.last_digest_at,p.frequency,
    COALESCE(p.last_module_digest_at,'')<=? AND (SELECT CASE WHEN MAX(n.excerpt=?)=1 THEN ? ELSE MIN(n.created_at) END FROM notifications n WHERE n.kind='module_update' AND n.emailed=0 AND n.seen=0
      AND n.user_id IN (SELECT a.id UNION SELECT d.id FROM users d JOIN auth_accounts g ON g.providerId='github' AND g.accountId=d.github_id WHERE g.userId=a.id AND d.github_id IS NOT NULL))<=? AS updates_due
    FROM auth_users a JOIN users u ON u.id=a.id LEFT JOIN notification_preferences p ON p.user_id=a.id
    WHERE a.emailVerified=1 AND u.suspended=0 AND u.username IS NOT NULL AND COALESCE(p.email_enabled,1)=1
    AND NOT EXISTS(SELECT 1 FROM social_pending_accounts s WHERE s.user_id=a.id)
    ) SELECT * FROM members a WHERE (a.last_digest_at IS NULL OR a.last_digest_at<=CASE COALESCE(a.frequency,'hours') WHEN 'daily' THEN ? ELSE ? END)
    AND EXISTS(SELECT 1 FROM notifications n WHERE n.emailed=0 AND n.created_at<=? AND n.kind NOT IN ('post_like','module_like') AND (n.kind<>'module_update' OR a.updates_due=1 OR a.updates=0) AND n.user_id IN (SELECT a.id UNION SELECT d.id FROM users d JOIN auth_accounts g ON g.providerId='github' AND g.accountId=d.github_id WHERE g.userId=a.id AND d.github_id IS NOT NULL))
    ORDER BY a.last_digest_at IS NOT NULL,a.last_digest_at LIMIT ?`).bind(hoursBefore(now, DIGEST_HOURS.daily), MODULE_UPDATE_CATCHUP, hoursBefore(now, DIGEST_HOURS.daily), hoursBefore(now, DIGEST_HOURS.daily), hoursBefore(now, DIGEST_HOURS.daily), hoursBefore(now, DIGEST_HOURS.hours), settled, MEMBERS_PER_RUN).all<Candidate>()).results
  const app = new URL(env.APP_URL)
  let sent = 0, requested = false
  for (const member of candidates) {
    const pending = (await db.prepare(`SELECT id,created_at FROM notifications WHERE user_id IN (${RECIPIENTS}) AND emailed=0 ORDER BY created_at DESC,rowid DESC LIMIT 500`).bind(member.id, member.id).all<{ id: string; created_at: string }>()).results
    const rows = (await db.prepare(`${ITEM_SQL} WHERE n.user_id IN (${RECIPIENTS}) AND n.emailed=0 AND ${VISIBLE} ORDER BY n.created_at DESC,n.rowid DESC LIMIT 500`).bind(member.id, member.id).all<Parameters<typeof toItem>[0]>()).results
    const wanted: NotificationItem[] = rows.map(toItem).filter(item => !!member[EMAIL_SETTING[item.kind]])
    const wantedIds = new Set(wanted.map(item => item.id)), unwanted = pending.filter(row => row.created_at <= settled && !wantedIds.has(row.id)).map(row => row.id)
    // Keep the newest pending version of each module, including a fresh one so an older version cannot slip out.
    const modules = new Set<string | null>()
    const due = wanted.filter(item => {
      if (item.kind === 'module_update') {
        if (modules.has(item.module_id)) return false
        modules.add(item.module_id)
        if (!member.updates_due) return false
      }
      return item.created_at <= settled
    })
    // Likes never start an email: they wait for the daily module update digest and stay in the bell until then.
    const bundled = due.some(item => item.kind === 'module_update') ? due : due.filter(item => item.kind !== 'post_like' && item.kind !== 'module_like')
    let included = bundled.slice(0, ITEMS_PER_DIGEST)
    // Turned-off kinds and hidden content are settled without a message.
    if (!included.length) { if (unwanted.length) await markEmailed(db, unwanted); continue }
    const catchupIds = new Set((await db.prepare(`SELECT id FROM notifications WHERE excerpt=? AND id IN (${included.map(() => '?').join(',')})`).bind(MODULE_UPDATE_CATCHUP, ...included.map(item => item.id)).all<{ id: string }>()).results.map(row => row.id))
    // Keep the approved personal catch-up separate from unrelated activity, which stays queued.
    if (catchupIds.size) included = included.filter(item => item.kind === 'module_update' && catchupIds.has(item.id))
    try {
      await reserveMailBudget(env, db, 'activity')
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) { await recordMail(db, 'activity', 'limited'); break }
      throw error
    }
    const token = await unsubscribeToken(env.AUTH_SECRET, 'activity', member.id)
    const settings = new URL(app); settings.hash = 'account/notifications'
    const page = new URL(app); page.hash = 'account/unsubscribe/' + token
    const inbox = new URL(app); inbox.hash = 'account'
    const mailItems = await Promise.all(included.map(async item => {
      if (item.kind !== 'module_update') return item
      const release = await db.prepare('SELECT notes FROM module_releases WHERE module_id=? AND version=?').bind(item.module_id, item.module_version ?? null).first<{ notes: string | null }>()
      return release?.notes ? { ...item, releaseNotes: parseReleaseNotes(JSON.parse(release.notes), item.module_id!) } : item
    }))
    const urls = { app: app.href, notifications: inbox.href, settings: settings.href, unsubscribe: page.href }
    const message = catchupIds.size ? renderModuleUpdateCatchup(mailItems, urls) : renderActivityEmail(mailItems, urls, bundled.length - included.length)
    const oneClick = env.AUTH_BASE_URL ? new URL('/api/notifications/unsubscribe?token=' + encodeURIComponent(token), env.AUTH_BASE_URL).href : null
    // Stay below the provider's default two requests per second, as the welcome and news mailers do.
    if (requested) await new Promise(resolve => setTimeout(resolve, 550))
    requested = true
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
    const releases = included.filter(item => item.kind === 'module_update')
    for (const item of releases) {
      await db.prepare(`UPDATE notifications SET emailed=1 WHERE user_id IN (${RECIPIENTS}) AND kind='module_update' AND module_id=?
        AND (created_at<? OR (created_at=? AND rowid<=(SELECT rowid FROM notifications WHERE id=?)))`).bind(member.id, member.id, item.module_id, item.created_at, item.created_at, item.id).run()
    }
    await db.prepare('INSERT INTO notification_preferences(user_id,last_digest_at,last_module_digest_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_digest_at=excluded.last_digest_at,last_module_digest_at=COALESCE(excluded.last_module_digest_at,notification_preferences.last_module_digest_at)').bind(member.id, sqlTime(now), releases.length ? sqlTime(now) : null).run()
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

import type { Database, Env } from './platform'
import { digest, HttpError, jsonBody, response } from './security'
import { throttle } from './auth'
import { mailLimits, reserveMailBudget } from './mail-budget'
import { emailReady, recordMail } from './email'
import { SUPPORT_EMAIL } from '../src/support'
import { NEWS_CONSENT_VERSION, saveNewsPreference } from './news-preferences'
import { NEWS_EMAIL_VERSION, renderNewsEmail } from './news-email-template'
import { adminText } from './announcements'
import { unsubscribeRoute, unsubscribeToken } from './unsubscribe'

export function newsMailLimit(env: Env) { return mailLimits(env, 'news').daily }
const MESSAGES_PER_RUN = 20, RETRY_SECONDS = 300, MAX_ATTEMPTS = 3, LISTED = 50
const newId = 'lower(hex(randomblob(16)))'
/** Members whose news consent is current and who can receive mail: verified, not suspended, sign-up complete. */
const RECIPIENTS = `SELECT a.id,a.email FROM auth_users a JOIN users u ON u.id=a.id JOIN account_news_preferences n ON n.user_id=a.id
 WHERE n.enabled=1 AND n.consent_version=? AND a.emailVerified=1 AND u.suspended=0 AND u.username IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM social_pending_accounts p WHERE p.user_id=a.id)`
type Campaign = { id: string; subject: string; body: string; status: string }
type Content = { subject: string; body: string }

/** Withdraws news consent from a signed mail link. */
export function newsUnsubscribe(request: Request, env: Env, db: Database) { return unsubscribeRoute(request, env, db, 'news', userId => saveNewsPreference(db, userId, false)) }

/** Posts one rendered message to the provider. Never logs addresses, content or provider bodies. */
async function deliver(env: Env, campaign: Content, member: { id: string; email: string }, idempotencyKey: string) {
  const app = new URL(env.APP_URL!), settings = new URL(app); settings.hash = 'account/notifications'
  const message = renderNewsEmail(campaign, { app: app.href, settings: settings.href })
  const token = await unsubscribeToken(env.AUTH_SECRET!, 'news', member.id)
  const oneClick = env.AUTH_BASE_URL ? new URL('/api/news/unsubscribe?token=' + encodeURIComponent(token), env.AUTH_BASE_URL).href : null
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [member.email], reply_to: SUPPORT_EMAIL, ...message, ...(oneClick ? { headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) }),
  }).catch(() => null)
  return !!result?.ok
}
async function withinBudget(env: Env, db: Database) {
  try {
    await reserveMailBudget(env, db, 'news')
    return true
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 429) throw error
    await recordMail(db, 'news', 'limited')
    return false
  }
}

/** Run hourly: works through queued deliveries within the daily cap, rechecking consent and membership for each one. */
export async function sendNewsMail(env: Env, db: Database, now = new Date()) {
  if (!emailReady(env) || !env.AUTH_SECRET || !env.APP_URL) return { sent: 0, queued: 0 }
  const seconds = Math.floor(now.getTime() / 1000)
  const queue = (await db.prepare(`SELECT d.campaign_id,d.member_id,d.idempotency_key,d.attempts,c.subject,c.body FROM news_deliveries d JOIN news_campaigns c ON c.id=d.campaign_id
    WHERE d.status='queued' AND c.status='sending' AND (d.attempted_at IS NULL OR d.attempted_at<=?) ORDER BY c.scheduled_at,c.rowid,d.rowid LIMIT ?`)
    .bind(seconds - RETRY_SECONDS, MESSAGES_PER_RUN).all<{ campaign_id: string; member_id: string; idempotency_key: string; attempts: number; subject: string; body: string }>()).results
  let sent = 0
  for (const [index, item] of queue.entries()) {
    const member = await db.prepare(RECIPIENTS + ' AND a.id=?').bind(NEWS_CONSENT_VERSION, item.member_id).first<{ id: string; email: string }>()
    if (!member) {
      // Consent withdrawn, account suspended or removed since the campaign was queued: never mailed, never retried.
      await db.prepare("UPDATE news_deliveries SET status='skipped',attempted_at=? WHERE campaign_id=? AND member_id=? AND status='queued'").bind(seconds, item.campaign_id, item.member_id).run()
      continue
    }
    if (!await withinBudget(env, db)) break
    const claim = await db.prepare("UPDATE news_deliveries SET attempted_at=?,attempts=attempts+1 WHERE campaign_id=? AND member_id=? AND status='queued' AND attempts=? RETURNING attempts")
      .bind(Math.max(seconds, Math.floor(Date.now() / 1000)), item.campaign_id, item.member_id, item.attempts).first<{ attempts: number }>()
    if (!claim) continue
    // Space a batch below the provider's default two requests per second.
    if (index) await new Promise(resolve => setTimeout(resolve, 550))
    const accepted = await deliver(env, item, member, item.idempotency_key)
    if (accepted) {
      await db.prepare("UPDATE news_deliveries SET status='sent' WHERE campaign_id=? AND member_id=?").bind(item.campaign_id, item.member_id).run()
      await recordMail(db, 'news', 'accepted')
      sent++
    } else {
      // The same idempotency key makes a retry safe; after the last attempt the delivery is given up, never duplicated.
      if (claim.attempts >= MAX_ATTEMPTS) await db.prepare("UPDATE news_deliveries SET status='failed' WHERE campaign_id=? AND member_id=?").bind(item.campaign_id, item.member_id).run()
      await recordMail(db, 'news', 'failed')
      // Stop the batch after a provider failure to contain rate/quota/configuration errors.
      break
    }
  }
  await db.prepare("UPDATE news_campaigns SET status='sent' WHERE status='sending' AND NOT EXISTS(SELECT 1 FROM news_deliveries d WHERE d.campaign_id=news_campaigns.id AND d.status='queued')").run()
  const queued = await db.prepare("SELECT COUNT(*) AS total FROM news_deliveries d JOIN news_campaigns c ON c.id=d.campaign_id WHERE d.status='queued' AND c.status='sending'").first<{ total: number }>()
  return { sent, queued: queued?.total ?? 0 }
}

/** Markdown link text and list lines from member-written titles: punctuation that could open markup is escaped. */
const markdownText = (value: string) => value.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>~|]/g, '\\$&')
/** A proposed "what landed" body from the last 30 days, every item linking to the site. Nothing private is read. */
export async function suggestNewsDigest(db: Database, env: Env, now = new Date()) {
  const app = new URL(env.APP_URL ?? 'https://modwerk.app/'); app.search = ''; app.hash = ''
  const link = (hash: string) => { const url = new URL(app); url.hash = hash.replace(/^#/, ''); return url.href }
  const since = new Date(now.getTime() - 30 * 86400000).toISOString().replace('T', ' ').slice(0, 19)
  const [modules, threads, showcase] = await Promise.all([
    // Releases detected after the first inventory, newest version per module; the baseline is not news.
    db.prepare(`SELECT r.module_id,r.name,r.version,r.href,EXISTS(SELECT 1 FROM module_releases o WHERE o.module_id=r.module_id AND o.detected_at<r.detected_at) AS updated
      FROM module_releases r WHERE r.detected_at>=? AND r.detected_at>(SELECT COALESCE(MAX(initialized_at),'') FROM module_release_inventory)
      AND r.detected_at=(SELECT MAX(l.detected_at) FROM module_releases l WHERE l.module_id=r.module_id) ORDER BY r.detected_at DESC,r.rowid DESC LIMIT 20`).bind(since).all<{ module_id: string; name: string; version: string; href: string; updated: number }>(),
    db.prepare(`SELECT t.id,t.title,
      (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id=t.id AND p.hidden=0 AND p.created_at>=? AND p.id<>(SELECT first.id FROM forum_posts first WHERE first.thread_id=t.id ORDER BY first.created_at,first.rowid LIMIT 1)) AS replies,
      (SELECT COUNT(*) FROM forum_reactions r JOIN forum_posts p ON p.id=r.post_id WHERE p.thread_id=t.id AND p.hidden=0 AND p.created_at>=?) AS likes
      FROM forum_threads t WHERE t.hidden=0 AND t.category<>'issues' AND (replies>0 OR likes>0) ORDER BY replies+likes DESC,t.updated_at DESC,t.id LIMIT 5`).bind(since, since).all<{ id: string; title: string; replies: number; likes: number }>(),
    db.prepare(`SELECT p.id,p.thread_id,t.title,u.username,
      (SELECT CAST(COUNT(*)/30 AS INTEGER) FROM forum_posts preceding WHERE preceding.thread_id=t.id AND (preceding.created_at<p.created_at OR (preceding.created_at=p.created_at AND preceding.rowid<p.rowid))) AS page
      FROM forum_posts p JOIN forum_threads t ON t.id=p.thread_id JOIN users u ON u.id=p.user_id
      WHERE p.id IN (SELECT m.post_id FROM forum_media m WHERE m.removed=0 AND m.post_id IS NOT NULL) AND p.hidden=0 AND t.hidden=0 AND t.category<>'issues' AND p.created_at>=?
      ORDER BY p.created_at DESC,p.rowid DESC LIMIT 5`).bind(since).all<{ id: string; thread_id: string; title: string; username: string | null; page: number }>(),
  ])
  const month = now.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const count = (total: number, one: string, many: string) => `${total} ${total === 1 ? one : many}`
  const sections = [
    modules.results.length ? ['## New and updated modules', ...modules.results.map(item => `- [${markdownText(item.name)}](${link(item.href)}) — ${item.updated ? 'updated to' : 'new, version'} ${markdownText(item.version)}`)] : [],
    threads.results.length ? ['## Busiest discussions', ...threads.results.map(item => `- [${markdownText(item.title)}](${link('#forum/thread/' + item.id)}) — ${count(item.replies, 'reply', 'replies')}, ${count(item.likes, 'like', 'likes')}`)] : [],
    showcase.results.length ? ['## Fresh from the showcase', ...showcase.results.map(item => `- [${markdownText(item.title)}](${link('#forum/thread/' + item.thread_id + '?post=' + item.id + '&page=' + item.page)})${item.username ? ' by @' + markdownText(item.username) : ''}`)] : [],
  ].filter(section => section.length)
  const body = ['Hi,', '', sections.length ? 'Here’s what landed on Modwerk in the last 30 days.' : 'It has been a quiet month on Modwerk, but more modules are on their way.',
    ...sections.flatMap(section => ['', ...section]), '', `Browse everything at ${link('#library')} and say hi on the forum at ${link('#forum')}.`, '', 'See you around,', 'Jannik'].join('\n')
  return { subject: `What landed on Modwerk in ${month}`, body }
}

const campaignRow = 'SELECT c.id,c.subject,c.body,c.status,c.template_version,c.created_by,c.created_at,c.scheduled_at,c.recipient_count,' +
  ["sent", "failed", "skipped", "queued"].map(status => `(SELECT COUNT(*) FROM news_deliveries d WHERE d.campaign_id=c.id AND d.status='${status}') AS ${status}`).join(',') + ' FROM news_campaigns c'
/** Operator-only: compose, test, queue and cancel news campaigns. Nothing here returns an address. */
export async function adminNews(request: Request, env: Env, db: Database, path: string, adminId: string): Promise<Response | null> {
  if (!path.startsWith('/api/admin/news')) return null
  if (path === '/api/admin/news' && request.method === 'GET') {
    const [optIns, campaigns, tester] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS total FROM (${RECIPIENTS})`).bind(NEWS_CONSENT_VERSION).first<{ total: number }>(),
      db.prepare(campaignRow + ' ORDER BY c.created_at DESC,c.rowid DESC LIMIT ' + LISTED).all(),
      db.prepare('SELECT 1 AS verified FROM auth_users WHERE id=? AND emailVerified=1').bind(adminId).first(),
    ])
    return response({ optIns: optIns?.total ?? 0, dailyLimit: newsMailLimit(env), emailAvailable: emailReady(env) && !!env.AUTH_SECRET && !!env.APP_URL, testAvailable: !!tester, campaigns: campaigns.results })
  }
  if (path === '/api/admin/news/suggest' && request.method === 'GET') return response(await suggestNewsDigest(db, env))
  const fields = async () => {
    const body = await jsonBody(request)
    return { subject: adminText(body.subject, 'The subject', 3, 150), text: adminText(body.body, 'The message', 1, 20000) }
  }
  if (path === '/api/admin/news' && request.method === 'POST') {
    await throttle(db, 'admin-news', 30)
    const { subject, text } = await fields()
    const created = await db.prepare(`INSERT INTO news_campaigns(id,subject,body,template_version,created_by) VALUES(${newId},?,?,?,?) RETURNING id`).bind(subject, text, NEWS_EMAIL_VERSION, adminId).first<{ id: string }>()
    return response({ id: created!.id }, 201)
  }
  const match = path.match(/^\/api\/admin\/news\/([a-f0-9]{32})(?:\/(test|queue|cancel))?$/)
  if (!match) throw new HttpError(404, 'News route not found.')
  const campaign = await db.prepare('SELECT id,subject,body,status FROM news_campaigns WHERE id=?').bind(match[1]).first<Campaign>()
  if (!campaign) throw new HttpError(404, 'Campaign not found.')
  const action = match[2]
  if (!action && request.method === 'PATCH') {
    const { subject, text } = await fields()
    if (!(await db.prepare("UPDATE news_campaigns SET subject=?,body=? WHERE id=? AND status='draft' RETURNING id").bind(subject, text, campaign.id).first())) throw new HttpError(409, 'Only a draft can be edited.')
    return response({ ok: true })
  }
  if (!action && request.method === 'DELETE') {
    if (!(await db.prepare("DELETE FROM news_campaigns WHERE id=? AND status='draft' RETURNING id").bind(campaign.id).first())) throw new HttpError(409, 'Only a draft can be discarded; a queued campaign is cancelled instead.')
    return response({ ok: true })
  }
  if (request.method !== 'POST') throw new HttpError(405, 'This news action is not supported.')
  if (action === 'test') {
    if (!emailReady(env) || !env.AUTH_SECRET || !env.APP_URL) throw new HttpError(503, 'News email is not connected yet.')
    // The test goes to the signed-in administrator's own verified address; the break-glass key has none.
    const tester = await db.prepare('SELECT id,email FROM auth_users WHERE id=? AND emailVerified=1').bind(adminId).first<{ id: string; email: string }>()
    if (!tester) throw new HttpError(400, 'Sign in with your administrator account to receive a test message.')
    await throttle(db, 'admin-news-test', 10)
    if (!await withinBudget(env, db)) throw new HttpError(429, 'The daily news mail budget is used up. Try again tomorrow.')
    const accepted = await deliver(env, { ...campaign, subject: '[Test] ' + campaign.subject }, tester, 'news-test-' + await digest(campaign.id + ':' + tester.id + ':' + Date.now()))
    await recordMail(db, 'news', accepted ? 'accepted' : 'failed')
    if (!accepted) throw new HttpError(503, 'The test message could not be sent. Please try again later.')
    return response({ ok: true })
  }
  if (action === 'queue') {
    if (campaign.status !== 'draft') throw new HttpError(409, 'This campaign was already queued.')
    const members = (await db.prepare(`SELECT id FROM (${RECIPIENTS})`).bind(NEWS_CONSENT_VERSION).all<{ id: string }>()).results
    if (!members.length) throw new HttpError(400, 'Nobody has opted in to news email yet.')
    // One row per member, inserted before the status changes, so a retried or concurrent queue cannot add a second one.
    const rows = await Promise.all(members.map(async member => db.prepare('INSERT OR IGNORE INTO news_deliveries(campaign_id,member_id,idempotency_key) VALUES(?,?,?)').bind(campaign.id, member.id, 'news-' + await digest(campaign.id + ':' + member.id))))
    for (let start = 0; start < rows.length; start += 80) await db.batch(rows.slice(start, start + 80))
    const queued = await db.prepare(`UPDATE news_campaigns SET status='sending',scheduled_at=CURRENT_TIMESTAMP,recipient_count=(SELECT COUNT(*) FROM news_deliveries WHERE campaign_id=?) WHERE id=? AND status='draft' RETURNING recipient_count`)
      .bind(campaign.id, campaign.id).first<{ recipient_count: number }>()
    if (!queued) throw new HttpError(409, 'This campaign was already queued.')
    return response({ ok: true, recipients: queued.recipient_count })
  }
  if (!(await db.prepare("UPDATE news_campaigns SET status='cancelled' WHERE id=? AND status='sending' RETURNING id").bind(campaign.id).first())) throw new HttpError(409, 'Only a queued campaign can be cancelled.')
  await db.prepare("DELETE FROM news_deliveries WHERE campaign_id=? AND status='queued'").bind(campaign.id).run()
  return response({ ok: true })
}

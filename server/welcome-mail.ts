import type { Database, Env } from './platform'
import { emailReady, recordMail } from './email'
import { reserveMailBudget } from './mail-budget'
import { digest, HttpError } from './security'
import { SUPPORT_EMAIL } from '../src/support'
import { welcomeEmailVersions, WELCOME_EMAIL_VERSION } from './welcome-email-template'

const MEMBERS_PER_RUN = 10, LEASE_SECONDS = 60, RETRY_SECONDS = 300
// Resend retains idempotency keys for 24 hours. Stop uncertain retries before that window ends.
const SAFE_RETRY_SECONDS = 20 * 3600
const MEMBER = `SELECT a.id,a.email FROM auth_users a JOIN users u ON u.id=a.id
 WHERE a.emailVerified=1 AND u.suspended=0 AND u.username IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM social_pending_accounts p WHERE p.user_id=a.id)`
type Pending = { user_id: string; state: string; first_attempt_at: number | null; template_version: string }

/** Called by the five-minute cron. A persistent claim also protects against overlapping runs. */
export async function sendMemberWelcomes(env: Env, db: Database, now = new Date()) {
  if (env.WELCOME_MAIL_ENABLED !== 'true' || !emailReady(env)) return { sent: 0, review: 0 }
  const seconds = Math.floor(now.getTime() / 1000)
  await db.prepare(`INSERT OR IGNORE INTO member_welcome_mail(user_id,template_version) SELECT id,? FROM (${MEMBER})`).bind(WELCOME_EMAIL_VERSION).run()
  await db.prepare(`UPDATE member_welcome_mail SET state='review' WHERE state IN ('pending','sending')
    AND first_attempt_at IS NOT NULL AND first_attempt_at<=? AND lease_until<=?`).bind(seconds - SAFE_RETRY_SECONDS, seconds).run()
  const candidates = (await db.prepare(`SELECT w.user_id,w.state,w.first_attempt_at,w.template_version FROM member_welcome_mail w JOIN (${MEMBER}) m ON m.id=w.user_id
    WHERE w.state IN ('pending','sending') AND w.retry_at<=? AND w.lease_until<=? ORDER BY w.retry_at,w.user_id LIMIT ?`)
    .bind(seconds, seconds, MEMBERS_PER_RUN).all<Pending>()).results
  let sent = 0
  for (const pending of candidates) {
    const message = welcomeEmailVersions[pending.template_version]
    if (!message) continue
    const attemptTime = Math.max(seconds, Math.floor(Date.now() / 1000))
    // Recheck membership after the claim; never send to a removed/suspended/incomplete account.
    const claim = await db.prepare(`UPDATE member_welcome_mail SET state='sending',lease_until=?,retry_at=?
      WHERE user_id=? AND state IN ('pending','sending') AND retry_at<=? AND lease_until<=? AND first_attempt_at IS ? AND state=? AND template_version=? RETURNING user_id`)
      .bind(attemptTime + LEASE_SECONDS, attemptTime + LEASE_SECONDS, pending.user_id, attemptTime, attemptTime, pending.first_attempt_at, pending.state, pending.template_version).first()
    if (!claim) continue
    const member = await db.prepare(MEMBER + ' AND a.id=?').bind(pending.user_id).first<{ id: string; email: string }>()
    if (!member) {
      await db.prepare("UPDATE member_welcome_mail SET state='pending',lease_until=0,retry_at=? WHERE user_id=?").bind(attemptTime + RETRY_SECONDS, pending.user_id).run()
      continue
    }
    try {
      await reserveMailBudget(env, db, 'welcome')
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 429) throw error
      await db.prepare("UPDATE member_welcome_mail SET state='pending',lease_until=0,retry_at=? WHERE user_id=?").bind(attemptTime + RETRY_SECONDS, pending.user_id).run()
      await recordMail(db, 'welcome', 'limited')
      break
    }
    await db.prepare('UPDATE member_welcome_mail SET first_attempt_at=COALESCE(first_attempt_at,?),attempts=attempts+1 WHERE user_id=?')
      .bind(attemptTime, pending.user_id).run()
    // Space a batch below the provider's default two requests per second.
    await new Promise(resolve => setTimeout(resolve, 550))
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': pending.template_version + '-' + await digest(member.id) },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [member.email], reply_to: SUPPORT_EMAIL, ...message }),
    }).catch(() => null)
    if (result?.ok) {
      // Persist acceptance before aggregate counters so a counter failure cannot resend this welcome.
      await db.prepare("UPDATE member_welcome_mail SET state='accepted',accepted_at=?,lease_until=0 WHERE user_id=?").bind(attemptTime, pending.user_id).run()
      await recordMail(db, 'welcome', 'accepted')
      sent++
    } else {
      // Network errors and server errors may have sent the message: preserve their original retry window.
      const firstAttempt = result && result.status >= 400 && result.status < 500 && result.status !== 409 && pending.state !== 'sending'
        ? pending.first_attempt_at : pending.first_attempt_at ?? attemptTime
      await db.prepare("UPDATE member_welcome_mail SET state='pending',lease_until=0,retry_at=?,first_attempt_at=? WHERE user_id=?")
        .bind(attemptTime + RETRY_SECONDS, firstAttempt, pending.user_id).run()
      await recordMail(db, 'welcome', 'failed')
      // Stop the batch after a provider failure to contain rate/quota/configuration errors.
      break
    }
  }
  const review = await db.prepare("SELECT COUNT(*) AS total FROM member_welcome_mail WHERE state='review'").first<{ total: number }>()
  return { sent, review: review?.total ?? 0 }
}

import type { Database, Env } from './platform'
import { tagMailLinks } from './mail-links'
import { emailReady, recordMail } from './email'
import { reserveMailBudget } from './mail-budget'
import { digest, HttpError } from './security'
import { escape } from './account-email-template'
import { SUPPORT_EMAIL } from '../src/support'
import { DEVELOPMENT_DISCORD_URL } from '../src/config/development-discord'

/** Days without a signed-in visit before the one reminder, and again after it before the place is freed. */
export const BETA_IDLE_DAYS = 5
const IDLE_SECONDS = BETA_IDLE_DAYS * 86400
export const BETA_IDLE_EMAIL_VERSION = 'modwerk-beta-idle-001'
// A spell starts at the later of the last visit (the bell's presence poll) and joining the beta.
const TESTERS = `SELECT u.id,a.email,u.beta_reminded_at AS reminded,COALESCE(p.seen_at,0) AS seen,
 COALESCE((SELECT CAST(strftime('%s',MAX(m.created_at)) AS INTEGER) FROM forum_moderation m WHERE m.target=u.id AND m.action IN ('beta-tester:accept','beta-tester:grant')),0) AS joined
 FROM users u JOIN auth_users a ON a.id=u.id LEFT JOIN member_presence p ON p.user_id=u.id
 WHERE u.beta_tester=1 AND u.is_admin=0 AND u.suspended=0 AND a.emailVerified=1`
type Tester = { id: string; email: string; reminded: number | null; seen: number; joined: number }

const site = 'https://modwerk.app/'
export const betaIdleEmail = {
  subject: 'Your Modwerk beta place',
  text: `Hey,

you haven't been on Modwerk for ${BETA_IDLE_DAYS} days. Beta places are limited, and I'd like to keep them for people who are testing right now.

If you're still in, just open Modwerk while signed in within the next ${BETA_IDLE_DAYS} days and your place stays yours. Otherwise it goes to someone else. If you want back in later, just ask me on Discord:
${DEVELOPMENT_DISCORD_URL}

Open Modwerk:
${site}

Thank you,
Jannik

You're getting this because you're a Modwerk beta tester.`,
  html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your Modwerk beta place</title></head>
<body style="margin:0;padding:0;background-color:#171719;color:#ededf2;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Open Modwerk within ${BETA_IDLE_DAYS} days to keep it.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171719"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 8px 24px;font-size:26px;font-weight:bold;letter-spacing:-1px;color:#ffffff;">Modwerk<span style="color:#c7a16c;"> ▪</span></td></tr>
<tr><td bgcolor="#c7a16c" height="3" style="height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="#232327" style="padding:32px 28px;border:1px solid #36363e;border-top:0;border-radius:0 0 12px 12px;">
<p style="margin:0 0 16px;color:#c4c4ce;font-size:15px;line-height:25px;">Hey,</p>
<p style="margin:0 0 18px;color:#c4c4ce;font-size:15px;line-height:25px;">you haven't been on Modwerk for ${BETA_IDLE_DAYS} days. Beta places are limited, and I'd like to keep them for people who are testing right now.</p>
<p style="margin:0 0 24px;color:#c4c4ce;font-size:15px;line-height:25px;">If you're still in, just open Modwerk while signed in within the next ${BETA_IDLE_DAYS} days and your place stays yours. Otherwise it goes to someone else. If you want back in later, just <a href="${escape(DEVELOPMENT_DISCORD_URL)}" style="color:#c4c9ff;text-decoration:underline;">ask me on Discord</a>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#727dde" style="border-radius:7px;text-align:center;">
<a href="${site}" style="display:inline-block;padding:15px 22px;border:1px solid #727dde;border-radius:7px;color:#ffffff;font-size:15px;font-weight:bold;line-height:20px;text-decoration:none;">Open Modwerk</a>
</td></tr></table>
<p style="margin:26px 0 0;color:#f4f4f8;font-size:15px;line-height:25px;">Thank you,<br><strong>Jannik</strong></p>
</td></tr>
<tr><td style="padding:24px 8px 8px;color:#90909e;font-size:12px;line-height:21px;">
<p style="margin:0;">You're getting this because you're a Modwerk beta tester. Modwerk · <a href="${site}" style="color:#b9bdd7;text-decoration:underline;">modwerk.app</a></p>
</td></tr></table>
</td></tr></table></body></html>`,
}

/** Hourly: one reminder after a quiet spell, then the place is freed if the tester still hasn't been back. */
export async function remindInactiveBetaTesters(env: Env, db: Database, now = Date.now()) {
  // No mail, no reminders, and no removal without a reminder.
  if (!emailReady(env)) return { reminded: 0, removed: 0 }
  const seconds = Math.floor(now / 1000), idleSince = seconds - IDLE_SECONDS
  let reminded = 0, removed = 0
  for (const tester of (await db.prepare(TESTERS).all<Tester>()).results) {
    const spell = Math.max(tester.seen, tester.joined)
    if (tester.reminded !== null && tester.reminded >= spell) {
      if (tester.reminded > idleSince) continue
      // Recheck in the same transaction that the tester has not visited since the reminder.
      const quiet = `EXISTS(SELECT 1 FROM users WHERE id=? AND beta_tester=1 AND beta_reminded_at=?) AND NOT EXISTS(SELECT 1 FROM member_presence WHERE user_id=? AND seen_at>?)`
      const [log] = await db.batch([
        db.prepare(`INSERT INTO forum_moderation(id,actor_id,target,action,reason) SELECT ?,?,?,'beta-tester:inactive',? WHERE ${quiet} RETURNING id`)
          .bind(crypto.randomUUID(), tester.id, tester.id, `no visit for ${BETA_IDLE_DAYS} days after the reminder`, tester.id, tester.reminded, tester.id, tester.reminded),
        db.prepare(`UPDATE users SET beta_tester=0 WHERE id=? AND ${quiet}`).bind(tester.id, tester.id, tester.reminded, tester.id, tester.reminded),
      ]) as { results: unknown[] }[]
      removed += log.results.length
      continue
    }
    if (spell > idleSince) continue
    const claim = await db.prepare('UPDATE users SET beta_reminded_at=? WHERE id=? AND beta_tester=1 AND beta_reminded_at IS ? RETURNING id').bind(seconds, tester.id, tester.reminded).first()
    if (!claim) continue
    const release = () => db.prepare('UPDATE users SET beta_reminded_at=? WHERE id=? AND beta_reminded_at=?').bind(tester.reminded, tester.id, seconds).run()
    try {
      // Bounded by the pool, so it shares the welcome budget instead of resizing the plan's split.
      await reserveMailBudget(env, db, 'welcome')
    } catch (error) {
      await release()
      if (!(error instanceof HttpError) || error.status !== 429) throw error
      await recordMail(db, 'beta', 'limited')
      break
    }
    // Space a batch below the provider's default two requests per second.
    await new Promise(resolve => setTimeout(resolve, 550))
    // shortcut: an uncertain send retried after Resend's 24 h key window can mail twice; add welcome-mail's review state if that happens.
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': BETA_IDLE_EMAIL_VERSION + '-' + await digest(tester.id + ':' + spell) },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [tester.email], reply_to: SUPPORT_EMAIL, ...tagMailLinks(betaIdleEmail, env.APP_URL, 'beta') }),
    }).catch(() => null)
    if (!result?.ok) {
      // Retried next hour; the removal clock only starts once a reminder was accepted.
      await release()
      await recordMail(db, 'beta', 'failed')
      break
    }
    await recordMail(db, 'beta', 'accepted')
    reminded++
  }
  return { reminded, removed }
}

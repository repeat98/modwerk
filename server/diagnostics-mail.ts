import type { Database, Env } from './platform'
import { digest, HttpError, jsonBody, response } from './security'
import { throttle, ADMIN_ACTOR } from './auth'
import { reserveMailBudget } from './mail-budget'
import { emailReady, recordMail } from './email'
import { escape } from './account-email-template'
import { adminText } from './announcements'
import { unsubscribeRoute, unsubscribeToken } from './unsubscribe'
import { SUPPORT_EMAIL } from '../src/support'
import { DIAGNOSTIC_CONSENT_DAYS } from '../src/community/octatrack-diagnostics-contract'

/** A personal email to a member whose shared Octatrack diagnostics show a problem (`problem`), and the follow-up once its
 * fix ships (`fixed`). The diagnostics consent says reports may lead to one (OCTATRACK_DIAGNOSTICS_VERSION 2026-11-19.1;
 * owner, 19 Nov 2026: everyone sharing may get one, nobody is asked again). An agent or the owner drafts it with the
 * administrator key; only an administrator signed in with their own account sends it, one at a time or all listed drafts
 * in one run from the admin page, each through the send route (docs/MAINTENANCE.md). */
export const DIAGNOSTICS_MAIL_VERSION = 'modwerk-diagnostics-mail-001'
export const DIAGNOSTICS_MAIL_KINDS = ['problem', 'fixed'] as const
const LISTED = 100
/** Who may get one: a verified, unsuspended member whose diagnostics sharing is on and current (the window reports are
 * stored under), who has not followed the link to stop them. A visitor shares as a guest and has no address. */
const ELIGIBLE = `SELECT a.id,a.email,u.username FROM auth_users a JOIN users u ON u.id=a.id JOIN octatrack_diagnostic_consent c ON c.user_id=a.id
 WHERE c.enabled=1 AND c.changed_at>? AND c.changed_at<=? AND a.emailVerified=1 AND u.email_verified=1 AND u.suspended=0 AND u.username IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM diagnostics_mail_optout o WHERE o.user_id=a.id)`
const consentWindow = (now: Date) => [new Date(now.getTime() - DIAGNOSTIC_CONSENT_DAYS * 86400000).toISOString(), now.toISOString()]
type Member = { id: string; email: string; username: string }
type Mail = { id: string; user_id: string; kind: string; cause: string; subject: string; body: string; status: string }

/** Stops these emails for the member a signed link names. */
export function diagnosticsMailUnsubscribe(request: Request, env: Env, db: Database) {
  return unsubscribeRoute(request, env, db, 'diagnostics', userId => db.prepare('INSERT OR IGNORE INTO diagnostics_mail_optout(user_id) VALUES(?)').bind(userId).run())
}

/** Plain paragraphs, the member's name and a footer that says why it came and how to stop it. The body is plain text. */
export function renderDiagnosticsMail(mail: { subject: string; body: string }, username: string, stop: string) {
  const paragraphs = mail.body.trim().split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
  const why = 'You’re getting this because you share Octatrack diagnostics with Modwerk.'
  // A generated name (member_ and hex) is no way to greet someone: a plain hello instead.
  const greeting = /^member_[0-9a-f]+$/i.test(username) ? 'Hey,' : `Hey ${username},`
  const text = [greeting, ...paragraphs, 'Thank you,\nJannik', `${why} Stop these emails: ${stop}`].join('\n\n')
  const p = (value: string) => `<p style="margin:0 0 16px;color:#c4c4ce;font-size:15px;line-height:25px;">${escape(value).replace(/\n/g, '<br>')}</p>`
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(mail.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#171719;color:#ededf2;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171719"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 8px 24px;font-size:26px;font-weight:bold;letter-spacing:-1px;color:#ffffff;">Modwerk<span style="color:#c7a16c;"> ▪</span></td></tr>
<tr><td bgcolor="#c7a16c" height="3" style="height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="#232327" style="padding:32px 28px;border:1px solid #36363e;border-top:0;border-radius:0 0 12px 12px;">
${p(greeting)}
${paragraphs.map(p).join('\n')}
<p style="margin:10px 0 0;color:#f4f4f8;font-size:15px;line-height:25px;">Thank you,<br><strong>Jannik</strong></p>
</td></tr>
<tr><td style="padding:24px 8px 8px;color:#90909e;font-size:12px;line-height:21px;">
<p style="margin:0;">${escape(why)} <a href="${escape(stop)}" style="color:#b9bdd7;text-decoration:underline;">Stop these emails</a></p>
</td></tr></table>
</td></tr></table></body></html>`
  return { subject: mail.subject, text, html }
}

async function eligible(db: Database, userId: string, now: Date) {
  return db.prepare(ELIGIBLE + ' AND a.id=?').bind(...consentWindow(now), userId).first<Member>()
}

/** Posts one message. Never logs the address, the content or the provider's answer. */
async function deliver(env: Env, mail: Mail, member: Member) {
  const token = await unsubscribeToken(env.AUTH_SECRET!, 'diagnostics', member.id)
  const page = new URL(env.APP_URL!); page.hash = 'account/diagnostics-mail-off/' + token
  const oneClick = env.AUTH_BASE_URL ? new URL('/api/diagnostics/mail/unsubscribe?token=' + encodeURIComponent(token), env.AUTH_BASE_URL).href : null
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': DIAGNOSTICS_MAIL_VERSION + '-' + await digest(mail.id) },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [member.email], reply_to: SUPPORT_EMAIL, ...renderDiagnosticsMail(mail, member.username, page.href),
      ...(oneClick ? { headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) }),
  }).catch(() => null)
  return !!result?.ok
}

/** Operator-only: draft, list, discard and send. Nothing here returns an address. */
export async function adminDiagnosticsMail(request: Request, env: Env, db: Database, path: string, adminId: string, now = new Date()): Promise<Response | null> {
  if (!path.startsWith('/api/admin/diagnostics-mail')) return null
  const ready = emailReady(env) && !!env.AUTH_SECRET && !!env.APP_URL
  if (path === '/api/admin/diagnostics-mail' && request.method === 'GET') {
    const mails = (await db.prepare(`SELECT m.id,u.username,m.kind,m.cause,m.subject,m.body,m.status,m.created_at,m.sent_at,
      EXISTS(SELECT 1 FROM (${ELIGIBLE}) e WHERE e.id=m.user_id) AS eligible FROM diagnostics_mail m JOIN users u ON u.id=m.user_id
      ORDER BY m.created_at DESC,m.rowid DESC LIMIT ${LISTED}`).bind(...consentWindow(now)).all()).results
    return response({ emailAvailable: ready, canSend: adminId !== ADMIN_ACTOR, mails })
  }
  if (path === '/api/admin/diagnostics-mail' && request.method === 'POST') {
    await throttle(db, 'admin-diagnostics-mail', 60)
    const body = await jsonBody(request)
    if (!DIAGNOSTICS_MAIL_KINDS.some(kind => kind === body.kind)) throw new HttpError(400, 'Choose problem or fixed.')
    const username = adminText(body.username, 'The username', 1, 64), subject = adminText(body.subject, 'The subject', 3, 150), text = adminText(body.body, 'The message', 20, 6000)
    const cause = body.cause === undefined ? '' : adminText(body.cause, 'The cause', 1, 200)
    const member = await db.prepare(ELIGIBLE + ' AND u.username=?').bind(...consentWindow(now), username).first<Member>()
    // One answer for every reason, so the route never tells whether an account exists or shares.
    if (!member) throw new HttpError(400, 'This member cannot get a diagnostics email: no member by that name shares diagnostics now, or they stopped these emails.')
    const created = await db.prepare(`INSERT INTO diagnostics_mail(id,user_id,kind,cause,subject,body,created_by) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?) RETURNING id`)
      .bind(member.id, body.kind, cause, subject, text, adminId).first<{ id: string }>()
    return response({ id: created!.id }, 201)
  }
  const match = path.match(/^\/api\/admin\/diagnostics-mail\/([a-f0-9]{32})(\/send)?$/)
  if (!match) throw new HttpError(404, 'Diagnostics mail route not found.')
  if (!match[2] && request.method === 'DELETE') {
    if (!(await db.prepare("UPDATE diagnostics_mail SET status='discarded' WHERE id=? AND status='draft' RETURNING id").bind(match[1]).first())) throw new HttpError(409, 'Only a draft can be discarded.')
    return response({ ok: true })
  }
  if (!match[2] || request.method !== 'POST') throw new HttpError(405, 'This diagnostics mail action is not supported.')
  // The owner approves each one by sending it while signed in; the administrator key that agents use can only draft.
  if (adminId === ADMIN_ACTOR) throw new HttpError(403, 'Sign in with your administrator account to send a diagnostics email.')
  if (!ready) throw new HttpError(503, 'Email is not connected yet.')
  await throttle(db, 'admin-diagnostics-mail-send', 120) // an hour: room for one Send all of a pass's drafts
  const mail = await db.prepare("UPDATE diagnostics_mail SET status='sending',sent_by=? WHERE id=? AND status='draft' RETURNING id,user_id,kind,cause,subject,body,status").bind(adminId, match[1]).first<Mail>()
  if (!mail) throw new HttpError(409, 'This email was already sent, failed or was discarded.')
  const back = () => db.prepare("UPDATE diagnostics_mail SET status='draft',sent_by=NULL WHERE id=? AND status='sending'").bind(mail.id).run()
  const member = await eligible(db, mail.user_id, now)
  if (!member) { await back(); throw new HttpError(409, 'This member cannot get it any more: they stopped sharing diagnostics or these emails, or their account changed.') }
  try {
    // Bounded by the pool, so it shares the welcome budget like the beta reminder.
    await reserveMailBudget(env, db, 'welcome')
  } catch (error) {
    await back()
    if (error instanceof HttpError && error.status === 429) { await recordMail(db, 'diagnostics', 'limited'); throw new HttpError(429, 'The daily mail budget is used up. Try again tomorrow.') }
    throw error
  }
  const accepted = await deliver(env, mail, member)
  await db.prepare('UPDATE diagnostics_mail SET status=?,sent_at=CURRENT_TIMESTAMP WHERE id=?').bind(accepted ? 'sent' : 'failed', mail.id).run()
  await recordMail(db, 'diagnostics', accepted ? 'accepted' : 'failed')
  if (!accepted) throw new HttpError(503, 'The email could not be sent. Draft it again to retry.')
  return response({ ok: true })
}

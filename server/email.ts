import type { Env, Database } from './platform'
import { digest, HttpError } from './security'
import { reserveMailBudget } from './mail-budget'
import { SUPPORT_EMAIL } from '../src/support'
import { renderAccountEmail } from './account-email-template'
export class AccountMailError extends HttpError {}

type MailOutcome='accepted'|'failed'|'limited'
/** Daily counts per purpose, without addresses, content or links. */
export async function recordMail(db: Database, purpose: 'verify' | 'reset' | 'activity' | 'welcome' | 'news', outcome: MailOutcome) {
  // The column comes only from this fixed internal allowlist.
  await db.prepare(`INSERT INTO account_mail_daily(day,purpose,${outcome}) VALUES(?,?,1) ON CONFLICT(day,purpose) DO UPDATE SET ${outcome}=${outcome}+1`).bind(new Date().toISOString().slice(0,10),purpose).run()
}
export function emailReady(env: Env) { return !!env.RESEND_API_KEY && !!env.EMAIL_FROM && !/[\r\n]/.test(env.EMAIL_FROM) }
export async function sendAccountEmail(env: Env, db: Database, to: string, purpose: 'verify' | 'reset', value: string) {
  if (!emailReady(env)) throw new HttpError(503, 'Account email is not connected yet. Please try again later.')
  const record=(outcome:MailOutcome)=>recordMail(db,purpose,outcome)
  try{
    await reserveMailBudget(env, db, 'account')
  }catch(error){if(error instanceof HttpError&&error.status===429){await record('limited');throw new AccountMailError(429,'Account email is temporarily limited.')}throw error}
  const url = new URL(env.APP_URL!)
  url.hash = 'account/' + purpose + '/' + value
  const message = renderAccountEmail(purpose, url.href)
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': purpose + '-' + await digest(value) },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], reply_to: SUPPORT_EMAIL, ...message }),
  }).catch(() => null)
  // Never expose provider bodies, recipient addresses, API credentials or links in logs/errors.
  await record(result?.ok?'accepted':'failed')
  if (!result?.ok) throw new AccountMailError(503, 'The email could not be sent. Please try again later.')
}

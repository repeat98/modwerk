import type { Database, Env } from './platform'
import { boundedBody, HttpError, response } from './security'

/** Ko-fi posts each payment server-to-server: a form field `data` holding JSON with the account's verification token.
 * Only Ko-fi's message ID (so a repeated delivery counts once), the UTC month, the amount, the currency and whether it
 * counts are kept. The payer's name, email address, message and links are read for nothing but the test check and dropped.
 * Donations and subscriptions count toward the running costs; shop orders and commissions do not. A payer at example.com
 * (reserved for examples, RFC 2606) is Ko-fi's "Send test" and never counts. */
const COUNTED_TYPES = new Set(['Donation', 'Subscription'])

function sameText(a: string, b: string) { if (a.length !== b.length) return false; let difference = 0; for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index); return difference === 0 }

export async function kofiWebhook(request: Request, env: Env, db: Database) {
  const token = env.KOFI_VERIFICATION_TOKEN?.trim() ?? ''
  if (!token) throw new HttpError(503, 'Ko-fi payments are not connected.')
  let payload: Record<string, unknown> | null = null
  try { payload = JSON.parse(new URLSearchParams(new TextDecoder().decode(await boundedBody(request, 16 * 1024))).get('data') ?? '') } catch { /* refused below */ }
  if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Invalid payload.')
  if (typeof payload.verification_token !== 'string' || !sameText(payload.verification_token, token)) throw new HttpError(401, 'Invalid token.')
  const id = payload.message_id, type = payload.type, currency = payload.currency, amount = Number(payload.amount)
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id) || typeof type !== 'string' || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount) || amount < 0 || amount > 100000) throw new HttpError(400, 'Invalid payment.')
  const test = typeof payload.email === 'string' && /@example\.com$/i.test(payload.email.trim())
  const time = typeof payload.timestamp === 'string' ? Date.parse(payload.timestamp) : NaN
  const month = new Date(Number.isFinite(time) ? time : Date.now()).toISOString().slice(0, 7)
  await db.prepare('INSERT INTO kofi_payments(message_id,month,amount_cents,currency,counted) VALUES(?,?,?,?,?) ON CONFLICT(message_id) DO NOTHING')
    .bind(id, month, Math.round(amount * 100), currency, COUNTED_TYPES.has(type) && !test ? 1 : 0).run()
  return response({ ok: true })
}

/** Public: this UTC month's counted Ko-fi payments in euros for the support dialogs, or null while the webhook is not set up. */
export async function kofiCoverage(env: Env, db: Database, now = new Date()) {
  const month = now.toISOString().slice(0, 7)
  if (!env.KOFI_VERIFICATION_TOKEN?.trim()) return response({ month, euros: null })
  const row = await db.prepare("SELECT COALESCE(SUM(amount_cents),0) AS cents FROM kofi_payments WHERE month=? AND counted=1 AND currency='EUR'").bind(month).first<{ cents: number }>()
  return response({ month, euros: (row?.cents ?? 0) / 100 })
}

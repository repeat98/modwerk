import type { Database, Env } from './platform'
import { throttle } from './auth'
import { HttpError, jsonBody, response } from './security'

/** Each kind of link signs its own prefix, so an activity link can never withdraw news consent, or the reverse. */
const PREFIX = { activity: 'modwerk-activity-unsubscribe-v1:', news: 'modwerk-news-unsubscribe-v1:' } as const
type Purpose = keyof typeof PREFIX

async function signature(secret: string, purpose: Purpose, userId: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(PREFIX[purpose] + userId))), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** A long-lived, single-purpose link: it can only turn one kind of email off. Rotating AUTH_SECRET invalidates it. */
export async function unsubscribeToken(secret: string, purpose: Purpose, userId: string) { return userId + '.' + await signature(secret, purpose, userId) }
async function tokenUser(secret: string, purpose: Purpose, value: unknown) {
  if (typeof value !== 'string' || value.length > 200) return null
  const split = value.lastIndexOf('.'), userId = value.slice(0, split), mac = value.slice(split + 1)
  if (split < 1 || !/^[a-f0-9]{64}$/.test(mac)) return null
  const expected = await signature(secret, purpose, userId)
  let difference = 0
  for (let index = 0; index < 64; index++) difference |= expected.charCodeAt(index) ^ mac.charCodeAt(index)
  return difference ? null : userId
}
/** One-click unsubscribe (RFC 8058): mail clients post here without an Origin or session; the signed token authorizes it. */
export async function unsubscribeRoute(request: Request, env: Env, db: Database, purpose: Purpose, turnOff: (userId: string) => Promise<unknown>) {
  if (!env.AUTH_SECRET) throw new HttpError(503, 'Email settings are not available yet.')
  await throttle(db, 'unsubscribe-ip:' + (request.headers.get('CF-Connecting-IP') ?? 'local'), 30)
  const query = new URL(request.url).searchParams.get('token')
  const token = query ?? (request.headers.get('Content-Type')?.includes('application/json') ? (await jsonBody(request)).token : null)
  const userId = await tokenUser(env.AUTH_SECRET, purpose, token)
  if (!userId) throw new HttpError(400, `This unsubscribe link is not valid. Change ${purpose === 'news' ? 'news' : 'email'} settings in your account instead.`)
  // A deleted account has nothing left to unsubscribe and must not regain a stored preference.
  if (await db.prepare('SELECT id FROM auth_users WHERE id=?').bind(userId).first()) await turnOff(userId)
  return response({ ok: true })
}

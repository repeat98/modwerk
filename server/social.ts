import { symmetricEncrypt } from 'better-auth/crypto'
import type { Database, Env } from './platform'
import { COMMUNITY_RULES_VERSION } from '../src/legal/policy'
import { accountAuth } from './accounts'
import { throttle } from './auth'
import { digest, HttpError, jsonBody, response, token } from './security'
import { completeSocialOnboarding, exchangeSocialSession } from './social-onboarding'
import { socialProviders, validUsername, type SocialProvider } from './social-config'
const now = () => Math.floor(Date.now() / 1000)
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function returnUrl(env: Env, route: string) { const url = new URL(env.APP_URL!); url.hash = route; return url.href }
function redirect(url: string) { return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }) }
/** Explicit facade; Better Auth retains its state-cookie, PKCE and nonce checks. */
export async function socialRoutes(request: Request, env: Env, db: Database, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/auth/sso') && !/^\/api\/auth\/callback\/(google|github|discord)$/.test(path)) return null
  const callback = path.match(/^\/api\/auth\/callback\/(google|github|discord)$/), start = path.match(/^\/api\/auth\/sso\/start\/([a-f0-9]{64})$/), providers = socialProviders(env)
  if (!providers.length) throw new HttpError(503, 'Social sign-in is not configured yet.')
  if (callback) {
    if (request.method !== 'GET' || !providers.includes(callback[1] as SocialProvider)) throw new HttpError(404, 'Sign-in provider not available.')
    const result = await accountAuth(env,db).handler(request), session = result.headers.get('set-auth-token'), flowHash = result.headers.get('X-Modwerk-Sso-Flow')
    if (!session || !hex(flowHash)) {
      // Provider/Better Auth failures arrive as ?error=<code> on the redirect; log only the code (visible in `wrangler tail`).
      const reason = (() => { try { return new URL(result.headers.get('Location') ?? '', env.APP_URL!).searchParams.get('error') } catch { return null } })()
      console.warn('social sign-in failed', callback[1], 'status=' + result.status, 'reason=' + (reason ?? (session ? 'missing_flow' : 'no_session')))
      // Only the verified owner of the provider email reaches this; tell them to use their original sign-in.
      return redirect(returnUrl(env, reason === 'account_not_linked' ? 'account/sso-error?reason=exists' : 'account/sso-error'))
    }
    const code = token(), payload = await symmetricEncrypt({ key: env.AUTH_SECRET!, data: JSON.stringify({ session, cookies: result.headers.getSetCookie() }) })
    // The desktop app's sign-in returns through the browser's modwerk:// prompt, which may wait for a click: five minutes, not one.
    const flow = await db.prepare("UPDATE social_flows SET token_hash=?,stage='complete',payload=?,expires=?+CASE client WHEN 'desktop' THEN 300 ELSE 60 END WHERE token_hash=? AND provider=? AND stage='started' AND expires>? RETURNING client").bind(await digest(code), payload, now(), flowHash, callback[1], now()).first<{client: string}>()
    if (!flow) return redirect(returnUrl(env, 'account/sso-error'))
    return redirect(returnUrl(env, (flow.client === 'desktop' ? 'account/sso-app/' : 'account/sso/') + code))
  }
  if (start) {
    if (request.method !== 'GET') throw new HttpError(405, 'Open this sign-in link in your browser.')
    const flowHash = await digest(start[1]), flow = await db.prepare("UPDATE social_flows SET stage='started' WHERE token_hash=? AND stage='pending' AND expires>? RETURNING provider,mode").bind(flowHash, now()).first<{provider: SocialProvider; mode: string}>()
    if (!flow || !providers.includes(flow.provider)) throw new HttpError(400, 'This sign-in link is invalid or expired. Start again.')
    const result = await accountAuth(env,db).api.signInSocial({ headers: request.headers, body: { provider: flow.provider, requestSignUp: true, callbackURL: returnUrl(env, 'account/sso-error'), errorCallbackURL: returnUrl(env, 'account/sso-error'), disableRedirect: true, additionalData: { flowHash } }, asResponse: true })
    const data = await result.json() as { url?: string }
    if (!result.ok || !data.url) return redirect(returnUrl(env, 'account/sso-error'))
    const out = redirect(data.url)
    // Top-level navigation sets a first-party API-origin state cookie.
    for (const value of result.headers.getSetCookie()) out.headers.append('Set-Cookie', value)
    return out
  }
  if (request.method !== 'POST') throw new HttpError(405, 'Use a supported sign-in action.')
  await throttle(db, 'social-ip:' + (request.headers.get('CF-Connecting-IP') ?? 'local'), 30, 900)
  const body = await jsonBody(request)
  if (path === '/api/auth/sso/exchange') return exchangeSocialSession(env,db,body)
  if (path === '/api/auth/sso/complete') return completeSocialOnboarding(env,db,body)
  if (path !== '/api/auth/sso') throw new HttpError(404, 'Sign-in action not found.')
  if (!providers.includes(body.provider as SocialProvider) || (body.mode !== 'login' && body.mode !== 'register') || !hex(body.challenge)) throw new HttpError(400, 'Choose an available sign-in provider.')
  if (body.client !== undefined && body.client !== 'web' && body.client !== 'desktop') throw new HttpError(400, 'Start sign-in from the site or the Modwerk app.')
  let username: string | null = null
  if (body.mode === 'register' && typeof body.username === 'string' && body.username.trim()) {
    if (env.REGISTRATION_OPEN !== 'true' || env.PRIVACY_READY !== 'true') throw new HttpError(503, 'New registrations are temporarily closed.')
    if (body.rulesVersion !== COMMUNITY_RULES_VERSION) throw new HttpError(400, 'Accept the current community rules before creating an account.')
    if (body.newsletter !== undefined && typeof body.newsletter !== 'boolean') throw new HttpError(400, 'Choose whether to receive news emails.')
    username = typeof body.username === 'string' ? body.username.toLowerCase() : null
    if (!validUsername(username)) throw new HttpError(400, 'Choose a public username: 3–24 letters, numbers or underscores, excluding reserved names.')
    if (await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').bind(username).first()) throw new HttpError(409, 'This username is already in use.')
  }
  const ticket = token()
  await db.prepare("INSERT INTO social_flows(token_hash,challenge_hash,provider,mode,username,rules_version,newsletter,stage,expires,client) VALUES(?,?,?,?,?,?,?,'pending',?,?)").bind(await digest(ticket), body.challenge, body.provider, body.mode, username, body.mode === 'register' ? COMMUNITY_RULES_VERSION : null, body.mode === 'register' && body.newsletter === true ? 1 : 0, now() + 600, body.client === 'desktop' ? 'desktop' : 'web').run()
  const url = new URL(env.AUTH_BASE_URL!); url.pathname = url.pathname.replace(/\/$/, '') + '/sso/start/' + ticket
  return response({ url: url.href })
}

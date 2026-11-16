import { startPush } from './push'
import { handleApi, reportFailure } from './api'
import type { Env } from './platform'
import { appOrigin, HttpError, response } from './security'
import { withAccountAuth } from './accounts'
/** One trusted website origin, including failure responses and preflights. */
export function handleCommunity(request: Request, env: Env, context?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  return withAccountAuth(() => handleRequest(request, env, context))
}
async function handleRequest(request: Request, env: Env, context?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  const started=performance.now()
  let allowed: string
  try { allowed = appOrigin(env) } catch (error) { return response({ error: error instanceof Error ? error.message : 'Service unavailable.' }, 503) }
  const origin = request.headers.get('Origin')
  if (origin && origin !== allowed) return response({ error: 'This request did not originate from Octamod.' }, 403)
  let result: Response
  if (request.method === 'OPTIONS') {
    const method = request.headers.get('Access-Control-Request-Method') ?? ''
    const headers = (request.headers.get('Access-Control-Request-Headers') ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
    if (origin !== allowed || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || headers.some(header => !['authorization', 'content-type', 'x-octamod-admin','x-modwerk-developer','x-octamod-usage-consent','x-modwerk-diagnostics-guest'].includes(header))) return response({ error: 'Preflight not allowed.' }, 403)
    result = new Response(null, { status: 204 })
    result.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE')
    result.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Octamod-Admin, X-Modwerk-Developer, X-Octamod-Usage-Consent, X-Modwerk-Diagnostics-Guest')
    result.headers.set('Access-Control-Max-Age', '600')
  } else {
    try { result = await handleApi(request, env) }
    catch (error) {
      if (!(error instanceof HttpError)) reportFailure(request, error)
      result = response({ error: error instanceof HttpError ? error.message : 'The request could not be completed.' }, error instanceof HttpError ? error.status : 500)
    }
  }
  // A WebSocket upgrade (remote sessions) carries its socket on this very response object.
  if (result.status === 101) return result
  // Presence check-ins never queue notifications and should not dispatch push for every visitor/minute.
  if(context && new URL(request.url).pathname !== '/api/community/online' && !['GET','HEAD','OPTIONS'].includes(request.method) && result.ok)startPush(env,context)
  const headers = new Headers(result.headers)
  headers.set('Server-Timing','app;dur='+(performance.now()-started).toFixed(1))
  headers.set('Vary', 'Origin')
  if (origin === allowed) {
    headers.set('Access-Control-Allow-Origin', allowed)
    headers.set('Timing-Allow-Origin',allowed)
    headers.set('Access-Control-Expose-Headers', 'X-Octamod-Session, X-Modwerk-Developer, Server-Timing')
  }
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers })
}

import { post } from './api'
export function accountHref(mode: 'login' | 'register', next = 'forum') { return '#account/' + mode + '?next=' + encodeURIComponent(safeNext(next)) }
export function safeNext(value: string | null) { return value && value.length <= 500 && /^[a-z][a-z0-9_/?=&%-]*$/i.test(value) && !value.startsWith('account') && !value.startsWith('admin') ? value : 'forum' }
const nextKey = 'modwerk.account.next'
/** Registration remembers where it started, so the emailed verification link can return there once the member is signed in. */
export function rememberNext(next: string) { try { if (safeNext(next) === 'forum') localStorage.removeItem(nextKey); else localStorage.setItem(nextKey, safeNext(next)) } catch { /* The forum is the fallback. */ } }
export function takeNext(value: string | null) {
  let saved = ''
  try { saved = localStorage.getItem(nextKey) ?? ''; localStorage.removeItem(nextKey) } catch { /* The forum is the fallback. */ }
  return safeNext(value && safeNext(value) !== 'forum' ? value : saved)
}
const welcomeKey = 'modwerk.account.welcome'
let welcomePending = false
/** Only completed signup requests a welcome; keep the original destination intact. */
export function welcomeHref(next: string) {
  welcomePending = true
  try { sessionStorage.setItem(welcomeKey, '1') } catch { /* The current tab can still show the welcome. */ }
  return '#' + safeNext(next)
}
export function hasSignupWelcome() {
  if (welcomePending) return true
  try { return sessionStorage.getItem(welcomeKey) === '1' } catch { return false }
}
/** Consume the welcome once, including when verification returns in a fresh tab. */
export function takeSignupWelcome() {
  let pending = welcomePending
  welcomePending = false
  try { pending ||= sessionStorage.getItem(welcomeKey) === '1'; sessionStorage.removeItem(welcomeKey) } catch { /* Use the in-memory fallback. */ }
  return pending
}
/** Authorize immediately before local composition; no firmware is transmitted. */
export async function requireBuildAccount(moduleIds?: readonly string[]) { await post('/auth/build-access', moduleIds ? { moduleIds } : {}) }

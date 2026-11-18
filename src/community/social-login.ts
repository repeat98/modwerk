import { apiUrl } from '../hosting'
import { post } from './api'
import { safeNext } from './member-access'
import { desktopShell } from '../desktop-shell'
export type SocialProvider = 'google' | 'github' | 'discord'
export const socialNames: Record<SocialProvider, string> = { google: 'Google', github: 'GitHub', discord: 'Discord' }
const storageKey = 'modwerk.social.pending'
type Onboarding = {code:string;username:string}
type Pending = {verifier:string;next:string;expires:number;onboarding?:Onboarding}
export type SocialResult = {next:string;onboarding?:Onboarding}
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('') }
function readPending():Pending {
  let pending:Pending
  try { pending=JSON.parse(sessionStorage.getItem(storageKey)??'null') } catch {throw new Error('Start sign-in again in this browser tab.')}
  if(!pending||pending.expires<Date.now()||!/^[a-f0-9]{64}$/.test(pending.verifier))throw new Error('This sign-in has expired. Start again in this browser tab.')
  return pending
}
/** Start a social sign-in. In the desktop app it runs in the default browser (providers refuse embedded windows) and
 * comes back through a modwerk:// link to this page, which holds the verifier: 'browser' says so. */
export async function startSocial(provider: SocialProvider, next: string): Promise<'browser' | void> {
  const desktop = desktopShell()?.openSignIn ? desktopShell() : null
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  const pending:Pending = { verifier, next: safeNext(next), expires: Date.now() + 10 * 60 * 1000 }
  try { sessionStorage.setItem(storageKey, JSON.stringify(pending)) } catch { throw new Error('Enable browser storage to complete social sign-in.') }
  const result = await post<{url: string}>('/auth/sso', { provider, mode:'login', challenge: await hash(verifier), ...(desktop ? { client: 'desktop' } : {}) })
  const url = new URL(result.url), apiOrigin = new URL(apiUrl('/auth/sso'), window.location.href).origin
  if (url.origin !== apiOrigin || !/^\/api\/auth\/sso\/start\/[a-f0-9]{64}$/.test(url.pathname)) throw new Error('The sign-in link was not accepted.')
  redemption=undefined
  if (desktop?.openSignIn) { desktop.openSignIn(url.href); return 'browser' }
  window.location.assign(url.href)
}
// Share one redemption across React StrictMode's repeated effect setup.
let redemption: {code: string; promise: Promise<SocialResult>} | undefined
export function finishSocial(code: string) {
  if (redemption?.code === code) return redemption.promise
  const promise = (async ():Promise<SocialResult> => {
    const pending=readPending()
    if(!code&&pending.onboarding)return {next:safeNext(pending.next),onboarding:pending.onboarding}
    const result=await post<{onboarding?:Onboarding}>('/auth/sso/exchange', { code, verifier: pending.verifier })
    if(result.onboarding){
      pending.onboarding=result.onboarding
      pending.expires=Date.now()+10*60*1000
      sessionStorage.setItem(storageKey,JSON.stringify(pending))
      return {next:safeNext(pending.next),onboarding:result.onboarding}
    }
    sessionStorage.removeItem(storageKey)
    return {next:safeNext(pending.next)}
  })()
  redemption = { code, promise }
  return promise
}
export async function completeSocial(fields:{username:string;rulesVersion:string;newsletter:boolean}) {
  const pending=readPending()
  if(!pending.onboarding)throw new Error('Start sign-in again in this browser tab.')
  await post('/auth/sso/complete',{...fields,code:pending.onboarding.code,verifier:pending.verifier})
  sessionStorage.removeItem(storageKey)
  redemption=undefined
  return safeNext(pending.next)
}

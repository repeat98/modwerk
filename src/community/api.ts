import { apiUrl, communityBase } from '../hosting'
const sessionKey = () => 'octamod.community.session:' + communityBase()
const adminKey = () => 'octamod.community.admin:' + communityBase()
const developerKey = () => 'modwerk.developer.session:' + communityBase()
function savedDeveloper() { try { return localStorage.getItem(developerKey()) ?? '' } catch { return '' } }
function validSession(value:string){return /^[a-f0-9]{64}$/.test(value)||/^[A-Za-z0-9_%+./=-]{40,600}$/.test(value)&&value.includes('.')}
function savedSession() { try { return localStorage.getItem(sessionKey()) ?? '' } catch { return '' } }
function savedAdmin() { try { return sessionStorage.getItem(adminKey()) ?? '' } catch { return '' } }
/** Administrator sessions are separate from member and legacy guest sessions and last only for this tab. */
export function setAdminSession(value: string) { try { if (value) sessionStorage.setItem(adminKey(), value); else sessionStorage.removeItem(adminKey()) } catch { throw new Error('Your browser could not keep the administrator session for this tab.') } }
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method=(options.method??'GET').toUpperCase()
  const publicRead=method==='GET'&&['/catalog','/community/summary','/community/online','/forum/highlights','/announcements'].includes(path.split('?')[0])
  const headers = new Headers(options.headers), session = savedSession()
  if (!publicRead&&validSession(session)) headers.set('Authorization', 'Bearer ' + session)
  const admin = savedAdmin()
  if (!publicRead&&/^[a-f0-9]{64}$/.test(admin)) headers.set('X-Octamod-Admin', admin)
  const developer=savedDeveloper()
  if ((path.startsWith('/developer/')||path.startsWith('/issues/')||/^\/modules\/[a-z0-9-]+\/support$/.test(path))&&/^[a-f0-9]{64}$/.test(developer)) headers.set('X-Modwerk-Developer',developer)
  // Retry reads once; account handoffs and mutations must never be replayed. Marking notifications read only
  // sets them seen, so a dropped request retries like a read instead of leaving them unread.
  const replayable=method==='GET'?!path.includes('/auth/')||path==='/auth/session'||path==='/developer/auth/session':method==='PATCH'&&(path==='/notifications'||path==='/announcements/mine')
  const attempts=replayable?2:1
  const unreachable=()=>new Error('Couldn’t reach the Modwerk community service. Check your connection or content blocker, then try again. Your local workspace still works.')
  let result: Response|null=null
  for(let attempt=0;attempt<attempts;attempt++){
    try {
      const timeout=AbortSignal.timeout(method==='GET'?10000:30000)
      const signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout
      result=await fetch(apiUrl(path),{...options,headers,signal,credentials:'same-origin',redirect:'error'})
      if(result.status<500||attempt===attempts-1)break
      await result.body?.cancel()
    } catch {
      if(options.signal?.aborted||attempt===attempts-1)throw unreachable()
    }
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  if(!result)throw unreachable()
  const next = result.headers.get('X-Octamod-Session')
  const nextDeveloper=result.headers.get('X-Modwerk-Developer')
  if(result.ok&&nextDeveloper!==null){try{if(/^[a-f0-9]{64}$/.test(nextDeveloper))localStorage.setItem(developerKey(),nextDeveloper);else if(nextDeveloper==='')localStorage.removeItem(developerKey())}catch{throw new Error('Enable site storage to keep your developer sign-in.')}}
  if (result.ok && next !== null) {
    try { if (validSession(next)) localStorage.setItem(sessionKey(), next); else if (next === '') localStorage.removeItem(sessionKey()) }
    catch { throw new Error('Your browser could not save this community session. Enable site storage to keep ownership of posts.') }
  }
  return result
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const result = await apiFetch(path, options)
  let body: T & { error?: string }
  try { body = await result.json() as T & { error?: string } }
  // The Worker always answers in JSON, so anything else came from the network path, such as a Cloudflare error page.
  catch { throw new Error('The Modwerk community service sent an unexpected response (HTTP ' + result.status + '). Try again in a moment. Your local workspace still works.') }
  if (!result.ok) throw new Error(body.error ?? 'The request could not be completed.')
  return body
}
export function post<T>(path: string, body: unknown, method = 'POST') { return api<T>(path, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }) }
export type CommunityUser = { id: string; displayName: string; username: string | null; avatar?: string | null; verified: boolean; betaTester?: boolean }
export type Session = { available: boolean; emailAvailable?: boolean; registrationAvailable?: boolean; forumMedia?: boolean; ssoProviders?: ('google' | 'github' | 'discord')[]; admin: boolean; user: CommunityUser | null }
export type DeveloperSession = { available: boolean; user: { login: string } | null }
export type PublicMedia = { id: string; kind: 'image' | 'audio'; caption: string; capture_type: string }
export type PublishedModule = { module_id: string; title: string; repository_url: string; description: string; usage: string; resource_notes: string; test_report_url: string; reviewed_at: string; added_at?: string | null; updated_at?: string | null; author: string }

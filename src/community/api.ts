import { apiUrl, communityBase } from '../hosting'
import { createReadRecovery } from './read-recovery'
const readRecoveries = new Map<string, ReturnType<typeof createReadRecovery>>()
function readRecovery() {
  const base = communityBase()
  if (!readRecoveries.has(base)) readRecoveries.set(base, createReadRecovery())
  return readRecoveries.get(base)!
}
const sessionKey = () => 'octamod.community.session:' + communityBase()
const adminKey = () => 'octamod.community.admin:' + communityBase()
const developerKey = () => 'modwerk.developer.session:' + communityBase()
function savedDeveloper() { try { return localStorage.getItem(developerKey()) ?? '' } catch { return '' } }
function validSession(value:string){return /^[a-f0-9]{64}$/.test(value)||/^[A-Za-z0-9_%+./=-]{40,600}$/.test(value)&&value.includes('.')}
function savedSession() { try { return localStorage.getItem(sessionKey()) ?? '' } catch { return '' } }
/** Whether this browser holds a session token, so the first paint can wait for the member instead of drawing the visitor view. */
export function hasSavedSession() { return validSession(savedSession()) }
function savedAdmin() { try { return sessionStorage.getItem(adminKey()) ?? '' } catch { return '' } }
/** Calls `listener` whenever community reads work again after an outage; returns the unsubscribe. */
export function onCommunityReconnect(listener: () => void) { return readRecovery().onReconnect(listener) }
// A read still unanswered after this long gets one fresh request beside it, as a reload would; the first answer wins.
const HEDGE_MS=5000
type Exchange={response?:Response;reachable?:boolean}
function anySignal(signals:AbortSignal[]){
  if(typeof AbortSignal.any==='function')return AbortSignal.any(signals)
  const combined=new AbortController()
  for(const signal of signals){if(signal.aborted){combined.abort(signal.reason);break}signal.addEventListener('abort',()=>combined.abort(signal.reason),{once:true})}
  return combined.signal
}
/** Sends a request and at most attempts-1 more: 200 ms after a dropped connection or server error, or for a read
 * beside one that has not answered within HEDGE_MS. Each has a 30-second deadline, so a slow reply can still win.
 * `reachable` is undefined when the caller cancelled, true for any HTTP response and false when none arrived. */
function exchange(url:string,init:RequestInit,attempts:number,hedge:boolean,caller?:AbortSignal):Promise<Exchange>{
  return new Promise(resolve=>{
    const running=new Set<AbortController>()
    let started=0,settled=false,timer:ReturnType<typeof setTimeout>|undefined,failed:Response|undefined
    const settle=(outcome:Exchange)=>{
      if(settled)return
      settled=true;clearTimeout(timer);caller?.removeEventListener('abort',cancel)
      for(const controller of running)controller.abort()
      if(failed&&failed!==outcome.response)void failed.body?.cancel()
      resolve(outcome)
    }
    const cancel=()=>settle({})
    const lost=()=>{
      if(running.size)return
      if(started<attempts){clearTimeout(timer);timer=setTimeout(launch,200)}
      // Any HTTP response proves connectivity; one route's server error must not pause every route.
      else settle(failed?{response:failed,reachable:true}:{reachable:false})
    }
    function launch(){
      if(settled)return
      if(caller?.aborted){cancel();return}
      started++
      const controller=new AbortController()
      running.add(controller)
      if(hedge&&started<attempts)timer=setTimeout(launch,HEDGE_MS)
      let request:Promise<Response>
      // Leave room for occasional slow network/edge responses; a ten-second cutoff drops live reads. A later attempt
      // starts from a timer, where a synchronous throw would leave the request unsettled.
      try { const deadline=AbortSignal.timeout(30000); request=fetch(url,{...init,signal:anySignal(caller?[caller,deadline,controller.signal]:[deadline,controller.signal])}) }
      catch (error) { request=Promise.reject(error) }
      request.then(response=>{
        running.delete(controller)
        if(settled){void response.body?.cancel();return}
        if(response.status<500){settle({response,reachable:true});return}
        if(failed)void failed.body?.cancel()
        failed=response;lost()
      },()=>{
        running.delete(controller)
        if(!settled&&caller?.aborted)cancel()
        else if(!settled)lost()
      })
    }
    caller?.addEventListener('abort',cancel,{once:true})
    launch()
  })
}
/** Administrator sessions are separate from member and legacy guest sessions and last only for this tab. */
export function setAdminSession(value: string) { try { if (value) sessionStorage.setItem(adminKey(), value); else sessionStorage.removeItem(adminKey()) } catch { throw new Error('Your browser could not keep the administrator session for this tab.') } }
export async function apiFetch(path: string, options: RequestInit = {}, expectedSession?: string): Promise<Response> {
  const method=(options.method??'GET').toUpperCase()
  const publicRead=method==='GET'&&['/catalog','/community/summary','/community/online','/forum/highlights','/announcements'].includes(path.split('?')[0])
  const headers = new Headers(options.headers), session = savedSession()
  if (expectedSession !== undefined && session !== expectedSession) throw new DOMException('The signed-in account changed.', 'AbortError')
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
  const recovery=method==='GET'&&replayable?await readRecovery().begin(options.signal??undefined):undefined
  if(recovery===null)throw unreachable()
  let outcome: Exchange={}
  // Administrator statistics can be slow by design; a second copy would only double their database work.
  const hedge=method==='GET'&&replayable&&!path.startsWith('/admin/')
  try { outcome=await exchange(apiUrl(path),{...options,headers,credentials:'same-origin',redirect:'error'},attempts,hedge,options.signal??undefined) }
  finally { recovery?.finish(outcome.reachable) }
  const result=outcome.response
  if(!result)throw unreachable()
  if (expectedSession !== undefined && savedSession() !== expectedSession) throw new DOMException('The signed-in account changed.', 'AbortError')
  const next = result.headers.get('X-Octamod-Session')
  const nextDeveloper=result.headers.get('X-Modwerk-Developer')
  if(result.ok&&nextDeveloper!==null){try{if(/^[a-f0-9]{64}$/.test(nextDeveloper))localStorage.setItem(developerKey(),nextDeveloper);else if(nextDeveloper==='')localStorage.removeItem(developerKey())}catch{throw new Error('Enable site storage to keep your developer sign-in.')}}
  if (result.ok && next !== null) {
    try { if (validSession(next)) localStorage.setItem(sessionKey(), next); else if (next === '') localStorage.removeItem(sessionKey()) }
    catch { throw new Error('Your browser could not save this community session. Enable site storage to keep ownership of posts.') }
  }
  return result
}
export async function api<T>(path: string, options: RequestInit = {}, expectedSession?: string): Promise<T> {
  const result = await apiFetch(path, options, expectedSession)
  let body: T & { error?: string }
  try { body = await result.json() as T & { error?: string } }
  // The Worker always answers in JSON, so anything else came from the network path, such as a Cloudflare error page.
  catch { throw new Error('The Modwerk community service sent an unexpected response (HTTP ' + result.status + '). Try again in a moment. Your local workspace still works.') }
  if (!result.ok) throw new Error(body.error ?? 'The request could not be completed.')
  return body
}
export function post<T>(path: string, body: unknown, method = 'POST') { return api<T>(path, { method, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }) }
/** Private background work cannot inherit a newly signed-in account or overwrite its session with a late reply. */
export function scopedApi() {
  const session = savedSession()
  return { current: () => savedSession() === session,
    request: <T>(path: string, options: RequestInit = {}) => api<T>(path, options, session),
    fetch: (path: string, options: RequestInit = {}) => apiFetch(path, options, session) }
}
export type CommunityUser = { id: string; displayName: string; username: string | null; avatar?: string | null; verified: boolean; betaTester?: boolean }
export type Session = { available: boolean; emailAvailable?: boolean; registrationAvailable?: boolean; forumMedia?: boolean; ssoProviders?: ('google' | 'github' | 'discord')[]; admin: boolean; user: CommunityUser | null }
export type DeveloperSession = { available: boolean; user: { login: string } | null }
export type PublicMedia = { id: string; kind: 'image' | 'audio'; caption: string; capture_type: string }
export type PublishedModule = { module_id: string; title: string; repository_url: string; description: string; usage: string; resource_notes: string; test_report_url: string; reviewed_at: string; added_at?: string | null; updated_at?: string | null; author: string }

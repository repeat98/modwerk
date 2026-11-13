import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { Inventory } from '../config/inventory'
import { changeDiagnosticSharing, collectOctatrackDiagnostics, diagnosticPreference, subscribeDiagnosticPreference } from '../community/octatrack-diagnostics'
import { api } from '../community/api'
import { browserRequestsPrivacy } from '../community/usage'
import type { DiagnosticEntry } from '../community/octatrack-diagnostics-contract'
import { rememberInvitationAnswer, stepTotals, type StepRow } from '../community/diagnostics-sharing'
import { DiagnosticDetails, useInvitationCounts } from './DiagnosticsInvitation'
import { DIAGNOSTICS_GUEST } from '../community/octatrack-diagnostics-contract'

export function OctatrackDiagnosticsCollector({memberId,link,inventory}: {memberId:string;link:OctatrackLink|null;inventory?:Inventory}) {
  const latest = useRef(inventory)
  useEffect(()=>{latest.current=inventory},[inventory])
  useEffect(()=>collectOctatrackDiagnostics(memberId,link,()=>latest.current),[memberId,link])
  return null
}
/** `username` is the name the owner sees on shared records; testers match it on Discord.
 * While sharing is off, Share diagnostics turns it on right here, with What gets shared beside it as the dialog has it;
 * Stop sharing and delete turns it off. */
export function OctatrackDiagnosticsSettings({username}: {username?: string | null}) {
  const state = useSyncExternalStore(subscribeDiagnosticPreference,diagnosticPreference,diagnosticPreference)
  const privacy = browserRequestsPrivacy(), offer = !state.enabled
  const count = useInvitationCounts('settings', offer)
  async function share() { if (await changeDiagnosticSharing(true)) count('shared') }
  return <section className="octatrack-diagnostics" aria-label="Diagnostics">
    <h3>Diagnostics</h3>
    <p>{state.enabled ? 'You’re helping me find browser, build and Octatrack sync problems.' : 'Help me find browser, build and Octatrack sync problems by sharing private technical reports.'}</p>
    {state.enabled && username && <p className="link-hint">They reach me as @{username}. {/^member_[a-z0-9]+$/i.test(username)
      ? <>That name was made up by the site: <a href="#account">choose your own</a>, ideally your Discord name, so I can match your messages to them.</>
      : 'Use the same name on Discord, so I can match your messages to them.'}</p>}
    <DiagnosticDetails/>
    {offer && <>
      <p className="diagnostics-choice">Optional. Sharing applies to {state.accountId === DIAGNOSTICS_GUEST ? 'this browser' : 'your signed-in sessions'} for 90 days. Builds and syncing work either way.</p>
      <button type="button" className="button button-primary" disabled={privacy || !state.ready || state.busy} onClick={()=>void share()}>{state.busy ? 'Saving…' : 'Share diagnostics'}</button>
    </>}
    {state.ready && (state.saved || state.error) && <button className="text-button" disabled={state.busy} onClick={()=>{if(state.accountId)rememberInvitationAnswer(state.accountId);void changeDiagnosticSharing(false)}}>Stop sharing and delete</button>}
    {state.notice && <p className="link-hint" role="status">{state.notice}</p>}
    {state.lastSent && <p className="link-hint" role="status">Last diagnostic received: {new Date(state.lastSent).toLocaleTimeString()}</p>}
    {privacy && <p className="link-hint">Your browser requests privacy, so automatic diagnostics stay off here.</p>}
    {state.error && <p className="file-error" role="alert">{state.error}</p>}
  </section>
}
type AdminDiagnostics = {events:DiagnosticEntry[];counts:{day:string;event:string;count:number}[];steps?:StepRow[]}
const STEP_NAMES: Record<string, string> = {base_guide_opened:'Guide openings, not people (one that opened by itself counts once per browser and base)',base_file_downloaded:'Base file downloaded',base_first_connection:'First connection on the base',base_usb_update_done:'USB base update done'}
export function OctatrackDiagnosticsAdmin() {
  const [data,setData] = useState<AdminDiagnostics>(),[error,setError]=useState('')
  async function load() { try {setData(await api('/admin/octatrack/diagnostics'));setError('')} catch(error) {setError(error instanceof Error?error.message:'Couldn’t read diagnostics.')} }
  useEffect(()=>{let cancelled=false;void api<AdminDiagnostics>('/admin/octatrack/diagnostics').then(value=>{if(!cancelled)setData(value)}).catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:'Couldn’t read diagnostics.')});return()=>{cancelled=true}},[])
  const steps = data?.steps ? stepTotals(data.steps) : undefined
  return <section className="configuration-section"><div className="section-title"><h2>Technical diagnostics</h2><button className="button button-quiet" onClick={()=>void load()}>Refresh</button></div>
    <p className="service-note">Private opt-in records from the last 30 days; newest 100 shown. A record is an observation, not a confirmed bug. Daily sync-action counts also include people who leave technical sharing off.</p>
    {steps && <details><summary>Base install and sharing, last 30 days (everyone, no identifiers)</summary>
      {steps.funnel.map(row=><p key={row.event}>{STEP_NAMES[row.event]}: {row.count}</p>)}
      <p>Failed: {steps.failures.length ? steps.failures.map(row=>row.detail+' '+row.count).join(' · ') : 'none'}</p>
      {steps.invitations.map(row=><p key={row.placement}>Invitation, {row.placement}: shown {row.shown} · shared {row.shared} · not now {row.notNow}{row.rate !== null && <> · {row.rate} % shared</>}</p>)}
    </details>}
    {data && <><details><summary>Daily sync counts</summary>{data.counts.map(row=><p key={row.day+row.event}>{row.day} · {row.event}: {row.count}</p>)}</details>{data.events.length ? data.events.map(entry=><details key={entry.eventId+entry.username}><summary>{entry.createdAt} · {entry.username?.startsWith('guest:') ? entry.username : '@'+entry.username} · {entry.data.event}</summary><pre className="diagnostic-json">{JSON.stringify(entry.data,null,2)}</pre></details>) : <p>No shared diagnostics yet.</p>}</>}
    {error && <p className="file-error" role="alert">{error}</p>}
  </section>
}

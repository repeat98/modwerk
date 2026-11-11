import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { changeDiagnosticSharing, diagnosticPreference, subscribeDiagnosticPreference } from '../community/octatrack-diagnostics'
import { diagnosticsStepNeeded, invitationAnswered, rememberInvitationAnswer } from '../community/diagnostics-sharing'
import { DIAGNOSTICS_GUEST, type DiagnosticInvitationOutcome, type DiagnosticInvitationPlacement } from '../community/octatrack-diagnostics-contract'
import { declinedThisVisit, declineForThisVisit, offerDiagnostics, pauseReask, unitBusy, pendingReask, REASK_REASONS, REASK_STALE_MS, reaskPaused, settleReask, subscribeReask } from '../community/diagnostics-reask'
import { browserRequestsPrivacy, countDiagnosticsInvitation } from '../community/usage'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { Icon } from './Icon'
import './diagnostics.css'

export function DiagnosticDetails() {
  return <details className="diagnostics-details"><summary>What gets shared</summary>
    <p>Browser failures are recorded as the type of error and the part of the site that was open. Build failures include the type of build and the stage that failed. No error messages, stack traces, file names or page addresses are sent.</p>
    <p>When you use Octatrack USB sync, reports can also include base and running-set hashes, package hashes and sizes, module IDs with this site’s catalogue versions, connection and sync events, self-test results, load readings and refusal codes. An older installed module may have a different version. While your Octatrack is connected, its CPU and DSP load are read every 30 seconds and sent every 5 minutes, before and after a sync, when it disconnects or you close the page, at once when the CPU goes above 90 %, and when the Octatrack stops answering.</p>
    <p>If connecting to your Octatrack fails, the report says why, as one of a few fixed reasons: this browser has no WebUSB, no Octatrack was chosen, access was denied, it couldn’t be opened, or another app was using it.</p>
    <p>The Octatrack also keeps a small log of its own, also while this site is closed: its load and whether it was playing, overloads, freezes and crashes, and at such a moment each track’s machine type and effects, playing or stopped, the tempo, the screen that was open and the last 16 keys pressed. The site sends that log the next time you connect.</p>
    <p>Every report except that log also names your browser with its main version and your operating system, such as Chrome 131 on Windows, never the full browser identification.</p>
    <p>No firmware, samples, audio, project, sample or set names, device serial numbers, raw memory or crash dumps. Reports use Modwerk’s Cloudflare service and aren’t posted to GitHub or shared with module authors. I may have an AI assistant (Anthropic’s Claude) help me read them; for that, they are sent to Anthropic.</p>
    <p>Consent is optional under GDPR Article 6(1)(a). You can stop sharing and delete reports under Setup in Your Octatrack. Signed in, your account data download includes them; without an account they are kept under a random ID stored in this browser. Reports are hidden after 30 days and deleted by hourly cleanup, with at most 1,000 entries per account or browser. <a href="#privacy" target="_blank" rel="noreferrer">Privacy and your rights</a>.</p>
    <p>Separate daily counts of sync actions, base install steps and answers to this invitation contain no account, device, module or session identifier. They last 30 days and follow your usage-count preference and browser privacy signals.</p>
  </details>
}

/** Counts each answer once, by placement, through the identifier-free path; previews count nothing. */
function useInvitationCounts(placement: DiagnosticInvitationPlacement | undefined, visible: boolean) {
  const counted = useRef(new Set<DiagnosticInvitationOutcome>())
  const count = (outcome: DiagnosticInvitationOutcome) => { if (placement && !counted.current.has(outcome)) { counted.current.add(outcome); countDiagnosticsInvitation(outcome, placement) } }
  useEffect(() => { if (visible) count('shown') }) // every render; the set counts it once
  return count
}

/** One explicit choice, separate from installation and sync. No collection is enabled by opening or dismissing it.
 * Share diagnostics is the main button (owner, 11 November 2026); Not now sits beside it, the same size, and closing it is Not now. `onClose(true)` after sharing.
 * `reason` opens it with what just failed; `placement` names where it was shown for the anonymous answer counts. */
export function DiagnosticsInvitation({onClose,preview=false,placement,reason}: {onClose:(shared?:boolean)=>void;preview?:boolean;placement?:DiagnosticInvitationPlacement;reason?:string}) {
  const state = useSyncExternalStore(subscribeDiagnosticPreference,diagnosticPreference,diagnosticPreference)
  const dialog = useRef<HTMLDialogElement>(null), live = useRef(true)
  const privacy = browserRequestsPrivacy(), guest = state.accountId === DIAGNOSTICS_GUEST
  const count = useInvitationCounts(preview ? undefined : placement, true)
  useEffect(()=>{
    live.current=true
    const previous=document.activeElement, element=dialog.current
    element?.showModal(); element?.querySelector('h2')?.focus()
    return ()=>{live.current=false;element?.close();if(previous instanceof HTMLElement && previous.isConnected)previous.focus()}
  },[])
  async function share() {
    if(preview){onClose();return}
    if(await changeDiagnosticSharing(true) && live.current){count('shared');onClose(true)}
  }
  function notNow() { if(!preview){count('not-now');declineForThisVisit(state.accountId)} onClose(false) }
  return <dialog ref={dialog} className="diagnostics-invitation" aria-labelledby="diagnostics-title" aria-describedby="diagnostics-intro" onCancel={event=>{event.preventDefault();notNow()}}>
    <button type="button" className="icon-button diagnostics-close" aria-label="Close diagnostics invitation" onClick={notNow}><Icon name="close"/></button>
    <div className="diagnostics-heading-icon" aria-hidden="true"><Icon name="wave" size={24}/></div>
    <h2 id="diagnostics-title" tabIndex={-1}>Help us find bugs</h2>
    {preview && <p className="diagnostics-preview">Preview · no data is shared</p>}
    <p id="diagnostics-intro" className="diagnostics-intro">{reason ?? 'If a build or sync fails, a technical report helps us see where it went wrong and fix the problem.'}</p>
    <ul className="diagnostics-facts">
      <li><Icon name="search" size={19}/><div><strong>What went wrong</strong><p>Browser and build failure categories, why a connection failed, your browser and system, plus sync results, load, freezes and what your Octatrack was doing at the time.</p></div></li>
      <li><Icon name="lock" size={19}/><div><strong>Private, for 30 days</strong><p>{guest ? 'Reports are kept under a random ID stored in this browser, not under your name, and only site administrators can read them.' : 'Reports are linked to your account and visible only to you and site administrators.'}</p></div></li>
    </ul>
    <p className="diagnostics-connected">Using your Octatrack over USB? Keep this page open and your Octatrack connected so we can receive a report if something fails.</p>
    <DiagnosticDetails/>
    <p className="diagnostics-choice">Optional. Sharing applies to {guest ? 'this browser' : 'your signed-in sessions'} for 90 days. You can turn it off and delete reports under Setup in Your Octatrack anytime. Builds and syncing work either way.</p>
    {privacy && <p className="diagnostics-choice" role="status">Your browser requests privacy, so automatic diagnostics stay off here.</p>}
    {!preview && state.error && <p className="file-error" role="alert">{state.error}</p>}
    <footer className="diagnostics-actions"><button type="button" className="button button-quiet" onClick={notNow}>Not now</button><button type="button" className="button button-primary" disabled={privacy || !preview && (!state.ready || state.busy)} onClick={()=>void share()}>{state.busy && !preview ? 'Saving…' : 'Share diagnostics'}</button></footer>
  </dialog>
}

/** The base install guide's last step (BaseInstallDialog's `diagnosticsStep`): why a report helps, what is and is never
 * sent, and one free choice. Share diagnostics is the main button, Not now beside it the same size; both finish it (`onDone`); the guide's
 * Continue waits for one of them. Renders nothing for a member who already shares under the current consent version, or
 * where sharing isn't possible. */
export function DiagnosticsGuideStep({onDone}: {onDone?: (shared: boolean) => void}) {
  const state = useSyncExternalStore(subscribeDiagnosticPreference,diagnosticPreference,diagnosticPreference)
  const [answer,setAnswer] = useState<'shared' | 'not-now'>()
  const offer = !answer && diagnosticsStepNeeded(state), live = useRef(true)
  const count = useInvitationCounts('guide', offer)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  async function share() {
    if (!await changeDiagnosticSharing(true) || !live.current) return
    count('shared'); setAnswer('shared'); onDone?.(true)
  }
  // Not now here answers the first-connection invitation too, so it doesn't follow the guide.
  function notNow() { count('not-now'); declineForThisVisit(state.accountId); if (state.accountId) rememberInvitationAnswer(state.accountId); setAnswer('not-now'); onDone?.(false) }
  if (answer) return <section className="diagnostics-step" aria-label="Diagnostics"><p role="status">{answer === 'shared' ? 'Thanks. Diagnostics sharing is on.' : 'Nothing is shared. You can turn diagnostics on any time under Setup in Your Octatrack.'}</p></section>
  if (!offer) return null
  return <section className="diagnostics-step" aria-labelledby="diagnostics-step-title">
    <div className="diagnostics-heading-icon" aria-hidden="true"><Icon name="wave" size={24}/></div>
    <h3 id="diagnostics-step-title">Help make this work on every Octatrack</h3>
    <p className="diagnostics-step-lead">Modules over USB are new, and every Octatrack setup is different. If something goes wrong on yours, a diagnostics report shows us what happened, so it gets fixed for you and for everyone else.</p>
    <ul className="diagnostics-facts">
      <li><Icon name="search" size={19}/><div><strong>Technical readings only</strong><p>Sync results, CPU and DSP load, freezes and crashes with what your Octatrack was doing at that moment, your browser and system.</p></div></li>
      <li><Icon name="lock" size={19}/><div><strong>Never your music</strong><p>No samples, audio, projects or their names, no firmware and no serial number. Reports are private and hidden after 30 days.</p></div></li>
      <li><Icon name="check" size={19}/><div><strong>Yours to switch off</strong><p>Stop sharing and delete your reports any time under Setup in Your Octatrack. Everything works either way.</p></div></li>
    </ul>
    <DiagnosticDetails/>
    <p className="diagnostics-choice">Optional. Sharing applies to {state.accountId === DIAGNOSTICS_GUEST ? 'this browser, under a random ID kept here instead of an account,' : 'your signed-in sessions'} for 90 days.</p>
    {state.error && <p className="file-error" role="alert">{state.error}</p>}
    <div className="diagnostics-step-actions"><button type="button" className="button button-quiet" onClick={notNow}>Not now</button><button type="button" className="button button-primary" disabled={!state.ready || state.busy} onClick={()=>void share()}>{state.busy ? 'Saving…' : 'Share diagnostics'}</button></div>
  </section>
}

/** Invite after the first compatible USB connection of the member, or of the visitor (`memberId` DIAGNOSTICS_GUEST), and any current dialog. Dismissal remains account/version scoped.
 * It also asks once more after a failure (diagnostics-reask.ts): a failed sync or self-test and a unit that started its
 * previous base are seen here; other places call offerDiagnostics. That question waits until nothing runs on the unit
 * and no other dialog is open (at most REASK_STALE_MS), and isn't asked while sharing, after turning sharing off under
 * the current text, under browser privacy, after any Not now on this page or within REASK_PAUSE_DAYS of a Not now to it. */
export function DiagnosticsInvitationGate({memberId,link,eligible,blocked=false,preview=false}:{memberId:string;link:OctatrackLink|null;eligible:boolean;blocked?:boolean;preview?:boolean}) {
  const state=useSyncExternalStore(subscribeDiagnosticPreference,diagnosticPreference,diagnosticPreference)
  const connection=useOctatrackLink(link), connected=connection.status==='ready' && !!connection.identity?.canSubmit
  const [connectedFor,setConnectedFor]=useState<string>(), [openFor,setOpenFor]=useState<string>(), skipped=useRef<string>(undefined)
  const reask=useSyncExternalStore(subscribeReask,pendingReask,pendingReask), [asking,setAsking]=useState<string>(), askingNow=!!asking && reask?.key===asking
  if(connected && connectedFor!==memberId)setConnectedFor(memberId)
  const afterConnection=preview || connectedFor===memberId
  const possible=preview || state.accountId===memberId && state.available && !state.hasChoice && !state.enabled && !browserRequestsPrivacy()
  useEffect(()=>{
    if(!afterConnection || !eligible || blocked || !possible || skipped.current===memberId || askingNow)return
    const invite=()=>{if(skipped.current!==memberId && (preview || !invitationAnswered(memberId) && !declinedThisVisit(memberId)) && !document.querySelector('dialog[open]'))setOpenFor(memberId)}
    invite()
    const observer=new MutationObserver(invite)
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']})
    window.addEventListener('storage',invite)
    return ()=>{observer.disconnect();window.removeEventListener('storage',invite)}
  },[memberId,afterConnection,eligible,blocked,possible,preview,askingNow])
  // What the link shows on its own: a failed sync (not one the member cancelled), a failed self-test, a fallback start.
  useEffect(()=>{
    if(!link || preview)return
    const stopEvents=link.subscribeDiagnostics(event=>{
      if(event.event==='sync_failed' && event.error!=='cancelled')offerDiagnostics('sync-failed')
      else if(event.event==='selftest' && event.reading?.state===3)offerDiagnostics('selftest-failed','selftest:'+(event.active ?? event.base ?? ''))
    })
    const fellBack=()=>{const now=link.getState();if(now.slots?.fellBack && now.identity)offerDiagnostics('recovery','recovery:'+now.identity.base)}
    fellBack()
    const stopState=link.subscribe(fellBack)
    return ()=>{stopEvents();stopState()}
  },[link,preview])
  const running=unitBusy(connection)
  // A member who turned sharing off under the current text (hasChoice) made that choice: not asked again.
  const knownNo=state.accountId===memberId && state.ready && (state.enabled || state.hasChoice || !state.available) || browserRequestsPrivacy() || declinedThisVisit(memberId) || reaskPaused(memberId)
  useEffect(()=>{
    if(!reask || asking===reask.key || preview)return
    if(knownNo || Date.now()-reask.at>REASK_STALE_MS){settleReask();return}
    if(!eligible || blocked || running || state.accountId!==memberId || !state.ready || openFor===memberId)return
    const ask=()=>{if(!document.querySelector('dialog[open]'))setAsking(reask.key)}
    ask()
    const observer=new MutationObserver(ask)
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']})
    return ()=>observer.disconnect()
  },[reask,asking,knownNo,eligible,blocked,running,memberId,state.accountId,state.ready,openFor,preview])
  function close(){skipped.current=memberId;setOpenFor(undefined);if(!preview)rememberInvitationAnswer(memberId)}
  function answered(shared?:boolean){if(!shared)pauseReask(memberId);skipped.current=memberId;rememberInvitationAnswer(memberId);setAsking(undefined);settleReask()}
  if(askingNow && reask)return <DiagnosticsInvitation placement="after-failure" reason={REASK_REASONS[reask.reason]} onClose={answered}/>
  return openFor===memberId && afterConnection && eligible && !blocked && possible ? <DiagnosticsInvitation preview={preview} placement="hub" onClose={close}/> : null
}

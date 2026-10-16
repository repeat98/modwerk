import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { changeDiagnosticSharing, diagnosticPreference, subscribeDiagnosticPreference } from '../community/octatrack-diagnostics'
import { OCTATRACK_DIAGNOSTICS_VERSION } from '../community/octatrack-diagnostics-contract'
import { browserRequestsPrivacy } from '../community/usage'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { Icon } from './Icon'
import './diagnostics.css'

export function DiagnosticDetails() {
  return <details className="diagnostics-details"><summary>What gets shared</summary>
    <p>Browser failures are recorded as the type of error and the part of the site that was open. Build failures include the type of build and the stage that failed. No error messages, stack traces, file names or page addresses are sent.</p>
    <p>When you use Octatrack USB sync, reports can also include base and running-set hashes, package hashes and sizes, module IDs with this site’s catalogue versions, connection and sync events, self-test results, load readings and refusal codes. An older installed module may have a different version. While your Octatrack is connected, its CPU and DSP load are read every 30 seconds and sent every 5 minutes, before and after a sync, when it disconnects or you close the page, at once when the CPU goes above 90 %, and when the Octatrack stops answering.</p>
    <p>The Octatrack also keeps a small log of its own, also while this site is closed: its load and whether it was playing, overloads, freezes and crashes, and at such a moment each track’s machine type and effects, playing or stopped, the tempo, the screen that was open and the last 16 keys pressed. The site sends that log the next time you connect.</p>
    <p>No firmware, samples, audio, project, sample or set names, device serial numbers, raw memory or crash dumps. Reports use Modwerk’s Cloudflare service and aren’t posted to GitHub or shared with module authors. I may have an AI assistant (Anthropic’s Claude) help me read them; for that, they are sent to Anthropic.</p>
    <p>Consent is optional under GDPR Article 6(1)(a). You can stop sharing and delete reports in Account → Diagnostics. Your account data download includes them. Reports are hidden after 30 days and deleted by hourly cleanup, with at most 1,000 entries per account. <a href="#privacy" target="_blank" rel="noreferrer">Privacy and your rights</a>.</p>
    <p>Separate daily sync-action counts contain no account, device, module or session identifier. They last 30 days and follow your usage-count preference and browser privacy signals.</p>
  </details>
}

/** One explicit choice, separate from installation and sync. No collection is enabled by opening or dismissing it.
 * With `onLeave` it is the beta's requirement: the only other way out is leaving the beta. */
export function DiagnosticsInvitation({onClose,onLeave,preview=false}: {onClose:()=>void;onLeave?:()=>void;preview?:boolean}) {
  const state = useSyncExternalStore(subscribeDiagnosticPreference,diagnosticPreference,diagnosticPreference)
  const dialog = useRef<HTMLDialogElement>(null), live = useRef(true)
  const privacy = browserRequestsPrivacy()
  useEffect(()=>{
    live.current=true
    const previous=document.activeElement, element=dialog.current
    element?.showModal(); element?.querySelector('h2')?.focus()
    return ()=>{live.current=false;element?.close();if(previous instanceof HTMLElement && previous.isConnected)previous.focus()}
  },[])
  async function share() {
    if(preview){onClose();return}
    if(await changeDiagnosticSharing(true) && live.current)onClose()
  }
  return <dialog ref={dialog} className="diagnostics-invitation" aria-labelledby="diagnostics-title" aria-describedby="diagnostics-intro" onCancel={event=>{event.preventDefault();if(!onLeave)onClose()}}>
    {!onLeave && <button type="button" className="icon-button diagnostics-close" aria-label="Close diagnostics invitation" onClick={onClose}><Icon name="close"/></button>}
    <div className="diagnostics-heading-icon" aria-hidden="true"><Icon name="wave" size={24}/></div>
    <h2 id="diagnostics-title" tabIndex={-1}>Help us find bugs</h2>
    {preview && <p className="diagnostics-preview">Preview · no data is shared</p>}
    <p id="diagnostics-intro" className="diagnostics-intro">If a build or sync fails, a technical report helps us see where it went wrong and fix the problem.</p>
    <ul className="diagnostics-facts">
      <li><Icon name="search" size={19}/><div><strong>What went wrong</strong><p>Browser and build failure categories, plus sync results, load, freezes and what your Octatrack was doing at the time.</p></div></li>
      <li><Icon name="lock" size={19}/><div><strong>Private, for 30 days</strong><p>Reports are linked to your account and visible only to you and site administrators.</p></div></li>
    </ul>
    <p className="diagnostics-connected">Trying the Octatrack beta? Keep this page open and your Octatrack connected so we can receive a report if something fails.</p>
    <DiagnosticDetails/>
    <p className="diagnostics-choice">{onLeave ? 'Needed for the beta – the rest of the site works without it.' : 'Optional.'} Sharing applies to your signed-in sessions for 90 days. You can turn it off and delete reports in Account → Diagnostics anytime.{!onLeave && ' Builds and syncing work either way.'}</p>
    {privacy && <p className="diagnostics-choice" role="status">Your browser requests privacy, so automatic diagnostics stay off here.</p>}
    {!preview && state.error && <p className="file-error" role="alert">{state.error}</p>}
    <footer className="diagnostics-actions"><button type="button" className="button button-quiet" onClick={onLeave ?? onClose}>{onLeave ? 'Leave beta' : 'Not now'}</button><button type="button" className="button button-primary" disabled={privacy || !preview && (!state.ready || state.busy)} onClick={()=>void share()}>{state.busy && !preview ? 'Saving…' : 'Share diagnostics'}</button></footer>
  </dialog>
}

const invitationKey=(memberId:string)=>`modwerk.diagnostics.invitation:${OCTATRACK_DIAGNOSTICS_VERSION}:${memberId}`
function dismissed(memberId:string){try{return localStorage.getItem(invitationKey(memberId))==='dismissed'}catch{return false}}
/** Invite after the account's first compatible USB connection and any current dialog. Dismissal remains account/version scoped. */
export function DiagnosticsInvitationGate({memberId,link,eligible,blocked=false,preview=false}:{memberId:string;link:OctatrackLink|null;eligible:boolean;blocked?:boolean;preview?:boolean}) {
  const state=useSyncExternalStore(subscribeDiagnosticPreference,diagnosticPreference,diagnosticPreference)
  const connection=useOctatrackLink(link), connected=connection.status==='ready' && !!connection.identity?.canSubmit
  const [connectedFor,setConnectedFor]=useState<string>(), [openFor,setOpenFor]=useState<string>(), skipped=useRef<string>(undefined)
  if(connected && connectedFor!==memberId)setConnectedFor(memberId)
  const afterConnection=preview || connectedFor===memberId
  const possible=preview || state.accountId===memberId && state.available && !state.hasChoice && !state.enabled && !browserRequestsPrivacy()
  useEffect(()=>{
    if(!afterConnection || !eligible || blocked || !possible || skipped.current===memberId)return
    const invite=()=>{if(skipped.current!==memberId && (preview || !dismissed(memberId)) && !document.querySelector('dialog[open]'))setOpenFor(memberId)}
    invite()
    const observer=new MutationObserver(invite)
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']})
    window.addEventListener('storage',invite)
    return ()=>{observer.disconnect();window.removeEventListener('storage',invite)}
  },[memberId,afterConnection,eligible,blocked,possible,preview])
  function close(){skipped.current=memberId;setOpenFor(undefined);if(!preview)try{localStorage.setItem(invitationKey(memberId),'dismissed')}catch{/* still dismissed for this visit */}}
  return openFor===memberId && afterConnection && eligible && !blocked && possible ? <DiagnosticsInvitation preview={preview} onClose={close}/> : null
}

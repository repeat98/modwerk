import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { Icon } from './Icon'
import { DiagnosticsInvitation } from './DiagnosticsInvitation'
import { assetUrl } from '../hosting'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { api, post } from '../community/api'
import { useCommunity } from '../community/context'
import { diagnosticPreference, subscribeDiagnosticPreference, type DiagnosticPreference } from '../community/octatrack-diagnostics'
import { browserRequestsPrivacy } from '../community/usage'
import { invitationAnswered, rememberInvitationAnswer } from '../community/diagnostics-sharing'
import { OCTATRACK_BASE_RELEASED } from '../config/octatrack-base'
import { mayAsk } from '../community/diagnostics-reask'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'

// A new note needs a new id here and in server/auth.ts (OWNER_NOTE).
const KEY = 'modwerk.owner-note:2026-10-16-beta-3'
const WAIT = 15
let closedThisVisit = false
export function ownerNoteSeen() {
  if (closedThisVisit) return true
  try { return localStorage.getItem(KEY) === 'seen' } catch { return false }
}
export function closeOwnerNote() {
  closedThisVisit = true
  try { localStorage.setItem(KEY, 'seen') } catch { /* Stays closed for this visit when storage is blocked. */ }
}
/** The diagnostics step follows the note, even if the invitation was dismissed before, unless sharing is already on or
 * impossible here. It is an offer with Not now, never a condition of the beta or of the Octatrack base path. */
export const askForDiagnostics = (preference: DiagnosticPreference, privacy: boolean) => preference.available && !preference.enabled && !privacy
/** A tester past the note whose consent predates the current version (#657 reset everyone's) shares nothing until asked again.
 * One who turned sharing off under the current version made that choice; it isn't asked here. */
export const diagnosticsLapsed = (preference: DiagnosticPreference, memberId: string, privacy: boolean) =>
  preference.accountId === memberId && preference.ready && !preference.hasChoice && askForDiagnostics(preference, privacy)

/** What leaving the beta takes away: beta modules and beta-only pages, and, until the Octatrack base path is released
 * to everyone (OCTATRACK_BASE_RELEASED), that path too. */
export const leaveBeta = (released = OCTATRACK_BASE_RELEASED) => released
  ? 'Leave the beta? Beta modules and the beta-only pages go away for your account. Your Octatrack page, the base and USB sync stay. If you want back in later, just ask me on Discord.'
  : 'Leave the beta? The beta modules and the Octatrack USB page go away for your account. If you want back in later, just ask me on Discord.'

export function OwnerNote({ username, onJoin, onLeave }: { username: string; onJoin: () => void; onLeave: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), open = useRef(false), [wait, setWait] = useState(WAIT), [accepted, setAccepted] = useState(false)
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    open.current = true; element?.showModal(); element?.querySelector('h2')?.focus()
    return () => { open.current = false; element?.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus() }
  }, [])
  useEffect(() => {
    if (!wait) return
    const timer = window.setTimeout(() => setWait(wait - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  // The note stays up for a few seconds so it gets read, and then only closes through Leave beta or, once accepted, Join Discord.
  // Chrome closes a modal on a second Escape (or Android's back) even when the first one was cancelled, so it opens again.
  const locked = !!wait || !accepted
  // A middle click opens Discord too, so it counts as the same choice.
  const join = (event: MouseEvent) => { if (locked) event.preventDefault(); else onJoin() }
  return <dialog ref={dialog} className="app-dialog owner-note" aria-labelledby="owner-note-title" aria-describedby="owner-note-message" onCancel={event => event.preventDefault()} onClose={event => { const element = event.currentTarget; if (open.current && element.isConnected && !element.open) element.showModal() }}>
    <header className="owner-note-head"><img src={assetUrl('modwerk-mark.svg')} width={28} height={28} alt="" /><span>Modwerk beta</span></header>
    <div className="owner-note-body">
      <h2 id="owner-note-title" tabIndex={-1}>Hey guys, please read this before you flash</h2>
      <div id="owner-note-message">
        <p>thanks a lot for testing the beta! Even if you've seen my last note, please read this one carefully. It stays open until you choose: <strong>accept it and join us on Discord</strong>, or <strong>leave the beta</strong>.</p>
        <p className="owner-note-warning"><Icon name="warn" size={18} /><span><strong>Don't install the Modwerk base unless you can recover without USB.</strong> A tester reported that after installing the base, their Octatrack no longer connected over USB: USB DISK MODE did nothing and Chrome found no device. Without USB you can't reach the card from your computer, so before you install it, have a <strong>CompactFlash card reader</strong> to put the original OS on the card, or a <strong>MIDI interface</strong> to send Elektron's original OS .syx through the startup menu. Keep the original OS 1.40C .bin and .syx on your computer. <a href="#faq" target="_blank" rel="noreferrer">Recovery steps in the FAQ</a></span></p>
        <ul className="owner-note-asks">
          <li><strong>Be on Discord and stay active there</strong> – report bugs in beta modules and beta pages only in the <strong>#beta-testers</strong> channel, right when you run into them. <strong>Please don't use the report forms on this site</strong> for those: I follow beta bugs on Discord only.</li>
          <li><strong>Use the same name on Discord as here</strong> (<strong>@{username}</strong>) – so I know who's who.</li>
          <li><strong>Share diagnostics if you can</strong> – I'll ask you right after this note. It's optional, and it helps me see where a build or sync went wrong.</li>
        </ul>
        <p>The beta is limited to 50 people, so if you're not active on Discord, I'll pass your place on to someone else. Beta modules are still <strong>highly experimental</strong>.</p>
        <p>If this doesn't work for you, you can leave the beta below.</p>
        <p className="owner-note-sign">Thank you,<br /><strong>Jannik</strong></p>
      </div>
      <label className="risk-accept owner-note-accept"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I've read this. I won't install the Modwerk base without a CompactFlash card reader or a MIDI interface at hand. I'll join #beta-testers on Discord, stay active there and report beta bugs only there, not on this site.</span></label>
    </div>
    <footer className="owner-note-actions">
      <button type="button" className="owner-note-close" disabled={!!wait} onClick={onLeave}>Leave beta</button>
      <a className="button button-primary" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-disabled={locked} onClick={join} onAuxClick={event => { if (event.button === 1) join(event) }} aria-label="Accept and join Discord (opens in a new tab)"><img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" />{wait ? `Accept & join Discord (${wait})` : 'Accept & join Discord'}</a>
    </footer>
  </dialog>
}

/** Beta testers only (App.tsx), on every device until they accept the note and join Discord, or leave the beta.
 * It can't be put off: it opens on top of any other dialog as soon as the tab is visible, on every page but the FAQ, the account and the legal pages.
 * The diagnostics step follows as an offer (Not now, no Leave beta); after a new consent version it is offered once more,
 * without the note, as the ordinary invitation: a Not now to it, or to the invitation anywhere else, is remembered in this
 * browser (invitationAnswered). That offer waits, as the welcome and the re-ask do, while another dialog is open or
 * something runs on the unit (`link`): a lapsed consent and a due base update come on the same visit. Nothing on the
 * site depends on the answer. */
export function OwnerNoteGate({ enabled, link = null }: { enabled: boolean; link?: OctatrackLink | null }) {
  const { session, refresh } = useCommunity(), memberId = session.user!.id
  const [step, setStep] = useState<'note' | 'diagnostics'>(), [serverDue, setServerDue] = useState<boolean>()
  useEffect(() => {
    if (ownerNoteSeen()) return
    const controller = new AbortController()
    // A Worker without this note yet falls back to this browser's marker.
    void api<{ show: boolean }>('/auth/owner-note', { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setServerDue(result.show) }).catch(() => { if (!controller.signal.aborted) setServerDue(true) })
    return () => controller.abort()
  }, [memberId])
  const preference = useSyncExternalStore(subscribeDiagnosticPreference, diagnosticPreference, diagnosticPreference)
  const due = serverDue === true && !ownerNoteSeen()
  // Not now ends the offer for this visit, so it never comes back every second.
  const [declined, setDeclined] = useState(false)
  const lapsed = !due && !declined && (ownerNoteSeen() || serverDue === false) && diagnosticsLapsed(preference, memberId, browserRequestsPrivacy()) && !invitationAnswered(memberId)
  useEffect(() => {
    if (!enabled || step || !due && !lapsed) return
    // The note opens over anything; the offer alone waits its turn (mayAsk).
    const show = () => { if (due ? document.visibilityState === 'visible' : mayAsk(link?.getState())) setStep(due ? 'note' : 'diagnostics') }
    show()
    const timer = window.setInterval(show, 1000)
    return () => window.clearInterval(timer)
  }, [enabled, step, due, lapsed, link])
  const done = () => setStep(undefined)
  async function leave() {
    if (!window.confirm(leaveBeta())) return
    try { await post('/auth/beta-leave', {}) } catch (failure) { window.alert(failure instanceof Error ? failure.message : 'Couldn’t leave the beta. Please try again.'); return }
    setStep(undefined); await refresh()
  }
  if (step === 'diagnostics') return <DiagnosticsInvitation onClose={shared => { if (!shared) rememberInvitationAnswer(memberId); setDeclined(true); done() }} />
  return step === 'note' ? <OwnerNote username={session.user!.username!} onLeave={() => void leave()} onJoin={() => {
    // Accepting is recorded at once: a reload or a failed share before diagnostics are on brings back only the diagnostics step (lapsed), never the note.
    closeOwnerNote(); void post('/auth/owner-note', {}).catch(() => {}); void post('/auth/beta-discord-invite', {}).catch(() => {})
    if (askForDiagnostics(diagnosticPreference(), browserRequestsPrivacy())) setStep('diagnostics'); else done()
  }} /> : null
}

/** Dev preview (?preview=beta-note): the note, then the diagnostics offer. Nothing is sent. */
export function OwnerNotePreview() {
  const [step, setStep] = useState<'note' | 'diagnostics'>('note'), [closed, setClosed] = useState(false)
  if (closed) return null
  return step === 'note' ? <OwnerNote username="yourname" onJoin={() => setStep('diagnostics')} onLeave={() => setClosed(true)} /> : <DiagnosticsInvitation preview onClose={() => setClosed(true)} />
}

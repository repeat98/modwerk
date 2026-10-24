import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { LinkHero } from './LinkHero'
import { api, post } from '../community/api'
import { useCommunity } from '../community/context'
import { accountHref } from '../community/member-access'
import { BETA_RISKS_VERSION, BETA_TESTER_LIMIT, betaInvitationRoute } from '../config/beta-invitation'
import { FLASHING_RISKS, INDEPENDENCE_NOTICE } from '../firmware-notices'

// shortcut: one key per public round, so "Not now" lasts for this round only; a later round needs a new key.
const KEY = 'modwerk.beta-join:2026-10-24'
const ROUTE = betaInvitationRoute('public')
// What a tester signs up for. Diagnostics and Discord are then asked for by the beta note (OwnerNote.tsx), and the USB install guide follows it.
const ASKS: [IconName, string, string][] = [
  ['arrow', 'Load modules over USB', 'Install the Modwerk base once from the card, then send modules from this page over USB, not as card firmware. That’s what the beta tests.'],
  ['shield', 'Turn on diagnostics', 'The beta needs them: they show where a build or sync went wrong. You’re asked right after joining.'],
  ['message', 'Report bugs on Discord', 'In #beta-testers, under the same name as here.'],
  ['warn', 'Have a way back', 'A CompactFlash card reader, and ideally a MIDI interface, to restore the original OS if USB stops working.'],
]

function betaJoinDismissed() {
  try { return localStorage.getItem(KEY) === 'dismissed' } catch { return false }
}

/** Members and visitors without beta access, on a computer (App.tsx), while an administrator keeps the public round open
 * and places are left. It waits until the tab is visible and no other dialog is open. Once someone joins, the session
 * gives them beta access, App drops this prompt and the beta note takes over. */
export function BetaJoinPrompt() {
  const { session, refresh } = useCommunity()
  const dialog = useRef<HTMLDialogElement>(null)
  const [places, setPlaces] = useState(0), [open, setOpen] = useState(false), [accepted, setAccepted] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const user = session.user, verified = !!(user?.verified && user.username), usb = typeof navigator !== 'undefined' && 'usb' in navigator
  useEffect(() => {
    if (betaJoinDismissed()) return
    const controller = new AbortController()
    void api<{ placesLeft: number }>('/auth/beta-join', { signal: controller.signal }).then(async ({ placesLeft }) => {
      // A member whose earlier invitation was used or revoked can't join this way, so they aren't asked.
      if (placesLeft && verified) placesLeft = (await api<{ status: string }>('/auth/beta-invitations/public', { signal: controller.signal })).status === 'pending' ? placesLeft : 0
      if (!controller.signal.aborted) setPlaces(placesLeft)
    }).catch(() => {})
    return () => controller.abort()
  }, [verified, user?.id])
  useEffect(() => {
    if (!places || open) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) setOpen(true) }, 1500)
    return () => window.clearInterval(timer)
  }, [places, open])
  useEffect(() => {
    const element = dialog.current
    if (!open || !element) return
    element.showModal(); element.querySelector('h2')?.focus()
    return () => element.close()
  }, [open])
  function later() {
    try { localStorage.setItem(KEY, 'dismissed') } catch { /* Closed for this visit when storage is blocked. */ }
    setOpen(false); setPlaces(0)
  }
  async function join() {
    if (!accepted || busy) return
    setBusy(true); setError('')
    try {
      await post('/auth/beta-invitations/public', { acceptRisks: true, risksVersion: BETA_RISKS_VERSION })
      await refresh()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Couldn’t join the beta. Please try again.') }
    finally { setBusy(false) }
  }
  if (!open) return null
  return <dialog ref={dialog} className="base-install-dialog beta-join" aria-labelledby="beta-join-title" aria-describedby="beta-join-intro" onCancel={event => { event.preventDefault(); later() }}>
    <button type="button" className="icon-button base-install-close" aria-label="Close" onClick={later}><Icon name="close" size={18} /></button>
    <LinkHero />
    <h2 id="beta-join-title" className="link-title" tabIndex={-1}>The beta is open for new testers <span className="module-beta-badge">Beta</span></h2>
    <p id="beta-join-intro" className="base-install-intro">Beta testers send modules from this page to their Octatrack over USB and try new modules first. It’s open to new testers for a short time, while places last.</p>
    <ul className="link-promises">{ASKS.map(([icon, lead, rest]) => <li key={lead}><span className="link-feature-icon" aria-hidden="true"><Icon name={icon} size={18} /></span><span><strong>{lead}</strong> {rest}</span></li>)}</ul>
    <p className={'link-needs' + (usb ? '' : ' is-missing')}>You need an Octatrack MKII, your OS 1.40C file, a USB cable and Chrome or Edge on a computer.</p>
    {!usb ? <p className="file-error" role="alert">The beta runs over USB, which this browser can’t do. Open Modwerk in Chrome or Edge on a computer to join.</p>
      : !user ? <p className="base-install-note">Sign in or create an account to join.</p>
      : !verified ? <p className="base-install-note">Verify your email and choose a username in your account first.</p>
      : <>
        <p className="link-needs">Beta features are experimental: expect bugs. {FLASHING_RISKS} Back up your projects and samples first. {INDEPENDENCE_NOTICE}</p>
        <label className="risk-accept"><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} /><span>I’ll load modules over USB, turn on diagnostics and report bugs in #beta-testers. I understand the risks.</span></label>
      </>}
    {error && <p className="file-error" role="alert">{error}</p>}
    <footer className="base-install-footer">
      <p className="link-hint">{places} of {BETA_TESTER_LIMIT} places left</p>
      <div className="base-install-actions">
        <button type="button" className="button button-quiet" onClick={later}>Not now</button>
        {usb && (!user ? <>
          <a className="button button-quiet" href={accountHref('login', ROUTE)}>Sign in</a>
          {session.registrationAvailable && <a className="button button-primary" href={accountHref('register', ROUTE)}>Create account</a>}
        </> : !verified ? <a className="button button-primary" href="#account">Open account</a>
          : <button type="button" className="button button-primary" disabled={!accepted || busy} onClick={() => void join()}>{busy ? 'Joining…' : 'Join the beta'}</button>)}
      </div>
    </footer>
  </dialog>
}

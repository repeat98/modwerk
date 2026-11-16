import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { assetUrl } from '../hosting'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { api, post } from '../community/api'
import { useCommunity } from '../community/context'
import { pageBusy } from '../community/public-announcement'
import { issueRepository } from '../community/report-context'

import { OWNER_STATEMENT_KEY as KEY } from '../config/owner-statement'

/** Seconds the page must stay free of other dialogs, menus and typing before the statement opens. */
const SETTLE = 3
let closedThisVisit = false
function ownerStatementSeen() {
  if (closedThisVisit) return true
  try { return localStorage.getItem(KEY) === 'seen' } catch { return false }
}
function rememberOwnerStatement() {
  try { localStorage.setItem(KEY, 'seen') } catch { closedThisVisit = true /* Stays closed for this visit when storage is blocked. */ }
}

const FIGURES = [
  ['700+', 'pull requests merged last month'],
  ['2', 'people reviewing and merging'],
  ['18', 'waiting as I write this'],
] as const
const ASKS = [
  ['Review pull requests', 'Modules, base work, site and SDK fixes. Check them against the guidelines, the checks and the hardware evidence, and tell authors what’s missing.'],
  ['Merge what’s ready', 'So a good module doesn’t sit around for days.'],
  ['Look after one area, if you like', 'One machine, the Octatrack base, the site.'],
] as const

/** Jannik's statement on where Modwerk stands. Closing it in any way (Close, Escape, Discord) counts as read. */
export function OwnerStatement({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal(); element?.querySelector('h2')?.focus()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus() }
  }, [])
  return <dialog ref={dialog} className="app-dialog owner-note owner-statement" aria-labelledby="owner-statement-title" aria-describedby="owner-statement-lead" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="owner-note-head"><img src={assetUrl('modwerk-mark.svg')} width={28} height={28} alt="" /><span>A note from Jannik · <time dateTime="2026-11-16">16 November</time></span>
      <button type="button" className="icon-button" aria-label="Close the note" onClick={onClose}><Icon name="close" size={17} /></button>
    </header>
    <div className="owner-note-body owner-statement-body">
      <h2 id="owner-statement-title" tabIndex={-1}>The future of Modwerk is still uncertain</h2>
      <p id="owner-statement-lead" className="owner-statement-lead">I need your help, and I want to be honest about where Modwerk stands: right now it hangs on a thin thread.</p>

      <ul className="owner-statement-figures" aria-label="Modwerk’s pull requests in numbers">
        {FIGURES.map(([value, label]) => <li key={label}><strong>{value}</strong><span>{label}</span></li>)}
      </ul>

      <section aria-labelledby="owner-statement-reviewers">
        <h3 id="owner-statement-reviewers">700 pull requests, two reviewers</h3>
        <p>That’s your work, and I want to say thank you to everyone who contributes to Modwerk. It’s amazing what we’ve built together so far.</p>
        <p>But nearly every one of those pull requests was reviewed and merged by just two people. If one of us is away for a week, the queue piles up; if both of us are, everything stops.</p>
        <p>AI helps writing code, but somebody still has to review and test everything before it ends up on your device. With two people, that doesn’t scale.</p>
      </section>

      <section aria-labelledby="owner-statement-same">
        <h3 id="owner-statement-same">Everyone building the same thing</h3>
        <p>For about a month we’ve been testing two things in the beta: modules that go onto your instrument over USB, and DSP effects that load only when a track uses them.</p>
        <p>Other projects have now started doing the same: loading modules over USB and putting DSP code on the chip only when it’s needed. Ideas are free – that’s literally in our <a href="#modding-guidelines">guidelines</a> – and it’s good to see the approach works. But it’s a shame to see everyone build the same thing side by side instead of together. Every hour spent rebuilding what already works here is an hour nobody spends on the next machine.</p>
      </section>

      <section aria-labelledby="owner-statement-ask">
        <h3 id="owner-statement-ask">What I’m asking for</h3>
        <p>I’m urgently looking for more maintainers who review and merge code:</p>
        <ol className="owner-statement-asks">
          {ASKS.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
        </ol>
        <p>If you’ve built or reviewed a module, or know an instrument really well, you’re who I’m looking for. A few hours a week already helps a lot.</p>
      </section>

      <aside className="owner-statement-callout" aria-label="For other projects">
        <strong>Working on mods, USB loading or DSP for Elektron gear somewhere else?</strong>
        <p>Come talk to me. The code is public, work done here is credited to whoever did it, and I’d rather share the load than compete. If you build on our code, just keep the licences and the credit.</p>
      </aside>

      <p>Interested? Message me on Discord and tell me what you’d like to look after.</p>
      <p>Feel free to disagree, just keep it fair.</p>
      <p className="owner-note-sign"><strong>Jannik</strong></p>
    </div>
    <footer className="owner-note-actions">
      <button type="button" className="owner-note-close" onClick={onClose}>Close</button>
      <a className="button owner-statement-secondary" href={issueRepository() + '/pulls'} target="_blank" rel="noopener noreferrer" onClick={onClose}>Open pull requests<span className="sr-only"> (opens in a new tab)</span></a>
      <a className="button button-primary" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}><img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" />Message me on Discord<span className="sr-only"> (opens in a new tab)</span></a>
    </footer>
  </dialog>
}

/** Every visitor once: signed-out visitors per browser, verified members once per account on every device (a browser that
 * already showed it carries that into the account). It waits until the page has been free of other dialogs, menus and
 * typing for a few seconds, so it never interrupts an install, a sync or a form. */
export function OwnerStatementGate({ enabled }: { enabled: boolean }) {
  const { session, loading } = useCommunity(), memberId = session.user?.verified ? session.user.id : null
  // The account's answer, kept with the account it belongs to so a sign-in or sign-out never reuses another's.
  const [server, setServer] = useState<{ memberId: string; show: boolean }>(), [open, setOpen] = useState(false), [closed, setClosed] = useState(false)
  const seenHere = ownerStatementSeen()
  useEffect(() => {
    if (loading || !memberId) return
    // Closing it here, or before on this browser, is recorded on the account in this one place.
    if (seenHere) { void post('/auth/owner-statement', {}).catch(() => {}); return }
    const controller = new AbortController()
    // A Worker without this route yet falls back to this browser's marker.
    void api<{ show: boolean }>('/auth/owner-statement', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setServer({ memberId, show: result.show }) })
      .catch(() => { if (!controller.signal.aborted) setServer({ memberId, show: true }) })
    return () => controller.abort()
  }, [loading, memberId, seenHere])
  const due = !loading && !closed && !seenHere && (memberId ? server?.memberId === memberId && server.show : true)
  useEffect(() => {
    if (!enabled || !due || open) return
    let idle = 0
    const timer = window.setInterval(() => {
      // Read in another tab meanwhile.
      if (ownerStatementSeen()) { setClosed(true); return }
      idle = pageBusy() ? 0 : idle + 1
      if (idle >= SETTLE) setOpen(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [enabled, due, open])
  if (!open) return null
  return <OwnerStatement onClose={() => { rememberOwnerStatement(); setOpen(false); setClosed(true) }} />
}

/** Dev preview (?preview=owner-statement). Nothing is stored or sent. */
export function OwnerStatementPreview() {
  const [closed, setClosed] = useState(false)
  return closed ? null : <OwnerStatement onClose={() => setClosed(true)} />
}

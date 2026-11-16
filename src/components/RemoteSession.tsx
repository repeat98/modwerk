// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The member's consent dialog for a remote debug session, and the banner that shows the session while it runs.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from './Icon'
import { acceptRemoteSession, declineRemoteSession, endRemoteSession, holdUnit, MemberRelay, pickUnit, readRemoteSessions, remoteSessionTicket, type UsbEvents } from '../community/remote-session'
import { useRemoteSessionDue } from '../community/remote-session-signal'
import { siteLocks, webUsb, type LinkDevice, type UsbFilter } from '../engine/elekloader/octatrack-link'
import { REMOTE_READ_REQUESTS, type RemoteSessionView } from '../community/remote-session-contract'
import './remote-session.css'

type Usb = UsbEvents & { requestDevice(options: { filters: UsbFilter[] }): Promise<LinkDevice> }
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

/** Mounted once the bell has seen a request this visit (App.tsx); reads the request again whenever the flag rises. */
export function RemoteSessionGate() {
  const due = useRemoteSessionDue()
  const [current, setCurrent] = useState<RemoteSessionView | null>(null), [version, setVersion] = useState('')
  const [relay, setRelay] = useState<MemberRelay | null>(null), [dismissed, setDismissed] = useState<string>()
  const refresh = useCallback((signal?: AbortSignal) => readRemoteSessions(signal).then(result => { if (!signal?.aborted) { setCurrent(result.current); setVersion(result.consentVersion) } }).catch(() => {}), [])
  useEffect(() => { if (!due) return; const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort() }, [due, refresh])
  // Leaving or reloading the page ends a running session; its banner said so.
  useEffect(() => {
    if (!relay) return
    const leave = () => relay.stop('member')
    window.addEventListener('pagehide', leave)
    return () => window.removeEventListener('pagehide', leave)
  }, [relay])
  if (relay) return <RemoteSessionBanner relay={relay} session={current} onClosed={() => { setRelay(null); setCurrent(null); void refresh() }} />
  if (!current) return null
  // A session marked running that this tab does not hold (the page was reloaded): it can only be ended from here.
  if (current.status === 'active') return <OrphanBanner session={current} onEnded={() => void refresh()} />
  if (dismissed === current.id) return null
  return <RemoteSessionConsent session={current} version={version} onStarted={setRelay} onAnswered={() => { setDismissed(current.id); void refresh() }} onLater={() => setDismissed(current.id)} />
}

export function RemoteSessionConsent({ session, version, onStarted, onAnswered, onLater, usb = webUsb() as Usb | undefined }: {
  session: RemoteSessionView; version: string; onStarted: (relay: MemberRelay) => void; onAnswered: () => void; onLater: () => void; usb?: Usb
}) {
  const dialog = useRef<HTMLDialogElement>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close() }, [])
  async function accept() {
    if (!usb) return
    setBusy(true); setError('')
    let held: Awaited<ReturnType<typeof holdUnit>> | undefined
    try {
      const device = await pickUnit(usb)
      held = await holdUnit(device, siteLocks())
      const { ticket } = await acceptRemoteSession(session.id, version)
      const relay = new MemberRelay({ id: session.id, scope: session.scope, device, vendorInterface: held.vendorInterface, usb,
        ticket: async () => (await remoteSessionTicket(session.id)).ticket, open: url => new WebSocket(url) })
      const release = held.release
      relay.subscribe(() => { if (relay.getState().status === 'ended') void release() })
      relay.start(ticket)
      onStarted(relay)
    } catch (caught) {
      await held?.release()
      setError(caught instanceof Error ? caught.message : 'The session could not start.')
    } finally { setBusy(false) }
  }
  async function decline() { setBusy(true); await declineRemoteSession(session.id).catch(() => {}); onAnswered() }
  const reads = Array.from(new Set(Object.values(REMOTE_READ_REQUESTS).filter(label => label !== 'result')))
  return <dialog ref={dialog} className="app-dialog remote-session-dialog" aria-labelledby="remote-session-title" onCancel={event => { event.preventDefault(); if (!busy) onLater() }}>
    <h2 id="remote-session-title">{session.requester} asks to read your Octatrack</h2>
    <blockquote className="remote-session-reason">{session.reason}</blockquote>
    <p>If you accept, {session.requester} can read from your Octatrack through this tab for up to <strong>{session.minutes} minutes</strong>: {reads.join(', ')}.</p>
    <p className="remote-session-limit"><Icon name="lock" size={16} /><span><strong>Nothing on your Octatrack can be changed.</strong> No modules are loaded, kept or undone, nothing is saved, and no firmware, project, sample or card content is read. This tab checks every request and refuses anything else.</span></p>
    <p>This tab lists every request while the session runs. Press End, close or reload the tab, and it stops at once. {session.requester} may use Anthropic’s Claude to run the session and read the results. The site keeps a record of who asked, why, when the session ran, how it ended and how many requests ran, for 90 days; it doesn’t store what was read.</p>
    {!usb && <p className="file-error" role="alert">Remote sessions need Chrome or Edge on a computer, with your Octatrack plugged in over USB.</p>}
    {error && <p className="file-error" role="alert">{error}</p>}
    <footer className="remote-session-actions">
      <button type="button" className="text-button" disabled={busy} onClick={onLater}>Later</button>
      <button type="button" className="button" disabled={busy} onClick={() => void decline()}>Decline</button>
      <button type="button" className="button button-primary" disabled={busy || !usb} onClick={() => void accept()}>{busy ? 'Connecting…' : 'Accept and choose Octatrack'}</button>
    </footer>
  </dialog>
}

export function RemoteSessionBanner({ relay, session, onClosed }: { relay: MemberRelay; session: RemoteSessionView | null; onClosed: () => void }) {
  const state = useSyncExternalStore(relay.subscribe, relay.getState), [open, setOpen] = useState(false)
  const who = session?.requester ?? 'The administrator'
  if (state.status === 'ended') return <aside className="remote-session-banner is-ended" aria-live="polite">
    <p><strong>Remote session ended.</strong> {state.ended === 'time' ? 'Its time ran out.' : state.ended === 'operator' ? `${who} ended it.` : state.ended === 'lost' ? 'The connection was lost.' : 'You ended it.'} {state.count} requests ran.</p>
    <button type="button" className="text-button" onClick={onClosed}><Icon name="close" size={14} />Close</button>
  </aside>
  return <aside className="remote-session-banner" aria-label="Remote session">
    <div className="remote-session-head">
      <span className={'remote-session-dot' + (state.status === 'live' && state.operator ? ' is-live' : '')} aria-hidden="true" />
      <p><strong>{who} {state.status === 'live' && state.operator ? 'is reading your Octatrack' : state.status === 'reconnecting' ? '– reconnecting…' : 'can read your Octatrack'}</strong> until {time(state.endsAt ?? session?.endsAt ?? null)}. Read-only; {state.count} requests so far.{!state.unit && ' Your Octatrack was unplugged.'}</p>
      <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide' : 'Show'} requests</button>
      <button type="button" className="button button-primary" onClick={() => { relay.stop('member'); if (session) void endRemoteSession(session.id).catch(() => {}) }}>End</button>
    </div>
    {state.messages.map(message => <p key={message.at} className="remote-session-message" role="status"><Icon name="message" size={14} />{who}: {message.text}</p>)}
    {open && <ol className="remote-session-log">{state.log.length ? [...state.log].reverse().map((entry, index) => <li key={state.count - index}><time>{new Date(entry.at).toLocaleTimeString()}</time><span>{entry.label}</span><span className={'is-' + entry.outcome}>{entry.outcome}</span></li>) : <li>No requests yet.</li>}</ol>}
  </aside>
}

function OrphanBanner({ session, onEnded }: { session: RemoteSessionView; onEnded: () => void }) {
  return <aside className="remote-session-banner" aria-label="Remote session">
    <div className="remote-session-head">
      <p><strong>A remote session with {session.requester} is still open</strong> until {time(session.endsAt)}, but this tab isn’t connected, so nothing can be read.</p>
      <button type="button" className="button button-primary" onClick={() => void endRemoteSession(session.id).catch(() => {}).then(onEnded)}>End it</button>
    </div>
  </aside>
}

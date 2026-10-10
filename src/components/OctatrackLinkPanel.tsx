import { useRef, useState, type ChangeEvent } from 'react'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { Icon } from './Icon'
import './octatrack-link.css'

const PILL: Record<LinkState['status'], string> = {
  unsupported: 'Not available', idle: 'Not connected', connecting: 'Connecting…', stock: 'Original OS', busy: 'In use',
  ready: 'Ready', sending: 'Sending', trial: 'Trying', finishing: 'Trying',
}

/**
 * The configuration page's USB card (checkout column). `onInstall` opens the base
 * install dialog. The builder's `prepareModule` is absent until the browser builder
 * provides it; dev builds can send a runtime module file instead.
 */
export function OctatrackLinkPanel({ link, onInstall, prepareModule }: {
  link: OctatrackLink
  onInstall: () => void
  prepareModule?: () => Promise<{ name: string; data: Uint8Array }>
}) {
  const state = useOctatrackLink(link)
  const [preparing, setPreparing] = useState<'idle' | 'busy' | 'failed'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  const { status, identity, active, module, progress = 0, notice } = state
  const canSend = status === 'ready' && !!identity?.canSubmit
  const needsBase = status === 'stock' || status === 'ready' && !identity?.canSubmit
  async function sendSelection() {
    setPreparing('busy')
    try { const prepared = await prepareModule!(); setPreparing('idle'); await link.send(prepared.name, prepared.data) }
    catch (error) { console.error(error); setPreparing('failed') }
  }
  async function sendFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (file) await link.send(file.name.replace(/\.mwrm$/i, ''), new Uint8Array(await file.arrayBuffer()))
  }

  const text = status === 'unsupported' ? 'Loading modules over USB needs Chrome or Edge on a computer. You can still download the .bin and install it from the card.'
    : status === 'idle' ? 'Plug in the USB cable and switch the Octatrack on, then connect.'
    : status === 'connecting' ? 'Looking for the Modwerk base…'
    : status === 'stock' ? 'This unit runs the original OS. Install the Modwerk base once from the card. After that, modules load over USB in seconds, with no restart.'
    : status === 'busy' ? 'Another tab or app is using the Octatrack’s USB connection. Close it, then try again.'
    : status === 'ready' && !identity?.canSubmit ? 'This Octatrack runs a Modwerk base this page can’t send to. Install the current base.'
    : status === 'ready' ? 'Send modules straight to the Octatrack. You try them first, and nothing stays until you keep it.'
    : status === 'sending' ? (progress < 1 ? `Sending ${module}… Keep the cable in. If it comes out, nothing changes.` : `Starting ${module}…`)
    : `${module} is running. Try it on your Octatrack.`

  return <section className={'link-card' + (status === 'trial' || status === 'finishing' ? ' is-trial' : '')} aria-labelledby="link-title" aria-busy={status === 'connecting' || status === 'sending' || status === 'finishing'}>
      <div className="link-heading"><h2 id="link-title">Send over USB</h2><span className="pill link-state"><span className={'status-dot' + (canSend ? ' verified' : status === 'trial' || status === 'finishing' || status === 'sending' ? ' is-live' : '')} />{needsBase && status === 'ready' ? 'Base outdated' : PILL[status]}</span></div>
      {identity && status !== 'busy' && <p className="link-identity">{identity.model} · Modwerk base {identity.base.slice(0, 8)}{active && (active === identity.base ? ' · no module loaded' : ' · last module ' + active.slice(0, 8))}</p>}
      <p role="status">{text}</p>
      {status === 'sending' && <progress className="link-progress" max={1} value={progress} aria-label={`Sending ${module}`} />}
      {(status === 'trial' || status === 'finishing') && <p className="link-hint">When you’re done, stop playback, then keep it or undo. Unplugging or leaving this page also undoes it.</p>}
      <div className="link-actions">
        {status === 'idle' && <button className="button button-primary" onClick={() => void link.connect()}><Icon name="arrow" size={16} />Connect</button>}
        {status === 'busy' && <button className="button button-primary" onClick={() => void link.retry()}>Try again</button>}
        {needsBase && <button className="button button-primary" onClick={onInstall}>Install the base</button>}
        {canSend && prepareModule && <button className="button button-primary" disabled={preparing === 'busy'} onClick={() => void sendSelection()}>Send to Octatrack</button>}
        {canSend && import.meta.env.DEV && <><button className={'button ' + (prepareModule ? 'button-quiet' : 'button-primary')} onClick={() => fileRef.current?.click()}>Send a module file…</button><input ref={fileRef} type="file" accept=".mwrm" hidden onChange={event => void sendFile(event)} aria-label="Choose a runtime module file" /></>}
        {status === 'sending' && progress < 1 && <button className="button button-quiet" onClick={() => link.cancel()}>Cancel</button>}
        {(status === 'trial' || status === 'finishing') && <><button className="button button-primary" disabled={status === 'finishing'} onClick={() => void link.keep()}><Icon name="check" size={16} />Keep</button><button className="button button-quiet" disabled={status === 'finishing'} onClick={() => void link.undo()}>Undo</button></>}
      </div>
      {(status === 'idle' || canSend) && <button className="text-button" onClick={onInstall}>{status === 'idle' ? 'First time? Install the Modwerk base' : 'Install the base on another Octatrack'} <Icon name="arrow" size={14} /></button>}
      {preparing === 'busy' && <p className="link-hint" role="status">Preparing your modules…</p>}
      {preparing === 'failed' && status === 'ready' && <p className="file-error" role="alert">Your modules could not be prepared for USB.</p>}
      {notice && <p className={notice.tone === 'success' ? 'success-note' : 'file-error'} role={notice.tone === 'success' ? 'status' : 'alert'}>{notice.text}</p>}
  </section>
}

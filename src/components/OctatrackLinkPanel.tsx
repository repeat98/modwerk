import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { saveFirmware } from '../config/firmware-filename'
import { OctatrackLink, type LinkState } from '../engine/elekloader/octatrack-link'
import { RiskAcceptance } from './ConfigurationLayout'
import { Icon } from './Icon'
import './octatrack-link.css'

export interface BaseImage { buffer: ArrayBuffer; sha256: string }

const PILL: Record<LinkState['status'], string> = {
  unsupported: 'Not available', idle: 'Not connected', connecting: 'Connecting…', stock: 'Original OS', busy: 'In use',
  ready: 'Ready', sending: 'Sending', trial: 'Trying', finishing: 'Trying',
}

/**
 * The configuration page's USB card (checkout column) and, while a unit needs the
 * base, its install guide (main column, through `guideSlot`). The builder's
 * `buildBase` and `prepareModule` are absent until the browser builder provides
 * them; dev builds can send a runtime module file instead.
 */
export function OctatrackLinkPanel({ guideSlot, firmwareReady, buildBase, prepareModule, link: given }: {
  guideSlot: HTMLElement | null
  firmwareReady: boolean
  buildBase?: () => Promise<BaseImage>
  prepareModule?: () => Promise<{ name: string; data: Uint8Array }>
  link?: OctatrackLink
}) {
  const [link] = useState(() => given ?? new OctatrackLink())
  const state = useSyncExternalStore(link.subscribe, link.getState)
  const [guideOpen, setGuideOpen] = useState(false)
  const [preparing, setPreparing] = useState<'idle' | 'busy' | 'failed'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { link.start(); return () => link.stop() }, [link])

  const { status, identity, module, progress = 0, notice } = state
  const canSend = status === 'ready' && !!identity?.canSubmit
  const needsBase = status === 'stock' || status === 'ready' && !identity?.canSubmit
  // Stays open once needed, so step 4 can show the base found after the unit restarts.
  if (needsBase && !guideOpen) setGuideOpen(true)
  function openGuide() { setGuideOpen(true); requestAnimationFrame(() => document.getElementById('usb-base')?.scrollIntoView({ block: 'start' })) }
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

  return <>
    <section className={'link-card' + (status === 'trial' || status === 'finishing' ? ' is-trial' : '')} aria-labelledby="link-title" aria-busy={status === 'connecting' || status === 'sending' || status === 'finishing'}>
      <div className="link-heading"><h2 id="link-title">Send over USB</h2><span className="pill link-state"><span className={'status-dot' + (canSend ? ' verified' : status === 'trial' || status === 'finishing' || status === 'sending' ? ' is-live' : '')} />{needsBase && status === 'ready' ? 'Base outdated' : PILL[status]}</span></div>
      {identity && status !== 'busy' && <p className="link-identity">{identity.model} · Modwerk base {identity.base.slice(0, 8)}</p>}
      <p role="status">{text}</p>
      {status === 'sending' && <progress className="link-progress" max={1} value={progress} aria-label={`Sending ${module}`} />}
      {(status === 'trial' || status === 'finishing') && <p className="link-hint">When you’re done, stop playback, then keep it or undo. Unplugging or leaving this page also undoes it.</p>}
      <div className="link-actions">
        {status === 'idle' && <button className="button button-primary" onClick={() => void link.connect()}><Icon name="arrow" size={16} />Connect</button>}
        {status === 'busy' && <button className="button button-primary" onClick={() => void link.retry()}>Try again</button>}
        {needsBase && <button className="button button-primary" onClick={openGuide}>Install the base</button>}
        {canSend && prepareModule && <button className="button button-primary" disabled={preparing === 'busy'} onClick={() => void sendSelection()}>Send to Octatrack</button>}
        {canSend && import.meta.env.DEV && <><button className={'button ' + (prepareModule ? 'button-quiet' : 'button-primary')} onClick={() => fileRef.current?.click()}>Send a module file…</button><input ref={fileRef} type="file" accept=".mwrm" hidden onChange={event => void sendFile(event)} aria-label="Choose a runtime module file" /></>}
        {status === 'sending' && progress < 1 && <button className="button button-quiet" onClick={() => link.cancel()}>Cancel</button>}
        {(status === 'trial' || status === 'finishing') && <><button className="button button-primary" disabled={status === 'finishing'} onClick={() => void link.keep()}><Icon name="check" size={16} />Keep</button><button className="button button-quiet" disabled={status === 'finishing'} onClick={() => void link.undo()}>Undo</button></>}
      </div>
      {status === 'idle' && !guideOpen && <button className="text-button" onClick={openGuide}>First time? Install the Modwerk base <Icon name="arrow" size={14} /></button>}
      {preparing === 'busy' && <p className="link-hint" role="status">Preparing your modules…</p>}
      {preparing === 'failed' && status === 'ready' && <p className="file-error" role="alert">Your modules could not be prepared for USB.</p>}
      {notice && <p className={notice.tone === 'success' ? 'success-note' : 'file-error'} role={notice.tone === 'success' ? 'status' : 'alert'}>{notice.text}</p>}
    </section>
    {guideSlot && guideOpen && createPortal(<BaseInstallGuide state={state} firmwareReady={firmwareReady} buildBase={buildBase} onConnect={() => void link.connect()} onClose={() => setGuideOpen(false)} />, guideSlot)}
  </>
}

function BaseInstallGuide({ state, firmwareReady, buildBase, onConnect, onClose }: { state: LinkState; firmwareReady: boolean; buildBase?: () => Promise<BaseImage>; onConnect: () => void; onClose: () => void }) {
  const [accepted, setAccepted] = useState(false)
  const [download, setDownload] = useState<'idle' | 'building' | 'done' | 'failed'>('idle')
  const found = state.status === 'ready' && !!state.identity?.canSubmit
  async function downloadBase() {
    setDownload('building')
    try { const image = await buildBase!(); saveFirmware(image.buffer, 'base', image.sha256); setDownload('done') }
    catch (error) { console.error(error); setDownload('failed') }
  }
  const step = (done: boolean, number: number) => <span className="link-step-marker" aria-hidden="true">{done ? <Icon name="check" size={14} /> : number}</span>
  return <section id="usb-base" className="configuration-section link-guide" aria-labelledby="usb-base-title">
    <div className="section-title"><h2 id="usb-base-title">Install the Modwerk base</h2><span className="pill">Once</span></div>
    <p className="service-note">The base lets this page send modules to your Octatrack over USB, so trying one takes seconds and never needs a restart. You install it once from the card, like an OS update.</p>
    <ol className="link-steps">
      <li className={download === 'done' ? 'is-complete' : undefined}>{step(download === 'done', 1)}<div className="link-step-body">
        <strong>Download the base</strong>
        <p>Built in your browser from your original OS 1.40C file. Nothing is uploaded.</p>
        <RiskAcceptance checked={accepted} onChange={setAccepted} />
        <button className="button button-primary" disabled={!buildBase || !firmwareReady || !accepted || download === 'building'} onClick={() => void downloadBase()}><Icon name="download" size={16} />{download === 'building' ? 'Building the base…' : 'Download base .bin'}</button>
        {!buildBase ? <p className="link-hint">The browser can’t build the base yet.</p> : !firmwareReady && <p className="link-hint">Choose your original OS 1.40C file under Base firmware first.</p>}
        {download === 'failed' && <p className="file-error" role="alert">The base could not be built. Check your OS file and try again.</p>}
        {download === 'done' && <p className="link-hint" role="status">Download requested. Check your browser’s downloads folder.</p>}
      </div></li>
      <li>{step(false, 2)}<div className="link-step-body">
        <strong>Copy it to the card</strong>
        <p>Connect USB, open <b>PROJECT → SYSTEM → USB DISK MODE</b> and press <b>YES</b>. Copy the .bin to the top level of the card. Eject the drive on your computer before you leave USB DISK MODE.</p>
      </div></li>
      <li>{step(false, 3)}<div className="link-step-body">
        <strong>Install it</strong>
        <p>Open <b>PROJECT → SYSTEM → OS UPGRADE</b>, press <b>YES</b> and confirm. Keep the power on until the Octatrack has restarted.</p>
      </div></li>
      <li className={found ? 'is-complete' : undefined}>{step(found, 4)}<div className="link-step-body">
        <strong>Check it</strong>
        {found ? <p role="status">Found the Modwerk base on your {state.identity!.model}. You can send modules now.</p>
          : state.status === 'unsupported' ? <p>Checking needs Chrome or Edge on a computer.</p>
          : <><p>Leave the USB cable in. This page finds the base by itself once the Octatrack has restarted.</p>{state.status === 'idle' && <button className="button button-quiet" onClick={onConnect}>Connect</button>}</>}
      </div></li>
    </ol>
    <p className="service-note">The original OS goes back on the same way. If the Octatrack doesn’t start, follow <a className="text-button" href="#faq">recovery in the FAQ</a>.</p>
    {found && <button className="button button-quiet" onClick={onClose}>Close guide</button>}
  </section>
}

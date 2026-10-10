import { useEffect, useRef, useState } from 'react'
import { saveFirmware } from '../config/firmware-filename'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { RiskAcceptance } from './ConfigurationLayout'
import { Icon, type IconName } from './Icon'
import './octatrack-link.css'

export interface BaseImage { buffer: ArrayBuffer; sha256: string }
/** The release prompt holds this long before it can be put off. */
const LAUNCH_HOLD_SECONDS = 10
// What the release prompt promises. Every line must be true on release day: several modules at once, the
// stress tests and the automatic reports are still to be built (docs/OCTATRACK_ELEKLOADER_MIGRATION.md).
const ALSO_NEW: [IconName, string, string][] = [
  ['grid', 'As many modules as fit', ', all selectable from the Octatrack’s menus'],
  ['wave', 'Better DSP memory use', ', so more effects fit side by side'],
  ['shield', 'Automatic stress tests', ' for every module and configuration before it lands'],
  ['message', 'Automatic bug reports', ' when something fails, straight to the module’s author'],
]
const SCREEN = ['LOADING', 'TRYING', 'KEPT']

/** This page, a cable and the Octatrack, drawn like the module previews; the unit's screen shows what happens. */
function LinkHero() {
  return <div className="module-preview link-hero" aria-hidden="true">
    <div className="preview-label"><span>NEW</span><span className="preview-led" /></div>
    <svg viewBox="0 0 600 196" className="signal-art link-hero-art" fill="none">
      <g className="signal-grid">{[52, 98, 144].map(y => <path key={y} d={'M16 ' + y + 'H584'} />)}{[120, 240, 360, 480].map(x => <path key={x} d={'M' + x + ' 16V180'} />)}</g>
      <rect className="signal-secondary" x="40" y="36" width="150" height="96" rx="6" />
      {[50, 74, 98].map((y, row) => <rect key={y} className={row === 1 ? 'signal-main link-hero-pick' : 'signal-ghost'} x="52" y={y} width="126" height="16" rx="3" />)}
      <path className="signal-secondary" d="M28 140H202L192 149H38Z" />
      <path className="signal-ghost" d="M196 145C260 145 270 186 320 186S360 150 384 150" />
      <path className="signal-main link-hero-flow" d="M196 145C260 145 270 186 320 186S360 150 384 150" />
      <rect className="signal-secondary" x="384" y="24" width="188" height="140" rx="9" />
      <rect className="link-hero-screen" x="400" y="40" width="92" height="46" rx="3" />
      {SCREEN.map(word => <text key={word} className="link-hero-word" x="446" y="68" textAnchor="middle">{word}</text>)}
      {[514, 537, 560].flatMap(x => [52, 76].map(y => <circle key={x + '-' + y} className="signal-secondary" cx={x} cy={y} r="7" />))}
      <rect className="signal-ghost" x="400" y="104" width="72" height="6" rx="3" /><rect className="signal-secondary" x="430" y="100" width="8" height="14" rx="2" />
      {Array.from({ length: 16 }, (_, i) => <rect key={i} className="rhythm-off link-hero-trig" style={{ animationDelay: i * 0.15 + 's' }} x={400 + i * 10.4} y="138" width="7.5" height="10" rx="1.5" />)}
      <text x="115" y="172" textAnchor="middle">THIS PAGE</text><text x="478" y="184" textAnchor="middle">OCTATRACK</text>
    </svg>
  </div>
}

/**
 * The one place to install the Modwerk base. The USB card opens it at any time; at
 * release it opens once per member (`launch`) and cannot be put off for the first
 * seconds. Step 4 completes by itself when the unit comes back with the base.
 * `buildBase` is the builder's seam, absent until the browser can build the base.
 */
export function BaseInstallDialog({ link, launch = false, firmwareReady, onChooseFirmware, buildBase, onClose }: {
  link: OctatrackLink
  launch?: boolean
  firmwareReady: boolean
  onChooseFirmware: (file: File) => void
  buildBase?: () => Promise<BaseImage>
  /** `done` is false when the browser closed it early (Escape before the page was clicked), which must not count as seen. */
  onClose: (done: boolean) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), fileRef = useRef<HTMLInputElement>(null), finished = useRef(false)
  const state = useOctatrackLink(link)
  const [hold, setHold] = useState(launch ? LAUNCH_HOLD_SECONDS : 0)
  const [accepted, setAccepted] = useState(false)
  const [download, setDownload] = useState<'idle' | 'building' | 'done' | 'failed'>('idle')
  const [view, setView] = useState<'intro' | 'steps'>(launch ? 'intro' : 'steps')
  const found = state.status === 'ready' && !!state.identity?.canSubmit
  const canClose = hold === 0 || found
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal(); element?.querySelector('h2')?.focus()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  useEffect(() => { dialog.current?.querySelector('h2')?.focus(); dialog.current?.scrollTo(0, 0) }, [view])
  useEffect(() => {
    if (!hold) return
    const timer = window.setTimeout(() => setHold(hold - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [hold])
  function finish() { finished.current = true; onClose(true) }
  async function downloadBase() {
    setDownload('building')
    try { const image = await buildBase!(); saveFirmware(image.buffer, 'base', image.sha256); setDownload('done') }
    catch (error) { console.error(error); setDownload('failed') }
  }
  const step = (done: boolean, number: number) => <span className="link-step-marker" aria-hidden="true">{done ? <Icon name="check" size={14} /> : number}</span>

  return <dialog ref={dialog} className="base-install-dialog" aria-labelledby="base-install-title" aria-describedby="base-install-intro" onCancel={event => { event.preventDefault(); if (canClose) finish() }} onClose={() => { if (!finished.current && !dialog.current?.open) onClose(false) }}>
    {canClose && <button type="button" className="icon-button base-install-close" aria-label="Close" onClick={finish}><Icon name="close" size={18} /></button>}
    {view === 'intro' ? <>
      <LinkHero />
      <h2 id="base-install-title" className="link-title" tabIndex={-1}>Load modules over USB</h2>
      <p id="base-install-intro" className="base-install-intro">Install the Modwerk base once from the card. After that, modules go straight from this page to your Octatrack, without the card and without a reboot.</p>
      <ul className="link-promises">{ALSO_NEW.map(([icon, lead, rest]) => <li key={lead}><span className="link-feature-icon" aria-hidden="true"><Icon name={icon} size={18} /></span><span><strong>{lead}</strong>{rest}</span></li>)}</ul>
      <p className={'link-needs' + (state.status === 'unsupported' ? ' is-missing' : '')}>You need an Octatrack MKII, your OS 1.40C file, a USB cable and Chrome or Edge on a computer.</p>
      {state.status === 'unsupported' && <p className="file-error" role="alert">This browser can’t talk to USB devices. Open this page in Chrome or Edge on a computer.</p>}
    </> : <>
    <header className="base-install-header"><h2 id="base-install-title" tabIndex={-1}>Install the Modwerk base</h2></header>
    <p id="base-install-intro" className="base-install-intro">Install it once from the card, like an OS update. {launch && <button type="button" className="text-button" onClick={() => setView('intro')}>What’s new?</button>}</p>
    <ol className="link-steps">
      <li className={download === 'done' ? 'is-complete' : undefined}>{step(download === 'done', 1)}<div className="link-step-body">
        <strong>Download the base</strong>
        <p>Built in your browser from your original OS 1.40C file. Nothing is uploaded.</p>
        {!firmwareReady && <><button type="button" className="button button-quiet" onClick={() => fileRef.current?.click()}><Icon name="file" size={16} />Choose your OS 1.40C file</button>
          <input ref={fileRef} type="file" accept=".bin" hidden aria-label="Choose your original OS 1.40C file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChooseFirmware(file) }} />
          <a className="text-button" href="#faq" target="_blank" rel="noreferrer">Where do I get it? <Icon name="arrow" size={14} /></a></>}
        <RiskAcceptance checked={accepted} onChange={setAccepted} />
        <button type="button" className="button button-primary" disabled={!buildBase || !firmwareReady || !accepted || download === 'building'} onClick={() => void downloadBase()}><Icon name="download" size={16} />{download === 'building' ? 'Building the base…' : 'Download base .bin'}</button>
        {!buildBase && <p className="link-hint">The browser can’t build the base yet.</p>}
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
          : <><p>Leave the USB cable in. This page finds the base by itself once the Octatrack has restarted.</p>{state.status === 'idle' && <button type="button" className="button button-quiet" onClick={() => void link.connect()}>Connect</button>}</>}
      </div></li>
    </ol>
    <p className="link-hint">The original OS goes back on the same way. If the Octatrack doesn’t start, follow <a className="text-button" href="#faq" target="_blank" rel="noreferrer">recovery in the FAQ</a>.</p>
    </>}
    <footer className="base-install-footer">
      <p className="link-hint">{found ? 'All set.' : 'It’s on the Octatrack configuration page whenever you want it.'}</p>
      <div className="base-install-actions">
        <button type="button" className={'button ' + (found ? 'button-primary' : 'button-quiet')} disabled={!canClose} onClick={finish}>{found ? 'Done' : !launch ? 'Close' : hold ? `Later (${hold})` : 'Later'}</button>
        {view === 'intro' && !found && <button type="button" className="button button-primary" onClick={() => setView('steps')}>Show me how<Icon name="arrow" size={16} /></button>}
      </div>
    </footer>
  </dialog>
}

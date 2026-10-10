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
const BENEFITS: [IconName, string, string][] = [
  ['play', 'No card, no restart', 'Send modules over USB in seconds.'],
  ['swap', 'Try, then keep', 'Every module starts as a trial. Undo any time.'],
  ['grid', 'As many as fit', 'Load as many modules as the firmware allows.'],
  ['shield', 'Stress-tested for you', 'Automatic checks run on your unit before you keep a module.'],
  ['message', 'Bugs report themselves', 'Failures go to the module’s author. You see what’s sent.'],
  ['lock', 'Your music stays yours', 'Checks never touch your projects, samples or audio.'],
]

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
    <header className="base-install-header">
      <div>{view === 'intro' && <p className="base-install-kicker">New on Modwerk</p>}<h2 id="base-install-title" tabIndex={-1}>{view === 'intro' ? 'Load modules over USB' : 'Install the Modwerk base'}</h2></div>
      {canClose && <button type="button" className="icon-button" aria-label="Close" onClick={finish}><Icon name="close" size={18} /></button>}
    </header>
    {view === 'intro' ? <>
      <p id="base-install-intro" className="base-install-intro">Install the Modwerk base once. After that, everything happens right here.</p>
      <ul className="base-install-benefits">{BENEFITS.map(([icon, title, line]) => <li key={title}><span className="base-install-benefit-icon" aria-hidden="true"><Icon name={icon} size={18} /></span><strong>{title}</strong><span>{line}</span></li>)}</ul>
      <div className="base-install-needs"><span className="subtle">You need</span>{['Octatrack MKII', 'OS 1.40C file', 'USB cable'].map(need => <span key={need} className="pill">{need}</span>)}<span className={'pill' + (state.status === 'unsupported' ? ' is-missing' : '')}>Chrome or Edge on a computer</span></div>
      {state.status === 'unsupported' && <p className="file-error" role="alert">This browser can’t connect over USB. Open Modwerk in Chrome or Edge on a computer to send modules.</p>}
    </> : <>
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
      <p className="link-hint">{found ? 'All set.' : 'You’ll find this on the Octatrack configuration page any time.'}</p>
      <div className="base-install-actions">
        <button type="button" className={'button ' + (found ? 'button-primary' : 'button-quiet')} disabled={!canClose} onClick={finish}>{found ? 'Done' : !launch ? 'Close' : hold ? `Not now (${hold})` : 'Not now'}</button>
        {view === 'intro' && !found && <button type="button" className="button button-primary" onClick={() => setView('steps')}>Set it up<Icon name="arrow" size={16} /></button>}
      </div>
    </footer>
  </dialog>
}

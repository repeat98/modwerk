import { useEffect, useRef, useState } from 'react'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { saveFirmware } from '../config/firmware-filename'
import { BETA_RECOVERY_NOTICE } from '../firmware-notices'
import { finishBaseInstall, pendingBaseInstall, waitForBaseInstall } from '../config/octatrack-progress'
import type { BaseUpdateStep, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { siteUpdated, unitForPrompt } from '../hooks/useBaseInstallPrompt'
import { baseLayout, isPublishedBase, layoutName, type BaseLayout } from '../engine/elekloader/base-variants'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { RiskAcceptance } from './ConfigurationLayout'
import { Icon, type IconName } from './Icon'
import { LinkHero } from './LinkHero'
import './octatrack-link.css'

export interface BaseImage { buffer: ArrayBuffer; sha256: string; base: string }
/** The release prompt holds this long before it can be put off. */
const LAUNCH_HOLD_SECONDS = 10
/** The update over USB, step by step, as the link reports it (updateBase). */
const USB_STEPS: Record<BaseUpdateStep, string> = {
  staging: 'Sending the new base to your Octatrack',
  starting: 'The Octatrack is trying the new base. Nothing is saved yet',
  started: 'The new base works. Saving it now',
  writing: 'Saving the new base. Don’t switch off or unplug the Octatrack',
  restarting: 'Saved and checked. The Octatrack restarts',
  done: 'Done. Your Octatrack runs the new base.',
}
// What the beta prompt promises: only what the base does today. Cross-compatibility,
// automatic stress tests and bug reports are still to be built (docs/OCTATRACK_ELEKLOADER_MIGRATION.md).
const ALSO_NEW: [IconName, string, string, boolean?][] = [
  ['wave', 'Better DSP memory use', '. Effects load as needed, sharing one copy of their code between tracks on the same DSP core.', true],
  ['check', 'Kept after a restart', ', the Octatrack loads your modules again when it starts'],
  ['shield', 'A self-test on the Octatrack', ' after every sync, then you keep it or undo it'],
  ['search', 'Missing modules named', ' when a project uses one the Octatrack doesn’t have'],
  ['sliders', 'Stock effects stay', ', none of them get replaced'],
]

/**
 * The one place to install the Modwerk base. The USB card opens it at any time; for
 * beta testers it opens once per member (`launch`) and cannot be put off for the first
 * seconds. Step 4 completes by itself when the unit comes back with the base.
 * `buildBase` is the builder's seam, absent until the browser can build the base.
 */
export function BaseInstallDialog({ link, launch = false, layout, firmwareReady, firmwareError, onChooseFirmware, buildBase, returnSetId, onClose, onReady }: {
  link: OctatrackLink
  launch?: boolean
  firmwareReady: boolean
  /** Why the chosen OS file was refused (not the original 1.40C). */
  firmwareError?: string
  onChooseFirmware: (file: File) => void
  /** The USB Audio layout to install (base-variants.ts); the default layout when absent. */
  layout?: BaseLayout
  buildBase?: (layout?: BaseLayout) => Promise<BaseImage>
  /** Return to this set after the exact downloaded base is confirmed, including after a page reload. */
  returnSetId?: string
  /** `done` is false when the browser closed it early (Escape before the page was clicked), which must not count as seen. */
  onClose: (done: boolean) => void
  onReady: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), fileRef = useRef<HTMLInputElement>(null), finished = useRef(false)
  const state = useOctatrackLink(link)
  const [hold, setHold] = useState(launch ? LAUNCH_HOLD_SECONDS : 0)
  const [accepted, setAccepted] = useState(false)
  const [usb, setUsb] = useState<{ step: BaseUpdateStep; fraction?: number } | { error: string } | null>(null)
  const [card, setCard] = useState(false), [outdated, setOutdated] = useState(false)
  const [pending, setPending] = useState(pendingBaseInstall)
  const [download, setDownload] = useState<'idle' | 'building' | 'done' | 'failed'>(pending ? 'done' : 'idle'), [failure, setFailure] = useState('')
  const [view, setView] = useState<'intro' | 'steps'>(launch && !pending ? 'intro' : 'steps')
  const [stage, setStage] = useState<'download' | 'copy' | 'install' | 'connect'>(pending ? 'connect' : 'download')
  const stages = ['download', 'copy', 'install', 'connect'] as const
  const stageIndex = stages.indexOf(stage)
  const found = !!pending && state.status === 'ready' && !!state.identity?.canSubmit && state.identity.base === pending.expectedBase
  const updating = !!usb && 'step' in usb && usb.step !== 'done'
  const canClose = (hold === 0 || found) && !updating
  // A unit already on an older Modwerk base is updated, not installed (the hub and the update prompt send it here).
  const older = !pending && unitForPrompt(state) === 'older'
  // The current base in another USB Audio layout: the same update over USB, to the variant the module set needs.
  const running = baseLayout(state.identity?.base)
  const switching = !pending && layout !== undefined && isPublishedBase(state.identity?.base) && running !== layout
  // Over USB from any older base (every base RAM-boots the new one, which writes itself: flash.c); the card stays for
  // the first install and as the fallback after an error.
  const overUsb = stage === 'download' && !card && (usb !== null || older || switching)
  // A page from before a deploy knows an older base: it would call the current one older, or send its own.
  useEffect(() => { if (older || switching) void siteUpdated().then(updated => { if (updated) setOutdated(true) }) }, [older, switching])
  useEffect(() => {
    if (!pending || !found || finished.current) return
    finished.current = true; finishBaseInstall(); onReady()
  }, [found, pending, state.identity?.base, onReady])
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal(); element?.querySelector('h2')?.focus()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  useEffect(() => { (dialog.current?.querySelector<HTMLElement>('[data-stage-title]') ?? dialog.current?.querySelector('h2'))?.focus(); dialog.current?.scrollTo(0, 0) }, [view, stage])
  useEffect(() => {
    if (!hold) return
    const timer = window.setTimeout(() => setHold(hold - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [hold])
  function finish() { finished.current = true; onClose(true) }
  async function updateOverUsb() {
    if (await siteUpdated()) return setOutdated(true)
    setUsb({ step: 'staging' })
    try {
      const image = await buildBase!(layout)
      await link.updateBase(new Uint8Array(image.buffer), image.base, (step, fraction) => setUsb({ step, fraction }))
      setUsb({ step: 'done' }); finished.current = true; onReady()
    } catch (error) { console.error(error); setUsb({ error: error instanceof Error ? error.message : 'The update did not finish.' }) }
  }
  async function downloadBase() {
    if (await siteUpdated()) return setOutdated(true)
    setDownload('building')
    try {
      const image = await buildBase!(layout); saveFirmware(image.buffer, 'base', image.sha256)
      const previousBase = link.getState().identity?.base
      waitForBaseInstall(image.sha256, image.base, previousBase, returnSetId)
      setPending({ sha256: image.sha256, expectedBase: image.base, previousBase, returnSetId }); setDownload('done'); setStage('copy')
    }
    catch (error) { console.error(error); setFailure(error instanceof Error ? error.message : ''); setDownload('failed') }
  }

  return <dialog ref={dialog} className="base-install-dialog" aria-labelledby="base-install-title" aria-describedby="base-install-intro" onCancel={event => { event.preventDefault(); if (canClose) finish() }} onClose={() => { if (!finished.current && !dialog.current?.open) onClose(false) }}>
    {canClose && <button type="button" className="icon-button base-install-close" aria-label="Close" onClick={finish}><Icon name="close" size={18} /></button>}
    {view === 'intro' ? <>
      <LinkHero />
      <h2 id="base-install-title" className="link-title" tabIndex={-1}>Sync to Octatrack <span className="module-beta-badge">Beta</span></h2>
      <p id="base-install-intro" className="base-install-intro">Install the Modwerk base once from the card. After that, modules go straight from this page to your Octatrack, without the card and without a reboot. It’s a beta: please report problems in <strong>#beta-testers</strong> on the <a href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer">development Discord</a>, not through the report forms on this site.</p>
      <ul className="link-promises">{ALSO_NEW.map(([icon, lead, rest, explainOnPhone]) => <li key={lead}><span className="link-feature-icon" aria-hidden="true"><Icon name={icon} size={18} /></span><span><strong>{lead}</strong><span className={explainOnPhone ? undefined : 'link-feature-rest'}>{rest}</span></span></li>)}</ul>
      <p className={'link-needs' + (state.status === 'unsupported' ? ' is-missing' : '')}>You need an Octatrack MKII, your OS 1.40C file, a USB cable, Chrome or Edge on a computer, and a CompactFlash card reader in case USB stops working.</p>
      {state.status === 'unsupported' && <p className="file-error" role="alert">This browser can’t talk to USB devices. Open this page in Chrome or Edge on a computer.</p>}
    </> : <>
    <header className="base-install-header"><h2 id="base-install-title" tabIndex={-1}>{switching ? 'Change USB Audio' : <>{older ? 'Update' : 'Install'} the Modwerk base</>} <span className="module-beta-badge">Beta</span></h2></header>
    <p id="base-install-intro" className="base-install-intro">{outdated ? 'Modwerk was updated since you opened this page, so it doesn’t know the current base yet. Reload the page; it then checks your Octatrack again.' : switching && running && layout ? <>Your Octatrack is set to {layoutName(running)}. USB Audio is part of the base, so switching to {layoutName(layout)} updates the base over USB. Your modules stay. After the Octatrack restarts, your computer sees the new audio channels. On Windows, open Sound settings → Recording → Octatrack → Properties → Advanced and pick the new channel count: Windows keeps the old one until you do.</> : older ? <>A new Modwerk base is out. Your Octatrack has an older one{state.identity && <> (<code>{state.identity.base.slice(0, 8)}</code>)</>}. {overUsb ? 'You can update it over USB, no card needed.' : 'Update it from the card, the same way as the first time.'}</> : 'A one-time install from your Octatrack’s card.'}</p>
    {!overUsb && !outdated && <ol className="base-install-progress" aria-label="Installation progress">{stages.map((item, index) => <li key={item} aria-current={stage === item ? 'step' : undefined} className={index < stageIndex ? 'is-past' : undefined}><span aria-hidden="true">{index < stageIndex ? <Icon name="check" size={13}/> : index + 1}</span>{['Download', 'Copy', 'Install', 'Connect'][index]}</li>)}</ol>}
    {!outdated && <section className="base-install-stage" aria-labelledby="base-stage-title">
    {overUsb && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Update over USB</h3>
      <p>The new base{layout ? <> with {layoutName(layout)}</> : ''} is built in your browser from your original OS 1.40C file and sent to the Octatrack. The Octatrack tries it first without saving anything. If it works, the base is saved and the Octatrack restarts. Don’t switch off the Octatrack or unplug the cable until it’s done.</p>
      <p className="base-install-warning" role="note"><Icon name="warn" size={18}/><span><strong>{BETA_RECOVERY_NOTICE}</strong> Keep the original OS 1.40C .bin and .syx on your computer. <a href="#faq" target="_blank" rel="noreferrer">Recovery in the FAQ</a></span></p>
      <input ref={fileRef} type="file" accept=".bin" hidden aria-label="Choose your original OS 1.40C file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChooseFirmware(file) }}/>
      {firmwareReady ? <><p className="base-file-ready"><Icon name="check" size={18}/>Your OS 1.40C file is ready.</p>{!usb && <RiskAcceptance checked={accepted} onChange={setAccepted}/>}</> : <a className="text-button" href="#faq" target="_blank" rel="noreferrer">Where do I get the original OS file? <Icon name="arrow" size={14}/></a>}
      {firmwareError && <p className="file-error" role="alert">{firmwareError}</p>}
      {usb && 'step' in usb && <p className="base-install-note" role="status">{updating && <span className="status-dot is-updating" />}{USB_STEPS[usb.step]}{usb.fraction !== undefined && usb.fraction < 1 ? ` (${Math.round(100 * usb.fraction)} %)` : ''}{usb.step === 'done' ? '' : '…'}</p>}
      {usb && 'error' in usb && <p className="file-error" role="alert">{usb.error} {state.status === 'ready' ? 'You can try again, or update from the card.' : 'Once it is connected again you can try again, or update from the card.'}</p>}
    </>}
    {stage === 'download' && !overUsb && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Download the base</h3>
      <p>The base is built in your browser from your original OS 1.40C file. The file stays on your computer.</p>
      <p className="base-install-warning" role="note"><Icon name="warn" size={18}/><span><strong>{BETA_RECOVERY_NOTICE}</strong> Keep the original OS 1.40C .bin and .syx on your computer. <a href="#faq" target="_blank" rel="noreferrer">Recovery in the FAQ</a></span></p>
      <input ref={fileRef} type="file" accept=".bin" hidden aria-label="Choose your original OS 1.40C file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChooseFirmware(file) }}/>
      {firmwareReady ? <><p className="base-file-ready"><Icon name="check" size={18}/>Your OS 1.40C file is ready.</p><RiskAcceptance checked={accepted} onChange={setAccepted}/></> : <a className="text-button" href="#faq" target="_blank" rel="noreferrer">Where do I get the original OS file? <Icon name="arrow" size={14}/></a>}
      {firmwareError && <p className="file-error" role="alert">{firmwareError}</p>}
      {download === 'failed' && <p className="file-error" role="alert">The base could not be built. {failure || 'Check your OS file and try again.'}</p>}
      {state.status === 'unsupported' && <p className="base-install-note">You can prepare the base here. To connect and sync modules over USB afterwards, open Modwerk in Chrome or Edge on a computer.</p>}
    </>}
    {stage === 'copy' && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Copy the file to your card</h3>
      <p>The download was requested. Find the Modwerk base .bin in your browser’s downloads.</p>
      <ol className="base-instructions">
        <li><strong>Open the Octatrack’s card on your computer</strong><p>Connect the USB cable. On the Octatrack, open <b>PROJECT → SYSTEM → USB DISK MODE</b> and press <b>YES</b>.</p></li>
        <li><strong>Copy the downloaded .bin onto the card</strong><p>Put it at the top level, outside any folder.</p></li>
        <li><strong>Eject the drive on your computer</strong><p>Then leave USB DISK MODE on the Octatrack.</p></li>
      </ol>
    </>}
    {stage === 'install' && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Install it on your Octatrack</h3>
      <ol className="base-instructions">
        <li><strong>Open OS UPGRADE</strong><p>Go to <b>PROJECT → SYSTEM → OS UPGRADE</b>. Press <b>YES</b> and confirm.</p></li>
        <li><strong>Keep the power on while it updates</strong><p>Wait until startup finishes, or the Octatrack explicitly asks you to restart.</p></li>
        <li><strong>Follow the restart prompt, if shown</strong><p>Only then switch the Octatrack off and on again. Leave the USB cable connected.</p></li>
      </ol>
      <details className="base-install-recovery"><summary>If the Octatrack doesn’t start or connect</summary><p>The original OS can be installed again: from the card with a CompactFlash card reader, or as the .syx through a MIDI interface and the startup menu. Follow <a href="#faq" target="_blank" rel="noreferrer">recovery in the FAQ</a>, and report it in #beta-testers on Discord.</p></details>
    </>}
    {stage === 'connect' && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Waiting for your Octatrack</h3>
      {state.status === 'unsupported' ? <><p>This browser can’t connect to USB devices.</p><p>Open Modwerk in <strong>Chrome or Edge on a computer</strong>, sign in and connect your Octatrack. The base you just installed stays on it.</p></> : <>
        <p>Keep the USB cable connected. Choose your Octatrack in the browser’s device list.</p>
        <p className="base-install-note" role="status">{found ? 'The downloaded base is confirmed. Opening your module set…' : state.status === 'connecting' ? 'Connecting to your Octatrack…' : state.status === 'stock' || state.status === 'ready' ? 'The downloaded base hasn’t been confirmed yet. Finish the installation, then connect again.' : 'Once the installed base is recognised, your module set opens automatically.'}</p>
        {state.notice && <p className="file-error" role="status">{state.notice.text}</p>}
      </>}
    </>}
    </section>}
    </>}
    <footer className="base-install-footer">
      {view === 'intro' ? <><p className="link-hint">You’ll find this guide under Octatrack.</p><div className="base-install-actions"><button type="button" className="button button-quiet" disabled={!canClose} onClick={finish}>{hold ? `Later (${hold})` : 'Later'}</button><button type="button" className="button button-primary" onClick={() => setView('steps')}>Show me how<Icon name="arrow" size={16}/></button></div></> : outdated ? <>
        <button type="button" className="button button-quiet" disabled={!canClose} onClick={finish}>Close</button>
        <button type="button" className="button button-primary" onClick={() => location.reload()}>Reload page</button>
      </> : <>
        <button type="button" className="button button-quiet" disabled={stageIndex === 0 && !canClose || download === 'building'} onClick={() => stageIndex ? setStage(stages[stageIndex - 1]) : finish()}>{stageIndex ? 'Back' : 'Close'}</button>
        {overUsb && usb && 'error' in usb && <button type="button" className="button button-quiet" onClick={() => { setUsb(null); setCard(true) }}>Update from the card</button>}
        {overUsb && (firmwareReady ? <button type="button" className="button button-primary" disabled={!buildBase || !accepted || updating || state.status !== 'ready'} onClick={() => void updateOverUsb()}><Icon name="arrow" size={16}/>{updating ? 'Updating…' : usb && 'error' in usb ? 'Try again' : 'Update over USB'}</button> : <button type="button" className="button button-primary" onClick={() => fileRef.current?.click()}><Icon name="file" size={16}/>Choose OS 1.40C file</button>)}
        {stage === 'download' && !overUsb && (firmwareReady ? <button type="button" className="button button-primary" disabled={!buildBase || !accepted || download === 'building'} onClick={() => void downloadBase()}><Icon name="download" size={16}/>{download === 'building' ? 'Building the base…' : 'Download base .bin'}</button> : <button type="button" className="button button-primary" onClick={() => fileRef.current?.click()}><Icon name="file" size={16}/>Choose OS 1.40C file</button>)}
        {stage === 'copy' && <button type="button" className="button button-primary" onClick={() => setStage('install')}>File copied <Icon name="arrow" size={16}/></button>}
        {stage === 'install' && <button type="button" className="button button-primary" onClick={() => setStage('connect')}>Octatrack has started <Icon name="arrow" size={16}/></button>}
        {stage === 'connect' && state.status !== 'unsupported' && <button type="button" className={'button ' + (pending ? 'button-primary' : 'button-quiet')} disabled={state.status === 'connecting' || found} onClick={() => void link.retry()}>{state.status === 'connecting' ? 'Connecting…' : 'Connect Octatrack'}</button>}
        {stage === 'connect' && state.status === 'unsupported' && <button type="button" className="button button-quiet" disabled={!canClose} onClick={finish}>Close guide</button>}
      </>}
    </footer>
  </dialog>
}

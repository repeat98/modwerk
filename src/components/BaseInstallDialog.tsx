import { useEffect, useRef, useState } from 'react'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { saveFirmware } from '../config/firmware-filename'
import { BETA_RECOVERY_NOTICE } from '../firmware-notices'
import { finishBaseInstall, pendingBaseInstall, waitForBaseInstall } from '../config/octatrack-progress'
import { explainLinkError, type BaseUpdateStep, type OctatrackLink } from '../engine/elekloader/octatrack-link'
import { UploadDeviceError, UploadUnconfirmedError } from '../engine/elekloader/upload-session'
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
/** The update over USB in three stages and one restart (owner, 25 October 2026), told before it starts and tracked
 * while it runs. With one copy of the base the unit starts the new one from RAM, which saves itself and keeps the old
 * one as the fallback; on two slots the running base saves the new one into its spare slot, then the unit restarts. */
const USB_STAGES = {
  one: [
    ['Send', 'The new base goes over USB.'],
    ['Restart', 'The Octatrack starts the new base. Nothing is saved yet.'],
    ['Save', 'It saves the new base and keeps your current one as a fallback.'],
  ],
  two: [
    ['Send', 'The new base goes over USB.'],
    ['Save', 'It saves the new base next to your current one, which stays as a fallback.'],
    ['Restart', 'The Octatrack restarts on the new base.'],
  ],
} as const
/** Folded away below the update: what to do when it goes wrong, the beta's recovery notice included. */
const USB_RECOVERY = 'If the Octatrack doesn’t start after the update, switch it off and on: after two starts that fail, it goes back to your current base by itself. A save cut off by a power cut or the cable leaves your current base in place. As a last resort, Elektron’s startup menu installs the original OS: hold FUNC while switching on, choose MIDI UPGRADE and send the original OS 1.40C .syx through a MIDI interface.'
type UsbOrder = keyof typeof USB_STAGES
/** Which of the stages a step the link reports (updateBase) belongs to; 3 once done. On two slots the container is
 * sent while 'writing' (its fraction), then written. */
function stageOf(order: UsbOrder, step: BaseUpdateStep, fraction?: number): number {
  if (step === 'done') return 3
  if (order === 'two') return step === 'restarting' ? 2 : step === 'staging' || step === 'writing' && fraction !== undefined && fraction < 1 ? 0 : 1
  return step === 'staging' ? 0 : step === 'starting' ? 1 : 2
}
/** What is happening, as the link reports it. */
const USB_STEPS: Record<BaseUpdateStep, string> = {
  staging: 'Sending the new base to your Octatrack',
  starting: 'The Octatrack restarts on the new base. Nothing is saved yet',
  started: 'The new base works. Saving it now',
  writing: 'Saving the new base. Don’t switch off or unplug the Octatrack',
  reconnecting: 'USB dropped out. Keep the Octatrack switched on: it finishes saving by itself. Reconnecting',
  restarting: 'Saved and checked. The Octatrack restarts on the new base',
  done: 'Done. Your Octatrack runs the new base.',
}
// What the beta prompt promises: only what the base does today. Cross-compatibility,
// automatic stress tests and bug reports are still to be built (docs/OCTATRACK_ELEKLOADER_MIGRATION.md).
const ALSO_NEW: [IconName, string, string, boolean?][] = [
  ['wave', 'Better DSP memory use', '. Effects load as needed, sharing one copy of their code between tracks on the same DSP core.', true],
  ['check', 'Kept after a restart', ', the Octatrack loads your modules again when it starts'],
  ['shield', 'A self-test on the Octatrack', ' for the modules it runs, from Status or PROJ > MODWERK'],
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
  // A failed update keeps the stage it stopped in (`at`), so the window shows where, and whether anything was saved.
  const [usb, setUsb] = useState<{ step: BaseUpdateStep; fraction?: number } | { error: string; at: number } | null>(null)
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
  // The current base in another USB Audio layout: the same update over USB, to the variant the module set needs.
  // Both are read from the unit until an update over USB starts, then kept: mid-update the unit runs the new base,
  // which would turn the dialog into the first install's.
  const live = { older: !pending && unitForPrompt(state) === 'older', switching: !pending && layout !== undefined && isPublishedBase(state.identity?.base) && baseLayout(state.identity?.base) !== layout, from: state.identity?.base, order: (state.slots?.layout === 'two' ? 'two' : 'one') as UsbOrder }
  const [began, setBegan] = useState(live)
  const { older, switching, from, order } = usb ? began : live, running = baseLayout(from), usbStages = USB_STAGES[order]
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
  // Closing the page mid-update leaves a save that failed its check unrepeated, and the user unaware of it.
  useEffect(() => {
    if (!updating) return
    const stay = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', stay)
    return () => window.removeEventListener('beforeunload', stay)
  }, [updating])
  useEffect(() => {
    if (!hold) return
    const timer = window.setTimeout(() => setHold(hold - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [hold])
  function finish() { finished.current = true; onClose(true) }
  async function updateOverUsb() {
    if (await siteUpdated()) return setOutdated(true)
    setBegan(live); setUsb({ step: 'staging' })
    let at = 0
    try {
      const image = await buildBase!(layout)
      await link.updateBase(new Uint8Array(image.buffer), image.base, (step, fraction) => { at = stageOf(live.order, step, fraction); setUsb({ step, fraction }) })
      setUsb({ step: 'done' }) // the user closes it with Continue, so the end of the update is seen
    } catch (error) {
      console.error(error)
      // A transport error's own text is for developers ("hello was not confirmed; …"): say it in the link's words.
      const transport = error instanceof UploadUnconfirmedError || error instanceof UploadDeviceError
      setUsb({ error: transport ? explainLinkError(error) : error instanceof Error ? error.message : 'The update did not finish.', at })
    }
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
    <p id="base-install-intro" className="base-install-intro">{outdated ? 'Modwerk was updated since you opened this page, so it doesn’t know the current base yet. Reload the page; it then checks your Octatrack again.' : switching && running && layout ? <>Your Octatrack is set to {layoutName(running)}. USB Audio is part of the base, so switching to {layoutName(layout)} updates the base over USB. Your modules are synced again afterwards. After the Octatrack restarts, your computer sees the new audio channels. On Windows, open Sound settings → Recording → Octatrack → Properties → Advanced and pick the new channel count: Windows keeps the old one until you do.</> : older ? <>A new Modwerk base is out. Your Octatrack has an older one{from && <> (<code>{from.slice(0, 8)}</code>)</>}. {overUsb ? 'You can update it over USB, no card needed.' : 'Update it from the card, the same way as the first time.'}</> : 'A one-time install from your Octatrack’s card.'}</p>
    {!overUsb && !outdated && <ol className="base-install-progress" aria-label="Installation progress">{stages.map((item, index) => <li key={item} aria-current={stage === item ? 'step' : undefined} className={index < stageIndex ? 'is-past' : undefined}><span aria-hidden="true">{index < stageIndex ? <Icon name="check" size={13}/> : index + 1}</span>{['Download', 'Copy', 'Install', 'Connect'][index]}</li>)}</ol>}
    {!outdated && <section className="base-install-stage" aria-labelledby="base-stage-title">
    {overUsb && (() => {
      // One row of the three stages, the same before, during and after, so the window never changes its layout: what
      // will happen, then where it is, then where it stopped.
      const step = usb && 'step' in usb ? usb : undefined, failed = usb && 'error' in usb ? usb : undefined
      const at = step ? stageOf(order, step.step, step.fraction) : failed ? failed.at : -1
      const sending = step?.fraction !== undefined && step.fraction < 1
      const save = usbStages.findIndex(([title]) => title === 'Save')
      // On two slots the container goes over while 'writing': it is said as the send it is.
      const said = step && (order === 'two' && step.step === 'writing' && sending ? 'staging' : step.step)
      return <>
        <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Update over USB</h3>
        {!usb && <p>It takes a minute or two{layout ? <>, with {layoutName(layout)}</> : ''}. Your Octatrack restarts once.</p>}
        <ol className="base-update-plan" aria-label={usb ? 'Update progress' : 'What happens'}>{usbStages.map(([title, text], index) => {
          const state = !usb ? undefined : index < at || step?.step === 'done' ? 'is-complete' : index === at ? (failed ? 'is-failed' : 'is-active') : undefined
          return <li key={title} className={state} aria-current={index === at && step && step.step !== 'done' ? 'step' : undefined}>
            <span className="base-update-mark" aria-hidden="true">{state === 'is-complete' ? <Icon name="check" size={13}/> : state === 'is-failed' ? '!' : index + 1}</span>
            <strong>{title}</strong>
            <p>{text}</p>
            {index === at && sending && <progress max={1} value={step!.fraction} aria-label={title}/>}
          </li>
        })}</ol>
        {step && <>
          {/* While it saves, the line is the warning itself. */}
          <p className={usbStages[at]?.[0] === 'Save' ? 'base-install-warning' : step.step === 'done' ? 'success-note' : 'base-install-note'} role="status">{updating && <span className="status-dot is-updating" />}{USB_STEPS[said!]}{sending ? ` (${Math.round(100 * step.fraction!)} %)` : ''}{step.step === 'done' ? '' : '…'}</p>
          {updating && <p className="link-hint">Keep this page open until it says Done.</p>}
        </>}
        {failed && <div className="file-error base-update-error" role="alert">
          <strong>The update stopped.</strong>
          <p>{failed.error}{failed.at < save ? ' Nothing was saved: your Octatrack keeps its current base.' : ''}</p>
          {state.status !== 'ready' && <p>Connect the Octatrack again to try again.</p>}
        </div>}
        {!usb && <>
          <p className="base-install-warning" role="note"><Icon name="warn" size={18}/><span><strong>Save your project and stop playback first.</strong> Keep the Octatrack on and the cable in until this window says Done.</span></p>
          {firmwareReady ? <><p className="base-file-ready"><Icon name="check" size={18}/>Your OS 1.40C file is ready.</p><RiskAcceptance checked={accepted} onChange={setAccepted}/></> : <a className="text-button" href="#faq" target="_blank" rel="noreferrer">Where do I get the original OS file? <Icon name="arrow" size={14}/></a>}
          <details className="base-install-recovery"><summary>If something goes wrong</summary><p>{USB_RECOVERY} Keep the original OS 1.40C .bin and .syx on your computer. <a href="#faq" target="_blank" rel="noreferrer">Recovery in the FAQ</a></p></details>
        </>}
        <input ref={fileRef} type="file" accept=".bin" hidden aria-label="Choose your original OS 1.40C file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChooseFirmware(file) }}/>
        {firmwareError && <p className="file-error" role="alert">{firmwareError}</p>}
      </>
    })()}
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
        {overUsb && usb && 'step' in usb && usb.step === 'done' ? <button type="button" className="button button-primary" onClick={() => { finished.current = true; onReady() }}>Continue<Icon name="arrow" size={16}/></button>
        : overUsb && (firmwareReady ? <button type="button" className="button button-primary" disabled={!buildBase || !accepted || updating || state.status !== 'ready'} onClick={() => void updateOverUsb()}><Icon name="arrow" size={16}/>{updating ? 'Updating…' : usb && 'error' in usb ? 'Try again' : 'Update over USB'}</button> : <button type="button" className="button button-primary" onClick={() => fileRef.current?.click()}><Icon name="file" size={16}/>Choose OS 1.40C file</button>)}
        {stage === 'download' && !overUsb && (firmwareReady ? <button type="button" className="button button-primary" disabled={!buildBase || !accepted || download === 'building'} onClick={() => void downloadBase()}><Icon name="download" size={16}/>{download === 'building' ? 'Building the base…' : 'Download base .bin'}</button> : <button type="button" className="button button-primary" onClick={() => fileRef.current?.click()}><Icon name="file" size={16}/>Choose OS 1.40C file</button>)}
        {stage === 'copy' && <button type="button" className="button button-primary" onClick={() => setStage('install')}>File copied <Icon name="arrow" size={16}/></button>}
        {stage === 'install' && <button type="button" className="button button-primary" onClick={() => setStage('connect')}>Octatrack has started <Icon name="arrow" size={16}/></button>}
        {stage === 'connect' && state.status !== 'unsupported' && <button type="button" className={'button ' + (pending ? 'button-primary' : 'button-quiet')} disabled={state.status === 'connecting' || found} onClick={() => void link.retry()}>{state.status === 'connecting' ? 'Connecting…' : 'Connect Octatrack'}</button>}
        {stage === 'connect' && state.status === 'unsupported' && <button type="button" className="button button-quiet" disabled={!canClose} onClick={finish}>Close guide</button>}
      </>}
    </footer>
  </dialog>
}

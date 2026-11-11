import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BaseDialogFrame, BaseIntro, StagePlan, StageProgress, type BasePromise } from './BaseDialogFrame'
import { saveFirmware } from '../config/firmware-filename'
import { BASE_RECOVERY_NOTICE, MODULE_SKIP_HINT, REPORT_PROBLEMS } from '../firmware-notices'
import { finishBaseInstall, pendingBaseInstall, waitForBaseInstall } from '../config/octatrack-progress'
import { explainLinkError, type BaseUpdateStep, type OctatrackLink } from '../engine/elekloader/octatrack-link'
import { UploadDeviceError, UploadUnconfirmedError } from '../engine/elekloader/upload-session'
import { siteUpdated, unitForPrompt } from '../hooks/useBaseInstallPrompt'
import { baseLayout, isPublishedBase, layoutName, type BaseLayout } from '../engine/elekloader/base-variants'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { accountHref } from '../community/member-access'
import { RiskAcceptance } from './ConfigurationLayout'
import { Icon } from './Icon'
import { LinkHero } from './LinkHero'
import type { BaseInstallFailure } from '../community/octatrack-diagnostics-contract'
import { offerDiagnostics } from '../community/diagnostics-reask'

export interface BaseImage { buffer: ArrayBuffer; sha256: string; base: string }
/** Where a guide run got to, for whoever listens (`onStage`): each at most once per run of the guide. */
export type BaseGuideStage = 'opened' | 'file-downloaded' | 'first-connection' | 'usb-update-done' | 'failed'
/** Why a guide run failed, as far as this page can tell (`onStage('failed', …)`, at most once per run):
 * - `no-webusb`: this browser has no WebUSB, so the guide can prepare the file but never connect;
 * - `site-outdated`: Modwerk was deployed since the page opened, so it asks for a reload instead of building a base;
 * - `build-failed`: the browser could not build the base from the OS file (card download or USB update);
 * - `link-lost`: the Octatrack stopped answering during a USB update (UploadUnconfirmedError);
 * - `update-refused`: the Octatrack refused a USB update (UploadDeviceError);
 * - `update-failed`: a USB update stopped for another reason (a restart that didn't come back, the wrong base after it);
 * - `wrong-base`: after the card install, the unit connected on a base that is neither the downloaded one nor its old one.
 * The anonymous install counts take exactly these (BASE_INSTALL_FAILURES in octatrack-diagnostics-contract.ts). */
export type BaseGuideFailure = Exclude<BaseInstallFailure, 'other'>
/** The update over USB in three stages and one restart (owner, 25 October 2026), told before it starts and tracked
 * while it runs: the unit starts the new base from RAM, which saves itself and keeps the old one as the fallback, on
 * two slots as well (octatrack-link.ts updateBase). */
const USB_STAGES = [
  ['Send', 'The new base goes over USB.'],
  ['Restart', 'The Octatrack starts the new base. Nothing is saved yet.'],
  ['Save', 'It saves the new base and keeps your current one as a fallback.'],
] as const
/** Folded away below the update: what to do when it goes wrong. */
const USB_RECOVERY = 'If the Octatrack doesn’t start after the update, switch it off and on: after two starts that fail, it goes back to your current base by itself. A save cut off by a power cut or the cable leaves your current base in place. As a last resort, Elektron’s startup menu installs the original OS: hold FUNC while switching on, choose MIDI UPGRADE and send the original OS 1.40C .syx through a MIDI interface.'
/** Which of the stages a step the link reports (updateBase) belongs to; 3 once done. */
function stageOf(step: BaseUpdateStep): number {
  if (step === 'done') return 3
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
// What the guide promises: only what the base does today. Cross-compatibility,
// automatic stress tests and bug reports are still to be built (docs/OCTATRACK_ELEKLOADER_MIGRATION.md).
const ALSO_NEW: BasePromise[] = [
  ['wave', 'Better DSP memory use', '. Effects load as needed, sharing one copy of their code between tracks on the same DSP core.', true],
  ['check', 'Kept after a restart', ', the Octatrack loads your modules again when it starts'],
  ['shield', 'A self-test on the Octatrack', ' for the modules it runs, from Status or PROJ > MODWERK'],
  ['search', 'Missing modules named', ' when a project uses one the Octatrack doesn’t have'],
  ['sliders', 'Stock effects stay', ', none of them get replaced'],
]
/** The card steps after the download, kept for this tab so a reload comes back to the step it left (pendingBaseInstall
 * keeps the downloaded base the same way). */
const STAGE_KEY = 'modwerk.octatrack.base-guide-stage'
type CardStage = 'download' | 'copy' | 'install' | 'connect'
function resumedStage(): CardStage {
  try { const saved = sessionStorage.getItem(STAGE_KEY); return saved === 'copy' || saved === 'install' ? saved : 'connect' } catch { return 'connect' }
}
function keepStage(stage: CardStage | null) {
  try { if (stage && stage !== 'download') sessionStorage.setItem(STAGE_KEY, stage); else sessionStorage.removeItem(STAGE_KEY) } catch { /* the guide resumes at Connect */ }
}

/**
 * The one place to install the Modwerk base, as a guide: a first view (`launch`, when the Your Octatrack page opens it
 * by itself), then the card stages Download, Copy, Install and Connect for a first install, or one update over USB for a
 * unit on an older base. The card is the only way onto the original OS; every later update goes over USB, with the card
 * as the fallback. The Connect stage completes by itself when the unit comes back with the downloaded base, and the
 * guide resumes there (or at the card step it left) after a reload. `buildBase` is the builder's seam, absent until the
 * browser can build the base. `account` leads a visitor or an unverified member to their account first, without
 * holding up the install.
 */
export function BaseInstallDialog({ link, launch = false, layout, firmwareReady, firmwareError, onChooseFirmware, buildBase, returnSetId, account, diagnosticsStep, onStage, onClose, onReady }: {
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
  /** Not a verified member yet: the first view leads to signing in (`visitor`) or to the account (`unverified`). */
  account?: 'visitor' | 'unverified'
  /** Shown as its own last step once the unit first connects on the downloaded base; skipped entirely when absent. It
   * never holds up finishing: Continue stays available. */
  diagnosticsStep?: ReactNode
  /** Told where this run of the guide got to, each stage at most once per run (see BaseGuideStage, BaseGuideFailure). */
  onStage?: (stage: BaseGuideStage, detail?: BaseGuideFailure) => void
  /** `done` is false when the browser closed it early (Escape before the page was clicked), which must not count as seen. */
  onClose: (done: boolean) => void
  onReady: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null), finished = useRef(false), reported = useRef(new Set<BaseGuideStage>())
  const state = useOctatrackLink(link)
  const [accepted, setAccepted] = useState(false)
  // A failed update keeps the stage it stopped in (`at`), so the window shows where, and whether anything was saved.
  const [usb, setUsb] = useState<{ step: BaseUpdateStep; fraction?: number } | { error: string; at: number } | null>(null)
  const [card, setCard] = useState(false), [outdated, setOutdated] = useState(false)
  const [pending, setPending] = useState(pendingBaseInstall)
  const [download, setDownload] = useState<'idle' | 'building' | 'done' | 'failed'>(pending ? 'done' : 'idle'), [failure, setFailure] = useState('')
  const [chosenView, setView] = useState<'intro' | 'steps'>(launch && !pending ? 'intro' : 'steps')
  const [stage, setStage] = useState<CardStage>(() => pending ? resumedStage() : 'download')
  const stages = ['download', 'copy', 'install', 'connect'] as const
  const stageIndex = stages.indexOf(stage)
  const found = !!pending && state.status === 'ready' && !!state.identity?.canSubmit && state.identity.base === pending.expectedBase
  // The unit came back on the downloaded base: the end of the guide, kept even if it disconnects again. With a
  // diagnostics step the guide shows it as its last view; without one it finishes at once.
  const [arrived, setArrived] = useState(false)
  if (found && !arrived) setArrived(true)
  const view = arrived && diagnosticsStep ? 'done' : chosenView
  const updating = !!usb && 'step' in usb && usb.step !== 'done'
  const canClose = !updating
  // A unit already on an older Modwerk base is updated, not installed (the hub and the update prompt send it here).
  // The current base in another USB Audio layout: the same update over USB, to the variant the module set needs.
  // Both are read from the unit until an update over USB starts, then kept: mid-update the unit runs the new base,
  // which would turn the dialog into the first install's.
  const live = { older: !pending && unitForPrompt(state) === 'older', switching: !pending && layout !== undefined && isPublishedBase(state.identity?.base) && baseLayout(state.identity?.base) !== layout, from: state.identity?.base }
  const [began, setBegan] = useState(live)
  const { older, switching, from } = usb ? began : live, running = baseLayout(from), usbStages = USB_STAGES
  // Over USB from any older base (every base RAM-boots the new one, which writes itself: flash.c); the card stays for
  // the first install and as the fallback after an error.
  const overUsb = stage === 'download' && !card && (usb !== null || older || switching)
  // The unit is the authority: a guide that opened by itself closes once the unit says it already runs the current base.
  const alreadyCurrent = launch && !pending && !usb && !older && !switching && view !== 'done' && unitForPrompt(state) === 'current'
  // A wrong base after the card install: neither the downloaded one nor the one it ran before.
  const wrongBase = !!pending && stage === 'connect' && state.status === 'ready' && !!state.identity && state.identity.base !== pending.expectedBase && state.identity.base !== pending.previousBase
  function report(reached: BaseGuideStage, detail?: BaseGuideFailure) {
    if (reported.current.has(reached)) return
    reported.current.add(reached); onStage?.(reached, detail)
  }
  useEffect(() => { report('opened') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // The guide opens in such a browser only when the member asks for it (useBaseInstallPrompt), so this is an attempt.
  useEffect(() => { if (state.status === 'unsupported') { report('failed', 'no-webusb'); link.noWebUsb() } }, [state.status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (outdated) report('failed', 'site-outdated') }, [outdated]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wrongBase) report('failed', 'wrong-base') }, [wrongBase]) // eslint-disable-line react-hooks/exhaustive-deps
  // A page from before a deploy knows an older base: it would call the current one older, or send its own.
  useEffect(() => { if (older || switching) void siteUpdated().then(updated => { if (updated) setOutdated(true) }) }, [older, switching])
  useEffect(() => { if (pending && view === 'steps') keepStage(stage) }, [pending, stage, view])
  useEffect(() => {
    if (!arrived || finished.current) return
    finished.current = true; finishBaseInstall(); keepStage(null); report('first-connection')
    if (!diagnosticsStep) onReady()
  }, [arrived, onReady]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!alreadyCurrent || finished.current) return
    finished.current = true; onClose(true)
  }, [alreadyCurrent, onClose])
  function finish() { finished.current = true; onClose(true) }
  async function updateOverUsb() {
    if (await siteUpdated()) return setOutdated(true)
    setBegan(live); setUsb({ step: 'staging' })
    let at = 0, image: BaseImage
    try { image = await buildBase!(layout) }
    catch (error) {
      console.error(error); report('failed', 'build-failed')
      return setUsb({ error: error instanceof Error ? error.message : 'The base could not be built.', at })
    }
    try {
      await link.updateBase(new Uint8Array(image.buffer), image.base, (step, fraction) => { at = stageOf(step); setUsb({ step, fraction }) })
      setUsb({ step: 'done' }) // the user closes it with Continue, so the end of the update is seen
      report('usb-update-done')
    } catch (error) {
      console.error(error)
      report('failed', error instanceof UploadUnconfirmedError ? 'link-lost' : error instanceof UploadDeviceError ? 'update-refused' : 'update-failed')
      offerDiagnostics('base-update-failed') // DiagnosticsInvitationGate may ask about it once this window is closed
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
      report('file-downloaded')
    }
    catch (error) { console.error(error); report('failed', 'build-failed'); setFailure(error instanceof Error ? error.message : ''); setDownload('failed') }
  }
  const skipHint = MODULE_SKIP_HINT ? ' ' + MODULE_SKIP_HINT : ''

  // Closing the page mid-update leaves a save that failed its check unrepeated, and the user unaware of it: `busy`.
  return <BaseDialogFrame canClose={canClose} busy={updating} focus={view + stage} finishedRef={finished} onClose={onClose} footer={footer()}>
    {view === 'intro' ? <><BaseIntro hero={<LinkHero label="USB" />} title="Install the Modwerk base" promises={ALSO_NEW} beta={false}
      intro={<>Install the Modwerk base on your Octatrack once. After that, modules go from this page to your Octatrack over USB, without the card and without a restart. The original OS has no USB link for Modwerk, so this first install goes through the card in four steps: download the base, copy it to the card, install it with OS UPGRADE, then connect. Later base updates go over USB.</>}
      needs="You need an Octatrack (MKI or MKII), your original OS 1.40C file, a USB cable, Chrome or Edge on a computer, and a CompactFlash card reader in case USB stops working."
      missing={state.status === 'unsupported' ? 'This browser can’t talk to USB devices. Open this page in Chrome or Edge on a computer.' : undefined} />
      {account === 'visitor' ? <p className="base-install-note base-install-account">Sign in first, so your Octatrack’s setup stays with your account and you can report problems. <a className="text-button" href={accountHref('login', 'octatrack')}>Sign in</a> · <a className="text-button" href={accountHref('register', 'octatrack')}>Create account</a></p>
        : account === 'unverified' ? <p className="base-install-note base-install-account">Verify your email first, so your Octatrack’s setup stays with your account and you can report problems. <a className="text-button" href="#account">Open account</a></p> : null}
      {!['unsupported', 'ready', 'stock'].includes(state.status) && <p className="link-hint">Already installed the base? Connect your Octatrack, and this guide closes by itself.</p>}
    </> : view === 'done' ? <>
      <header className="base-install-header"><h2 id="base-install-title" tabIndex={-1}>The Modwerk base is installed</h2></header>
      <p id="base-install-intro" className="base-install-intro">Your Octatrack runs the Modwerk base. From now on, modules and base updates go over USB from Your Octatrack.</p>
      <section className="base-install-stage">{diagnosticsStep}</section>
    </> : <>
    <header className="base-install-header"><h2 id="base-install-title" tabIndex={-1}>{switching ? 'Change USB Audio' : <>{older ? 'Update' : 'Install'} the Modwerk base</>}</h2></header>
    <p id="base-install-intro" className="base-install-intro">{outdated ? 'Modwerk was updated since you opened this page, so it doesn’t know the current base yet. Reload the page; it then checks your Octatrack again.' : switching && running && layout ? <>Your Octatrack is set to {layoutName(running)}. USB Audio is part of the base, so switching to {layoutName(layout)} updates the base over USB. Your modules are synced again afterwards. After the Octatrack restarts, your computer sees the new audio channels. On Windows, open Sound settings → Recording → Octatrack → Properties → Advanced and pick the new channel count: Windows keeps the old one until you do.</> : older ? <>A new Modwerk base is out. Your Octatrack has an older one{from && <> (<code>{from.slice(0, 8)}</code>)</>}. {overUsb ? 'You can update it over USB, no card needed.' : 'Update it from the card, the same way as the first time.'}</> : 'A one-time install from the card: the original OS has no USB link for Modwerk. Later base updates go over USB.'}</p>
    {!overUsb && !outdated && <StageProgress labels={['Download', 'Copy', 'Install', 'Connect']} at={stageIndex} />}
    {!outdated && <section className="base-install-stage" aria-labelledby="base-stage-title">
    {overUsb && (() => {
      // One row of the three stages, the same before, during and after, so the window never changes its layout: what
      // will happen, then where it is, then where it stopped.
      const step = usb && 'step' in usb ? usb : undefined, failed = usb && 'error' in usb ? usb : undefined
      const at = step ? stageOf(step.step) : failed ? failed.at : -1
      const save = usbStages.findIndex(([title]) => title === 'Save')
      return <>
        <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Update over USB</h3>
        {!usb && <p>It takes a minute or two{layout ? <>, with {layoutName(layout)}</> : ''}. Your Octatrack restarts once.</p>}
        <StagePlan stages={usbStages} progressLabel="Update progress" run={usb ? { at, done: step?.step === 'done', failed: !!failed, fraction: step?.fraction } : undefined} />
        {/* While it saves, the line is the warning itself. Mounted before the update starts so screen readers hear its first step; the progress bar carries the percentage. */}
        <p className={!step ? undefined : usbStages[at]?.[0] === 'Save' ? 'base-install-warning' : step.step === 'done' ? 'success-note' : 'base-install-note'} role="status">{step && <>{updating && <span className="status-dot is-updating" />}{USB_STEPS[step.step]}{step.step === 'done' ? '' : '…'}</>}</p>
        {step && updating && <p className="link-hint">Keep this page open until it says Done.</p>}
        {failed && <div className="file-error base-update-error" role="alert">
          <strong>The update stopped.</strong>
          <p>{failed.error}{failed.at < save ? ' Nothing was saved: your Octatrack keeps its current base.' : ''}</p>
          {state.status !== 'ready' && <p>Connect the Octatrack again to try again.</p>}
        </div>}
        {!usb && <>
          <p className="base-install-warning" role="note"><Icon name="warn" size={18}/><span><strong>Save your project and stop playback first.</strong> Keep the Octatrack on and the cable in until this window says Done.</span></p>
          {firmwareReady ? <><p className="base-file-ready"><Icon name="check" size={18}/>Your OS 1.40C file is ready.</p><RiskAcceptance checked={accepted} onChange={setAccepted}/></> : <a className="text-button" href="#faq" target="_blank" rel="noreferrer">Where do I get the original OS file? <Icon name="arrow" size={14}/></a>}
          <details className="base-install-recovery"><summary>If something goes wrong</summary><p>{USB_RECOVERY}{skipHint} Keep the original OS 1.40C .bin and .syx on your computer. <a href="#faq" target="_blank" rel="noreferrer">Recovery in the FAQ</a></p></details>
        </>}
        <input ref={fileRef} type="file" accept=".bin" hidden aria-label="Choose your original OS 1.40C file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChooseFirmware(file) }}/>
        {firmwareError && <p className="file-error" role="alert">{firmwareError}</p>}
      </>
    })()}
    {stage === 'download' && !overUsb && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Download the base</h3>
      <p>The base is built in your browser from your original OS 1.40C file. The file stays on your computer.</p>
      <p className="base-install-warning" role="note"><Icon name="warn" size={18}/><span><strong>{BASE_RECOVERY_NOTICE}</strong> Keep the original OS 1.40C .bin and .syx on your computer. <a href="#faq" target="_blank" rel="noreferrer">Recovery in the FAQ</a></span></p>
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
        <li><strong>Open the Octatrack’s card on your computer</strong><p>Connect the USB cable. On the Octatrack, open <b>PROJECT → SYSTEM → USB DISK MODE</b> and press <b>YES</b>. Or take the card out and put it in a card reader.</p></li>
        <li><strong>Copy the downloaded .bin onto the card</strong><p>Put it at the top level, outside any folder.</p></li>
        <li><strong>Eject the drive on your computer</strong><p>Then leave USB DISK MODE on the Octatrack, or put the card back in.</p></li>
      </ol>
    </>}
    {stage === 'install' && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Install it on your Octatrack</h3>
      <ol className="base-instructions">
        <li><strong>Open OS UPGRADE</strong><p>Go to <b>PROJECT → SYSTEM → OS UPGRADE</b>. Press <b>YES</b> and confirm.</p></li>
        <li><strong>Keep the power on while it updates</strong><p>Wait until startup finishes, or the Octatrack explicitly asks you to restart.</p></li>
        <li><strong>Follow the restart prompt, if shown</strong><p>Only then switch the Octatrack off and on again. Leave the USB cable connected.</p></li>
      </ol>
      <details className="base-install-recovery"><summary>If the Octatrack doesn’t start or connect</summary><p>The original OS can be installed again: from the card with a CompactFlash card reader, or as the .syx through a MIDI interface and the startup menu. Follow <a href="#faq" target="_blank" rel="noreferrer">recovery in the FAQ</a>. {REPORT_PROBLEMS}</p></details>
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
  </BaseDialogFrame>

  function footer() {
    return <>
      {view === 'intro' ? <><p className="link-hint">You’ll find this guide again in Your Octatrack → Setup.</p><div className="base-install-actions"><button type="button" className="button button-quiet" disabled={!canClose} onClick={finish}>Later</button><button type="button" className="button button-primary" onClick={() => setView('steps')}>Show me how<Icon name="arrow" size={16}/></button></div></>
      : view === 'done' ? <button type="button" className="button button-primary" onClick={() => onReady()}>Continue<Icon name="arrow" size={16}/></button>
      : outdated ? <>
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
    </>
  }
}

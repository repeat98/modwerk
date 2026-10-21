import { useEffect, useRef, useState } from 'react'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { saveFirmware } from '../config/firmware-filename'
import { BETA_RECOVERY_NOTICE } from '../firmware-notices'
import { finishBaseInstall, pendingBaseInstall, waitForBaseInstall } from '../config/octatrack-progress'
import type { BaseUpdateStep, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { unitForPrompt } from '../hooks/useBaseInstallPrompt'
import { baseLayout, isPublishedBase, layoutName, type BaseLayout } from '../engine/elekloader/base-variants'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { RiskAcceptance } from './ConfigurationLayout'
import { Icon, type IconName } from './Icon'
import './octatrack-link.css'

export interface BaseImage { buffer: ArrayBuffer; sha256: string; base: string }
/** The release prompt holds this long before it can be put off. */
const LAUNCH_HOLD_SECONDS = 10
/** The update over USB, step by step, as the link reports it (updateBase). */
const USB_STEPS: Record<BaseUpdateStep, string> = {
  staging: 'Sending the new base to your Octatrack',
  starting: 'Your Octatrack restarts on the new base, from memory. Nothing is written yet',
  started: 'The new base runs and answers. Writing it to the Octatrack now',
  writing: 'Writing the new base. Keep the power and the cable on',
  restarting: 'Written and checked. Your Octatrack restarts on it',
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
const SCREEN = ['LOADING', 'TRYING', 'KEPT']

// The Octatrack MKII front panel, traced from a photo (panel 1238 x 640 px, top-left at 22, 322) and scaled into the hero.
const OT = { x: 316, y: 40, scale: 306 / 1238 }
const at = (x: number, y: number) => [OT.x + (x - 22) * OT.scale, OT.y + (y - 322) * OT.scale]
function Key({ x, y, w = 38, h = 38, className = 'signal-ghost', delay }: { x: number; y: number; w?: number; h?: number; className?: string; delay?: number }) {
  const [cx, cy] = at(x, y)
  return <rect className={className} style={delay === undefined ? undefined : { animationDelay: delay + 's' }} x={cx - w * OT.scale / 2} y={cy - h * OT.scale / 2} width={w * OT.scale} height={h * OT.scale} rx="2" />
}
function Knob({ x, y, r = 25 }: { x: number; y: number; r?: number }) {
  const [cx, cy] = at(x, y)
  return <g className="signal-secondary"><circle cx={cx} cy={cy} r={r * OT.scale} /><path d={`M${cx} ${cy - r * OT.scale}v${r * OT.scale * .55}`} /></g>
}
const KEYS: [number, number, number?, number?][] = [
  [77, 519], [193, 497], [251, 497], [309, 497], [75, 592], [134, 592], [192, 592], [251, 592], [309, 592], [193, 687, 60], [88, 775, 60], [193, 775, 60],
  [285, 716], [285, 775], [401, 716], [343, 775], [401, 775], [459, 775], ...[439, 497, 556, 614].flatMap(y => [[423, y], [792, y]] as [number, number][]),
  ...[491, 549, 607, 666, 724].map(x => [x, 670, 40] as [number, number, number]), [909, 576, 40], [1197, 870, 60, 40],
]
/** A sine squiggle like the module cards' art, `w` wide around (x, y). */
const squiggle = (x: number, y: number, w: number, a: number) => Array.from({ length: 13 }, (_, i) => (i ? 'L' : 'M') + (x + i * w / 12).toFixed(1) + ' ' + (y + Math.sin(i / 12 * Math.PI * 3) * a).toFixed(1)).join(' ')

/** This page (the module library, one card on its way) and an Octatrack MKII on a USB cable, drawn like the module previews. */
function LinkHero() {
  const [sx, sy] = at(473, 425), screenW = 269 * OT.scale, screenH = 205 * OT.scale, [fx, fy] = at(940, 745)
  return <div className="module-preview link-hero" aria-hidden="true">
    <div className="preview-label"><span>BETA</span><span className="preview-led" /></div>
    <svg viewBox="0 0 640 220" className="signal-art link-hero-art" fill="none">
      <g className="signal-grid">{[60, 110, 160].map(y => <path key={y} d={'M12 ' + y + 'H628'} />)}{[128, 256, 384, 512].map(x => <path key={x} d={'M' + x + ' 12V204'} />)}</g>
      {/* This page: sidebar, search, a grid of module cards; the highlighted one is being sent. */}
      <rect className="signal-secondary" x="24" y="44" width="200" height="128" rx="7" />
      <path className="signal-secondary" d="M12 180H236L224 190H24Z" />
      <rect className="signal-ghost" x="96" y="52" width="64" height="6" rx="3" />
      {[64, 72, 80, 88, 96].map((y, row) => <rect key={y} className={row ? 'signal-ghost' : 'signal-main'} x="34" y={y} width={row ? 22 : 26} height="3" rx="1.5" />)}
      {[0, 1].flatMap(row => [0, 1, 2].map(col => {
        const x = 74 + col * 48, y = 66 + row * 52, sent = row === 0 && col === 1
        return <g key={row + '-' + col}>
          <rect className={sent ? 'signal-main link-hero-pick' : 'signal-ghost'} x={x} y={y} width="44" height="46" rx="3" />
          <path className={sent ? 'signal-main' : 'signal-secondary'} d={squiggle(x + 7, y + 17, 30, 6)} />
          <rect className="signal-ghost" x={x + 7} y={y + 34} width="20" height="3" rx="1.5" />
        </g>
      }))}
      {/* The cable reaches the USB socket on the unit's top edge. */}
      <path className="signal-ghost" d="M236 182C292 182 282 18 384 18H500Q512 18 512 32V40" />
      <path className="signal-main link-hero-flow" d="M236 182C292 182 282 18 384 18H500Q512 18 512 32V40" />
      <rect className="signal-secondary" x={OT.x} y={OT.y} width={1238 * OT.scale} height={640 * OT.scale} rx="6" />
      <rect className="link-hero-screen" x={sx} y={sy} width={screenW} height={screenH} rx="2" />
      <text className="link-hero-name" x={sx + screenW / 2} y={sy + 14} textAnchor="middle">PREVIEW VOL</text>
      {SCREEN.map((word, i) => <text key={word} className={'link-hero-word' + (i ? '' : ' is-first')} style={{ animationDelay: -2 * ((3 - i) % 3) + 's' }} x={sx + screenW / 2} y={sy + screenH / 2 + 8} textAnchor="middle">{word}</text>)}
      <Knob x={102} y={437} r={22} />
      {[180, 209, 238, 267, 296, 325].map(x => { const [cx, cy] = at(x, 458); return <circle key={x} className="signal-secondary" cx={cx} cy={cy} r="1" /> })}
      {KEYS.map(([x, y, w, h], i) => <Key key={i} x={x} y={y} w={w} h={h} />)}
      <Key x={88} y={687} w={62} h={36} className="signal-secondary" />
      {[573, 642, 711].map(x => <Key key={x} x={x} y={775} w={60} className="signal-secondary" />)}
      {[[910, 477], [1007, 477], [1106, 477], [1205, 477], [1007, 576], [1106, 576], [1205, 576]].map(([x, y]) => <Knob key={x + '-' + y} x={x} y={y} />)}
      <path className="signal-secondary" d={`M${fx} ${fy}H${at(1120, 745)[0]}`} /><Key x={940} y={745} w={14} h={44} className="signal-secondary" />
      <Key x={846} y={746} w={60} h={60} /><Key x={1196} y={746} w={60} h={60} />
      {[1165, 1185, 1205, 1226].map(x => { const [cx, cy] = at(x, 828); return <circle key={x} className="signal-secondary" cx={cx} cy={cy} r="1.2" /> })}
      {Array.from({ length: 16 }, (_, i) => <Key key={'trig' + i} x={89 + i * 69.2} y={870} w={58} h={58} className="rhythm-off link-hero-trig" delay={i * 0.15} />)}
      <text x="124" y="208" textAnchor="middle">THIS PAGE</text><text x={OT.x + 153} y="212" textAnchor="middle">OCTATRACK MKII</text>
    </svg>
  </div>
}

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
  const [card, setCard] = useState(false)
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
    setUsb({ step: 'staging' })
    try {
      const image = await buildBase!(layout)
      await link.updateBase(new Uint8Array(image.buffer), image.base, (step, fraction) => setUsb({ step, fraction }))
      setUsb({ step: 'done' }); finished.current = true; onReady()
    } catch (error) { console.error(error); setUsb({ error: error instanceof Error ? error.message : 'The update did not finish.' }) }
  }
  async function downloadBase() {
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
      <p id="base-install-intro" className="base-install-intro">Install the Modwerk base once from the card. After that, modules go straight from this page to your Octatrack, without the card and without a reboot. It’s a beta, so please tell me in <strong>#beta-testers</strong> on the <a href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer">development Discord</a> what goes wrong, not through the report forms on this site.</p>
      <ul className="link-promises">{ALSO_NEW.map(([icon, lead, rest, explainOnPhone]) => <li key={lead}><span className="link-feature-icon" aria-hidden="true"><Icon name={icon} size={18} /></span><span><strong>{lead}</strong><span className={explainOnPhone ? undefined : 'link-feature-rest'}>{rest}</span></span></li>)}</ul>
      <p className={'link-needs' + (state.status === 'unsupported' ? ' is-missing' : '')}>You need an Octatrack MKII, your OS 1.40C file, a USB cable, Chrome or Edge on a computer, and a CompactFlash card reader in case USB stops working.</p>
      {state.status === 'unsupported' && <p className="file-error" role="alert">This browser can’t talk to USB devices. Open this page in Chrome or Edge on a computer.</p>}
    </> : <>
    <header className="base-install-header"><h2 id="base-install-title" tabIndex={-1}>{switching ? 'Change USB Audio' : <>{older ? 'Update' : 'Install'} the Modwerk base</>} <span className="module-beta-badge">Beta</span></h2></header>
    <p id="base-install-intro" className="base-install-intro">{switching && running && layout ? <>Your Octatrack runs the Modwerk base with {layoutName(running)}. USB Audio is part of the base, so I’ll send the same base with {layoutName(layout)} over USB. Your modules stay; your computer sees the Octatrack’s audio change after it restarts. On Windows, then open Sound settings → Recording → Octatrack → Properties → Advanced and pick the new channel count: Windows keeps the old one until you do.</> : older ? <>Your Octatrack runs an older Modwerk base{state.identity && <> (<code>{state.identity.base.slice(0, 8)}</code>)</>}. {overUsb ? 'I’ll send the current one over USB; the card is only for the first install.' : 'Install the current one from the card, the same way as the first time.'}</> : 'A one-time install from your Octatrack’s card.'}</p>
    {!overUsb && <ol className="base-install-progress" aria-label="Installation progress">{stages.map((item, index) => <li key={item} aria-current={stage === item ? 'step' : undefined} className={index < stageIndex ? 'is-past' : undefined}><span aria-hidden="true">{index < stageIndex ? <Icon name="check" size={13}/> : index + 1}</span>{['Download', 'Copy', 'Install', 'Connect'][index]}</li>)}</ol>}
    <section className="base-install-stage" aria-labelledby="base-stage-title">
    {overUsb && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Update over USB</h3>
      <p>I’ll build the current base{layout ? <> with {layoutName(layout)}</> : ''} in your browser from your original OS 1.40C file and send it over USB. Your Octatrack starts it from memory first, without writing anything; only once it runs and answers does it write it and restart. Keep the power and the cable on while it writes.</p>
      <p className="base-install-warning" role="note"><Icon name="warn" size={18}/><span><strong>{BETA_RECOVERY_NOTICE}</strong> Keep the original OS 1.40C .bin and .syx on your computer. <a href="#faq" target="_blank" rel="noreferrer">Recovery in the FAQ</a></span></p>
      <input ref={fileRef} type="file" accept=".bin" hidden aria-label="Choose your original OS 1.40C file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChooseFirmware(file) }}/>
      {firmwareReady ? <><p className="base-file-ready"><Icon name="check" size={18}/>Your OS 1.40C file is ready.</p>{!usb && <RiskAcceptance checked={accepted} onChange={setAccepted}/>}</> : <a className="text-button" href="#faq" target="_blank" rel="noreferrer">Where do I get the original OS file? <Icon name="arrow" size={14}/></a>}
      {firmwareError && <p className="file-error" role="alert">{firmwareError}</p>}
      {usb && 'step' in usb && <p className="base-install-note" role="status">{USB_STEPS[usb.step]}{usb.fraction !== undefined && usb.fraction < 1 ? ` (${Math.round(100 * usb.fraction)} %)` : ''}{usb.step === 'done' ? '' : '…'}</p>}
      {usb && 'error' in usb && <p className="file-error" role="alert">{usb.error} {state.status === 'ready' ? 'You can try again, or update from the card.' : 'Once it is connected again you can try again, or update from the card.'}</p>}
    </>}
    {stage === 'download' && !overUsb && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Download the base</h3>
      <p>I’ll build it in your browser from your original OS 1.40C file. Your firmware stays on your computer.</p>
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
      <details className="base-install-recovery"><summary>If the Octatrack doesn’t start or connect</summary><p>The original OS can be installed again: from the card with a CompactFlash card reader, or as the .syx through a MIDI interface and the startup menu. Follow <a href="#faq" target="_blank" rel="noreferrer">recovery in the FAQ</a>, and tell me in #beta-testers on Discord.</p></details>
    </>}
    {stage === 'connect' && <>
      <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Waiting for your Octatrack</h3>
      {state.status === 'unsupported' ? <><p>This browser can’t connect to USB devices.</p><p>Open Modwerk in <strong>Chrome or Edge on a computer</strong>, sign in and connect your Octatrack. The base you just installed stays on it.</p></> : <>
        <p>Keep the USB cable connected. Choose your Octatrack in the browser’s device list.</p>
        <p className="base-install-note" role="status">{found ? 'The downloaded base is confirmed. Opening your module set…' : state.status === 'connecting' ? 'Connecting to your Octatrack…' : state.status === 'stock' || state.status === 'ready' ? 'The downloaded base hasn’t been confirmed yet. Finish the installation, then connect again.' : 'Once I recognise the installed base, I’ll open your module set automatically.'}</p>
        {state.notice && <p className="file-error" role="status">{state.notice.text}</p>}
      </>}
    </>}
    </section>
    </>}
    <footer className="base-install-footer">
      {view === 'intro' ? <><p className="link-hint">You’ll find this guide under Octatrack.</p><div className="base-install-actions"><button type="button" className="button button-quiet" disabled={!canClose} onClick={finish}>{hold ? `Later (${hold})` : 'Later'}</button><button type="button" className="button button-primary" onClick={() => setView('steps')}>Show me how<Icon name="arrow" size={16}/></button></div></> : <>
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

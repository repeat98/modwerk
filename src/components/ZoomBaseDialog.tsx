import { useEffect, useRef, useState } from 'react'
import type { DeviceProfile } from '../devices/registry'
import { ZoomPedalArt } from '../devices/ZoomPedalArt'
import type { ZoomStock } from '../engine/zoom/zoom-base'
import type { ZoomLink } from '../engine/zoom/zoom-link'
import { ZOOM_BASE, isUpdateMode } from '../engine/zoom/zoom-protocol'
import { useZoomLink } from '../hooks/useZoomLink'
import { deviceStore, openDeviceDatabase } from '../storage/device'
import { BaseDialogFrame, BaseIntro, StagePlan, StageProgress, type BasePromise } from './BaseDialogFrame'
import { RiskAcceptance } from './ConfigurationLayout'
import { Icon } from './Icon'

const STAGES = ['updater', 'mode', 'flash', 'restart'] as const
type Stage = typeof STAGES[number]
const FLASH_STEPS = [
  ['Erase', 'The pedal’s OS is erased. The bootloader and your effects stay.'],
  ['Write', 'The base goes over USB, block by block.'],
  ['Finish', 'The pedal closes the flash and waits to be restarted.'],
] as const
const STEP_AT = { erase: 0, write: 1, finish: 2 }
// Only what MIDISTOMP's release does (its patches' descriptions in vendor/midistomp/midistomp.json).
const PROMISES: BasePromise[] = [
  ['sliders', 'MIDI control', ', knobs, effects on and off, patches and tap tempo from MIDI CC'],
  ['play', 'Follows MIDI clock', ', the patch tempo and a transport the effects can read'],
  ['grid', 'A mixer', ' with saved buses, on its own screen'],
  ['wave', 'More at once', ', the DSP limit rises from 225 to 300', true],
  ['swap', 'Looper services', ' for the Looper effect: a big buffer, footswitch and CC'],
  ['shield', 'Your effects stay', ', the flash never touches them'],
]
const RECOVERY = 'The bootloader is never written, so the pedal can always go back: unplug it, hold Up and Down while plugging it in, and flash again here. Or run Zoom’s own MS-70CDR 2.10 updater, which puts Zoom’s firmware back and also rewrites the effects area, so back up your files first (Backups).'
const SUPPORT = 'https://zoomcorp.com/en/us/multi-effects/multistomp-pedals/ms-70cdr/ms-70cdr-support/'
const store = () => openDeviceDatabase().then(deviceStore)
// The builder carries MIDISTOMP's patches (277 KB): loaded when a zip is read, not with the page.
const builder = () => import('../engine/zoom/zoom-base')
const readZip = (file: File) => Promise.all([file.arrayBuffer(), builder()]).then(([buffer, zoom]) => zoom.readUpdater(new Uint8Array(buffer)))
const buildRelease = (stock: ZoomStock) => builder().then(zoom => zoom.buildRelease(stock))

/**
 * Installing the Modwerk base on an MS-70CDR, like the Octatrack's (BaseInstallDialog), in the shared frame: Zoom's
 * updater (the .zip, kept in this browser), update mode, the flash, and the restart, which is done when the pedal
 * answers with the base's tag. The link reconnects by itself each time the pedal comes back. `read` and `build` are
 * seams for tests (the real ones need Zoom's own files).
 */
export function ZoomBaseDialog({ link, device, onClose, read = readZip, build = buildRelease }: {
  link: ZoomLink
  device: DeviceProfile
  onClose: () => void
  read?: (file: File) => Promise<ZoomStock>
  build?: (stock: ZoomStock) => Promise<{ main: Uint8Array; preset?: Uint8Array }>
}) {
  const state = useZoomLink(link), { status, identity } = state
  const connected = status === 'ready' || status === 'reading' || status === 'writing'
  const updateMode = connected && isUpdateMode(identity), onBase = connected && identity?.deviceId === 0x61 && identity.firmware === ZOOM_BASE.tag
  const finished = useRef(false), fileRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<'intro' | 'steps'>('intro'), [stage, setStage] = useState<Stage>('updater')
  const [stock, setStock] = useState<ZoomStock>(), [fileError, setFileError] = useState(''), [accepted, setAccepted] = useState(false)
  const [run, setRun] = useState<{ step: keyof typeof STEP_AT | 'done'; fraction: number } | { error: string; at: number } | null>(null)
  const flashing = !!run && 'step' in run && run.step !== 'done'
  const at = STAGES.indexOf(stage)

  // Zoom's updater, chosen once: kept in this browser like the Octatrack's OS file, and checked again each time.
  useEffect(() => {
    let live = true
    void store().then(s => s.readFirmware('zoom-ms-70cdr')).then(async saved => {
      if (saved) { const parts = await read(new File([saved.blob], saved.name)); if (live) setStock(s => s ?? parts) }
    }).catch(() => undefined)
    return () => { live = false }
  }, [read])
  async function choose(file: File) {
    setFileError('')
    try {
      setStock(await read(file))
      void store().then(s => s.saveFirmware(file, 'zoom-ms-70cdr')).catch(() => undefined)
    } catch (error) { setStock(undefined); setFileError((error as Error).message) }
  }
  async function flash() {
    setStage('flash'); setRun({ step: 'erase', fraction: 0 })
    let step: keyof typeof STEP_AT = 'erase'
    try {
      const base = await build(stock!)
      await link.flashBase(base.main, base.preset, (next, fraction) => { step = next; setRun({ step: next, fraction }) })
      setRun({ step: 'done', fraction: 1 }); setStage('restart')
    } catch (error) { setRun({ error: (error as Error).message, at: STEP_AT[step] }) }
  }

  const failed = run && 'error' in run ? run : undefined, running = run && 'step' in run ? run : undefined
  const restartLine = onBase ? <p className="success-note" role="status"><Icon name="check" size={16} /> Your {device.name} runs {ZOOM_BASE.name}.</p>
    : updateMode ? <p className="base-install-note" role="status">It started in update mode again. Unplug it, then plug it in without holding any buttons.</p>
    : connected ? <p className="file-error" role="status">Your pedal answers with firmware {identity?.firmware || 'unknown'}, not the base. Go back and flash again.</p>
    : status === 'idle' && state.notice?.tone === 'error' ? <p className="base-install-note" role="status">{state.notice.text} Once it shows its patch screen, connect again.</p>
    : <p className="base-install-note" role="status">Waiting for your pedal…</p>
  const modeLine = updateMode ? <p className="success-note" role="status"><Icon name="check" size={16} /> Your {device.name} is in update mode.</p>
    : connected ? <p className="base-install-note" role="status">Your pedal is running normally. Unplug it, then plug it in again while holding Up and Down.</p>
    : status === 'connecting' ? <p className="base-install-note" role="status">Looking for your pedal…</p>
    : <p className="base-install-note" role="status">{state.notice && state.notice.tone === 'error' ? state.notice.text : 'Once the pedal is in update mode, this page finds it by itself.'}</p>

  const footer = view === 'intro' ? <>
    <p className="link-hint">You’ll find this under Setup on the pedal’s page.</p>
    <div className="base-install-actions"><button type="button" className="button button-quiet" onClick={() => { finished.current = true; onClose() }}>Later</button><button type="button" className="button button-primary" onClick={() => setView('steps')}>Show me how<Icon name="arrow" size={16} /></button></div>
  </> : <>
    <button type="button" className="button button-quiet" disabled={flashing} onClick={() => stage === 'updater' || stage === 'restart' && onBase ? (finished.current = true, onClose()) : setStage(STAGES[at - 1])}>{stage === 'updater' || stage === 'restart' && onBase ? 'Close' : 'Back'}</button>
    {stage === 'updater' && (stock ? <button type="button" className="button button-primary" disabled={!accepted} onClick={() => setStage('mode')}>Next<Icon name="arrow" size={16} /></button>
      : <button type="button" className="button button-primary" onClick={() => fileRef.current?.click()}><Icon name="file" size={16} />Choose Zoom’s updater</button>)}
    {stage === 'mode' && (status === 'idle' && !updateMode ? <button type="button" className="button button-primary" onClick={() => void link.connect()}>Connect</button>
      : <button type="button" className="button button-primary" disabled={!updateMode} onClick={() => void flash()}><Icon name="arrow" size={16} />Flash the base</button>)}
    {stage === 'flash' && <button type="button" className="button button-primary" disabled={flashing || !updateMode} onClick={() => void flash()}>{flashing ? 'Flashing…' : 'Try again'}</button>}
    {stage === 'restart' && (status === 'idle' ? <button type="button" className="button button-primary" onClick={() => void link.connect()}>Connect</button>
      : <button type="button" className="button button-primary" disabled={!onBase} onClick={() => { finished.current = true; onClose() }}>Done</button>)}
  </>

  return <BaseDialogFrame canClose={!flashing} busy={flashing} focus={view + stage} finishedRef={finished} onClose={onClose} footer={footer}>
    {view === 'intro' ? <BaseIntro title={<>{ZOOM_BASE.name.split(' ')[0]} on your {device.name}</>} promises={PROMISES}
      hero={<div className="module-preview link-hero" aria-hidden="true"><div className="preview-label"><span>BETA</span><span className="preview-led" /></div><ZoomPedalArt device={device} /></div>}
      intro={<>Flash the base once over USB: Zoom’s own firmware, patched in your browser with Luca Matturro’s <a href="https://github.com/matujuice/zoom-ms-midistomp" target="_blank" rel="noreferrer">MIDISTOMP</a>. Zoom’s 2.10 updater puts the original back at any time. It’s a beta: please report problems in <strong>#zoom-pedals</strong> on the development Discord.</>}
      needs={'You need an ' + device.name + ', Zoom’s MS-70CDR 2.10 updater for Mac (the .zip; it works here on any computer), a USB cable, and Chrome or Edge on a computer.'}
      missing={status === 'unsupported' ? 'This browser can’t use MIDI. Open this page in Chrome or Edge on a computer.' : undefined} /> : <>
      <header className="base-install-header"><h2 id="base-install-title" tabIndex={-1}>Install the Modwerk base <span className="module-beta-badge">Beta</span></h2></header>
      <p id="base-install-intro" className="base-install-intro">{ZOOM_BASE.name}, flashed once over USB. It takes about a minute.</p>
      <StageProgress labels={['Updater', 'Update mode', 'Flash', 'Restart']} at={at} />
      <section className="base-install-stage" aria-labelledby="base-stage-title">
        {stage === 'updater' && <>
          <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Zoom’s updater</h3>
          <p>The base is built in your browser from Zoom’s own MS-70CDR 2.10 updater for Mac, as you download it (the .zip). The file stays on your computer.</p>
          {stock ? <><p className="base-file-ready"><Icon name="check" size={18} />Zoom’s 2.10 updater is ready.</p><RiskAcceptance checked={accepted} onChange={setAccepted} /></>
            : <a className="text-button" href={SUPPORT} target="_blank" rel="noreferrer">Download MS-70CDR_v2.10_Mac_E.zip from Zoom <Icon name="arrow" size={14} /></a>}
          {fileError && <p className="file-error" role="alert">{fileError}</p>}
          <input ref={fileRef} type="file" accept=".zip" hidden aria-label="Choose Zoom’s MS-70CDR 2.10 updater" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file) }} />
          <details className="base-install-recovery"><summary>If something goes wrong</summary><p>{RECOVERY}</p></details>
        </>}
        {stage === 'mode' && <>
          <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Put the pedal in update mode</h3>
          <ol className="base-instructions">
            <li><strong>Unplug the pedal’s USB cable</strong><p>And its power supply, if one is plugged in. Close Zoom’s updater and editors.</p></li>
            <li><strong>Hold Up and Down, and plug the USB cable back in</strong><p>Let go when the pedal shows its update screen.</p></li>
          </ol>
          {modeLine}
        </>}
        {stage === 'flash' && <>
          <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Flash</h3>
          <StagePlan stages={FLASH_STEPS} progressLabel="Flash progress" run={failed ? { at: failed.at, failed: true } : running && { at: running.step === 'done' ? 2 : STEP_AT[running.step], done: running.step === 'done', fraction: running.fraction }} />
          {flashing && <p className="base-install-warning" role="status"><span className="status-dot is-updating" />Don’t unplug the pedal or close this page until it’s done.</p>}
          {failed && <div className="file-error base-update-error" role="alert"><strong>The flash stopped.</strong><p>{failed.error}</p>{!updateMode && <p>Put the pedal in update mode again to try again.</p>}</div>}
          {failed && <details className="base-install-recovery"><summary>If it won’t start</summary><p>{RECOVERY}</p></details>}
        </>}
        {stage === 'restart' && <>
          <h3 id="base-stage-title" data-stage-title tabIndex={-1}>Start the pedal on the base</h3>
          <ol className="base-instructions">
            <li><strong>Unplug the USB cable</strong><p>The flash is done.</p></li>
            <li><strong>Plug it in again, without holding any buttons</strong><p>It starts with MIDISTOMP’s boot screen.</p></li>
          </ol>
          {restartLine}
        </>}
      </section>
    </>}
  </BaseDialogFrame>
}

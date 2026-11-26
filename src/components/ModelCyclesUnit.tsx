import { useEffect, useState, type ReactNode } from 'react'
import { DeviceImage } from '../devices/DeviceImage'
import { MC_UNIT_ROUTE, deviceHref, type DeviceProfile } from '../devices/registry'
import { findUnit, type MidiAccessLike } from '../engine/elektron/os-upgrade-midi'
import { readMcStatus, type McStatus } from '../engine/elektron/mc-link'
import { browserMidi } from '../engine/elektron/usb-upgrade'
import { useMobileWorkspace } from '../hooks/useMobileWorkspace'
import { Icon } from './Icon'
import { LoadChart, Meter } from './OctatrackLoad'
import './octatrack-link.css'
import './octatrack-load.css'

const INTERVAL = 2000, HISTORY = 150
const SERIES: { key: 'audio' | 'block'; title: string; className: string }[] = [{ key: 'audio', title: 'Audio', className: 'load-core1' }, { key: 'block', title: 'Busiest block', className: 'load-cpu' }]
type Point = { at: number; reading: { audio: number; block: number } | null }
/** none: no Model:Cycles port (or two); stock: a port, but no answer to the link. */
type Status = 'unsupported' | 'idle' | 'connecting' | 'none' | 'stock' | 'ready'
const tenths = (percent: number | null | undefined) => percent == null ? null : Math.round(percent * 10)
const count = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many)
const kb = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB'

/** Reads the unit every two seconds once MIDI is allowed: identity, live modules and load over one line each time.
 * A load window that hasn't moved is a gap. shortcut: kept while this page is open, not app-wide as the Octatrack's;
 * record it across pages when someone needs that. */
function useMcUnit(request: (() => Promise<MidiAccessLike>) | null) {
  const [access, setAccess] = useState<MidiAccessLike>()
  const [state, setState] = useState<{ status: Status; read?: McStatus; points: Point[]; now: number; error?: string }>({ status: request ? 'idle' : 'unsupported', points: [], now: 0 })
  useEffect(() => {
    if (!access) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, windows: number | undefined
    const tick = async () => {
      try {
        const read = findUnit(access, 'Model:Cycles') ? await readMcStatus(access) : undefined
        if (!live) return
        const load = read?.load, fresh = load && load.windowPercent !== null && load.windows !== windows ? load : null
        windows = load?.windows
        setState(s => ({ status: read ? 'ready' : read === null ? 'stock' : 'none', read: read ?? undefined, now: Date.now(),
          points: [...s.points, { at: Date.now(), reading: fresh && { audio: tenths(fresh.windowPercent)!, block: tenths(fresh.windowPeakPercent) ?? 0 } }].slice(-HISTORY) }))
      } catch (error) { if (live) setState(s => ({ ...s, error: (error as Error).message })) }
      if (live) timer = setTimeout(() => void tick(), INTERVAL)
    }
    void tick()
    return () => { live = false; clearTimeout(timer) }
  }, [access])
  const connect = () => {
    if (!request) return
    setState(s => ({ ...s, status: 'connecting', error: undefined }))
    request().then(setAccess, (error: Error) => setState(s => ({ ...s, status: 'idle', error: 'MIDI wasn’t allowed: ' + error.message })))
  }
  return { ...state, connect, clear: () => setState(s => ({ ...s, points: [] })) }
}

/**
 * Your Model:Cycles: the Octatrack's Status (OctatrackHub.tsx, as ZoomHub.tsx has it) over the Model:Cycles' link,
 * USB MIDI SysEx (mc-link.ts): the base it runs, its live modules and its audio load. Beta only (App.tsx).
 * `request` asks the browser for MIDI with SysEx; null where it has none.
 */
export function ModelCyclesUnit({ device, header, request = browserMidi() }: { device: DeviceProfile; header?: ReactNode; request?: (() => Promise<MidiAccessLike>) | null }) {
  const mobile = useMobileWorkspace()
  const { status, read, points, now, error, connect, clear } = useMcUnit(request)
  const identity = read?.identity, modules = read?.modules, load = read?.load, ready = status === 'ready'
  const last = points.at(-1), latest = ready && last && now - last.at <= 6000 ? last.reading : null
  const build = <a href={deviceHref(device.id, 'configuration')}>Build the base</a>
  const line: ReactNode = status === 'unsupported' ? 'This browser can’t use MIDI. Open this page in Chrome or Edge on a computer.'
    : status === 'connecting' ? 'Looking for your Model:Cycles…'
    : status === 'none' ? 'No Model:Cycles over USB. Plug one in and switch it on.'
    : status === 'stock' ? 'Connected · no Modwerk base'
    : ready ? <>Connected · Modwerk base{modules && <> · {count(modules.modules.length, 'module', 'modules')}</>}</>
    : 'Not connected'
  const off = !ready ? 'Connect your Model:Cycles to see its load.' : !load ? 'This base doesn’t measure its load. A newer one does.' : undefined
  const offCell = status === 'stock' ? <p className="hub-empty">It runs Elektron’s OS, or a base without the link. {build}, then send it over USB.</p>
    : <p className="hub-empty">{status === 'none' ? 'No Model:Cycles over USB.' : 'Connect your Model:Cycles to read it.'}</p>

  if (mobile) return <div className="configuration-page">
    {header}
    <div className="page-heading"><div><h1>Your {device.name}</h1><p>Connecting a Model:Cycles needs Chrome or Edge on a computer.</p></div></div>
    <a className="button button-quiet" href={deviceHref(device.id)}>Open {device.name} page <Icon name="arrow" size={15} /></a>
  </div>
  return <div className="configuration-page octatrack-hub">
    {header}
    <div className="hub-split">
      <header className="hub-hero">
        <DeviceImage device={device} eager />
        <div><h1 className="hub-view-title">{device.name}</h1>
          <p role="status"><span className={'unit-led is-' + (ready ? 'on' : status === 'connecting' ? 'load' : 'off')} aria-hidden="true" />{line}</p>
          {error && <p role="alert">{error}</p>}
        </div>
        {status === 'idle' && <button className="button button-quiet" onClick={connect}>Connect</button>}
      </header>
      <nav className="hub-nav" aria-label={'Your ' + device.name}>
        <div className="hub-nav-group">
          <h2 className="hub-nav-label">{device.name}</h2>
          <ul className="hub-nav-list">
            <li><a className="hub-nav-item" href={'#' + MC_UNIT_ROUTE} aria-current="page"><Icon name="grid" size={16} /><span>Status</span></a></li>
            <li><a className="hub-nav-item" href={deviceHref(device.id, 'configuration')}><Icon name="sliders" size={16} /><span>Build firmware</span></a></li>
          </ul>
        </div>
      </nav>
      <div className="hub-pane">
        <section className="hub-view hub-view-status" aria-label="Status"><div className="hub-console">
          <Meter area="hub-cell-cpu" title="Audio · working now" value={latest?.audio} note="Its share of the CPU, last half second" />
          <Meter area="hub-cell-dsp1" title="Busiest block · now" value={latest?.block} note="The dearest audio block of that half second" />
          <Meter area="hub-cell-dsp2" title="Busiest block · since switched on" value={ready ? tenths(load?.peakPercent) : null} note={load ? count(load.windows, 'window', 'windows') + ' measured' : undefined} />
          <LoadChart points={points} now={now} series={SERIES} onClear={clear} off={off}
            note={latest ? 'Every two seconds while this page is open. Audio is the share of the CPU the six tracks’ sound takes; the rest runs the screen and the sequencer.' : 'Waiting for the next reading.'} />
          <section className="hub-cell hub-cell-health" aria-labelledby="mc-base-cell">
            <h3 id="mc-base-cell">Base</h3>
            {!ready || !identity ? offCell : <>
              <p className="hub-test"><span className="unit-led is-on" aria-hidden="true" />Modwerk base · link {identity.linkVersion}</p>
              <p className="hub-empty">{identity.set ? <>Set {identity.set.crc.toString(16).padStart(8, '0')} · {identity.set.bytes} bytes: the base and the modules flashed with it.</> : 'This base doesn’t report its set. A newer one does.'}</p>
              {identity.ramBoot.status === 'booted from RAM' && <p className="hub-empty">Running from RAM: a power cycle brings back the flashed OS.</p>}
            </>}
          </section>
          <section className="hub-cell hub-cell-unit" aria-labelledby="mc-memory-cell">
            <h3 id="mc-memory-cell">Module memory</h3>
            {!ready ? offCell : !modules ? <p className="hub-empty">This base loads no modules over USB. A newer one does.</p> : <>
              <p className="hub-test">{kb(modules.free)} free</p>
              <p className="hub-empty">Largest free block {kb(modules.largest)}.{modules.refusal !== 'none' && <> Last refused: {modules.refusal}.</>}</p>
            </>}
          </section>
          <section className="hub-cell hub-cell-history" aria-labelledby="mc-modules-cell">
            <div className="hub-cell-head"><h3 id="mc-modules-cell">On your Model:Cycles{modules && <> · {modules.modules.length}</>}</h3></div>
            {!ready ? offCell : !modules?.modules.length ? <p className="hub-empty">{modules ? 'No modules loaded. Modules kept over USB show here until the next power cycle.' : 'This base loads no modules over USB.'}</p>
              : <ul className="hub-history">{modules.modules.map(module => <li key={module.id}><span className="unit-led is-on" aria-hidden="true" /><span className="hub-history-name"><strong>{module.name || 'Unnamed module'}</strong></span><span className="hub-history-end"><small>{module.id}</small></span></li>)}</ul>}
          </section>
        </div></section>
      </div>
    </div>
  </div>
}

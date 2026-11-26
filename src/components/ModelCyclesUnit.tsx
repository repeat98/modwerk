import { useEffect, useState, type ReactNode } from 'react'
import { DeviceImage } from '../devices/DeviceImage'
import { MC_UNIT_ROUTE, RYTM_UNIT_ROUTE, deviceHref, type DeviceProfile } from '../devices/registry'
import { findUnit, type MidiAccessLike } from '../engine/elektron/os-upgrade-midi'
import { readMcStatus, type McLoad, type McModules } from '../engine/elektron/mc-link'
import { RYTM_PORT, readRytmStatus } from '../engine/elektron/rytm-link'
import { browserMidi } from '../engine/elektron/usb-upgrade'
import { useMobileWorkspace } from '../hooks/useMobileWorkspace'
import { Icon } from './Icon'
import { LoadChart, Meter } from './OctatrackLoad'
import './octatrack-link.css'
import './octatrack-load.css'

/** What the page reads, the same for every machine on the Modwerk SysEx link: the identity (the set identity and the
 * RAM boot in every base; the Rytm also names its label and whether the base is a release one), the live modules and
 * the load. */
export type UnitStatus = {
  identity: { linkVersion: number; set: { crc: number; bytes: number } | null; ramBoot: { status: string }; label?: string; release?: boolean }
  modules: McModules | null; load: McLoad | null
}
/** A machine the page reads over its link: the model name its USB MIDI port carries, its reader, its route, and how
 * its audio note reads. */
export type UnitKind = { port: string; route: string; read: (access: MidiAccessLike) => Promise<UnitStatus | null>; audio: string }
export const MC_UNIT: UnitKind = { port: 'Model:Cycles', route: MC_UNIT_ROUTE, read: access => readMcStatus(access), audio: 'the six tracks’ sound' }
export const RYTM_UNIT: UnitKind = { port: RYTM_PORT, route: RYTM_UNIT_ROUTE, read: access => readRytmStatus(access), audio: 'the voices, the sample playback and the FX' }

const INTERVAL = 2000, HISTORY = 150
const SERIES: { key: 'audio' | 'block'; title: string; className: string }[] = [{ key: 'audio', title: 'Audio', className: 'load-core1' }, { key: 'block', title: 'Busiest block', className: 'load-cpu' }]
type Point = { at: number; reading: { audio: number; block: number } | null }
/** none: no port of the machine (or two); stock: a port, but no answer to the link. */
type Status = 'unsupported' | 'idle' | 'connecting' | 'none' | 'stock' | 'ready'
const tenths = (percent: number | null | undefined) => percent == null ? null : Math.round(percent * 10)
const count = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many)
const kb = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB'

/** Reads the unit every two seconds once MIDI is allowed: identity, live modules and load over one line each time.
 * A load window that hasn't moved is a gap. shortcut: kept while this page is open, not app-wide as the Octatrack's;
 * record it across pages when someone needs that. */
function useUnit(kind: UnitKind, request: (() => Promise<MidiAccessLike>) | null) {
  const [access, setAccess] = useState<MidiAccessLike>()
  const [state, setState] = useState<{ status: Status; read?: UnitStatus; points: Point[]; now: number; error?: string }>({ status: request ? 'idle' : 'unsupported', points: [], now: 0 })
  useEffect(() => {
    if (!access) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, windows: number | undefined
    const tick = async () => {
      try {
        const read = findUnit(access, kind.port) ? await kind.read(access) : undefined
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
  }, [access, kind])
  const connect = () => {
    if (!request) return
    setState(s => ({ ...s, status: 'connecting', error: undefined }))
    request().then(setAccess, (error: Error) => setState(s => ({ ...s, status: 'idle', error: 'MIDI wasn’t allowed: ' + error.message })))
  }
  return { ...state, connect, clear: () => setState(s => ({ ...s, points: [] })) }
}

type UnitProps = { device: DeviceProfile; header?: ReactNode; request?: (() => Promise<MidiAccessLike>) | null }
/** Your Model:Cycles (mc-link.ts). */
export const ModelCyclesUnit = (props: UnitProps) => <ElektronUnit {...props} kind={MC_UNIT} />
/** Your Analog Rytm MKII (rytm-link.ts). */
export const RytmUnit = (props: UnitProps) => <ElektronUnit {...props} kind={RYTM_UNIT} />

/**
 * Your unit: the Octatrack's Status (OctatrackHub.tsx, as ZoomHub.tsx has it) over a Modwerk base's link, USB MIDI SysEx:
 * the base it runs, its live modules and its audio load. The Model:Cycles and the Analog Rytm MKII share it (`kind`).
 * Beta only (App.tsx). `request` asks the browser for MIDI with SysEx; null where it has none.
 */
export function ElektronUnit({ device, header, request = browserMidi(), kind }: UnitProps & { kind: UnitKind }) {
  const mobile = useMobileWorkspace()
  const { status, read, points, now, error, connect, clear } = useUnit(kind, request)
  const identity = read?.identity, modules = read?.modules, load = read?.load, ready = status === 'ready'
  const last = points.at(-1), latest = ready && last && now - last.at <= 6000 ? last.reading : null
  const build = <a href={deviceHref(device.id, 'configuration')}>Build the base</a>
  const line: ReactNode = status === 'unsupported' ? 'This browser can’t use MIDI. Open this page in Chrome or Edge on a computer.'
    : status === 'connecting' ? 'Looking for your ' + device.name + '…'
    : status === 'none' ? 'No ' + device.name + ' over USB. Plug one in and switch it on.'
    : status === 'stock' ? 'Connected · no Modwerk base'
    : ready ? <>Connected · Modwerk base{modules && <> · {count(modules.modules.length, 'module', 'modules')}</>}</>
    : 'Not connected'
  const off = !ready ? 'Connect your ' + device.name + ' to see its load.' : !load ? 'This base doesn’t measure its load. A newer one does.' : undefined
  const offCell = status === 'stock' ? <p className="hub-empty">It runs Elektron’s OS, or a base without the link. {build}, then send it over USB.</p>
    : <p className="hub-empty">{status === 'none' ? 'No ' + device.name + ' over USB.' : 'Connect your ' + device.name + ' to read it.'}</p>

  if (mobile) return <div className="configuration-page">
    {header}
    <div className="page-heading"><div><h1>Your {device.name}</h1><p>Connecting a {device.name} needs Chrome or Edge on a computer.</p></div></div>
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
            <li><a className="hub-nav-item" href={'#' + kind.route} aria-current="page"><Icon name="grid" size={16} /><span>Status</span></a></li>
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
            note={latest ? 'Every two seconds while this page is open. Audio is the share of the CPU ' + kind.audio + ' takes; the rest runs the screen and the sequencer.' : 'Waiting for the next reading.'} />
          <section className="hub-cell hub-cell-health" aria-labelledby="mc-base-cell">
            <h3 id="mc-base-cell">Base</h3>
            {!ready || !identity ? offCell : <>
              <p className="hub-test"><span className="unit-led is-on" aria-hidden="true" />Modwerk {identity.release === false ? 'development base' : 'base'} · link {identity.linkVersion}{identity.label && <> · {identity.label}</>}</p>
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
            <div className="hub-cell-head"><h3 id="mc-modules-cell">On your {device.name}{modules && <> · {modules.modules.length}</>}</h3></div>
            {!ready ? offCell : !modules?.modules.length ? <p className="hub-empty">{modules ? 'No modules loaded. Modules kept over USB show here until the next power cycle.' : 'This base loads no modules over USB.'}</p>
              : <ul className="hub-history">{modules.modules.map(module => <li key={module.id}><span className="unit-led is-on" aria-hidden="true" /><span className="hub-history-name"><strong>{module.name || 'Unnamed module'}</strong></span><span className="hub-history-end"><small>{module.id}</small></span></li>)}</ul>}
          </section>
        </div></section>
      </div>
    </div>
  </div>
}

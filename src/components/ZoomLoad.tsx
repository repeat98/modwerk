import { useEffect, useId, useState } from 'react'
import type { ZoomLink } from '../engine/zoom/zoom-link'
import { ZOOM_BASE, isUpdateMode, type MidistompLoad, type ZoomIdentity } from '../engine/zoom/zoom-protocol'
import { percent } from '../config/octatrack-load'
import { LoadChart, Meter } from './OctatrackLoad'
import './octatrack-load.css'

const INTERVAL = 2000, HISTORY = 150
type Point = { at: number; reading: MidistompLoad | null }
const SERIES: { key: 'cpu' | 'audio'; title: string; className: string }[] = [{ key: 'cpu', title: 'CPU', className: 'load-cpu' }, { key: 'audio', title: 'Effects', className: 'load-core1' }]

/** The base's load every two seconds while `active`. A reading whose window (0.74 s) hasn't moved is a gap: the
 * pedal's timing isn't running. shortcut: kept while the pedal page is open, not on other pages as the Octatrack's;
 * record it app-wide when someone needs the history across pages. */
function useZoomLoad(link: ZoomLink | null, active: boolean) {
  const [state, setState] = useState<{ points: Point[]; now: number; unsupported: boolean }>({ points: [], now: 0, unsupported: false })
  useEffect(() => {
    if (!link || !active) return
    let live = true, timer: ReturnType<typeof setTimeout> | undefined, window: number | undefined, answered = false
    const read = async () => {
      const value = await link.load().catch(() => undefined)
      if (!live) return
      if (value === null && !answered) { setState(s => ({ ...s, unsupported: true })); return }
      if (value !== undefined) {
        // The first answer turns the timing on, so its window may be an old one: only a window that moved is now.
        const fresh = value && answered && value.window !== window ? value : null
        answered ||= !!value
        if (value) window = value.window
        setState(s => ({ points: [...s.points, { at: Date.now(), reading: fresh }].slice(-HISTORY), now: Date.now(), unsupported: false }))
      }
      timer = setTimeout(() => void read(), INTERVAL)
    }
    void read()
    return () => { live = false; clearTimeout(timer) }
  }, [link, active])
  return { ...state, clear: () => setState(s => ({ ...s, points: [] })) }
}

/** Why there is no load to show, or undefined when it can be read. */
function noLoad(identity: ZoomIdentity | undefined, unsupported: boolean) {
  if (!identity) return 'Connect your pedal to see its load.'
  if (isUpdateMode(identity)) return 'In update mode the pedal runs only its bootloader.'
  if (identity.midistomp) return unsupported ? 'MIDISTOMP ' + identity.midistomp.version + ' answers over USB but doesn’t send its load yet.' : undefined
  if (identity.firmware === ZOOM_BASE.tag) return ZOOM_BASE.name + ' shows its load on the pedal (at the top of MENU, and in MENU › SYSTEM) but doesn’t send it over USB. The next MIDISTOMP will.'
  return 'Zoom’s firmware doesn’t report its load. The base will (Setup).'
}

/**
 * The pedal's Status cells for the load, as the Octatrack's (OctatrackLoad): CPU, the effect chain and the patch's DSP
 * now, the last five minutes, and where the time goes in this patch, from MIDISTOMP's SYSTEM screen over USB
 * (zoom-protocol.ts parseLoad). `identity` is the connected pedal's; `active` while Status shows.
 */
export function ZoomLoad({ link, identity, active }: { link: ZoomLink | null; identity?: ZoomIdentity; active: boolean }) {
  const id = useId(), { points, now, unsupported, clear } = useZoomLoad(link, active && !!identity?.midistomp && !isUpdateMode(identity))
  const off = noLoad(identity, unsupported), last = points.at(-1)
  const latest = !off && active && last && now - last.at <= 6000 ? last.reading : null
  const slots = latest?.slots.reduce((sum, slot) => sum + slot.cpu, 0) ?? 0
  const parts: [string, number][] = latest ? [['Mixer', latest.audio - latest.perform - slots], ['PERFORM', latest.perform], ['MIDI', latest.midi], ['SYSTEM meter', latest.system], ['Zoom’s OS and screen', latest.cpu - latest.audio - latest.system - latest.midi]] : []
  return <>
    <Meter area="hub-cell-cpu" title="CPU · working now" value={latest?.cpu} note={latest ? 'Late blocks ' + latest.late + ' · ' + latest.lateTotal + ' since switched on' : undefined} />
    <Meter area="hub-cell-dsp1" title="Effects · working now" value={latest?.audio} note={latest ? 'Busiest block ' + percent(latest.audioMax) : undefined} />
    <div className="load-meter hub-cell hub-cell-dsp2"><span>DSP · this patch</span><strong>{latest ? Math.round(latest.dsp / 10) + '/300' : '—'}</strong>
      {latest ? <meter min={0} max={3000} value={latest.dsp} aria-label="DSP its effects declare" aria-valuetext={Math.round(latest.dsp / 10) + ' of 300'} /> : <div className="load-meter-unavailable" aria-hidden="true" />}
      <small>What its effects declare; full at 300</small></div>
    <LoadChart points={points} now={now} series={SERIES} onClear={clear} off={off}
      note={latest ? 'Every two seconds while Status shows. CPU is everything the pedal does; Effects is the audio chain: the six slots, the mixer and PERFORM.' : 'Waiting for the next reading.'} />
    <section className="hub-cell hub-cell-history" aria-labelledby={id}>
      <div className="hub-cell-head"><h3 id={id}>This patch</h3><span className="hub-cell-note">CPU of an audio block · DSP</span></div>
      {latest ? <ul className="hub-history">
        {latest.slots.map((slot, i) => { const empty = slot.name === '-' || !slot.name, loading = slot.name === '?'
          return <li key={i}><span className={'unit-led is-' + (empty ? 'off' : loading ? 'load' : 'on')} aria-hidden="true" /><span className="hub-history-name"><strong>{i + 1} · {empty ? 'Empty' : loading ? 'Loading' : slot.name}</strong></span>
            <span className="hub-history-end">{!empty && !loading && <><span>{percent(slot.cpu)}</span><small>DSP {(slot.dsp / 10).toFixed(1)}</small></>}</span></li> })}
        {parts.map(([name, value]) => <li key={name}><span className="unit-led is-off" aria-hidden="true" /><span className="hub-history-name"><strong>{name}</strong></span><span className="hub-history-end"><span>{percent(Math.max(0, value))}</span></span></li>)}
      </ul> : <p className="hub-empty">{off ?? 'Waiting for the next reading.'}</p>}
    </section>
  </>
}

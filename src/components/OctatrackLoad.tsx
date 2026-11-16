import { useId, useState } from 'react'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import type { LoadReading } from '../engine/elekloader/upload-wire'
import { useOctatrackLoad } from '../hooks/useOctatrackLoad'
import { loadPath, percent } from '../config/octatrack-load'
import './octatrack-load.css'

/** One meter cell, tenths of a percent; `note` replaces the peak line. */
export function Meter({ area, title, value, peak, note }: { area: string; title: string; value?: number | null; peak?: number | null; note?: string }) {
  return <div className={'load-meter hub-cell ' + area}><span>{title}</span><strong>{percent(value)}</strong>{value == null ? <div className="load-meter-unavailable" aria-hidden="true" /> : <meter min={0} max={1000} value={value} aria-label={`${title} load`} aria-valuetext={percent(value)} />}<small>{note ?? (peak != null ? `Recent device peak ${percent(peak)}` : ' ')}</small></div>
}
const SERIES: { key: keyof Pick<LoadReading, 'cpu' | 'tracks1to4' | 'tracks5to8'>; title: string; className: string }[] = [
  { key: 'cpu', title: 'CPU', className: 'load-cpu' }, { key: 'tracks1to4', title: 'DSP tracks 1–4', className: 'load-core1' }, { key: 'tracks5to8', title: 'DSP tracks 5–8', className: 'load-core0' },
]

/** The Status panel's load: three meter cells (the hardware meter windows now) and a cell with the last five minutes,
 * as a graph or a table in the same space. Recorded on every page while the unit is idle (recordLoad). */
export function OctatrackLoad({ link, active }: { link: OctatrackLink | null; active: boolean }) {
  const { points, notice, clear, now, ready, unsupported } = useOctatrackLoad(link)
  const last = points.at(-1)
  const latest = active && ready && last && now - last.at <= 6000 ? last.reading : null
  const off = !link?.getState().identity?.canSubmit || unsupported
  return <>
    <Meter area="hub-cell-cpu" title="CPU · working now" value={latest?.cpu} />
    <Meter area="hub-cell-dsp1" title="DSP tracks 1–4 · working now" value={latest?.tracks1to4} peak={latest?.peak1to4} />
    <Meter area="hub-cell-dsp2" title="DSP tracks 5–8 · working now" value={latest?.tracks5to8} peak={latest?.peak5to8} />
    <LoadChart points={points} now={now} series={SERIES} onClear={clear}
      off={off ? unsupported ? 'Live load needs a newer Modwerk base than the one on your Octatrack.' : 'Connect your Octatrack over USB to see its live load.' : undefined}
      note={notice || (latest ? 'Every two seconds while your Octatrack is connected. The CPU runs the screen, the sequencer and the modules’ code; each DSP runs the sound, machines and effects of four tracks. Without any module an Octatrack reads about 45 % CPU stopped and 60 to 75 % playing; from 85 % it takes no further module machine or effect.' : 'Waiting for live load. Syncing takes priority.')} />
  </>
}

/** The last five minutes of a unit's load (tenths of a percent), as a graph or a table in the same space; `off` says why
 * there's none. The Octatrack's and the Zoom pedal's Status share it. */
export function LoadChart<K extends string>({ points, now, series, off, note, onClear }: {
  points: { at: number; reading: Partial<Record<K, number | null>> | null }[]; now: number; series: { key: K; title: string; className: string }[]
  off?: string; note: string; onClear: () => void
}) {
  const id = useId(), [table, setTable] = useState(false)
  const observed = points.filter(point => point.reading)
  // The chart's takeaway: the highest reading still in the window, and where it was.
  let highest: { at: number; title: string; value: number } | undefined
  for (const point of observed) for (const item of series) {
    const value = point.reading![item.key]
    if (value != null && now - point.at <= 300000 && (!highest || value > highest.value)) highest = { at: point.at, title: item.title, value }
  }
  return <section className="octatrack-load hub-cell hub-cell-chart" aria-labelledby={`${id}-title`}>
    <div className="load-heading"><h3 id={`${id}-title`}>Last five minutes</h3>
      {highest && <span className="load-highest">Highest {percent(highest.value)} · {highest.title} · {new Date(highest.at).toLocaleTimeString()}</span>}
      <button type="button" className="text-button" disabled={!points.length} onClick={onClear}>Clear</button>
      <button type="button" className="text-button" aria-pressed={table} disabled={!!off} onClick={() => setTable(value => !value)}>Table</button></div>
    {off ? <p className="hub-empty">{off}</p> : <>
      <figure className="load-chart" hidden={table}>
        <div className="load-plot"><div className="load-y-labels" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div><svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label={series.map(item => item.title).join(' and ') + ' load over the last five minutes. Missing readings appear as gaps.'}><path className="load-grid" d="M0 0H600 M0 60H600 M0 120H600" />{series.map(item => <path key={item.key} className={item.className} d={loadPath(points, item.key, now)} fill="none" />)}</svg></div>
        <figcaption className="load-legend">{series.map(item => <span key={item.key} className={item.className}>{item.title}</span>)}<span className="load-time">5 min ago → now</span></figcaption>
      </figure>
      <div className="load-table" hidden={!table}><table><caption className="sr-only">Readings ({observed.length})</caption><thead><tr><th>Time</th>{series.map(item => <th key={item.key}>{item.title}</th>)}</tr></thead><tbody>{points.map(point => <tr key={point.at}><td>{new Date(point.at).toLocaleTimeString()}</td>{series.map(item => <td key={item.key}>{percent(point.reading?.[item.key])}</td>)}</tr>)}</tbody></table></div>
      <p className="load-note" role="status">{note}</p>
    </>}
  </section>
}

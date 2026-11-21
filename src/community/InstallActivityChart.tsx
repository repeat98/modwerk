import { useState } from 'react'
import { installSeries, type installActivityDays } from './install-activity'

const changeDay = '2026-11-12'
const dateLabel = (day: string) => new Date(day+'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function InstallActivityChart({ days }: { days: ReturnType<typeof installActivityDays> }) {
  const [selection, setSelection] = useState('')
  const selected = days.find(row => row.day === selection) ?? days.at(-1)
  if (!selected) return null
  const max = Math.max(1, ...days.map(row => row.total ?? 0))
  const changeVisible = days.some(row => row.day === changeDay)
  const describe = (row: typeof selected) => row.day + ' · ' + (row.total === null ? 'No counts available' : row.total + ' recorded actions')
    + (row.total !== null && row.incomplete ? ' · partial coverage' : '')
  const breakdown = (row: typeof selected) => installSeries.map(([,label], i) => label + ': ' + (row.values[i] ?? 'unavailable')).join(', ')
  return <figure className="visitors-chart install-activity">
    <figcaption>Firmware and module activity</figcaption>
    <p className="statistics-scale">Recorded actions per UTC day · scale 0–{max}</p>
    <div className="visitors-bars install-bars" role="group" aria-label="Daily firmware and module activity. Use arrow keys to inspect days.">
      {days.map((row, index) => <button key={row.day} type="button" className={row.day === changeDay ? 'install-change' : undefined}
        aria-pressed={row.day === selected.day} tabIndex={row.day === selected.day ? 0 : -1}
        aria-label={describe(row)+'. '+breakdown(row)} title={describe(row)+'. '+breakdown(row)} onClick={() => setSelection(row.day)}
        onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? Math.min(index+1,days.length-1) : event.key === 'ArrowLeft' ? Math.max(index-1,0)
            : event.key === 'Home' ? 0 : event.key === 'End' ? days.length-1 : null
          if (next === null) return
          event.preventDefault()
          setSelection(days[next].day)
          const button = event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined
          button?.focus()
        }}>
        {installSeries.map(([key], i) => <span key={key} data-series={key} style={{height: ((row.values[i] ?? 0) / max * 100)+'%'}}/>)}
      </button>)}
    </div>
    <div className="chart-dates"><span>{dateLabel(days[0].day)}</span><span>{dateLabel(days.at(-1)!.day)} · partial</span></div>
    <div aria-live="polite">
      <p className="statistics-selected">{describe(selected)}</p>
      <ul className="install-legend">{installSeries.map(([key,label], i) =>
        <li key={key}><i data-series={key} aria-hidden="true"/>{label} <b>{selected.values[i] ?? '—'}</b></li>)}</ul>
    </div>
    {changeVisible && <p className="service-note">The line marks November 12, when Octatrack module sets moved from firmware builds to USB syncs or card files.</p>}
    <p className="service-note">Firmware downloads count requests across instruments. The other series cover Octatrack. A base install counts when the guide first connects to the expected base after a card install. Card-only installs can go unconfirmed. Each action counts separately.</p>
    <p className="service-note">Downloads are retained for 90 days and Octatrack counts for 30. A dash means unavailable. Bars sum the available counts, including on days with partial coverage.</p>
  </figure>
}

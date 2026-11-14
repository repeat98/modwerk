// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import type { AdminOctatrack, AdminOctatrackCount, AdminOctatrackDay } from './admin-octatrack-contract'
import { baseLayout, layoutName, runningLayout } from '../engine/elekloader/base-variants'

const format = (value: number) => value.toLocaleString()
const plural = (count: number, word: string) => format(count) + ' ' + word + (count === 1 ? '' : 's')
const dateLabel = (day: string) => new Date(day + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const percent = (part: number, whole: number) => whole ? Math.round(part / whole * 100) + '%' : '—'
type Metric = Exclude<keyof AdminOctatrackDay, 'day'>
const METRICS: [Metric, string][] = [['installs', 'First base reports'], ['started', 'USB syncs started'], ['kept', 'Syncs kept'], ['failed', 'Syncs failed'], ['undone', 'Syncs undone']]
/** diag.h's incident kinds: the ones that show a problem, then the routine records every start and set change leaves. */
const PROBLEMS: Record<string, string> = { hot: 'Load at 90% or more', freeze: 'UI froze', crash: 'Crash', stall: 'DSP stall', shed: 'Frame guard skipped tracks' }
const ROUTINE: Record<string, string> = { start: 'starts', set: 'set changes', base: 'base records' }

/** What the site knows about a reported base: one of the published variants, the base before it, or neither. */
export function baseName(identity: string) {
  const published = baseLayout(identity)
  if (published) return { kind: 'current' as const, label: 'Current · ' + layoutName(published) }
  const previous = runningLayout(identity)
  return previous ? { kind: 'previous' as const, label: 'Previous · ' + layoutName(previous) } : { kind: 'older' as const, label: 'Older or development base' }
}

/** Reads the aggregate counts; never lists members (the diagnostics records below it do that, under their consent). */
export function OctatrackAdmin() {
  const [data, setData] = useState<AdminOctatrack>(), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<Metric>('installs'), [selectedDay, setSelectedDay] = useState('')
  // `loading` starts true for the first read; Refresh sets it before reading again.
  const load = useCallback((signal?: AbortSignal) => api<AdminOctatrack>('/admin/octatrack', { signal })
    .then(value => { if (!signal?.aborted) { setData(value); setError('') } })
    .catch(error => { if (!signal?.aborted) setError(error instanceof Error ? error.message : 'Octatrack statistics are unavailable.') })
    .finally(() => { if (!signal?.aborted) setLoading(false) }), [])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  const refresh = <button className="button button-quiet" disabled={loading} onClick={() => { setLoading(true); void load() }}>Refresh</button>
  if (!data) return <section className="configuration-section"><div className="section-title"><h2>Octatrack</h2>{refresh}</div>
    {error ? <p className="file-error" role="alert">{error}</p> : <p role="status">Loading Octatrack statistics…</p>}</section>
  return <OctatrackAdminReport data={data} loading={loading} error={error} refresh={refresh} metric={metric} onMetric={setMetric} selectedDay={selectedDay} onSelectDay={setSelectedDay}/>
}

function Counts({ title, rows, label = key => key, empty = 'None in 30 days', note }: { title: string; rows: AdminOctatrackCount[]; label?: (key: string) => string; empty?: string; note?: string }) {
  const max = Math.max(1, ...rows.map(row => row.count))
  return <div className="statistics-issue-ages octatrack-admin-counts"><h3>{title}</h3>
    {rows.length ? rows.map(row => <div key={row.key}><span>{label(row.key)}</span><progress aria-label={label(row.key)} value={row.count} max={max}/><strong title={plural(row.people, 'sharer')}>{format(row.count)} <small>· {format(row.people)}</small></strong></div>)
      : <p className="service-note">{empty}</p>}
    {note && <p className="service-note">{note}</p>}
  </div>
}

type ReportProps = { data: AdminOctatrack; loading: boolean; error: string; refresh: ReactNode; metric: Metric; onMetric: (metric: Metric) => void; selectedDay: string; onSelectDay: (day: string) => void }
/** Pure rendering of one response, kept separate so the markup can be tested without a backend. */
export function OctatrackAdminReport({ data, loading, error, refresh, metric, onMetric, selectedDay, onSelectDay }: ReportProps) {
  const { installs, sharing, health } = data
  const week = data.daily.slice(-7), sum = (rows: AdminOctatrackDay[], key: Metric) => rows.reduce((total, row) => total + row[key], 0)
  const started = sum(week, 'started'), kept = sum(week, 'kept'), failed = sum(week, 'failed'), undone = sum(week, 'undone')
  const bases = data.bases.map(row => ({ ...row, ...baseName(row.base) }))
  const onBase = bases.reduce((total, row) => total + row.people, 0), onCurrent = bases.filter(row => row.kind === 'current').reduce((total, row) => total + row.people, 0)
  const values = data.daily.map(row => row[metric]), max = Math.max(1, ...values), label = METRICS.find(([key]) => key === metric)![1]
  const selected = data.daily.find(row => row.day === selectedDay) ?? data.daily[data.daily.length - 1]
  const describe = (row: AdminOctatrackDay) => format(row[metric]) + ' ' + label.toLowerCase() + (row.day === data.to ? ', partial day' : '')
  const problems = health.deviceIncidents.filter(row => row.key in PROBLEMS), routine = health.deviceIncidents.filter(row => row.key in ROUTINE)
  return <section className="configuration-section" aria-busy={loading}>
    <div className="section-title"><div><h2>Octatrack</h2><p className="service-note">{dateLabel(data.from)} – {dateLabel(data.to)} UTC · updated {new Date(data.generatedAt).toLocaleTimeString(undefined, { timeZone: 'UTC' })} UTC</p></div>{refresh}</div>
    {error && <p className="file-error" role="alert">{error}</p>}
    <dl className="admin-overview statistics-workload">
      <div><dt>Members on the base</dt><dd>{format(installs.total)}</dd><small>{format(installs.today)} new today · {format(installs.last7)} in 7 days</small><small>Members whose unit has reported a Modwerk base</small></div>
      <div><dt>Sharing diagnostics</dt><dd>{format(sharing.members + sharing.guests)}</dd><small>{plural(sharing.members, 'member')} · {plural(sharing.guests, 'visitor')} · {format(sharing.membersReporting + sharing.guestsReporting)} sent reports in 30 days</small>
        <small className="statistics-change">{format(sharing.membersNew + sharing.guestsNew)} switched on in 7 days</small>
        {sharing.members > sharing.membersCurrent && <small>{plural(sharing.members - sharing.membersCurrent, 'member')} on an earlier consent text: their new reports wait until they agree again</small>}</div>
      <div><dt>Sharers on the current base</dt><dd>{percent(onCurrent, onBase)}</dd><small>{format(onCurrent)} of {plural(onBase, 'sharer')} who reported a base in 30 days</small></div>
      <div><dt>Syncs kept, 7 days</dt><dd>{percent(kept, started)}</dd><small>{format(kept)} kept of {plural(started, 'sync')} started</small><small>{format(failed)} failed · {format(undone)} undone · everyone</small></div>
    </dl>
    <figure className="visitors-chart">
      <div className="statistics-chart-heading"><figcaption>Daily</figcaption><label><span className="sr-only">Chart metric</span><select value={metric} onChange={event => onMetric(event.target.value as Metric)}>{METRICS.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label></div>
      <p className="statistics-scale">{label} per UTC day · scale 0–{format(max)}</p>
      <div className="visitors-bars" role="group" aria-label={label + ' by UTC day; use arrow keys to inspect days'}>
        {data.daily.map((row, index) => <button key={row.day} type="button" className={row.day === data.to ? 'is-today' : ''} title={dateLabel(row.day) + ': ' + describe(row)}
          aria-label={row.day + ': ' + describe(row)} aria-pressed={selected.day === row.day} tabIndex={selected.day === row.day ? 0 : -1}
          onClick={() => onSelectDay(row.day)} onMouseEnter={() => onSelectDay(row.day)}
          onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? Math.min(index + 1, data.daily.length - 1) : event.key === 'ArrowLeft' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0 : event.key === 'End' ? data.daily.length - 1 : null
            if (next !== null) { event.preventDefault(); onSelectDay(data.daily[next].day); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus() }
          }}><span style={{ height: Math.max(2, values[index] / max * 100) + '%' }}/></button>)}
      </div>
      <div className="chart-dates"><span>{dateLabel(data.from)}</span><span>{dateLabel(data.to)} · partial</span></div>
      <p className="statistics-selected" aria-live="polite">{dateLabel(selected.day)} · {describe(selected)}{metric !== 'installs' && selected.started ? ' · ' + format(selected.kept) + ' kept, ' + format(selected.failed) + ' failed, ' + format(selected.undone) + ' undone of ' + format(selected.started) + ' started' : ''}</p>
    </figure>
    <div className="octatrack-admin-groups">
      <div className="statistics-issue-ages octatrack-admin-counts"><h3>Bases in use</h3>
        {bases.length ? bases.map(row => <div key={row.base} className={'base-' + row.kind}><span title={row.base}>{row.label} <code>{row.base.slice(0, 8)}</code></span><progress aria-label={row.label} value={row.people} max={Math.max(1, ...bases.map(item => item.people))}/><strong title={'Last seen ' + row.lastSeen}>{format(row.people)}</strong></div>)
          : <p className="service-note">No sharer reported a base in 30 days.</p>}
      </div>
      <Counts title="Sync failures" rows={health.syncFailures}/>
      <Counts title="Build failures" rows={health.buildFailures}/>
      <Counts title="Connection failures" rows={health.linkFailures}/>
      <Counts title="Failed connections by browser" rows={health.linkClients}/>
      <Counts title="Unit stopped answering" rows={health.unresponsive} label={key => key === 'usb' ? 'USB reads failed' : 'UI tick stood still'}/>
      <Counts title="Unit log incidents" rows={problems} label={key => PROBLEMS[key]} empty="No problems logged in 30 days"
        note={routine.length ? 'Routine records: ' + routine.map(row => format(row.count) + ' ' + ROUTINE[row.key]).join(' · ') : undefined}/>
    </div>
    <details className="statistics-definitions"><summary>How these figures are counted</summary>
      <p>Members on the base: verified members whose unit reported a Modwerk base to the site while signed in, recorded once per account the first time; visitors without an account and members who connected before the base prompt reached them are missing. Daily sync counts come from every visitor and carry no identifier.</p>
      <p>Bases, failures and incidents come only from people who share diagnostics, from reports in the last 30 days, under the same consent and account conditions as the records below. Bases count each sharer once, by the base of their latest report. Each failure row shows occurrences, then the number of sharers they came from. A unit log is uploaded again at later connections, so each incident is counted once by its unit, start and sequence number.</p>
    </details>
  </section>
}

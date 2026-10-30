import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api'
import type { AdminActivity, AdminActivityDay } from './admin-activity-contract'
import { UnansweredThreadsQueue } from './UnansweredThreadsQueue'

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
const dateLabel = (day: string) => new Date(day + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const percent = (part: number, whole: number) => whole ? format(part / whole * 100) + '%' : '—'
const plural = (count: number, word: string) => format(count) + ' ' + word + (count === 1 ? '' : 's')
/** Hours under two days read as hours; longer waits read as days. */
const duration = (hours: number | null) => hours === null ? '—' : hours < 1 ? format(Math.round(hours * 60)) + ' min' : hours < 48 ? format(hours) + ' h' : format(hours / 24) + ' days'

const activityMetrics = [['threads', 'New threads'], ['replies', 'Replies and comments'], ['shouts', 'Shoutbox messages'], ['issuesOpened', 'Issues opened'], ['issuesClosed', 'Issues closed']] as const
export type ActivityMetric = typeof activityMetrics[number][0]
const sum = (rows: readonly AdminActivityDay[], key: ActivityMetric) => rows.reduce((total, row) => total + row[key], 0)

/** Forum and issue activity over time; thread titles are public, and no member is named. */
export function CommunityActivity() {
  const [days, setDays] = useState(30), [metric, setMetric] = useState<ActivityMetric>('replies'), [selectedDay, setSelectedDay] = useState('')
  const [data, setData] = useState<AdminActivity>(), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void api<AdminActivity>('/admin/activity?days=' + days, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setData(value); setError('') } })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Forum activity is unavailable.') })
    return () => controller.abort()
  }, [days])
  const periodControl = <div className="statistics-controls"><label>Activity period<select value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></div>
  if (error) return <section className="configuration-section"><div className="section-title"><h2>Forum and issue activity</h2>{periodControl}</div><p className="file-error" role="alert">{error}</p></section>
  if (!data) return <section className="configuration-section"><div className="section-title"><h2>Forum and issue activity</h2>{periodControl}</div><p role="status">Loading forum activity…</p></section>
  return <CommunityActivityReport data={data} loading={data.days !== days} metric={metric} onMetric={setMetric} selectedDay={selectedDay} onSelectDay={setSelectedDay} periodControl={periodControl}/>
}

type ReportProps = { data: AdminActivity; loading: boolean; metric: ActivityMetric; onMetric: (metric: ActivityMetric) => void; selectedDay: string; onSelectDay: (day: string) => void; periodControl: ReactNode }
/** Pure rendering of one activity response, so the markup can be tested without a backend. */
export function CommunityActivityReport({ data, loading, metric, onMetric, selectedDay, onSelectDay, periodControl }: ReportProps) {
  const { firstReplies: first, unanswered, issueTurnaround: issues } = data
  const label = activityMetrics.find(([key]) => key === metric)![1], max = Math.max(1, ...data.daily.map(row => row[metric]))
  const selected = data.daily.find(row => row.day === selectedDay) ?? data.daily[data.daily.length - 1]
  const describe = (row: AdminActivityDay) => format(row[metric]) + ' ' + label.toLowerCase() + (row.day === data.to ? ', partial day' : '')
  return <section className="configuration-section" aria-busy={loading}>
    <div className="section-title"><div><h2>Forum and issue activity</h2><p className="service-note">{dateLabel(data.from)} – {dateLabel(data.to)} UTC · includes today · updated {new Date(data.generatedAt).toLocaleTimeString(undefined, { timeZone: 'UTC' })} UTC</p></div>{periodControl}</div>
    {loading && <p role="status" className="service-note">Updating forum activity…</p>}
    <dl className="admin-overview statistics-workload">
      <div><dt>New threads</dt><dd>{format(sum(data.daily, 'threads'))}</dd><small>{sum(data.daily, 'replies') === 1 ? '1 reply or comment' : format(sum(data.daily, 'replies')) + ' replies and comments'} · {plural(sum(data.daily, 'shouts'), 'shoutbox message')}</small></div>
      <div><dt>Answered within 48 h</dt><dd>{percent(first.within48h, first.threads)}</dd><small>{first.threads ? format(first.answered) + ' of ' + plural(first.threads, 'new thread') + ' answered · median first reply ' + duration(first.medianHours) : 'No threads started in this period'}</small></div>
      <div><dt>Unanswered 48 h+</dt><dd>{format(unanswered.total)}</dd><small>Open threads with no reply from anyone but their author · all time</small></div>
      <div><dt>Issues opened / closed</dt><dd>{format(sum(data.daily, 'issuesOpened'))} / {format(sum(data.daily, 'issuesClosed'))}</dd><small>Bug reports in this period</small></div>
      <div><dt>Median time to close</dt><dd>{duration(issues.medianDays === null ? null : issues.medianDays * 24)}</dd><small>{issues.closed ? format(issues.within7Days) + ' of ' + plural(issues.closed, 'closed issue') + ' within 7 days' : 'No issues closed in this period'}</small></div>
    </dl>
    <figure className="visitors-chart">
      <div className="statistics-chart-heading"><figcaption>Daily activity</figcaption><label><span className="sr-only">Chart metric</span><select value={metric} onChange={event => onMetric(event.target.value as ActivityMetric)}>{activityMetrics.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label></div>
      <p className="statistics-scale">{label} per UTC day · scale 0–{format(max)}</p>
      <div className="visitors-bars" role="group" aria-label={label + ' by UTC day; use arrow keys to inspect days'}>
        {data.daily.map((row, index) => <button key={row.day} type="button" className={row.day === data.to ? 'is-today' : ''} title={dateLabel(row.day) + ': ' + describe(row)}
          aria-label={row.day + ': ' + describe(row)} aria-pressed={selected.day === row.day} tabIndex={selected.day === row.day ? 0 : -1}
          onClick={() => onSelectDay(row.day)} onMouseEnter={() => onSelectDay(row.day)}
          onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? Math.min(index + 1, data.daily.length - 1) : event.key === 'ArrowLeft' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0 : event.key === 'End' ? data.daily.length - 1 : null
            if (next !== null) { event.preventDefault(); onSelectDay(data.daily[next].day); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus() }
          }}><span style={{ height: Math.max(2, row[metric] / max * 100) + '%' }}/></button>)}
      </div>
      <div className="chart-dates"><span>{dateLabel(data.from)}</span><span>{dateLabel(data.to)} · partial</span></div>
      <p className="statistics-selected" aria-live="polite">{dateLabel(selected.day)} · {describe(selected)}</p>
    </figure>
    <UnansweredThreadsQueue key={data.generatedAt} initial={unanswered} generatedAt={data.generatedAt}/>
    <details className="statistics-definitions"><summary>How forum and issue figures are counted</summary>
      <p>Threads count when a member starts them; the automatic module threads are left out. Replies and comments are visible posts after a thread's opening post, including comments on module pages. Hidden and deleted posts, threads and shoutbox messages are not counted.</p>
      <p>A thread is answered by its first visible reply from someone other than its author. Answered within 48 h and the median first reply cover threads started in this period; threads still waiting are included in the percentage as unanswered. The unanswered list covers all open, unlocked threads older than 48 hours, whenever they started.</p>
      <p>Issues count when reported and when closed. Time to close runs from the report to its latest closing, so a reopened issue counts once it is closed again.{data.unknownCloseTimes ? ' ' + plural(data.unknownCloseTimes, 'earlier closed issue') + ' closed before closing times were recorded and without a reporter notification ' + (data.unknownCloseTimes === 1 ? 'is' : 'are') + ' left out.' : ''}</p>
    </details>
  </section>
}

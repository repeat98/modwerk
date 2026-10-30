import { useState } from 'react'
import type { UsageStatistics } from './usage-contract'
import { usagePageLabel } from './usage-pages'
import { pageTraffic } from './page-traffic'

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
export function PageTraffic({ data }: { data: UsageStatistics }) {
  const [selectedPage, setSelectedPage] = useState(''), [selectedDay, setSelectedDay] = useState('')
  const summary = pageTraffic(data), page = summary.ranked.some(row => row.page === selectedPage) ? selectedPage : ''
  const { days } = pageTraffic(data, page), selected = days.find(row => row.day === selectedDay) ?? days.at(-1)
  const max = Math.max(1, ...days.map(row => row.views ?? 0))
  const dayLabel = (row: typeof days[number]) => row.day + ' · ' + (row.views === null ? 'Not collected' : format(row.views) + ' views' + (row.partial ? ' · partial day' : ''))
  return <section className="page-traffic" aria-labelledby="page-traffic-title">
    <h3 id="page-traffic-title">Page traffic</h3>
    {data.pages === undefined ? <p className="service-note">Page traffic is not available from this backend yet.</p>
      : !data.pagesStarted ? <p className="service-note">Waiting for the first named page view. Earlier traffic cannot be split by page.</p>
      : <>
        <p className="service-note">{format(summary.total)} named page views · {data.from} – {data.to} UTC. Counting began {data.pagesStarted.slice(0, 10)}; the first day and today are partial. Views include repeat visits, not unique people.</p>
        {summary.unattributed > 0 && <p className="service-note">{format(summary.unattributed)} other page views have no page name, from earlier counts or older browsers. They are excluded from the shares and chart below.</p>}
        {summary.ranked.some(row => row.page === 'page-not-found') && <p className="service-note">Legacy unclassified / missing pages includes valid pages such as the machine overview introduced on 21 October 2026. Older browsers may still add to this group. It cannot be interpreted as broken links or reassigned to individual pages. New counts distinguish Page not found from Unclassified page.</p>}
        {summary.ranked.length ? <div className="statistics-table" role="region" aria-label="Most visited pages" tabIndex={0}><table>
          <caption>Most visited pages · share of named page views in the selected period. Select a page to see its daily views.</caption>
          <thead><tr><th scope="col">Page</th><th scope="col">Views</th><th scope="col">Share</th></tr></thead>
          <tbody>{summary.ranked.map(row => <tr key={row.page}><th scope="row"><button type="button" className="statistics-value-link" aria-pressed={page === row.page} onClick={() => setSelectedPage(page === row.page ? '' : row.page)}>{usagePageLabel(row.page)}</button></th><td>{format(row.views)}</td><td>{format(row.views / summary.total * 100)}%</td></tr>)}</tbody>
        </table></div> : <p className="service-note">No named page views recorded in this period.</p>}
        <figure className="visitors-chart">
          <div className="statistics-chart-heading"><figcaption>Daily page views</figcaption><label><span className="sr-only">Page to chart</span><select value={page} onChange={event => setSelectedPage(event.target.value)}>
            <option value="">All named pages</option>{summary.ranked.map(row => <option key={row.page} value={row.page}>{usagePageLabel(row.page)}</option>)}
          </select></label></div>
          <p className="statistics-scale">{page ? usagePageLabel(page) : 'All named pages'} · per UTC day · scale 0–{format(max)}</p>
          <div className="visitors-bars" role="group" aria-label="Page views by UTC day; use arrow keys to inspect days">
            {days.map((row, index) => <button key={row.day} type="button" className={row.views === null ? 'uncollected' : row.day === data.to ? 'is-today' : undefined}
              aria-label={dayLabel(row)} aria-pressed={selected?.day === row.day} tabIndex={selected?.day === row.day ? 0 : -1} onClick={() => setSelectedDay(row.day)}
              onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? Math.min(index + 1, days.length - 1) : event.key === 'ArrowLeft' ? Math.max(index - 1, 0) : event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : null
                if (next !== null) { event.preventDefault(); setSelectedDay(days[next].day); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus() }
              }}><span style={{ height: Math.max(2, (row.views ?? 0) / max * 100) + '%' }} /></button>)}
          </div>
          <div className="chart-dates"><span>{data.from}</span><span>{data.to} · partial</span></div>
          <p className="statistics-selected" aria-live="polite">{selected && dayLabel(selected)}</p>
        </figure>
        <p className="service-note">Catalog module pages are counted individually. Library categories are grouped by machine; discussions, profiles, messages and account screens use shared page names. Query changes do not add views. Admin and review screens are excluded. Counts never contain raw URLs, usernames or account tokens.</p>
      </>}
  </section>
}

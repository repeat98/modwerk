import { useEffect, useState } from 'react'
import { api } from './api'
import { PageTraffic } from './PageTraffic'
import { CommunityInsights } from './CommunityInsights'
import { HOURLY_ERA_METRICS, hourlyRows, usageCsv, usageInsights, usageMetrics } from './statistics-insights'
import type { UsageMetric } from './statistics-insights'
import type { DiscordInviteCounts, DownloadSignupCounts, UsageStatistics } from './usage-contract'
import type { AdminInsights } from './admin-insights-contract'
import { DEVICES_BY_ID } from '../devices/registry'

const format = (value: number) => value.toLocaleString(undefined,{maximumFractionDigits:1})
const dateLabel = (value: string) => new Date(value+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'})
const hourLabel = (value: string) => dateLabel(value.slice(0,10))+', '+value.slice(11,13)+':00 UTC'

function Comparison({value}: {value: ReturnType<ReturnType<typeof usageInsights>['compare']>}) {
  if (!value) return <small>Comparison unavailable</small>
  const change = value.current-value.previous
  return <small className="statistics-change">{value.percent === null
    ? change ? '+'+format(change)+' · previous period: 0' : 'No change · both periods: 0'
    : change === 0 ? 'No change from previous period' : (change>0 ? '+' : '')+format(value.percent)+'% from previous period'}</small>
}

function DiscordInviteStatistics({ data }: { data: UsageStatistics }) {
  const count = (key: keyof DiscordInviteCounts) => data.rows.reduce((total, row) => total + (row[key] ?? 0), 0)
  const value = (key: keyof DiscordInviteCounts) => data.discordInvitesStarted ? format(count(key)) : '—'
  return <section className="configuration-section" aria-labelledby="discord-statistics-title">
    <h2 id="discord-statistics-title">Community invitation responses</h2>
    <p className="service-note">{data.discordInvitesStarted ? 'Counted from ' + data.discordInvitesStarted.slice(0, 10) + ' · selected period.' : 'Invitation counts have not begun.'} Clicks record the action chosen; account creation and joining happen afterward.</p>
    <div className="statistics-table" tabIndex={0}><table><thead><tr><th scope="col">Invitation</th><th scope="col">Shown</th><th scope="col">Create account</th><th scope="col">Join Discord</th><th scope="col">Dismissed</th></tr></thead><tbody>
      <tr><th scope="row">Signed-in members</th><td>{value('discord_member_shown')}</td><td>—</td><td>{value('discord_member_joins')}</td><td>{value('discord_member_dismissals')}</td></tr>
      <tr><th scope="row">Signed-out visitors</th><td>{value('discord_visitor_shown')}</td><td>{value('discord_visitor_signups')}</td><td>{value('discord_visitor_joins')}</td><td>{value('discord_visitor_dismissals')}</td></tr>
      <tr><th scope="row">Signup welcome link</th><td>—</td><td>—</td><td>{value('discord_welcome_joins')}</td><td>—</td></tr>
    </tbody></table></div>
  </section>
}

function DownloadSignupStatistics({ data }: { data: UsageStatistics }) {
  const value = (key: keyof DownloadSignupCounts) => data.downloadSignupStarted ? format(data.rows.reduce((total, row) => total + (row[key] ?? 0), 0)) : '—'
  return <section className="configuration-section" aria-labelledby="download-signup-statistics-title">
    <h2 id="download-signup-statistics-title">Sign-up invitation after a download</h2>
    <p className="service-note">{data.downloadSignupStarted ? 'Counted from ' + data.downloadSignupStarted.slice(0, 10) + ' · selected period.' : 'Invitation counts have not begun.'} Guests see it once per visit after a firmware download. Followed counts accounts that, once verified, followed what they had downloaded on that device.</p>
    <div className="statistics-table" tabIndex={0}><table><thead><tr><th scope="col">Shown</th><th scope="col">Create account</th><th scope="col">Followed after sign-up</th></tr></thead><tbody>
      <tr><td>{value('download_signup_shown')}</td><td>{value('download_signup_clicks')}</td><td>{value('download_follows_claimed')}</td></tr>
    </tbody></table></div>
  </section>
}

export function UsageDashboard({data}: {data: UsageStatistics}) {
  const [metric,setMetric] = useState<UsageMetric>('visitors')
  const [resolution,setResolution] = useState<'day'|'hour'>('day')
  const [selectedDay,setSelectedDay] = useState('')
  const insights = usageInsights(data), covered = !!data.collectionStarted, hours = hourlyRows(data)
  // Failed builds and Digitakt/Digitone builds are counted from the breakdowns' start, so earlier windows cannot be compared.
  const breakdownsDay = data.breakdownsStarted?.slice(0,10) ?? null
  const hourlyDay = data.hourlyStarted?.slice(0,10) ?? null
  const comparable = (key: UsageMetric) => HOURLY_ERA_METRICS.includes(key) ? !!hourlyDay && !!data.comparison && hourlyDay < data.comparison.from
    : key!=='builds' && key!=='builds_failed' || !!breakdownsDay && !!data.comparison && breakdownsDay < data.comparison.from
  const devices = data.devices ?? [], attempts = devices.reduce((sum,row) => sum+row.builds+row.builds_failed,0), failed = devices.reduce((sum,row) => sum+row.builds_failed,0)
  const failureRate = (failures: number, total: number) => total ? format(failures/total*100)+'%' : '—'
  // One bar per UTC day, or per UTC hour in the 7-day view. Hourly visitors are daily visitors in the hour they first arrived.
  const hourly = resolution==='hour' && !!hours
  const bars = hourly ? hours.map(({hour,counts}) => ({id:hour,counts,title:hourLabel(hour),dayStart:hour.endsWith('T00'),
      partial:hour===hours.at(-1)?.hour || hour===data.hourlyStarted?.slice(0,13),uncollectedText:'hourly counts had not begun'}))
    : insights.rows.map(({day,counts}) => ({id:day,counts,title:dateLabel(day),dayStart:false,
      partial:day===data.to || day===data.collectionStarted?.slice(0,10),uncollectedText:'collection had not begun'}))
  const selected = bars.find(bar => bar.id===selectedDay)??bars.at(-1)
  const label = hourly && metric==='visitors' ? 'New daily visitors' : usageMetrics.find(([key]) => key===metric)![1]
  const max = Math.max(1,...bars.map(bar => bar.counts?.[metric]??0))
  const comparisonNote = data.comparison?.unavailableReason === 'retention'
    ? 'Previous-period comparison is unavailable: only 90 days of daily totals are retained.'
    : data.comparison && !data.comparison.unavailableReason
      ? 'Changes compare '+(data.days-1)+' completed days ('+dateLabel(data.from)+'–'+dateLabel(insights.rows.at(-2)!.day)+') with the previous '+(data.days-1)+' days. Today is excluded.'
      : 'Previous-period comparison needs two fully collected windows. Earlier traffic is unavailable.'

  function exportDaily() {
    const url = URL.createObjectURL(new Blob([usageCsv(data)],{type:'text/csv;charset=utf-8'}))
    const link = document.createElement('a')
    link.href=url; link.download='modwerk-usage-'+data.from+'-'+data.to+'.csv'
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url),1000)
  }

  return <>
    <DiscordInviteStatistics data={data} />
    <DownloadSignupStatistics data={data} />
    <dl className="admin-overview statistics-cards">
      <div><dt>Visitors today</dt><dd>{covered ? format(insights.today) : '—'}</dd><small>Estimated unique visitors · today is partial</small></div>
      {usageMetrics.slice(1).map(([key,title]) => <div key={key}><dt>{title}</dt><dd>{covered ? format(insights.totals[key]) : '—'}</dd><small>Selected period · includes today</small>{covered && <Comparison value={comparable(key) ? insights.compare(key) : null}/>}</div>)}
    </dl>
    <PageTraffic data={data} />
    {covered ? <>
      <p className="service-note statistics-coverage">{data.from} – {data.to} UTC · Updated {new Date(data.generatedAt).toLocaleTimeString(undefined,{timeZone:'UTC'})} UTC.<br/>{comparisonNote}</p>
      <div className="statistics-analysis">
        <figure className="visitors-chart">
          <div className="statistics-chart-heading"><figcaption>{hourly ? 'Hourly activity' : 'Daily activity'}</figcaption>
            <div className="statistics-chart-tools">
              <div className="statistics-resolution" role="group" aria-label="Chart resolution">{(['day','hour'] as const).map(value => <button key={value} type="button" aria-pressed={(value==='hour')===hourly} disabled={value==='hour' && !hours}
                title={value==='hour' && !hours ? 'Hourly counts are kept for 14 days, so they are shown in the 7-day view.' : undefined} onClick={() => { setResolution(value); setSelectedDay('') }}>{value==='day' ? 'Daily' : 'Hourly'}</button>)}</div>
              <label><span className="sr-only">Chart metric</span><select value={metric} onChange={event => setMetric(event.target.value as UsageMetric)}>{usageMetrics.map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select></label>
            </div></div>
          <p className="statistics-scale">{label} · {hourly ? 'per UTC hour' : 'per UTC day'} · scale 0–{format(max)}</p>
          <div className={'visitors-bars'+(hourly ? ' is-hourly' : '')} role="group" aria-label={label+(hourly ? ' by UTC hour' : ' by UTC day')+'; use arrow keys to inspect '+(hourly ? 'hours' : 'days')}>
            {bars.map((bar,index) => <button key={bar.id} type="button" className={[!bar.counts ? 'uncollected' : bar.id===bars.at(-1)?.id ? 'is-today' : '',bar.dayStart ? 'day-start' : ''].join(' ').trim() || undefined}
              aria-label={bar.title+': '+(bar.counts ? format(bar.counts[metric])+' '+label.toLowerCase() : bar.uncollectedText)+(bar.partial && bar.counts ? hourly ? ', partial hour' : bar.id===data.to ? ', partial day' : ', partial collection day' : '')}
              aria-pressed={selected?.id===bar.id} tabIndex={selected?.id===bar.id ? 0 : -1} onClick={() => setSelectedDay(bar.id)}
              onKeyDown={event => {
                const next = event.key==='ArrowRight' ? Math.min(index+1,bars.length-1) : event.key==='ArrowLeft' ? Math.max(index-1,0) : event.key==='Home' ? 0 : event.key==='End' ? bars.length-1 : null
                if (next!==null) { event.preventDefault(); setSelectedDay(bars[next].id); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus() }
              }}><span style={{height:bar.counts ? Math.max(2,bar.counts[metric]/max*100)+'%' : '2%'}}/></button>)}
          </div>
          {hourly ? <div className="chart-dates chart-days" aria-hidden="true">{insights.rows.map(({day}) => <span key={day}>{dateLabel(day)}</span>)}</div>
            : <div className="chart-dates"><span>{dateLabel(data.from)}</span><span>{dateLabel(data.to)} · partial</span></div>}
          <p className="statistics-selected" aria-live="polite">{selected && <>{selected.title} · {selected.counts ? format(selected.counts[metric])+' '+label.toLowerCase() : 'Not collected'}{selected.counts && selected.partial ? hourly ? ' · partial hour' : ' · partial day' : ''}</>}</p>
        </figure>
        <dl className="statistics-highlights">
          <div><dt>Average daily visitors</dt><dd>{insights.averageVisitors===null ? '—' : format(insights.averageVisitors)}</dd><small>Across {insights.completedDays} fully collected days</small></div>
          <div><dt>Busiest completed day</dt><dd>{insights.peak ? dateLabel(insights.peak.day) : '—'}</dd><small>{insights.peak ? format(insights.peak.visitors)+' daily browser identifiers' : 'No completed day with visitors yet'}</small></div>
          <div><dt>Days with visitors</dt><dd>{insights.completedDays ? insights.activeDays+' / '+insights.completedDays : '—'}</dd><small>Completed days in this period</small></div>
        </dl>
      </div>
      {breakdownsDay && <div className="statistics-table statistics-device-table" role="region" aria-label="Builds and download requests by machine" tabIndex={0}><table>
        <caption>By machine · {breakdownsDay > data.from ? 'counted since '+dateLabel(breakdownsDay)+' · ' : ''}build failure rate {failureRate(failed,attempts)}</caption>
        <thead><tr><th scope="col">Machine</th><th scope="col">Successful builds</th><th scope="col">Failed builds</th><th scope="col">Failure rate</th><th scope="col">Download requests</th></tr></thead>
        <tbody>{devices.map(row => <tr key={row.device}><th scope="row">{DEVICES_BY_ID[row.device]?.name ?? row.device}</th><td>{format(row.builds)}</td><td>{format(row.builds_failed)}</td><td>{failureRate(row.builds_failed,row.builds+row.builds_failed)}</td><td>{format(row.downloads)}</td></tr>)}</tbody>
      </table></div>}
      <details className="statistics-daily"><summary>Daily counts and CSV export</summary><button className="button button-quiet" onClick={exportDaily}>Export daily CSV</button><div className="statistics-table" role="region" aria-label="Daily usage counts" tabIndex={0}>
        <table><caption>UTC days · today and the collection start day are partial · — means not collected</caption>
          <thead><tr><th scope="col">Date</th>{usageMetrics.map(([key,title]) => <th scope="col" key={key}>{title}</th>)}</tr></thead>
          <tbody>{insights.rows.map(({day,counts}) => <tr key={day}><th scope="row">{day}{day===data.to || day===data.collectionStarted?.slice(0,10) ? ' *' : ''}</th>{usageMetrics.map(([key]) => <td key={key}>{counts ? format(counts[key]) : '—'}</td>)}</tr>)}</tbody>
        </table>
      </div></details>
    </> : <p className="service-note" role="status">Waiting for the first recorded visit. Earlier traffic is unavailable.</p>}
    <details className="statistics-definitions"><summary>Coverage and metric definitions</summary>
      <p>{data.collectionStarted ? 'Collection began '+new Date(data.collectionStarted).toLocaleString(undefined,{timeZone:'UTC'})+' UTC. ' : ''}Today and the collection start day are incomplete. Missing days after collection began count as zero; earlier days are unavailable. Daily totals are kept for 90 days.</p>
      <p>Counts include every visitor who has not objected or enabled Do Not Track (since 2026-10-05). Without consent, a visitor is one IP address and browser combination per UTC day, so people sharing a network and browser count once, and one person on two devices counts twice. Opted-in browsers count by their own daily identifier. Identifiers rotate daily; adding daily visitors does not give unique people across a period. Average visitors and peak days exclude partial days.</p>
      <p>A configuration starts when its first module is added, or when a nonempty configuration is imported or duplicated. Successful builds count completed local builds; failed builds count local builds that started and ended in an error, not cancelled builds or sign-in prompts.{breakdownsDay ? ' Since '+dateLabel(breakdownsDay)+', Digitakt and Digitone builds count too (Successful builds covered only the Octatrack before), and failed builds and the machine split are counted from the same day; earlier periods cannot be compared for builds. Requests from browsers that have not reloaded since then may still arrive without a machine.' : ''} Downloads and exports count requests, not saved or flashed files. Support dialog opens count each time the Support Modwerk dialog opens; Ko-fi clicks count the dialog’s Ko-fi button and bell entries that link to Ko-fi, not completed tips.{hourlyDay ? ' Both are counted from '+dateLabel(hourlyDay)+', so earlier days show zero and cannot be compared.' : ''} These are separate event totals, not a linked conversion funnel.</p>
      <p>Hourly totals are kept for 14 days and shown in the 7-day view{hourlyDay ? ' from '+dateLabel(hourlyDay) : ''}. In hours, visitors are daily visitors counted in the hour of their first visit that day, so a day’s hours add up to its visitors.</p>
      <p>Offline use, privacy preferences, blocked requests and automated traffic affect coverage. No firmware, configuration contents, guest identity, IP address, user agent or referrer is stored with these usage counts.</p>
    </details>
  </>
}

export function StatisticsPanel({onNavigate}: {onNavigate: (tab: 'issues'|'comments'|'modules', moduleId?: string) => void}) {
  const [days,setDays] = useState(7), [refresh,setRefresh] = useState(0)
  const [data,setData] = useState<UsageStatistics|null>(null), [community,setCommunity] = useState<AdminInsights|null>(null)
  const [error,setError] = useState(''), [communityError,setCommunityError] = useState(''), [loading,setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.allSettled([api<UsageStatistics>('/admin/statistics?days='+days,{signal:controller.signal}),api<AdminInsights>('/admin/insights',{signal:controller.signal})]).then(([usage,insights]) => {
      if (controller.signal.aborted) return
      if (usage.status==='fulfilled') { setData(usage.value); setError('') } else { setData(null); setError(usage.reason instanceof Error ? usage.reason.message : 'Unable to load usage statistics.') }
      if (insights.status==='fulfilled') { setCommunity(insights.value); setCommunityError('') } else { setCommunity(null); setCommunityError(insights.reason instanceof Error ? insights.reason.message : 'Unable to load community insights.') }
      setLoading(false)
    })
    return () => controller.abort()
  },[days,refresh])
  const current = data?.days===days ? data : null
  return <div className="admin-statistics" aria-busy={loading}>
    <section className="configuration-section usage-statistics"><div className="section-title"><div><h2>Site statistics</h2><p className="service-note">Anonymous browser-reported usage · UTC days</p></div>
      <div className="statistics-controls"><label>Usage period<select value={days} onChange={event => {setDays(Number(event.target.value));setLoading(true);setError('')}}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label><button className="button button-quiet" disabled={loading} onClick={() => {setRefresh(value => value+1);setLoading(true);setError('');setCommunityError('')}}>{loading ? 'Updating…' : 'Refresh statistics'}</button></div>
    </div>
      {error && <p role="alert" className="file-error">{error}</p>}
      {loading && <p role="status" className="service-note">{current ? 'Refreshing statistics…' : 'Loading statistics…'}</p>}
      {current && <UsageDashboard data={current}/>}
    </section>
    {communityError && <section className="configuration-section"><h2>Community insights</h2><p role="alert" className="file-error">{communityError}</p><p className="service-note">Use Refresh statistics to try again.</p></section>}
    {community && <CommunityInsights data={community} onNavigate={onNavigate}/>}
  </div>
}

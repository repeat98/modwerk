import { useState } from 'react'
import { rankedModules } from './statistics-insights'
import type { ModuleInsightSort } from './statistics-insights'
import type { AdminInsights } from './admin-insights-contract'
import { communityModule } from './modules'
import { RATING_RANKING_NOTE } from './rating-ranking'

const format = (value: number) => value.toLocaleString()
/** Change against the 7 days before; shown as a count, since small numbers make percentages jumpy. */
const trend = (week: number, previous: number) => week===previous ? (week ? 'same as week before' : 'none either week') : (week>previous ? '+' : '−')+format(Math.abs(week-previous))+' vs week before'
const utcDate = (value: string) => new Date(value.includes('T') ? value : value.replace(' ','T')+'Z').toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})

export function CommunityInsights({data,onNavigate}: {data:AdminInsights;onNavigate:(tab:'issues'|'comments'|'modules',moduleId?:string)=>void}) {
  const [sort,setSort] = useState<ModuleInsightSort>('downloads'), [search,setSearch] = useState('')
  const modules = rankedModules(data.modules,sort,search), ages = data.issueAges, total = data.totals
  return <>
    <section className="configuration-section"><div className="section-title"><div><h2>Community health</h2><p className="service-note">Current workload · independent of the usage period above</p></div><button className="text-button" onClick={() => onNavigate('issues')}>Open issue inbox →</button></div>
      <dl className="admin-overview statistics-workload">
        <div><dt>Open issues</dt><dd><button className="statistics-value-link" aria-label={'View '+total.openIssues+' open issues'} onClick={() => onNavigate('issues')}>{format(total.openIssues)}</button></dd><small>{format(total.closedIssues)} currently resolved</small></div>
        <div><dt>Waiting 7+ days</dt><dd>{format(ages.weekToMonth+ages.overMonth)}</dd><small>{format(ages.overMonth)} open for 30+ days</small></div>
        <div><dt>Comments</dt><dd><button className="statistics-value-link" aria-label={'Moderate '+total.comments+' comments'} onClick={() => onNavigate('comments')}>{format(total.comments)}</button></dd><small>Current retained comments</small></div>
        <div><dt>Published contributions</dt><dd><button className="statistics-value-link" aria-label={'View '+total.published+' published contributions'} onClick={() => onNavigate('modules')}>{format(total.published)}</button></dd><small>Community publications in the backend</small></div>
      </dl>
      <div className="statistics-issue-ages"><h3>Age of open issues</h3>{[['Under 7 days',ages.underWeek],['7–29 days',ages.weekToMonth],['30+ days',ages.overMonth]].map(([label,value]) => <div key={label}><span>{label}</span><progress aria-label={String(label)+' open issues'} value={Number(value)} max={Math.max(1,total.openIssues)}/><strong>{format(Number(value))}</strong></div>)}</div>
      <p className="service-note">{ages.oldest ? 'Oldest open report: '+utcDate(ages.oldest)+' UTC. Age is measured from creation, including reopened reports.' : 'No open reports. The issue inbox is clear.'} Module approvals and pending PRs are reviewed on GitHub.</p>
    </section>
    <section className="configuration-section"><div className="section-title"><div><h2>Module engagement</h2><p className="service-note">Cumulative download requests and current community feedback · all retained records</p></div></div>
      <dl className="statistics-engagement-totals"><div><dt>Module download requests</dt><dd>{data.downloadsStarted ? format(total.downloads) : '—'}</dd></div><div><dt>Current likes</dt><dd>{format(total.likes)}</dd></div><div><dt>Current ratings</dt><dd>{format(total.ratings)}</dd></div></dl>
      <div className="statistics-module-controls"><label>Find a module<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or module ID"/></label><label>Rank modules by<select value={sort} onChange={event => setSort(event.target.value as ModuleInsightSort)}><option value="downloads">Download requests</option><option value="downloadsWeek">Download requests this week</option><option value="likes">Likes</option><option value="ratingAverage">Rating (Bayesian)</option><option value="comments">Comments</option><option value="openIssues">Open issues</option></select></label></div>
      <div className="statistics-table statistics-module-table" role="region" aria-label="Module engagement rankings" tabIndex={0}><table><caption>{modules.length} matching {modules.length===1 ? 'module' : 'modules'} · ratings show their sample size</caption><thead><tr><th scope="col">Module / set</th><th scope="col">Downloads</th><th scope="col">This week</th><th scope="col">Likes</th><th scope="col">Rating</th><th scope="col">Comments</th><th scope="col">Open issues</th></tr></thead><tbody>{modules.map(module => <tr key={module.moduleId}><th scope="row">{module.available ? <a href={communityModule(module.moduleId)?.href ?? '#'+(module.moduleId.startsWith('remix-') ? 'module-set/'+module.moduleId.slice(6) : 'module/'+module.moduleId)}>{module.title}</a> : module.title}<small>{module.moduleId}{module.available ? '' : ' · retained history'}</small></th><td>{data.downloadsStarted ? format(module.downloads) : '—'}</td><td>{data.trendsStarted ? <>{format(module.downloadsWeek)}<small>{trend(module.downloadsWeek,module.downloadsPreviousWeek)}</small></> : '—'}</td><td>{format(module.likes)}</td><td>{module.ratings && module.ratingAverage!==null ? module.ratingAverage.toFixed(1)+' / 5' : 'Unrated'}<small>{format(module.ratings)} {module.ratings===1 ? 'rating' : 'ratings'}</small></td><td>{format(module.comments)}</td><td>{module.openIssues ? <button className="text-button" aria-label={'Open issue inbox for reports about '+module.title} onClick={() => onNavigate('issues',module.moduleId)}>{format(module.openIssues)} →</button> : '0'}</td></tr>)}</tbody></table></div>
      {!modules.length && <p className="service-note" role="status">No modules match this search.</p>}
      <p className="service-note">{data.downloadsStarted ? 'Module download counting began '+utcDate(data.downloadsStarted)+' UTC. ' : 'Module download coverage is unavailable. '}Each included module counts once per firmware or Octatrack card-set download. A kept Octatrack USB sync credits each module it added or updated. This week covers the last 7 UTC days including today{data.trendsStarted ? ', compared with the 7 days before; daily module counts began '+utcDate(data.trendsStarted)+' UTC, so earlier weeks read as zero' : ''}. Requests do not prove a save or flash. Likes and ratings can change. {RATING_RANKING_NOTE}</p>
      <p className="service-note">Stored contribution media: {(total.mediaBytes/1024/1024).toFixed(1)} MB · Updated {new Date(data.generatedAt).toLocaleTimeString(undefined,{timeZone:'UTC'})} UTC.</p>
    </section>
  </>
}

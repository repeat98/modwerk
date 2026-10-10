import type { PublicModuleIssue, useModuleIssues } from './issue-tracker'
import { ForumPostBody } from './ForumPostBody'
import { ForumTime } from './ForumTime'
import { Icon } from '../components/Icon'
import { GithubIssueReplies } from './GithubIssueReplies'
import { modulePageHref } from './modules'

export function IssueCount({ count }: { count: number }) {
  return <span className="tab-count module-issue-count" data-open={count > 0} aria-label={count + (count === 1 ? ' open issue' : ' open issues')}>{count}</span>
}

export function ModuleIssueCard({ issue, moduleId }: { issue: PublicModuleIssue; moduleId?: string }) {
  const github = issue.url.startsWith('https://github.com/'), configuration = issue.scope === 'configuration' ? issue.details?.modules ?? [] : null
  return <article className="module-issue-card" aria-labelledby={'issue-title-' + issue.id}>
    <header className="module-issue-header">
      <div className="module-issue-heading">
        <span className="module-issue-state" data-open={issue.status === 'open'}><Icon name={issue.status === 'open' ? 'message' : 'check'} size={14}/>{issue.status === 'open' ? 'Open' : 'Closed'}</span>
        {issue.number !== null && <span className="module-issue-number">#{issue.number}</span>}
        {configuration && <span className="pill">Whole configuration</span>}
        <h3 id={'issue-title-' + issue.id}>{issue.title}</h3>
      </div>
      <a className="text-button" href={issue.url} {...(github ? { target: '_blank', rel: 'noreferrer' } : {})}>{github ? 'View on GitHub' : 'View discussion'} ↗</a>
    </header>
    <div className="module-issue-meta">
      {issue.reporter && <span>Reported by <a href={'#forum/profile/' + encodeURIComponent(issue.reporter)}>@{issue.reporter}</a></span>}
      <ForumTime value={issue.created_at}/>
    </div>
    {issue.details ? <>
      <dl className="module-issue-device"><div><dt>Device</dt><dd>{issue.details.device}</dd></div>{configuration ? <div><dt>Configuration</dt><dd>{configuration.map((module, index) => <span key={module.id}>{index > 0 && ', '}<a href={modulePageHref(module.id)}>{module.name}</a> {module.version}</span>)}</dd></div> : <div><dt>Module version</dt><dd>{issue.details.version}</dd></div>}</dl>
      <div className="module-issue-description"><section><h4>Steps to reproduce</h4><ForumPostBody body={issue.details.steps}/></section>
        <div className="module-issue-results"><section><h4>Expected result</h4><ForumPostBody body={issue.details.expected}/></section><section><h4>Actual result</h4><ForumPostBody body={issue.details.actual}/></section></div>
      </div>
    </> : <p className="service-note">The description for this older report is available {github ? 'on GitHub' : 'in its discussion'}.</p>}
    {github && moduleId && issue.details && <GithubIssueReplies moduleId={moduleId} issueId={issue.id} githubUrl={issue.url}/>}
  </article>
}

export function ModuleIssues({ id, issues, onReportIssue }: { id: string; issues: ReturnType<typeof useModuleIssues>; onReportIssue: () => void }) {
  const { data, error, loading, status, page, setStatus, setPage, retry } = issues
  return <section className="detail-section module-issues forum-page">
    <div className="section-title"><h2>Issues {data && <IssueCount count={data.openCount}/>}</h2><button className="button button-quiet module-issue-action" onClick={onReportIssue}><Icon name="message" size={16}/>Report an issue</button></div>
    <p className="module-issues-intro">Bug reports for this module, and for whole configurations that include it. Check existing reports before opening a new issue.</p>
    <div className="module-issue-filters" role="group" aria-label="Filter issues by status">
      <button type="button" aria-pressed={status === 'open'} onClick={() => setStatus('open')}><Icon name="message" size={14}/>Open{data && <IssueCount count={data.openCount}/>}</button>
      <button type="button" aria-pressed={status === 'closed'} onClick={() => setStatus('closed')}><Icon name="check" size={14}/>Closed{data && <span className="tab-count">{data.closedCount}</span>}</button>
    </div>
    {error ? <><p className="file-error" role="alert">Issues could not load. {error}</p><button className="button button-quiet" onClick={retry}>Try again</button></> : loading ? <p role="status">Loading issues…</p> : data && <>
      {data.issues.length ? <ul className="module-issue-list">{data.issues.map(issue => <li key={issue.id}><ModuleIssueCard issue={issue} moduleId={id}/></li>)}</ul> : <div className="module-issues-empty" role="status"><Icon name={status === 'open' ? 'check' : 'message'} size={24}/><div><h3>{status === 'open' ? 'No open issues' : 'No closed issues yet'}</h3><p>{status === 'open' ? data.closedCount ? 'All reported issues have been closed. You can browse them in the Closed tab.' : 'No public bugs have been reported for this module.' : 'Resolved reports will appear here once they are closed.'}</p></div></div>}
      {(page > 0 || data.hasMore) && <nav className="module-issue-pagination" aria-label="Issue pages"><button className="button button-quiet" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button className="button button-quiet" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next</button></nav>}
      <a className="text-button" href={data.allUrl ?? '#forum?category=issues&module=' + encodeURIComponent(id)} {...(data.allUrl ? { target: '_blank', rel: 'noreferrer' } : {})}>{data.allUrl ? 'View all ' + status + ' issues on GitHub' : 'Open bug reports in the forum'} ↗</a>
    </>}
  </section>
}

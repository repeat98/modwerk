import type { BugReportResult, IssueTracker } from './issue-tracker'
import { threadHref } from '../routing'
import { Icon } from '../components/Icon'

export function BugReportNotice({ tracker }: { tracker: IssueTracker | null }) {
  const where = tracker?.tracker === 'github' ? <>opens a public GitHub issue for the module’s developers (no GitHub account needed)</> : <>notifies the module’s developers and opens a public thread in <a href="#forum?category=issues">Bug reports</a></>
  return <p className="service-note">Posting {where}. The title, description, device and module version are public under your username; your configuration, build fingerprint and any attached log stay private to you, the module’s maintainers and the administrator. Leave out firmware and personal information.</p>
}
/** Open issues first, so a reporter can add to one instead of filing it again. */
export function ExistingIssues({ id, tracker }: { id: string; tracker: IssueTracker | null }) {
  if (tracker?.tracker !== 'github') return <a href={'#forum?category=issues&module=' + encodeURIComponent(id)}>Check existing reports →</a>
  return <div className="issue-report-existing">
    {tracker.issues.length > 0 && <><p className="service-note">Already reported? Comment on the open issue instead:</p>
      <ul>{tracker.issues.map(issue => <li key={issue.url}><a href={issue.url} target="_blank" rel="noreferrer">{issue.title} ↗</a></li>)}</ul></>}
    {tracker.allUrl && <a href={tracker.allUrl} target="_blank" rel="noreferrer">All open issues for this module on GitHub ↗</a>}
  </div>
}

export function BugReportSuccess({ report, onReportAnother }: { report: BugReportResult; onReportAnother?: () => void }) {
  const account = <>Manage the private details under <a href={'#account/report/' + report.id}>Your account</a>. Status changes reach your bell and unread activity emails, following your <a href="#account/notifications">notification settings</a>.</>
  const another = onReportAnother && <button type="button" className="button button-quiet module-issue-action" onClick={onReportAnother}><Icon name="message" size={16}/>Report another issue</button>
  if (import.meta.env.DEV && report.id === 'local-preview') return <><strong>Local preview completed</strong><p>Nothing was sent or saved.</p>{another}</>
  if (report.githubUrl) return <><strong>Your bug report is on GitHub</strong><p>The module developers have been notified. <a href={report.githubUrl} target="_blank" rel="noreferrer">Open the issue ↗</a> to follow public replies. {account}</p>{another}</>
  if (report.forumThreadId) return <><strong>Your bug report is posted</strong><p>It is in the Bug Reports forum and the module developers’ inbox. <a href={threadHref(report.forumThreadId)}>Open the discussion</a> to follow public replies. {account}</p>{another}</>
  return <><strong>Your bug report is saved</strong><p>It reached the module developers’ inbox and will be posted to GitHub shortly. {account}</p>{another}</>
}

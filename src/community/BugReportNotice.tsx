import type { BugReportResult, IssueTracker } from './issue-tracker'
import { threadHref } from '../routing'
import { Icon } from '../components/Icon'
import { modulePageHref } from './modules'
import { useCommunity } from './context'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'

export function BugReportNotice({ tracker }: { tracker: IssueTracker | null }) {
  const where = tracker?.tracker === 'github' ? <>opens a public GitHub issue for the module’s developers (no GitHub account needed)</> : <>notifies the module’s developers and opens a public thread in <a href="#forum?category=issues">Bug reports</a></>
  const published = tracker?.tracker === 'github' ? 'The title, description, device, module version, configuration, build fingerprint and any attached log are public there under your username, and the developers reply there.' : 'The title, description, device and module version are public under your username; your configuration, build fingerprint and any attached log stay private to you, the module’s maintainers and the administrator.'
  return <p className="service-note">Posting {where}. {published} Leave out firmware and personal information.</p>
}
/** Before a report: modules are free, and their authors owe no fix or reply time (the community rules say the same). */
export function AuthorExpectations() {
  return <p className="service-note">Modules are free, and most are made by one person in their spare time. Their authors owe no fix or reply time; clear steps and a log get a fix fastest. <a href="#community-rules">Community rules</a></p>
}
/** Beta testers report on Discord (the beta tester note asks them to); the form stays usable, this only reminds them. */
export function BetaReportReminder() {
  const { session } = useCommunity()
  if (!session.user?.betaTester) return null
  return <p className="beta-report-reminder" role="note"><Icon name="warn" size={16}/><span><strong>Beta tester?</strong> Please report bugs only in <a href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer">#beta-testers on Discord</a>, not through this form.</span></p>
}
/** Open issues first, so a reporter can add to one instead of filing it again. */
export function ExistingIssues({ id, tracker }: { id: string; tracker: IssueTracker | null }) {
  if (tracker?.tracker !== 'github') return <a href={'#forum?category=issues&module=' + encodeURIComponent(id)}>Check existing reports →</a>
  return <div className="issue-report-existing">
    {tracker.issues.length > 0 && <><p className="service-note">Already reported? Comment on the open issue instead:</p>
      <ul>{tracker.issues.map(issue => <li key={issue.url}><a href={modulePageHref(id) + '?tab=issues'}>{issue.title} →</a></li>)}</ul></>}
    <a href={modulePageHref(id) + '?tab=issues'}>Read and reply to open reports on Modwerk →</a>
  </div>
}

export function BugReportSuccess({ report, onReportAnother }: { report: BugReportResult; onReportAnother?: () => void }) {
  const account = <>Manage the private details under <a href={'#account/report/' + report.id}>Your account</a>. Status changes reach your bell and unread activity emails, following your <a href="#account/notifications">notification settings</a>.</>
  const another = onReportAnother && <button type="button" className="button button-quiet module-issue-action" onClick={onReportAnother}><Icon name="message" size={16}/>Report another issue</button>
  if (import.meta.env.DEV && report.id === 'local-preview') return <><strong>Local preview completed</strong><p>Nothing was sent or saved.</p>{another}</>
  if (report.githubUrl) return <><strong>Your bug report is posted</strong><p>The module developers have been notified on GitHub. <a href={'#account/report/' + report.id}>Read and reply on Modwerk</a> to follow the same conversation. <a href={report.githubUrl} target="_blank" rel="noreferrer">View on GitHub ↗</a> {account}</p>{another}</>
  if (report.forumThreadId) return <><strong>Your bug report is posted</strong><p>It is in the Bug Reports forum and the module developers’ inbox. <a href={threadHref(report.forumThreadId)}>Open the discussion</a> to follow public replies. {account}</p>{another}</>
  return <><strong>Your bug report is saved</strong><p>It reached the module developers’ inbox and will be posted to GitHub shortly. {account}</p>{another}</>
}

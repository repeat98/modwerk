import { deviceHref } from '../devices/registry'
import { moduleIssueHref } from './modules'
import { Icon } from '../components/Icon'

export function ModuleIssueNotice({ moduleId, machine, onReportIssue }: { moduleId?: string | null; machine?: string; onReportIssue?: () => void }) {
  return <aside className="forum-config module-issue-notice">
    <strong>Something not working right?</strong>
    <p>Crashes, odd sound, or a control that doesn’t do what it should: use “Report an issue”. A title and what happened are enough, and the module’s developers are notified directly. Keep discussions for questions, tips, ideas and feedback.</p>
    {onReportIssue ? <button type="button" className="button button-quiet module-issue-action" onClick={onReportIssue}><Icon name="message" size={16}/>Report an issue</button> : moduleId ? <a className="button button-quiet module-issue-action" href={moduleIssueHref(moduleId)}><Icon name="message" size={16}/>Report an issue</a> : <a className="text-button" href={deviceHref(machine || 'all')}>Choose the affected module →</a>}
  </aside>
}

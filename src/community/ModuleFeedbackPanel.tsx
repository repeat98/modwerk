import { useId, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { WORKS_REPORT_NOTE } from './ModuleWorksCount'

export function ModuleFeedbackPanel({ workingCount, workingAction, onReportIssue }: { workingCount: number | null; workingAction: ReactNode; onReportIssue: () => void }) {
  const heading = useId()
  return <section className="module-feedback" aria-labelledby={heading}>
    <div className="detail-feedback-prompt"><h2 id={heading}>Tried it on your instrument?</h2><p>Let others know how it went.</p></div>
    <div className="detail-works-summary" title={WORKS_REPORT_NOTE} aria-label={workingCount == null ? 'Working report count unavailable.' : workingCount + (workingCount === 1 ? ' member reports' : ' members report') + ' this module working, across versions.'}>
      <Icon name="check" size={22}/><span><strong>{workingCount?.toLocaleString() ?? '—'} {workingCount === 1 ? 'member reports' : 'members report'} working</strong><small>Across versions</small></span>
    </div>
    {workingAction}
    <button type="button" className="button button-quiet module-issue-action" onClick={onReportIssue}><Icon name="message" size={16}/>Report an issue</button>
  </section>
}

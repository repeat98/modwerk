import { useId, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import type { BuiltModule } from './build-follow-up'
import { useCommunity } from './context'
import { feedbackId, updateHardwareFeedback } from './hardware-feedback'
import { ModuleIssueDialog } from './ModuleIssueDialog'
import { MODULE_STATISTICS_CHANGED } from './module-statistics'
import { saveWorkingReports } from './module-works-report'

type FollowUpProps = { machine: string; os: string; modules: readonly BuiltModule[]; pendingIds?: readonly string[]; onSaved?: () => void; onReportOpenChange?: (open: boolean) => void; embedded?: boolean; preview?: boolean }

/** Individual Works buttons save in one press. Bulk confirmation is explicit. */
export function BuildFollowUp(props: FollowUpProps) {
  const { session } = useCommunity()
  if (!props.modules.length || !session.user?.verified) return null
  return <BuildFeedback key={session.user.id + ':' + feedbackId(props)} {...props} memberId={session.user.id}/>
}

function BuildFeedback({ machine, os, modules, pendingIds, onSaved, onReportOpenChange, embedded = false, memberId, preview = false }: FollowUpProps & { memberId: string }) {
  const heading = useId(), submitting = useRef(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reported, setReported] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([])
  const [reporting, setReporting] = useState('')
  const shown = modules.filter(module => !pendingIds || pendingIds.includes(module.id))
  const remaining = shown.filter(module => !reported.includes(module.id)).map(module => module.id)
  const chosen = selected.filter(id => remaining.includes(id))
  async function submit(ids: string[]) {
    if (submitting.current || !ids.length) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const build = { machine, os, modules }
      if (!(import.meta.env.DEV && preview)) await saveWorkingReports(ids, build)
      setReported(current => [...new Set([...current, ...ids])]); setSelected(current => current.filter(id => !ids.includes(id)))
      onSaved?.()
      if (!(import.meta.env.DEV && preview)) {
        window.dispatchEvent(new Event(MODULE_STATISTICS_CHANGED))
        updateHardwareFeedback(memberId, build, { completed: ids })
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Your report could not be saved. Try again.') }
    finally { submitting.current = false; setBusy(false) }
  }
  return <section className={'build-follow-up' + (embedded ? '' : ' configuration-section')} aria-labelledby={embedded ? undefined : heading} aria-label={embedded ? 'Module hardware feedback' : undefined}>
    {!embedded && <div className="section-title"><h2 id={heading}>After you flash</h2></div>}
    <p className="service-note">{!embedded && <>Tried {modules.length > 1 ? 'these modules' : 'this module'} on your {machine}? </>}“Works for me” saves your confirmation with the build details. No forum post.</p>
    <ul className="build-follow-up-list">{shown.map(module => <li key={module.id} className="build-follow-up-module">
      <div className="build-follow-up-row">
        <span className="build-follow-up-name"><strong>{module.name}</strong><span className="subtle">{module.version}</span></span>
        <div className="reporting-actions">
          <button type="button" className={'button module-works-action ' + (reported.includes(module.id) ? 'module-works-reported' : 'button-quiet')} disabled={busy || reported.includes(module.id)} aria-label={module.name + (reported.includes(module.id) ? ': reported working' : ': report works on my ' + machine)} onClick={() => void submit([module.id])}><Icon name={reported.includes(module.id) ? 'check' : 'plus'} size={16}/>{reported.includes(module.id) ? 'Reported working' : busy ? 'Saving…' : 'Works for me'}</button>
          <button type="button" className="button button-quiet module-issue-action" aria-haspopup="dialog" aria-label={'Report an issue with ' + module.name} onClick={() => { setReporting(module.id); onReportOpenChange?.(true) }}><Icon name="message" size={16}/>Report an issue</button>
        </div>
      </div>
    </li>)}</ul>
    {shown.length > 1 && <details className="build-follow-up-bulk"><summary>Confirm several modules</summary><div className="build-follow-up-selection">
      <label><input type="checkbox" disabled={busy || !remaining.length} checked={!!remaining.length && chosen.length === remaining.length} onChange={event => setSelected(event.target.checked ? remaining : [])}/>Select all — I tested every module shown</label>
      {shown.map(module => <label key={module.id}><input type="checkbox" checked={chosen.includes(module.id)} disabled={busy || reported.includes(module.id)} aria-label={'Select ' + module.name + ' as tested'} onChange={event => setSelected(current => event.target.checked ? [...current, module.id] : current.filter(id => id !== module.id))}/>{module.name}</label>)}
      <button type="button" className="button button-quiet module-works-action" disabled={busy || !chosen.length} onClick={() => void submit(chosen)}><Icon name="plus" size={16}/>{busy ? 'Saving…' : 'Report selected working' + (chosen.length ? ' (' + chosen.length + ')' : '')}</button>
    </div></details>}
    {reported.length > 0 && <span className="sr-only" role="status">Working confirmations saved for {reported.length} {reported.length === 1 ? 'module' : 'modules'}.</span>}
    {error && <p className="file-error" role="alert">{error}</p>}
    {reporting && <ModuleIssueDialog id={reporting} build={{ machine, os, modules }} preview={preview} onReported={() => {
      if (!(import.meta.env.DEV && preview)) updateHardwareFeedback(memberId, { machine, os, modules }, { completed: reporting })
    }} onClose={() => { setReporting(''); onReportOpenChange?.(false) }}/>}
  </section>
}

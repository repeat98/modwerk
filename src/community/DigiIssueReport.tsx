import { useEffect, useRef, useState } from 'react'
import { post } from './api'
import { useCommunity } from './context'
import { MemberPrompt } from './MemberPrompt'
import { FLASH_STATES, type DigiIssueContext, type FlashState } from './issue-context'
import { useWorkspaceReportContext, type WorkspaceReportContext } from './report-context'
import { communityModule } from './modules'
import { DEVICES_BY_ID } from '../devices/registry'
import { BugReportNotice, BugReportSuccess, ExistingIssues } from './BugReportNotice'
import { ReportNotifications } from './ReportNotifications'
import { refreshModuleIssues, useIssueTracker, type BugReportResult } from './issue-tracker'
import { useOpenIssueReport } from './useOpenIssueReport'
import { DiscussionIssueDraft } from './DiscussionIssueDraft'
import { useDiscussionIssueDraft } from './discussion-issue-draft'
import { ReportConfiguration } from './ReportConfiguration'
import { defaultConfigurationChoice, resolveReportConfiguration, type ConfigurationChoice } from './report-configuration'
import { ReportMoreDetails } from './ReportMoreDetails'

export function DigiIssueReport({ id, openRequest = 0, embedded = false, workspaceContext, baseOs = '', moduleVersion, preview = false }: { id: string; openRequest?: number; embedded?: boolean; workspaceContext?: WorkspaceReportContext; baseOs?: string; moduleVersion?: string; preview?: boolean }) {
  const module = communityModule(id)!, device = DEVICES_BY_ID[module.machine], savedWorkspace = useWorkspaceReportContext(module.machine), workspace = workspaceContext ?? savedWorkspace, { session, preview: contextPreview } = useCommunity(), isPreview = import.meta.env.DEV && (preview || contextPreview)
  const report = useRef<HTMLDetailsElement>(null), title = useRef<HTMLInputElement>(null), success = useRef<HTMLDivElement>(null)
  const [sent, setSent] = useState<BugReportResult | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [opened, setOpened] = useState(embedded), tracker = useIssueTracker(id, opened)
  useOpenIssueReport(report, title, openRequest)
  const { draft, clearDraft } = useDiscussionIssueDraft(id)
  const [formKey, setFormKey] = useState(0), [kept, setKept] = useState({ model: embedded && device.variants?.length === 1 ? device.variants[0] : '', os: baseOs, flash: 'flashed', moduleVersion: moduleVersion ?? module.version, follow: true })
  useEffect(() => { if (sent) { success.current?.focus(); report.current?.scrollIntoView({ block: 'start' }) } }, [sent])
  useEffect(() => { if (formKey) title.current?.focus() }, [formKey])
  const [configuration, setConfiguration] = useState<ConfigurationChoice>(() => defaultConfigurationChoice([module.moduleId]))
  const resolved = resolveReportConfiguration(configuration, workspace, module.machine, null)
  const attachedDevice = embedded && !!kept.model && !!device.firmware?.releases.includes(kept.os)
  const deviceFields = <div className="issue-report-row issue-report-row-3">
    <label>{device.name}<select name="model" defaultValue={kept.model} required><option value="" disabled>Choose…</option>{(device.variants ?? [device.name]).map(model => <option key={model}>{model}</option>)}</select></label>
    <label>Base OS<select name="os" defaultValue={kept.os} required><option value="" disabled>Choose…</option>{device.firmware?.releases.map(release => <option key={release}>{release}</option>)}</select></label>
    <label>It is running<select name="flash" defaultValue={kept.flash} required>{Object.entries(FLASH_STATES).map(([key, label]) => <option key={key} value={key}>{label.replace('an Octamod', 'a Modwerk')}</option>)}</select></label>
  </div>
  /** A fresh form for the next bug; the device answers and follow choice stay as answered. */
  function reportAnother() { setSent(null); setError(''); setFormKey(key => key + 1) }
  async function send(form: HTMLFormElement) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const fields = Object.fromEntries(new FormData(form)) as Record<string, string>
      if (isPreview) { setSent({ id: 'local-preview', author: module.author, github: 'none', githubUrl: null, forumThreadId: null }); return }
      if (fields.actual.length > 2000) throw new Error('Keep the description under 2,000 characters. Your complete discussion draft is available above for reference.')
      if (!resolved.modules.length) throw new Error('Choose the configuration the ' + device.name + ' runs: a saved one, or tick its modules.')
      const context: DigiIssueContext = { machine: module.machine as DigiIssueContext['machine'], model: fields.model, flash: fields.flash as FlashState, os: fields.os, moduleVersion: fields.moduleVersion.trim() || module.version, modules: resolved.modules, keepStockFx2: null, build: resolved.build }
      setSent(await post<BugReportResult>('/modules/' + id + '/issues', { title: fields.title, steps: fields.steps, expected: fields.expected, actual: fields.actual, context, visibility: 'forum', notifyUpdates: fields.notifyUpdates === 'on' }))
      refreshModuleIssues(id)
      setKept({ model: fields.model, os: fields.os, flash: fields.flash, moduleVersion: context.moduleVersion, follow: fields.notifyUpdates === 'on' })
      clearDraft()
      window.dispatchEvent(new Event('modwerk-module-updates'))
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to send the report.') } finally { setBusy(false) }
  }
  return <details ref={report} className="issue-report" open={embedded || undefined} onToggle={event => { if (event.currentTarget.open) setOpened(true) }}><summary>Report an issue <span>For @{module.author}</span></summary>
    {sent ? <div ref={success} className="issue-report-success" role="status" tabIndex={-1}><BugReportSuccess report={sent} onReportAnother={reportAnother} /></div> : !session.user?.verified ? <MemberPrompt /> : <form key={formKey} className="community-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void send(event.currentTarget) }}>
      {!embedded&&<ExistingIssues id={id} tracker={tracker} />}
      {draft && <DiscussionIssueDraft body={draft.body} />}
      <label>Title<input ref={title} name="title" required maxLength={160} defaultValue={draft?.title ?? ''} placeholder="What went wrong, in one line" /></label>
      <label>What happened?<textarea name="actual" required maxLength={2000} rows={3} defaultValue={draft?.body ?? ''} placeholder="What you did and what you heard or saw: sound, screen message, freeze, reboot …" /></label>
      {attachedDevice ? <p className="service-note">{device.name} {kept.model} · OS {kept.os} · device details attached below</p> : deviceFields}
      <ReportMoreDetails embedded={embedded}>
      {attachedDevice && <details className="issue-report-more"><summary>Device details <span>Already attached</span></summary>{deviceFields}</details>}
      <details className="issue-report-more"><summary>Steps to reproduce <span>Optional</span></summary>
        <label>Steps to reproduce<textarea name="steps" maxLength={3000} rows={3} placeholder={'1. Load a project with …\n2. Select …\n3. Turn …'} /></label>
        <label>Expected result<textarea name="expected" maxLength={1000} rows={2} /></label>
        <label>Module version<input name="moduleVersion" maxLength={80} defaultValue={kept.moduleVersion} /></label>
      </details>
      {embedded?<details className="issue-report-more"><summary>Downloaded build <span>{workspace.modules.length} modules attached</span></summary><ReportConfiguration machine={module.machine} moduleId={module.moduleId} workspace={workspace} log={null} value={configuration} onChange={setConfiguration} disabled={busy}/></details>:<ReportConfiguration machine={module.machine} moduleId={module.moduleId} workspace={workspace} log={null} value={configuration} onChange={setConfiguration} disabled={busy}/>}
      </ReportMoreDetails>
      {isPreview?<p className="service-note">Local preview — nothing is sent.</p>:embedded?<p className="service-note">Your report is public and notifies the module’s developers. The configuration stays private to you, the maintainers and the administrator.</p>:<BugReportNotice tracker={tracker} />}
      <ReportNotifications id={id} defaultChecked={kept.follow} />
      <button className="button button-primary" disabled={busy}>{busy ? 'Posting…' : 'Post report'}</button>
    </form>}
    {error && <p className="file-error" role="alert">{error}</p>}
  </details>
}

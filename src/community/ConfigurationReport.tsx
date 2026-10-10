import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { DEVICES_BY_ID } from '../devices/registry'
import { post } from './api'
import { BugReportSuccess } from './BugReportNotice'
import { catalogModules, configurationSummary } from './configuration-report'
import { useCommunity } from './context'
import { FLASH_STATES, OT_MODELS, type FlashState, type IssueContext, type OtModel } from './issue-context'
import { refreshModuleIssues, type BugReportResult } from './issue-tracker'
import { MemberPrompt } from './MemberPrompt'
import { describeOtLog, OT_LOG_NAME } from './ot-log'
import { defaultConfigurationChoice, resolveReportConfiguration, type ResolvedConfiguration } from './report-configuration'
import { REPORT_OS, useWorkspaceReportContext } from './report-context'
import { useOtLogFile } from './useOtLogFile'

/**
 * Report a problem with a whole saved configuration, for when no single module is known to be at fault. It reaches
 * the authors and maintainers of every module in the configuration; a problem with one module belongs on that
 * module's own page.
 */
export function ConfigurationReportDialog({ machine, configurationId, onClose }: { machine: string; configurationId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId(), success = useRef<HTMLDivElement>(null), logHelp = useId()
  const { session } = useCommunity(), workspace = useWorkspaceReportContext(machine), device = DEVICES_BY_ID[machine]
  const { file, input: logInput, read: readLog, remove: removeLog } = useOtLogFile(), digi = machine !== 'octatrack'
  const [model, setModel] = useState<OtModel | ''>(''), [flash, setFlash] = useState<FlashState>('flashed')
  const [sent, setSent] = useState<BugReportResult | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    element?.querySelector<HTMLInputElement>('input[name="title"]')?.focus()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  useEffect(() => { if (sent) success.current?.focus() }, [sent])
  // The saved configuration is named, never typed in. An attached log replaces it with what the device actually ran.
  const saved = workspace.configurations.find(item => item.id === configurationId)
  const resolved: ResolvedConfiguration = file.log
    ? resolveReportConfiguration(defaultConfigurationChoice([]), workspace, machine, file.log.summary)
    : { source: 'saved', name: saved?.name ?? '', modules: saved?.modules ?? [], keepStockFx2: saved?.keepStockFx2 ?? null, build: saved && saved.id === workspace.activeId ? workspace.build : '' }
  const catalogued = catalogModules(machine, resolved.modules), modules = resolved.modules.length
  const cannotSend = !catalogued.length

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || file.reading || cannotSend) return
    setBusy(true); setError('')
    const form = event.currentTarget, fields = Object.fromEntries(new FormData(form)) as Record<string, string>
    try {
      if (fields.actual.length > 2000) throw new Error('Keep the description under 2,000 characters.')
      const context: IssueContext = digi
        ? { machine: machine as 'digitakt' | 'digitone', model: fields.model, flash: fields.flash as FlashState, os: fields.os, moduleVersion: resolved.modules[0]?.version ?? '', modules: resolved.modules, keepStockFx2: null, build: '' }
        : { model: model as OtModel, flash, os: file.log?.summary.os ?? REPORT_OS, modules: resolved.modules, keepStockFx2: resolved.keepStockFx2, build: resolved.build }
      const result = await post<BugReportResult>('/configuration-reports', { title: fields.title, steps: fields.steps, expected: fields.expected, actual: fields.actual, context, visibility: 'forum', notifyUpdates: fields.notifyUpdates === 'on', ...(file.log ? { log: file.log.text } : {}) })
      setSent(result)
      for (const module of catalogued) refreshModuleIssues(module.id)
      window.dispatchEvent(new Event('modwerk-module-updates'))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to send the report.') } finally { setBusy(false) }
  }

  const deviceFields = digi
    ? <div className="issue-report-row issue-report-row-3">
      <label>{device.name}<select name="model" required defaultValue=""><option value="" disabled>Choose…</option>{(device.variants ?? [device.name]).map(variant => <option key={variant}>{variant}</option>)}</select></label>
      <label>Base OS<select name="os" required defaultValue=""><option value="" disabled>Choose…</option>{device.firmware?.releases.map(release => <option key={release}>{release}</option>)}</select></label>
      <label>It is running<select name="flash" required defaultValue="flashed">{Object.entries(FLASH_STATES).map(([key, label]) => <option key={key} value={key}>{label.replace('an Octamod', 'a Modwerk')}</option>)}</select></label>
    </div>
    : <div className="issue-report-row">
      <label>Octatrack<select required value={model} onChange={event => setModel(event.target.value as OtModel)}><option value="" disabled>Choose…</option>{(Object.keys(OT_MODELS) as OtModel[]).map(key => <option key={key} value={key}>{OT_MODELS[key]}</option>)}</select></label>
      <label>It is running<select required value={flash} onChange={event => setFlash(event.target.value as FlashState)}>{(Object.keys(FLASH_STATES) as FlashState[]).map(key => <option key={key} value={key}>{FLASH_STATES[key]}</option>)}</select></label>
    </div>

  const count = configurationSummary(catalogued.length)
  return createPortal(<dialog ref={dialog} className="app-dialog module-issue-dialog configuration-report-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="configuration-report-head">
      <h2 id={heading}>Report a problem with this configuration</h2>
      <button type="button" className="icon-button" aria-label="Close report" onClick={onClose}><Icon name="close" size={18} /></button>
    </header>
    {sent ? <>
      <div className="configuration-report-body"><div ref={success} className="issue-report-success configuration-report-success" role="status" tabIndex={-1}><span className="configuration-report-check"><Icon name="check" size={18} /></span><div><BugReportSuccess report={sent} /></div></div></div>
      <footer className="configuration-report-footer"><div className="dialog-actions"><button type="button" className="button button-primary" onClick={onClose}>Close</button></div></footer>
    </> : !session.user?.verified ? <div className="configuration-report-body"><MemberPrompt /></div> : <form className="community-form configuration-report-form" aria-busy={busy} onSubmit={event => void send(event)}>
      <div className="configuration-report-body">
        <p className="configuration-report-intro">For a problem in the combination, or when you do not know which module is to blame. If one module clearly misbehaves, report it on that module’s page.</p>
        <section className="configuration-report-config" aria-label="Configuration">
          <div className="configuration-report-config-head"><span>Configuration</span><strong>{file.log ? 'Read from ' + OT_LOG_NAME : resolved.name || 'Not saved'}</strong><small>{count}</small></div>
          {catalogued.length > 0
            ? <ul className="issue-report-chips" aria-label="Modules in the configuration">{catalogued.map(module => <li key={module.id}>{module.name} <span>{module.version}</span></li>)}</ul>
            : <p className="file-error" role="alert">This configuration has no catalog modules to report on. Add a module first.</p>}
          {modules > catalogued.length && catalogued.length > 0 && <p className="service-note">{modules - catalogued.length} {modules - catalogued.length === 1 ? 'module is' : 'modules are'} no longer in the catalog and cannot be notified.</p>}
        </section>
        <label>Title<input name="title" required maxLength={160} placeholder="What went wrong, in one line" /></label>
        <label>What happened?<textarea name="actual" required maxLength={2000} rows={3} placeholder="What you did and what you heard or saw: sound, screen message, freeze, reboot …" /></label>
        {deviceFields}
        <div className="configuration-report-optional">
          <details className="issue-report-more"><summary>Steps to reproduce <span>Optional</span></summary>
            <label>Steps, one per line<textarea name="steps" maxLength={3000} rows={3} placeholder={'1. Load a project with …\n2. Play both effects …\n3. Turn …'} /></label>
            <label>Expected result<textarea name="expected" maxLength={1000} rows={2} /></label>
          </details>
          {!digi && <details className="issue-report-more issue-report-log"><summary>{file.log ? file.name + ' attached' : 'Attach ' + OT_LOG_NAME}<span>{file.log ? 'Ready, with the exact configuration' : 'Records the exact configuration. Helps most after a crash or freeze'}</span></summary>
            <ol className="issue-report-steps" id={logHelp}>
              <li>Stop playback, wait 30 seconds, save the project, then open <kbd>PROJECT</kbd> › SYSTEM › USB DISK MODE. A card reader works too.</li>
              <li>Choose <strong>OCTAMOD.LOG</strong> and <strong>OCTAMOD1.LOG</strong> from the top folder of the card. They are checked on this device and only sent when you post.</li>
              <li>Eject the card before leaving USB disk mode. After a crash, copy the logs soon: the last events may be missing.</li>
            </ol>
            <input ref={logInput} type="file" multiple accept=".log,.LOG,text/plain" aria-label="Choose log files" disabled={busy} aria-describedby={logHelp} onChange={event => void readLog(Array.from(event.target.files ?? []))} />
            {file.reading && <p className="service-note" role="status">Checking your log on this device…</p>}
            {file.log && <div className="issue-report-log-preview">
              <p className="success-note" role="status"><strong>{file.name} is ready.</strong> {describeOtLog(file.log.summary)}.</p>
              {file.note && <p className="service-note">{file.note}</p>}
              <button type="button" className="button button-quiet" disabled={busy} onClick={removeLog}>Remove log</button>
            </div>}
            {file.error && <p className="file-error" role="alert">{file.error} Try the other log, or post without one.</p>}
          </details>}
        </div>
      </div>
      <footer className="configuration-report-footer">
        <p className="configuration-report-notice">Posts publicly on GitHub for the developers of {catalogued.length === 1 ? 'this module' : 'all ' + count}, under your username: title, description, device and the module list with versions. Your build fingerprint and any log stay private to you, the maintainers and the administrator. Leave out firmware and personal information.</p>
        {error && <p className="file-error" role="alert">{error}</p>}
        <div className="configuration-report-submit">
          <label className="risk-accept"><input type="checkbox" name="notifyUpdates" defaultChecked />Follow new releases of {catalogued.length === 1 ? 'this module' : 'these ' + count}</label>
          <div className="configuration-report-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || file.reading || cannotSend}>{busy ? 'Posting…' : 'Post report'}</button></div>
        </div>
      </footer>
    </form>}
    {sent && error && <p className="file-error" role="alert">{error}</p>}
  </dialog>, document.body)
}

import { configurationSummary } from './configuration-report'
import { useEffect, useState } from 'react'
import { api, apiFetch, post } from './api'
import { isDigiIssue, FLASH_STATES, LOG_MISSING_REASONS, OT_MODELS } from './issue-context'
import type { IssueContext, LogMissingReason } from './issue-context'
import { describeOtLog } from './ot-log'
import type { OtLogSummary } from './ot-log'
import type { ReportMetadata } from './report-closure'
import { ReportState } from './ReportState'
import { ReportTriageForm } from './ReportTriageForm'
import { CloseReportForm } from './CloseReportForm'
type Issue = ReportMetadata & {
  id: string; module_id: string; scope?: 'module' | 'configuration'; module_count?: number; author_login: string; title: string; body: string; status: string; reporter: string
  context: IssueContext | null; log: OtLogSummary | null; log_missing: LogMissingReason | null; log_missing_note: string
  public_sharing: number; forum_thread_id: string | null; github_state: 'none' | 'pending' | 'syncing' | 'synced' | 'failed'; github_url: string | null; github_error: string
}
export function IssueInbox({moduleId, status, onStatus, onClearModule}: {
  moduleId: string; status: string; onStatus: (value: string) => void; onClearModule: () => void
}) {
  const path = '/admin/issues?status='+status+(moduleId ? '&moduleId='+encodeURIComponent(moduleId) : '')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ path: string; revision: number; items: Issue[]; error?: string }>()
  const [actionError, setActionError] = useState(''), [busy, setBusy] = useState('')
  const current = result?.path === path && result.revision === revision ? result : undefined
  const items = current?.items ?? [], loading = !current, error = current?.error || actionError
  useEffect(() => {
    const controller = new AbortController()
    void api<Issue[]>(path, { signal: controller.signal }).then(items => {
      if (!controller.signal.aborted) setResult({ path, revision, items })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ path, revision, items: [], error: error instanceof Error ? error.message : 'Unable to load reports.' })
    })
    return () => controller.abort()
  }, [path, revision])
  async function act(item: Issue, action: () => Promise<unknown>, failure: string) {
    setBusy(item.id)
    setActionError('')
    try { await action(); setRevision(value => value + 1) }
    catch (error) { setActionError(error instanceof Error ? error.message : failure) }
    finally { setBusy('') }
  }
  const resolve = (item: Issue) => act(item, () => post('/admin/issues/' + item.id, { status: item.status === 'open' ? 'closed' : 'open' }, 'PATCH'), 'Unable to update issue.')
  const mirror = (item: Issue) => act(item, async () => { const result = await post<{ state: string; error?: string }>('/admin/issues/' + item.id + '/github', {}); if (result.state === 'failed') throw new Error(result.error ?? 'GitHub mirroring failed.') }, 'Unable to mirror issue.')
  async function download(item: Issue) {
    setActionError('')
    try {
      // The admin session travels in a header, so fetch the log rather than linking to it.
      const result = await apiFetch('/admin/issues/' + item.id + '/log')
      if (!result.ok) throw new Error('The log could not be downloaded.')
      const link = document.createElement('a'), url = URL.createObjectURL(await result.blob())
      link.href = url; link.download = 'OCTAMOD-' + item.module_id + '-' + item.id.slice(0, 8) + '.LOG'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setActionError(error instanceof Error ? error.message : 'The log could not be downloaded.') }
  }
  return <section className="configuration-section"><div className="section-title"><h2>Issue reports</h2>{!loading && !error && <span className="pill">{items.length} {items.length === 1 ? 'report' : 'reports'}</span>}</div>
    <p className="service-note">New account reports and logs stay private. Previously published reports retain their GitHub links and status synchronization. Private reports cannot be published through retries.</p>
    <div className="statistics-controls inbox-controls"><label>Issue status<select value={status} disabled={!!busy} onChange={event => onStatus(event.target.value)}><option value="all">All reports</option><option value="open">Open reports</option><option value="closed">Closed reports</option></select></label>{moduleId && <span className="service-note">Module: {moduleId} <button className="text-button" onClick={onClearModule}>Clear module filter</button></span>}</div>
    {items.length===200 && <p className="service-note">Showing the latest 200 matching reports.</p>}
    {loading ? <p role="status">Loading reports…</p> : items.length ? items.map(item => <article className="inbox-issue" key={item.id}>
      <div className="section-title"><h3>{item.title}</h3><ReportState report={item}/></div>
      <small>{item.scope === 'configuration' ? 'Whole configuration · ' + configurationSummary(item.module_count ?? 0) : item.module_id} · from {item.reporter} · for @{item.author_login}</small>
      <p className="preserve-lines">{item.body}</p>
      <dl>
        {item.context && <><dt>Device</dt><dd>{isDigiIssue(item.context)?item.context.model:OT_MODELS[item.context.model]} · {FLASH_STATES[item.context.flash]} · OS {item.context.os}</dd>
          <dt>Modules</dt><dd>{item.context.modules.length ? item.context.modules.map(module => module.id + ' ' + module.version).join(', ') : 'none selected'}{item.log && ' (read from the log)'}</dd>
          <dt>Build</dt><dd>{item.context.build ? <code>{item.context.build}</code> : 'not built in the reporter’s browser'}</dd></>}
        <dt>Log</dt><dd>{item.log ? describeOtLog(item.log) : item.log_missing ? 'Not attached: ' + LOG_MISSING_REASONS[item.log_missing] + (item.log_missing_note ? ' — ' + item.log_missing_note : '') : 'Not attached'}</dd>
        <dt>GitHub</dt><dd>{item.github_url ? <a href={item.github_url} target="_blank" rel="noreferrer">{item.github_url.replace('https://github.com/', '')} ↗</a> : item.github_state === 'none' ? 'Not mirrored' : item.github_state === 'failed' ? 'Failed: ' + item.github_error : 'Mirroring…'}</dd>
      </dl>
      <div className="inbox-actions">
        <button className="text-button" disabled={!!busy} onClick={() => void resolve(item)}>{busy === item.id ? 'Saving…' : item.status === 'open' ? 'Mark resolved' : 'Reopen'}</button>
        {item.log && <button className="text-button" onClick={() => void download(item)}>Download log</button>}
        {!!item.public_sharing && item.github_state !== 'synced' && <button className="text-button" disabled={!!busy} onClick={() => void mirror(item)}>{item.github_state === 'none' ? 'Mirror to GitHub' : 'Retry GitHub'}</button>}
      </div>
      {item.status === 'open' && <><ReportTriageForm report={item} busy={!!busy} publicReport={!!item.github_url || !!item.forum_thread_id} onChange={body => void act(item,() => post('/issues/'+item.id,body,'PATCH'),'Unable to triage report.')}/><CloseReportForm busy={!!busy} publicReport={!!item.github_url || !!item.forum_thread_id} onClose={(closureReason,note) => void act(item,() => post('/issues/'+item.id,{status:'closed',closureReason,note},'PATCH'),'Unable to close report.')}/></>}
    </article>) : !error && <p className="service-note">No reports match these filters.</p>}{error && <p className="file-error" role="alert">{error}</p>}
    {current?.error && <button className="button button-quiet" onClick={() => setRevision(value => value + 1)}>Retry loading reports</button>}
  </section>
}

import { useEffect, useState } from 'react'
import { api } from './api'
import { FORUM_CATEGORIES } from './forum-contract'
import type { AdminActivity, UnansweredThreadsPage } from './admin-activity-contract'
import { threadHref } from '../routing'

type Selection = Pick<UnansweredThreadsPage, 'page' | 'category' | 'order'>
const initialSelection: Selection = { page: 1, category: 'all', order: 'oldest' }
const age = (createdAt: string, now: string) => {
  const days = (Date.parse(now) - Date.parse(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z')) / 86400000
  return days.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' days'
}

/** Starts with the activity response; paging/filtering fetch only the queue, without reloading all charts. */
export function UnansweredThreadsQueue({ initial, generatedAt }: { initial: AdminActivity['unanswered']; generatedAt: string }) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [data, setData] = useState<UnansweredThreadsPage>({ ...initial, ...initialSelection, pageSize: 10, generatedAt })
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const chosen = selection ?? initialSelection
  useEffect(() => {
    if (!selection) return
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(selection.page), category: selection.category, order: selection.order })
    void api<UnansweredThreadsPage>('/admin/unanswered-threads?' + params, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setData(value); setError('') } })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'The first-reply list is unavailable.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selection])
  function choose(value: Selection) { setLoading(true); setError(''); setSelection(value) }
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize))
  return <section className="statistics-unanswered" aria-labelledby="unanswered-title" aria-busy={loading}>
    <h3 id="unanswered-title">Waiting for a first reply</h3>
    <div className="statistics-controls">
      <label>Discussion category<select value={chosen.category} onChange={event => choose({ ...chosen, category: event.target.value as Selection['category'], page: 1 })}>
        <option value="all">All categories</option>{Object.entries(FORUM_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Waiting order<select value={chosen.order} onChange={event => choose({ ...chosen, order: event.target.value as Selection['order'], page: 1 })}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
      <button type="button" className="button button-quiet" disabled={loading} onClick={() => choose({ ...chosen })}>Refresh first-reply list</button>
    </div>
    {loading ? <p className="service-note" role="status">Updating first-reply list…</p> : error ? <p className="file-error" role="alert">{error} Use Refresh first-reply list to try again.</p> : <>
      {data.threads.length ? <ul>{data.threads.map(thread => <li key={thread.id}><a href={threadHref(thread.id, thread.title)}>{thread.title}</a><small>{age(thread.createdAt, data.generatedAt)} old</small></li>)}</ul>
        : <p className="service-note">{data.category === 'all' ? 'Every open thread older than 48 hours has a reply.' : 'No open threads in this category have waited more than 48 hours for a reply.'}</p>}
      {data.total > 0 && <p className="service-note" aria-live="polite">Showing {(data.page - 1) * data.pageSize + 1}–{Math.min((data.page - 1) * data.pageSize + data.threads.length, data.total)} of {data.total} · page {data.page} of {pages}.</p>}
    </>}
    <nav className="statistics-controls" aria-label="Unanswered discussion pages">
      <button type="button" className="button button-quiet" disabled={loading || !!error || data.page <= 1} onClick={() => choose({ ...chosen, page: data.page - 1 })}>Previous discussions</button>
      <button type="button" className="button button-quiet" disabled={loading || !!error || data.page >= pages} onClick={() => choose({ ...chosen, page: data.page + 1 })}>Next discussions</button>
    </nav>
  </section>
}

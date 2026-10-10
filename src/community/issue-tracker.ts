import { useEffect, useState } from 'react'
import { api } from './api'

export type BugReportResult = { id: string; author: string; forumThreadId: string | null; github: 'none' | 'synced' | 'syncing' | 'failed'; githubUrl: string | null }
export type PublicModuleIssue = {
  id: string; title: string; url: string; created_at: string; status: 'open' | 'closed'; number: number | null; reporter: string | null
  /** A configuration report concerns every module in `details.modules`; a module report, only the module whose page lists it. */
  scope?: 'module' | 'configuration'
  details: { device: string; version: string; steps: string; expected: string; actual: string; modules?: { id: string; name: string; version: string }[] } | null
}
/** Public report descriptions and counts; private configurations and logs are never included. */
export type IssueTracker = { tracker: 'github' | 'forum'; issues: PublicModuleIssue[]; allUrl: string | null; openCount: number; closedCount: number; hasMore: boolean }

const issuesChanged = 'modwerk:module-issues-changed'
export function refreshModuleIssues(id: string) { window.dispatchEvent(new CustomEvent(issuesChanged, { detail: id })) }

export function useModuleIssues(id: string) {
  const [view, setView] = useState({ id, status: 'open' as 'open' | 'closed', page: 0 })
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ id: string; request: string; data: IssueTracker | null; error: string } | null>(null)
  const { status, page } = view.id === id ? view : { status: 'open' as const, page: 0 }
  const request = `${id}:${status}:${page}:${revision}`
  useEffect(() => {
    let cancelled = false
    void api<IssueTracker>('/modules/' + id + '/issues?status=' + status + '&page=' + page)
      .then(data => { if (!cancelled) setResult({ id, request, data, error: '' }) })
      .catch(error => { if (!cancelled) setResult({ id, request, data: null, error: error instanceof Error ? error.message : 'Unable to load issues.' }) })
    return () => { cancelled = true }
  }, [id, status, page, request])
  useEffect(() => {
    const refresh = (event: Event) => { if ((event as CustomEvent<string>).detail === id) setRevision(value => value + 1) }
    window.addEventListener(issuesChanged, refresh)
    return () => window.removeEventListener(issuesChanged, refresh)
  }, [id])
  return {
    data: result?.id === id ? result.data : null,
    error: result?.request === request ? result.error : '',
    loading: result?.request !== request,
    status, page,
    setStatus: (status: 'open' | 'closed') => setView({ id, status, page: 0 }),
    setPage: (page: number) => setView({ id, status, page }),
    retry: () => setRevision(value => value + 1),
  }
}

/** Loads once the report form is opened, so module pages do not each ask for it. */
export function useIssueTracker(id: string, enabled: boolean) {
  const [tracker, setTracker] = useState<IssueTracker | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void api<IssueTracker>('/modules/' + id + '/issues').then(value => { if (!cancelled) setTracker(value) }).catch(() => { if (!cancelled) setTracker({ tracker: 'forum', issues: [], allUrl: null, openCount: 0, closedCount: 0, hasMore: false }) })
    return () => { cancelled = true }
  }, [id, enabled])
  return tracker
}

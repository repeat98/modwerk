import { useEffect, useState } from 'react'
import { api } from './api'

export function useAdminQueue<T>(path: string) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ path: string; revision: number; items: T[]; error?: string }>()
  useEffect(() => {
    const controller = new AbortController()
    void api<T[]>(path, { signal: controller.signal }).then(items => {
      if (!controller.signal.aborted) setResult({ path, revision, items })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ path, revision, items: [], error: error instanceof Error ? error.message : 'Unable to load this queue.' })
    })
    return () => controller.abort()
  }, [path, revision])
  const current = result?.path === path && result.revision === revision ? result : undefined
  return { items: current?.items ?? [], loading: !current, loadError: current?.error, reload: () => setRevision(value => value + 1) }
}

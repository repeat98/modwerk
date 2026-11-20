import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { api } from './api'
import { useReconnectRetry } from './useReconnectRetry'
import { adminHref, reviewQueues, toolGroups } from './admin-navigation'

type QueueCounts = Partial<Record<typeof reviewQueues[number]['id'], number>>

export function AdminOverview() {
  const [attempt, setAttempt] = useState(0)
  const [counts, setCounts] = useState<QueueCounts>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useReconnectRetry(!!error, setAttempt)

  useEffect(() => {
    const controller = new AbortController()
    void api<QueueCounts>('/admin/overview', { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted) { setCounts(data); setError('') }
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load queue counts.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])

  return <>
    <section className="admin-queues" aria-labelledby="admin-queues-title">
      <div className="section-title">
        <h2 id="admin-queues-title">Review queues</h2>
        <button type="button" className="text-button" disabled={loading} onClick={() => {
          setLoading(true)
          setError('')
          setAttempt(value => value + 1)
        }}>{loading ? 'Updating…' : 'Refresh counts'}</button>
      </div>
      <div className="admin-queue-grid" aria-busy={loading}>
        {reviewQueues.map(queue => {
          const count = counts[queue.id]
          return <a key={queue.id} className="admin-queue" href={adminHref(queue.id)}>
            <span className="admin-queue-label"><Icon name={queue.icon} size={17}/>{queue.description}</span>
            <strong>{count?.toLocaleString() ?? <span aria-label="Count unavailable">—</span>}</strong>
            <span className="admin-queue-link">{queue.label}<Icon name="arrow" size={15}/></span>
          </a>
        })}
      </div>
      {error && <p role="alert" className="file-error">Queue counts could not be refreshed. {error}</p>}
    </section>
    <div className="admin-directory">
      {toolGroups.map(group => <section key={group.label} aria-label={group.label}>
        <h2>{group.label}</h2>
        {group.sections.map(section => <a key={section.id} href={adminHref(section.id)}>
          <span><strong>{section.label}</strong><small>{section.description}</small></span>
          <Icon name="arrow" size={15}/>
        </a>)}
      </section>)}
    </div>
  </>
}

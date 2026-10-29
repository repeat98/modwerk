import { useEffect, useState } from 'react'
import { api } from './api'
import { useCommunity } from './context'

export type BoardClaim = { id: string; kind: 'module' | 'hook' | 'migration' | 'dsp-region'; key: string; holder: string; branch: string | null; pullRequest: number | null; note: string; createdAt: string; expiresAt: string | null }
const KIND = { module: 'Module', hook: 'Hook or table', migration: 'Migration', 'dsp-region': 'DSP region' } as const
const day = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Who is working on what (docs/AGENT_BOARD.md): every developer's agent reads and writes these claims; people read them here. */
export function AgentBoard({ repository }: { repository: string }) {
  const { session } = useCommunity()
  const [claims, setClaims] = useState<BoardClaim[] | null>(null), [error, setError] = useState('')
  const load = () => api<{ claims: BoardClaim[] }>('/agent-board/claims').then(value => { setClaims(value.claims); setError('') }, () => setError('The board could not be loaded. Try again in a moment.'))
  useEffect(() => { void load() }, [])
  async function release(claim: BoardClaim) {
    if (!window.confirm(`Release ${claim.key}, held by @${claim.holder}?`)) return
    try { await api('/agent-board/claims/' + claim.id, { method: 'DELETE' }); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'The claim could not be released.') }
  }
  return <section className="configuration-section agent-board" aria-labelledby="agent-board-title">
    <div className="developer-section-heading"><h2 id="agent-board-title">Who is working on what</h2><span className="subtle">Claims made by developers' agents, so nobody builds the same module twice</span></div>
    <p className="agent-board-intro">Your agent claims a module, hook or migration when it starts and checks here before it plans; <code>npm run board -- login</code> signs it in once. A claim lapses after 14 days without a pull request and ends when its pull request is merged or closed. <a href={repository + '/blob/main/docs/AGENT_BOARD.md'} target="_blank" rel="noreferrer">How the board works ↗</a></p>
    {error && <p className="service-note" role="alert">{error}</p>}
    {!claims && !error && <p className="subtle">Loading claims…</p>}
    {claims && !claims.length && <p className="subtle">No claims right now.</p>}
    {claims && claims.length > 0 && <ul className="agent-board-list">
      {claims.map(claim => <li key={claim.id}>
        <div className="agent-board-claim"><span className="agent-board-kind">{KIND[claim.kind]}</span><strong>{claim.key}</strong></div>
        <div className="agent-board-meta">
          <span>@{claim.holder}</span>
          {claim.pullRequest ? <a href={repository + '/pull/' + claim.pullRequest} target="_blank" rel="noreferrer">#{claim.pullRequest} ↗</a> : claim.branch && <span>{claim.branch}</span>}
          <span>{claim.expiresAt ? 'until ' + day(claim.expiresAt) : 'while its pull request is open'}</span>
          {session.admin && <button type="button" className="text-button" onClick={() => void release(claim)}>Release</button>}
        </div>
        {claim.note && <p className="agent-board-note">{claim.note}</p>}
      </li>)}
    </ul>}
  </section>
}

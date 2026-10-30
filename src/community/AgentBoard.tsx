import { useEffect, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'

export type BoardClaim = { id: string; kind: 'module' | 'hook' | 'migration' | 'dsp-region'; key: string; holder: string; branch: string | null; pullRequest: number | null; note: string; createdAt: string; expiresAt: string | null; releasedAt?: string; releasedReason?: string }
export type BoardThread = { id: string; kind: 'question' | 'finding'; topic: { kind: BoardClaim['kind'] | 'machine'; key: string }; author: string; to: string | null; body: string; pullRequest: number | null; createdAt: string; endsAt?: string; replies: { id: string; author: string; body: string; createdAt: string }[] }
export type BoardActivity = { days: number; developers: { signedIn: number; active: number }; claims: { active: number; made: number }; questions: { open: number }; findings: { active: number }; posts: number }
const KIND = { module: 'Module', hook: 'Hook or table', migration: 'Migration', 'dsp-region': 'DSP region', machine: 'Machine' } as const
const ENDED = { holder: 'released', administrator: 'released by an administrator', merged: 'merged', closed: 'pull request closed', expired: 'lapsed', suspended: 'account suspended' } as Record<string, string>
const day = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const count = (value: number, one: string, many = one + 's') => value + ' ' + (value === 1 ? one : many)

/** Who is working on what (docs/AGENT_BOARD.md): every developer's agent reads and writes these claims, questions and
 * findings; people read them here. The board's other parts stay hidden when a Worker without them answers. */
export function AgentBoard({ repository }: { repository: string }) {
  const { session } = useCommunity()
  const [claims, setClaims] = useState<BoardClaim[] | null>(null), [released, setReleased] = useState<BoardClaim[]>([]), [error, setError] = useState('')
  const [threads, setThreads] = useState<BoardThread[]>([]), [activity, setActivity] = useState<BoardActivity | null>(null)
  const load = () => Promise.all([
    api<{ claims: BoardClaim[]; released?: BoardClaim[] }>('/agent-board/claims?released=1').then(value => { setClaims(value.claims); setReleased(value.released ?? []); setError('') }, () => setError('The board could not be loaded. Try again in a moment.')),
    api<{ messages: BoardThread[] }>('/agent-board/messages').then(value => setThreads(value.messages), () => setThreads([])),
    api<BoardActivity>('/agent-board/activity').then(setActivity, () => setActivity(null)),
  ])
  useEffect(() => { void load() }, [])
  async function act(question: string, path: string, method: 'POST' | 'DELETE', failure: string) {
    if (!window.confirm(question)) return
    try { await (method === 'POST' ? post(path, {}) : api(path, { method })); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : failure) }
  }
  const pull = (number: number) => <a href={repository + '/pull/' + number} target="_blank" rel="noreferrer">#{number} ↗</a>
  return <section className="configuration-section agent-board" aria-labelledby="agent-board-title">
    <div className="developer-section-heading"><h2 id="agent-board-title">Who is working on what</h2><span className="subtle">Claims, questions and findings from developers' agents, so nobody builds the same module twice</span></div>
    <p className="agent-board-intro">Your agent claims a module, hook or migration when it starts and checks here before it plans; <code>npm run board -- login</code> signs it in once. A claim lapses after 14 days without a pull request and ends when its pull request is merged or closed. Agents ask a claim's holder or a module's author with <code>npm run board -- ask</code> and leave what they found for the next developer with <code>npm run board -- finding</code>. <a href={repository + '/blob/main/docs/AGENT_BOARD.md'} target="_blank" rel="noreferrer">How the board works ↗</a></p>
    {activity && <p className="agent-board-activity" aria-label="Board activity">{count(activity.developers.signedIn, 'developer')} signed in from the terminal · {activity.developers.active} active in the last {activity.days} days · {count(activity.claims.made, 'claim')} and {count(activity.posts, 'post')} in that time</p>}
    {error && <p className="service-note" role="alert">{error}</p>}
    {!claims && !error && <p className="subtle">Loading claims…</p>}
    {claims && !claims.length && <p className="subtle">No claims right now.</p>}
    {claims && claims.length > 0 && <ul className="agent-board-list">
      {claims.map(claim => <li key={claim.id}>
        <div className="agent-board-claim"><span className="agent-board-kind">{KIND[claim.kind]}</span><strong>{claim.key}</strong></div>
        <div className="agent-board-meta">
          <span>@{claim.holder}</span>
          {claim.pullRequest ? pull(claim.pullRequest) : claim.branch && <span>{claim.branch}</span>}
          <span>{claim.expiresAt ? 'until ' + day(claim.expiresAt) : 'while its pull request is open'}</span>
          {session.admin && <button type="button" className="text-button" onClick={() => void act(`Release ${claim.key}, held by @${claim.holder}?`, '/agent-board/claims/' + claim.id, 'DELETE', 'The claim could not be released.')}>Release</button>}
        </div>
        {claim.note && <p className="agent-board-note">{claim.note}</p>}
      </li>)}
    </ul>}
    {released.length > 0 && <details className="agent-board-ended"><summary>Recently ended claims ({released.length})</summary><ul className="agent-board-list">
      {released.map(claim => <li key={claim.id}>
        <div className="agent-board-claim"><span className="agent-board-kind">{KIND[claim.kind]}</span><strong>{claim.key}</strong></div>
        <div className="agent-board-meta"><span>@{claim.holder}</span>{claim.pullRequest && pull(claim.pullRequest)}<span>{ENDED[claim.releasedReason ?? 'expired'] ?? claim.releasedReason} {day(claim.releasedAt ?? claim.expiresAt ?? claim.createdAt)}</span></div>
      </li>)}
    </ul></details>}
    {threads.length > 0 && <>
      <h3 className="agent-board-subtitle">Questions and findings</h3>
      <ul className="agent-board-list agent-board-threads">
        {threads.map(thread => <li key={thread.id}>
          <div className="agent-board-claim"><span className="agent-board-kind">{thread.kind === 'question' ? 'Question' : 'Finding'}</span><strong>{thread.topic.key}</strong></div>
          <div className="agent-board-meta">
            <span>@{thread.author}{thread.to && ' to @' + thread.to}</span>
            {thread.pullRequest ? <span>folds into a guide in {pull(thread.pullRequest)}</span> : thread.endsAt && <span>open until {day(thread.endsAt)}</span>}
            {session.admin && <button type="button" className="text-button" onClick={() => void act('Close this ' + thread.kind + ' by @' + thread.author + '?', '/agent-board/messages/' + thread.id + '/close', 'POST', 'The thread could not be closed.')}>Close</button>}
            {session.admin && <button type="button" className="text-button" onClick={() => void act('Delete this ' + thread.kind + ' by @' + thread.author + ' and its replies?', '/agent-board/messages/' + thread.id, 'DELETE', 'The thread could not be deleted.')}>Delete</button>}
          </div>
          <p className="agent-board-body">{thread.body}</p>
          {thread.replies.length > 0 && <ol className="agent-board-replies">{thread.replies.map(reply => <li key={reply.id}><span>@{reply.author}</span> {reply.body}</li>)}</ol>}
        </li>)}
      </ul>
    </>}
  </section>
}

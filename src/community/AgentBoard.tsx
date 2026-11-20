import { useEffect, useState } from 'react'
import { api, post } from './api'
import { useCommunity } from './context'

export type BoardClaim = { id: string; kind: 'module' | 'hook' | 'migration' | 'dsp-region' | 'machine-id' | 'issue'; key: string; holder: string; branch: string | null; pullRequest: number | null; note: string; createdAt: string; expiresAt: string | null; releasedAt?: string; releasedReason?: string }
export type BoardThread = { id: string; kind: 'question' | 'finding' | 'wanted'; topic: { kind: BoardClaim['kind'] | 'machine' | 'site'; key: string }; author: string; to: string | null; body: string; pullRequest: number | null; parentIssue?: number; parentClaim?: string; priority?: Priority; createdAt: string; endsAt?: string; endedAt?: string; endedReason?: string; replies: { outcome?: 'reproduced' | 'different-result'; evidence?: number | null; id: string; author: string; body: string; createdAt: string }[] }
type Priority = 'high' | 'normal' | 'low'
export type BoardActivity = { days: number; developers: { signedIn: number; active: number }; claims: { active: number; made: number }; questions: { open: number }; findings: { active: number }; posts: number }
const KIND = { module: 'Module', hook: 'Hook or table', migration: 'Migration', 'dsp-region': 'DSP region', 'machine-id': 'Machine id', issue: 'Issue', machine: 'Machine' } as const
const ENDED = { holder: 'released', administrator: 'released by an administrator', merged: 'merged', closed: 'pull request closed', expired: 'lapsed', suspended: 'account suspended' } as Record<string, string>
const day = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const count = (value: number, one: string, many = one + 's') => value + ' ' + (value === 1 ? one : many)

/** Who is working on what (docs/AGENT_BOARD.md): every developer's agent reads and writes these claims, questions and
 * findings; people read them here. The board's other parts stay hidden when a Worker without them answers. */
export function AgentBoard({ repository }: { repository: string }) {
  const { session } = useCommunity()
  const [claims, setClaims] = useState<BoardClaim[] | null>(null), [released, setReleased] = useState<BoardClaim[]>([]), [error, setError] = useState('')
  const [all, setAll] = useState<BoardThread[] | null>(null), [done, setDone] = useState<BoardThread[]>([]), [activity, setActivity] = useState<BoardActivity | null>(null)
  const [taskParent, setTaskParent] = useState('')
  const load = () => Promise.all([
    api<{ claims: BoardClaim[]; released?: BoardClaim[] }>('/agent-board/claims?released=1').then(value => { setClaims(value.claims); setReleased(value.released ?? []); setError('') }, () => setError('The board could not be loaded. Try again in a moment.')),
    // ended=1 adds the 50 most recently ended threads; a wanted task among them whose pull request merged is done.
    api<{ messages: BoardThread[]; ended?: BoardThread[] }>('/agent-board/messages?ended=1').then(value => { setAll(value.messages); setDone((value.ended ?? []).filter(thread => thread.kind === 'wanted' && thread.endedReason === 'merged')) }, () => setAll(null)),
    api<BoardActivity>('/agent-board/activity').then(setActivity, () => setActivity(null)),
  ])
  useEffect(() => { void load() }, [])
  async function act(question: string, path: string, method: 'POST' | 'DELETE', failure: string) {
    if (!window.confirm(question)) return
    try { await (method === 'POST' ? post(path, {}) : api(path, { method })); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : failure) }
  }
  async function prioritise(thread: BoardThread, priority: string) {
    try { await post('/agent-board/messages/' + thread.id + '/priority', { priority }); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'The priority could not be changed.') }
  }
  const pull = (number: number) => <a href={repository + '/pull/' + number} target="_blank" rel="noreferrer">#{number} ↗</a>
  const claimKey = (claim: BoardClaim) => claim.kind === 'issue' ? <a href={repository + '/issues/' + claim.key} target="_blank" rel="noreferrer">#{claim.key} ↗</a> : claim.key
  // The server lists the most urgent wanted tasks first; questions and findings have no priority.
  const threads = (all ?? []).filter(thread => thread.kind !== 'wanted'), wanted = (all ?? []).filter(thread => thread.kind === 'wanted')
  const parentOf = (task: BoardThread) => task.parentIssue ? 'Issue #' + task.parentIssue : task.parentClaim ? 'Claim ' + task.parentClaim : ''
  const parentTasks = (tasks: BoardThread[]) => taskParent ? tasks.filter(task => parentOf(task) === taskParent) : tasks
  const columns = [
    { title: 'To do', tasks: parentTasks(wanted).filter(task => !task.to && !task.pullRequest) },
    { title: 'Taken', tasks: parentTasks(wanted).filter(task => task.to && !task.pullRequest) },
    { title: 'In review', tasks: parentTasks(wanted).filter(task => task.pullRequest) },
    { title: 'Done', tasks: parentTasks(done) },
  ]
  // Collapsed by default: the board is reference, and open it pushed the help links far down the page.
  return <details className="agent-board">
    <summary><h2 id="agent-board-title">Who is working on what</h2>{claims && <span className="agent-board-count">{columns[0].tasks.length > 0 && count(columns[0].tasks.length, 'to-do') + ' · '}{count(claims.length, 'claim')}{threads.length > 0 && ' · ' + count(threads.length, 'post')}</span>}</summary>
    <p className="agent-board-intro">Agents claim what they work on, so nobody builds the same thing twice. Yours does this for you. <a href={repository + '/blob/main/docs/AGENT_BOARD.md'} target="_blank" rel="noreferrer">How the board works ↗</a></p>
    {activity && <p className="agent-board-activity" aria-label="Board activity">{count(activity.developers.signedIn, 'developer')} signed in from the terminal · {activity.developers.active} active in the last {activity.days} days · {count(activity.claims.made, 'claim')} and {count(activity.posts, 'post')} in that time</p>}
    {error && <p className="service-note" role="alert">{error}</p>}
    {all && <>
      <h3 className="agent-board-subtitle">To do</h3>
      <p className="agent-board-hint">Small jobs anyone's agent can take, most urgent first. Post one with <code>npm run board -- wanted &lt;topic&gt; &lt;key&gt; "…" --priority high</code>, take one with <code>npm run board -- take &lt;id&gt;</code>.</p>
      {taskParent && <p>Tasks for {taskParent} <button type="button" onClick={() => setTaskParent('')}>Show all tasks</button></p>}
      <div className="agent-board-columns">
        {columns.map(column => <section key={column.title} aria-label={column.title}>
          <h4>{column.title} <span>{column.tasks.length}</span></h4>
          {column.tasks.length > 0 ? <ul className="agent-board-tasks">
            {column.tasks.map(task => <li key={task.id}>
              <div className="agent-board-claim">{task.priority && task.priority !== 'normal' && <span className={'agent-board-priority ' + task.priority}>{task.priority === 'high' ? 'High' : 'Low'}</span>}<strong>{task.topic.key}</strong></div>
              <p className="agent-board-body">{task.body}</p>
              <div className="agent-board-meta">
                <span>{task.to ? (task.endedAt ? 'done by @' : 'taken by @') + task.to : 'posted by @' + task.author}</span>
                {parentOf(task) && <button type="button" className="text-button" onClick={() => setTaskParent(parentOf(task))}>{task.parentIssue ? parentOf(task) : 'Tasks for ' + (claims?.find(claim => claim.id === task.parentClaim)?.key ?? parentOf(task))}</button>}
                {task.parentIssue && <a href={repository + '/issues/' + task.parentIssue}>View issue #{task.parentIssue}</a>}
                {task.pullRequest && pull(task.pullRequest)}
                {session.admin && !task.endedAt && <select aria-label={'Priority of ' + task.topic.key} value={task.priority ?? 'normal'} onChange={event => void prioritise(task, event.target.value)}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>}
                {session.admin && !task.endedAt && <button type="button" className="text-button" onClick={() => void act('Close this wanted task by @' + task.author + '?', '/agent-board/messages/' + task.id + '/close', 'POST', 'The task could not be closed.')}>Close</button>}
              </div>
            </li>)}
          </ul> : <p className="subtle">Nothing here.</p>}
        </section>)}
      </div>
    </>}
    {!claims && !error && <p className="subtle">Loading claims…</p>}
    {claims && !claims.length && <p className="subtle">No claims right now.</p>}
    {claims && claims.length > 0 && <ul className="agent-board-list">
      {claims.map(claim => <li key={claim.id}>
        <div className="agent-board-claim"><span className="agent-board-kind">{KIND[claim.kind]}</span><strong>{claimKey(claim)}</strong></div>
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
        <div className="agent-board-claim"><span className="agent-board-kind">{KIND[claim.kind]}</span><strong>{claimKey(claim)}</strong></div>
        <div className="agent-board-meta"><span>@{claim.holder}</span>{claim.pullRequest && pull(claim.pullRequest)}<span>{ENDED[claim.releasedReason ?? 'expired'] ?? claim.releasedReason} {day(claim.releasedAt ?? claim.expiresAt ?? claim.createdAt)}</span></div>
      </li>)}
    </ul></details>}
    {threads.length > 0 && <>
      <h3 className="agent-board-subtitle">Questions and findings</h3>
      <ul className="agent-board-list agent-board-threads">
        {threads.map(thread => <li key={thread.id}>
          <div className="agent-board-claim"><span className="agent-board-kind">{{ question: 'Question', finding: 'Finding', wanted: 'Wanted' }[thread.kind]}</span><strong>{thread.topic.key}</strong></div>
          <div className="agent-board-meta">
            <span>@{thread.author}{thread.to && (thread.kind === 'wanted' ? ' taken by @' : ' to @') + thread.to}</span>
            {thread.pullRequest ? <span>{thread.kind === 'finding' ? 'folds into a guide in' : 'ends with'} {pull(thread.pullRequest)}</span> : thread.endsAt && <span>open until {day(thread.endsAt)}</span>}
            {session.admin && <button type="button" className="text-button" onClick={() => void act('Close this ' + thread.kind + ' by @' + thread.author + '?', '/agent-board/messages/' + thread.id + '/close', 'POST', 'The thread could not be closed.')}>Close</button>}
            {session.admin && <button type="button" className="text-button" onClick={() => void act('Delete this ' + thread.kind + ' by @' + thread.author + ' and its replies?', '/agent-board/messages/' + thread.id, 'DELETE', 'The thread could not be deleted.')}>Delete</button>}
          </div>
          <p className="agent-board-body">{thread.body}</p>
          {thread.replies.length > 0 && <ol className="agent-board-replies">{thread.replies.map(reply => <li key={reply.id}><span>@{reply.author}</span> {reply.outcome && <strong>{reply.outcome === 'reproduced' ? 'Reproduced' : 'Different result'} </strong>}{reply.body} {reply.evidence && <a href={repository + '/issues/' + reply.evidence}>Evidence #{reply.evidence}</a>}</li>)}</ol>}
        </li>)}
      </ul>
    </>}
  </details>
}

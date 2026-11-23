import { useEffect, useId, useMemo, useState } from 'react'
import { api } from './api'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import type { ForumThread } from './forum-contract'
import { currentPushSubscription, deviceSettings, pushSupported } from './push-client'
import { getStartedComplete, getStartedKey, getStartedSteps } from './get-started'

type Progress = { introductions: number; followedModules: number; pushEnabled: boolean }
const NO_PROGRESS: Progress = { introductions: 0, followedModules: 0, pushEnabled: false }
const progressKey = (id: string) => 'modwerk.get-started.progress:' + id
const seenKey = (id: string) => 'modwerk.get-started.seen:' + id
function dismissed(id: string) { try { return localStorage.getItem(getStartedKey(id)) === '1' } catch { return false } }
function dismiss(id: string) { try { localStorage.setItem(getStartedKey(id), '1') } catch { /* The card simply returns next time. */ } }
/** The progress this browser saw last time, shown at once while the current answers load. */
function remembered(id: string): Progress | null {
  try {
    const value = JSON.parse(localStorage.getItem(progressKey(id)) ?? 'null')
    return value && typeof value.introductions === 'number' && typeof value.followedModules === 'number' && typeof value.pushEnabled === 'boolean' ? value : null
  } catch { return null }
}
function remember(id: string, progress: Progress) { try { localStorage.setItem(progressKey(id), JSON.stringify(progress)) } catch { /* Only the next first paint waits for the answers. */ } }
/** A short checklist for new members, kept until every step is done or the member closes it. Dismissal stays in this browser. */
export function GetStarted({ machine }: { machine?: string }) {
  const { session } = useCommunity(), user = session.user, [loaded, setLoaded] = useState<Progress & { id: string } | null>(null), [closed, setClosed] = useState(false), [failed, setFailed] = useState('')
  const id = user?.verified && user.username ? user.id : '', username = user?.username ?? ''
  const stepsId = useId()
  const wasDismissed = useMemo(() => !!id && dismissed(id), [id]), saved = useMemo(() => id ? remembered(id) : null, [id])
  const [expanded, setExpanded] = useState(() => {
    if (saved || (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches)) return false
    try { return localStorage.getItem(seenKey(id)) !== '1' } catch { return true }
  })
  // Progress is keyed by member so another account's answers never show for this one.
  const progress = loaded && loaded.id === id ? loaded : null
  useEffect(() => {
    if (!id || dismissed(id)) return
    // A quick visit counts even if the member leaves before the progress requests finish.
    try { localStorage.setItem(seenKey(id), '1') } catch { /* The checklist still works without storage. */ }
    let cancelled = false
    void Promise.all([
      api<{ threads: ForumThread[] }>('/forum/threads?category=introductions&author=' + encodeURIComponent(username)),
      api<{ threads: ForumThread[] }>('/forum/threads?following=1'),
      pushSupported() ? currentPushSubscription().then(deviceSettings).catch(() => ({ activity: false })) : Promise.resolve({ activity: false }),
    ]).then(([intros, following, device]) => {
      if (cancelled) return
      const next = { introductions: intros.threads.length, followedModules: following.threads.filter(thread => thread.module_id).length, pushEnabled: device.activity }
      remember(id, next); setLoaded({ id, ...next })
    }).catch(() => { if (!cancelled) setFailed(id) /* The checklist is optional; the forum works without it. */ })
    return () => { cancelled = true }
  }, [id, username])
  // Until the answers arrive the card shows the progress remembered here, or every step still open: the card has its
  // final size from the first paint instead of appearing late and pushing the page down.
  const pending = !progress, shown = progress ?? saved ?? NO_PROGRESS
  const steps = user ? getStartedSteps({ username, displayName: user.displayName, avatar: user.avatar, ...shown }, machine) : null
  const complete = !pending && !!steps && getStartedComplete(steps)
  useEffect(() => { if (complete && id) dismiss(id) }, [complete, id])
  if (!id || !steps || wasDismissed || closed || complete || (pending && failed === id && !saved)) return null
  const done = steps.filter(step => step.done).length
  return <section className="get-started" aria-labelledby="get-started-title" aria-busy={pending}>
    <div className="get-started-heading">
      <div><h2 id="get-started-title"><button className="get-started-toggle" type="button" aria-expanded={expanded} aria-controls={stepsId} onClick={() => setExpanded(value => !value)}><Icon name="back" size={14} />Get started</button></h2><p>{pending && !saved ? 'Checking your progress…' : done + ' of ' + steps.length + ' steps complete'}</p></div>
      <button type="button" className="text-button" onClick={() => { dismiss(id); setClosed(true) }}>Dismiss</button>
    </div>
    <ol id={stepsId} className="get-started-steps" hidden={!expanded}>{steps.map((step, index) => <li key={step.id} className={step.done ? 'is-done' : undefined}>
      <span className="get-started-mark" aria-hidden="true">{step.done ? <Icon name="check" size={13} /> : index + 1}</span>
      <div><strong>{step.done ? <><span className="sr-only">Done: </span>{step.title}</> : step.title}</strong>{!step.done && <small>{step.detail}</small>}</div>
      {!step.done && <a className="get-started-action" href={step.href}>{step.action}<Icon name="arrow" size={13} /></a>}
    </li>)}</ol>
  </section>
}

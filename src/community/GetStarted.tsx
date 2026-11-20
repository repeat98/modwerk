import { useEffect, useId, useState } from 'react'
import { api } from './api'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import type { ForumThread } from './forum-contract'
import { currentPushSubscription, deviceSettings, pushSupported } from './push-client'
import { getStartedComplete, getStartedKey, getStartedSteps } from './get-started'

type Progress = { introductions: number; followedModules: number; pushEnabled: boolean }
function dismissed(id: string) { try { return localStorage.getItem(getStartedKey(id)) === '1' } catch { return false } }
function dismiss(id: string) { try { localStorage.setItem(getStartedKey(id), '1') } catch { /* The card simply returns next time. */ } }
/** A short checklist for new members, kept until every step is done or the member closes it. Dismissal stays in this browser. */
export function GetStarted({ machine }: { machine?: string }) {
  const { session } = useCommunity(), user = session.user, [loaded, setLoaded] = useState<Progress & { id: string } | null>(null), [closed, setClosed] = useState(false)
  const id = user?.verified && user.username ? user.id : '', username = user?.username ?? ''
  const stepsId = useId()
  const [expanded, setExpanded] = useState(() => typeof window === 'undefined' || !window.matchMedia?.('(max-width: 600px)').matches)
  // Progress is keyed by member so another account's answers never show for this one.
  const progress = loaded && loaded.id === id ? loaded : null
  useEffect(() => {
    if (!id || dismissed(id)) return
    let cancelled = false
    void Promise.all([
      api<{ threads: ForumThread[] }>('/forum/threads?category=introductions&author=' + encodeURIComponent(username)),
      api<{ threads: ForumThread[] }>('/forum/threads?following=1'),
      pushSupported() ? currentPushSubscription().then(deviceSettings).catch(() => ({ activity: false })) : Promise.resolve({ activity: false }),
    ]).then(([intros, following, device]) => {
      if (!cancelled) setLoaded({ id, introductions: intros.threads.length, followedModules: following.threads.filter(thread => thread.module_id).length, pushEnabled: device.activity })
    }).catch(() => { /* The checklist is optional; the forum works without it. */ })
    return () => { cancelled = true }
  }, [id, username])
  const steps = user && progress ? getStartedSteps({ username, displayName: user.displayName, avatar: user.avatar, ...progress }, machine) : null
  const complete = !!steps && getStartedComplete(steps)
  useEffect(() => { if (complete && id) dismiss(id) }, [complete, id])
  if (!id || !steps || closed || complete) return null
  const done = steps.filter(step => step.done).length
  return <section className="get-started" aria-labelledby="get-started-title">
    <div className="get-started-heading">
      <div><h2 id="get-started-title"><button className="get-started-toggle" type="button" aria-expanded={expanded} aria-controls={stepsId} onClick={() => setExpanded(value => !value)}><Icon name="back" size={14} />Get started</button></h2><p>{done} of {steps.length} steps complete</p></div>
      <button type="button" className="text-button" onClick={() => { dismiss(id); setClosed(true) }}>Dismiss</button>
    </div>
    <ol id={stepsId} className="get-started-steps" hidden={!expanded}>{steps.map((step, index) => <li key={step.id} className={step.done ? 'is-done' : undefined}>
      <span className="get-started-mark" aria-hidden="true">{step.done ? <Icon name="check" size={13} /> : index + 1}</span>
      <div><strong>{step.done ? <><span className="sr-only">Done: </span>{step.title}</> : step.title}</strong>{!step.done && <small>{step.detail}</small>}</div>
      {!step.done && <a className="get-started-action" href={step.href}>{step.action}<Icon name="arrow" size={13} /></a>}
    </li>)}</ol>
  </section>
}

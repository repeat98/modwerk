// The base install dialog's frame, for every machine (owner, 9 November 2026: the Zoom pedals' base installs like the
// Octatrack's). Each machine's dialog (BaseInstallDialog, ZoomBaseDialog) fills it with its own stages.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Icon, type IconName } from './Icon'
import './link-hero.css'
import './octatrack-link.css'

/** The modal: it focuses its title, and each stage's as `focus` changes; closes only when `canClose`; and while `busy`
 * the browser asks before the page is left. `finishedRef` is set by whoever closes it on purpose, so the browser's own
 * close (Escape before the page was clicked) reaches `onClose` as not done. */
export function BaseDialogFrame({ canClose, busy, focus, finishedRef, onClose, footer, children }: {
  canClose: boolean
  busy: boolean
  focus: string
  finishedRef: RefObject<boolean>
  onClose: (done: boolean) => void
  footer: ReactNode
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const finish = () => { finishedRef.current = true; onClose(true) }
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal(); element?.querySelector('h2')?.focus()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  useEffect(() => { (dialog.current?.querySelector<HTMLElement>('[data-stage-title]') ?? dialog.current?.querySelector('h2'))?.focus(); dialog.current?.scrollTo(0, 0) }, [focus])
  useEffect(() => {
    if (!busy) return
    const stay = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', stay)
    return () => window.removeEventListener('beforeunload', stay)
  }, [busy])
  return <dialog ref={dialog} className="base-install-dialog" aria-labelledby="base-install-title" aria-describedby="base-install-intro" onCancel={event => { event.preventDefault(); if (canClose) finish() }} onClose={() => { if (!finishedRef.current && !dialog.current?.open) onClose(false) }}>
    {canClose && <button type="button" className="icon-button base-install-close" aria-label="Close" onClick={finish}><Icon name="close" size={18} /></button>}
    {children}
    <footer className="base-install-footer">{footer}</footer>
  </dialog>
}

/** What the base brings: icon, lead, rest (the rest hidden on phones unless the fourth is true). */
export type BasePromise = [IconName, string, string, boolean?]

/** The first view: a picture, the title, what the base brings and what the install needs (`missing`: why this browser can't). */
export function BaseIntro({ hero, title, intro, promises, needs, missing }: { hero: ReactNode; title: ReactNode; intro: ReactNode; promises: BasePromise[]; needs: string; missing?: string }) {
  return <>
    {hero}
    <h2 id="base-install-title" className="link-title" tabIndex={-1}>{title} <span className="module-beta-badge">Beta</span></h2>
    <p id="base-install-intro" className="base-install-intro">{intro}</p>
    <ul className="link-promises">{promises.map(([icon, lead, rest, explainOnPhone]) => <li key={lead}><span className="link-feature-icon" aria-hidden="true"><Icon name={icon} size={18} /></span><span><strong>{lead}</strong><span className={explainOnPhone ? undefined : 'link-feature-rest'}>{rest}</span></span></li>)}</ul>
    <p className={'link-needs' + (missing ? ' is-missing' : '')}>{needs}</p>
    {missing && <p className="file-error" role="alert">{missing}</p>}
  </>
}

/** The numbered stages along the top, those before `at` ticked. */
export function StageProgress({ labels, at }: { labels: readonly string[]; at: number }) {
  return <ol className="base-install-progress" aria-label="Installation progress">{labels.map((label, index) => <li key={label} aria-current={index === at ? 'step' : undefined} className={index < at ? 'is-past' : undefined}><span aria-hidden="true">{index < at ? <Icon name="check" size={13} /> : index + 1}</span>{label}</li>)}</ol>
}

/** One operation's steps, the same row before, during and after, so the window never changes its layout: what will
 * happen, then where it is (with its progress while `fraction` is below 1), then where it stopped. No `run` before it starts. */
export function StagePlan({ stages, run, progressLabel }: { stages: readonly (readonly [string, string])[]; run?: { at: number; done?: boolean; failed?: boolean; fraction?: number }; progressLabel: string }) {
  return <ol className="base-update-plan" aria-label={run ? progressLabel : 'What happens'}>{stages.map(([title, text], index) => {
    const state = !run ? undefined : index < run.at || run.done ? 'is-complete' : index === run.at ? (run.failed ? 'is-failed' : 'is-active') : undefined
    const active = !!run && index === run.at && !run.done && !run.failed
    return <li key={title} className={state} aria-current={active ? 'step' : undefined}>
      <span className="base-update-mark" aria-hidden="true">{state === 'is-complete' ? <Icon name="check" size={13} /> : state === 'is-failed' ? '!' : index + 1}</span>
      <strong>{title}{state === 'is-complete' && <span className="sr-only"> (done)</span>}</strong>
      <p>{text}</p>
      {active && run.fraction !== undefined && run.fraction < 1 && <progress max={1} value={run.fraction} aria-label={title} />}
    </li>
  })}</ol>
}

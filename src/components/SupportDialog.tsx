import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { countSupportPrompt, trackUsage } from '../community/usage'
import { pageBusy } from '../community/public-announcement'
import { answerSupportPrompt, dueSupportPrompt, noteSupportVisit, type SupportPromptAnswer, type SupportPromptKind, type SupportPromptReason } from '../community/support-prompt'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { SUPPORT_COSTS, SUPPORT_URL, type SupportCosts as Costs } from '../config/support'
import { apiUrl } from '../hosting'

const PAGE_LOADED_AT = Date.now()
const euro = (amount: number) => '€' + amount.toLocaleString('en', { maximumFractionDigits: 0 })
const kofiLabel = 'Support on Ko-fi (opens in a new tab)'

export function SupportButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="support-link" aria-haspopup="dialog" onClick={onClick}><span className="support-heart"><Icon name="heart" size={14} /></span>Support Modwerk</button>
}

/** This UTC month's Ko-fi tips in euros from the webhook, or `euros: null` while it is not connected. */
export type KofiCoverage = { month: string; euros: number | null }
let coverageRequest: Promise<KofiCoverage | null> | undefined
function readCoverage(value: unknown): KofiCoverage | null {
  const data = value as Partial<KofiCoverage> | null
  return data && typeof data.month === 'string' && /^\d{4}-\d{2}$/.test(data.month) && (data.euros === null || typeof data.euros === 'number' && Number.isFinite(data.euros) && data.euros >= 0) ? { month: data.month, euros: data.euros } : null
}
/** Asked once per page, when a dialog with the costs first opens. Sends nothing but the request. */
export function useKofiCoverage() {
  const [coverage, setCoverage] = useState<KofiCoverage | null>(null)
  useEffect(() => {
    let live = true
    coverageRequest ??= fetch(apiUrl('/support/coverage'), { credentials: 'omit', referrerPolicy: 'no-referrer' }).then(reply => reply.ok ? reply.json() : null).then(readCoverage).catch(() => null)
    void coverageRequest.then(value => { if (live) setCoverage(value) })
    return () => { live = false }
  }, [])
  return coverage
}
const monthName = (month: string) => { const date = new Date(month + '-01T00:00:00Z'); return Number.isNaN(date.getTime()) ? month : date.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }

/** The running costs from `SUPPORT_COSTS`, and a bar for what Ko-fi covered: the webhook's total for this month plus any
 * tips entered by hand for the same month. */
export function SupportCosts({ costs = SUPPORT_COSTS, coverage = null }: { costs?: Costs; coverage?: KofiCoverage | null }) {
  if (!(costs.monthly > 0)) return null
  const split = costs.hosting !== undefined && costs.tokens !== undefined ? ` (hosting ${euro(costs.hosting)} · tokens ${euro(costs.tokens)})` : ''
  const live = coverage && coverage.euros !== null ? coverage : null
  const month = live?.month ?? costs.month
  const extra = costs.month && costs.month === month && costs.covered !== undefined ? Math.max(0, costs.covered) : 0
  const covered = live ? live.euros! + extra : costs.month && costs.covered !== undefined ? extra : null
  return <figure className="support-costs">
    <figcaption>Running costs: about <strong>{euro(costs.monthly)} a month</strong> for hosting and tokens{split}.</figcaption>
    {covered !== null && month && <>
      <div className="support-costs-bar" role="img" aria-label={`Ko-fi covered ${euro(covered)} of ${euro(costs.monthly)} in ${monthName(month)}`}><span style={{ width: Math.min(100, Math.round(covered / costs.monthly * 100)) + '%' }} /></div>
      <p>Ko-fi covered {euro(covered)} of {euro(costs.monthly)} in {monthName(month)}</p>
    </>}
  </figure>
}

export function SupportDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const coverage = useKofiCoverage()
  useEffect(() => {
    trackUsage('support_opened') // Only the event name is sent, like every other count.
    const element = dialog.current
    const previousFocus = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  return <dialog ref={dialog} className="app-dialog support-dialog" aria-labelledby="support-title" aria-describedby="support-message" onCancel={event => { event.preventDefault(); onClose() }}>
    <h2 id="support-title"><span className="support-heart"><Icon name="heart" size={20} /></span>Contribute to Modwerk</h2>
    <p id="support-message">Modwerk grew out of octabam and the work of people who build, test and share modules for their instruments.</p>
    <ul className="support-ways">
      <li><a href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noopener noreferrer">Join the Discord</a> to trade ideas, ask questions or help someone get a module running.</li>
      <li><a href="#forum" onClick={onClose}>Share a test or bug report in the forum.</a> Include the machine, OS version and what you heard or saw.</li>
      <li><a href="#submit" onClick={onClose}>Contribute code.</a> The guide covers building a module and submitting your changes for review.</li>
    </ul>
    <p>I pay for the hosting and the tokens Modwerk is built with. If you’d like to help with those costs, Ko-fi tips are welcome. Modwerk is free to use.</p>
    <SupportCosts coverage={coverage} />
    <div className="dialog-actions">
      <button type="button" className="button button-quiet" autoFocus onClick={onClose}>Close</button>
      <a className="button button-primary" href={url} target="_blank" rel="noopener noreferrer" onClick={() => { trackUsage('support_link_opened'); countSupportPrompt('dialog-kofi'); answerSupportPrompt('kofi') }} aria-label={kofiLabel}>Support on Ko-fi <span aria-hidden="true">↗</span></a>
    </div>
  </dialog>
}

/** One quiet line on the screens that end an install. */
export function SupportLine({ url = SUPPORT_URL }: { url?: string }) {
  if (!url) return null
  return <p className="support-line"><span className="support-heart"><Icon name="heart" size={14} /></span><span>Modwerk takes a lot of evenings, and I pay for the hosting and tokens myself. <a href={url} target="_blank" rel="noopener noreferrer" aria-label={kofiLabel} onClick={() => { trackUsage('support_link_opened'); countSupportPrompt('line-kofi'); answerSupportPrompt('kofi') }}>Support on Ko-fi<span aria-hidden="true"> ↗</span></a></span></p>
}

const THANKS_TITLE: Record<SupportPromptKind, (count: number) => string> = {
  installs: count => `Your ${count}th install with Modwerk`,
  days: count => `${count} days with Modwerk`,
  base: () => 'Your instrument runs the Modwerk base',
}

/** The thank-you for frequent use (support-prompt.ts). It closes at once like every dialog. */
export function SupportMilestoneDialog({ reason, url, costs, onAnswer }: { reason: SupportPromptReason; url: string; costs?: Costs; onAnswer: (answer: SupportPromptAnswer, closed?: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const coverage = useKofiCoverage()
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  return <dialog ref={dialog} className="app-dialog support-dialog support-milestone" aria-labelledby="support-milestone-title" aria-describedby="support-milestone-message" onCancel={event => { event.preventDefault(); onAnswer('later', true) }}>
    <h2 id="support-milestone-title"><span className="support-heart"><Icon name="heart" size={20} /></span>{THANKS_TITLE[reason.kind](reason.count)}</h2>
    <p id="support-milestone-message">Glad it’s useful! Modwerk takes a lot of my evenings, and I pay for the hosting and the tokens it’s built with myself. If you’d like to chip in, a coffee on Ko-fi helps keep it running. Everything stays free either way.</p>
    <SupportCosts costs={costs} coverage={coverage} />
    <p className="service-note">Module authors have their own Ko-fi cups on their module pages.</p>
    <div className="dialog-actions">
      <button type="button" className="text-button support-milestone-never" onClick={() => onAnswer('never')}>Don’t show again</button>
      <button type="button" className="button button-quiet" autoFocus onClick={() => onAnswer('later')}>Not now</button>
      <a className="button button-primary" href={url} target="_blank" rel="noopener noreferrer" onClick={() => { trackUsage('support_link_opened'); onAnswer('kofi') }} aria-label={kofiLabel}>Support on Ko-fi <span aria-hidden="true">↗</span></a>
    </div>
  </dialog>
}

const PREVIEW_REASONS: SupportPromptReason[] = [{ kind: 'installs', count: 25 }, { kind: 'days', count: 10 }, { kind: 'base', count: 1 }]
/** Development only (`?preview=support-thanks`): each thank-you with example costs, and the install-screen line. */
export function SupportMilestonePreview() {
  const [reason, setReason] = useState<SupportPromptReason | null>(PREVIEW_REASONS[0])
  return <section className="configuration-section">
    <h2>Support thank-you preview</h2>
    <p className="service-note">Development preview with the live SUPPORT_COSTS. Below: the line on install screens.</p>
    <p className="success-note" role="status">Done.</p>
    <SupportLine />
    <div className="dialog-actions">{PREVIEW_REASONS.map(item => <button key={item.kind} type="button" className="button button-quiet" onClick={() => setReason(item)}>{THANKS_TITLE[item.kind](item.count)}</button>)}</div>
    {reason && <SupportMilestoneDialog key={reason.kind} reason={reason} url={SUPPORT_URL} costs={SUPPORT_COSTS} onAnswer={() => setReason(null)} />}
  </section>
}

const calm = () => !pageBusy() && !document.querySelector('.public-announcement')

/** Counts this visit's day and shows a thank-you earned on an earlier visit, once the page has settled and nothing else
 * is open. */
export function SupportMilestone({ enabled, url = SUPPORT_URL }: { enabled: boolean; url?: string }) {
  const [reason, setReason] = useState<SupportPromptReason | null>(null)
  useEffect(() => { noteSupportVisit() }, [])
  useEffect(() => {
    if (!enabled || !url || reason || !dueSupportPrompt(PAGE_LOADED_AT)) return
    let timer: number | undefined
    function check() {
      if (!calm()) { window.clearTimeout(timer); timer = undefined; return }
      timer ??= window.setTimeout(() => {
        timer = undefined
        const due = dueSupportPrompt(PAGE_LOADED_AT)
        if (!due || !calm()) return
        answerSupportPrompt('later') // shown once and the cooldown starts, even if the tab closes before an answer
        countSupportPrompt(`${due.kind}-shown`)
        setReason(due)
      }, 4000)
    }
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    document.addEventListener('visibilitychange', check)
    document.addEventListener('focusin', check); document.addEventListener('focusout', check)
    check()
    return () => { window.clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', check); document.removeEventListener('focusin', check); document.removeEventListener('focusout', check) }
  }, [enabled, url, reason])
  if (!reason) return null
  return <SupportMilestoneDialog reason={reason} url={url} onAnswer={(answer, closed) => {
    countSupportPrompt(`${reason.kind}-${closed ? 'closed' : answer}`)
    answerSupportPrompt(answer)
    setReason(null)
  }} />
}

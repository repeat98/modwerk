import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { assetUrl } from '../hosting'
import { hasBetaAccess } from './beta-access'
import type { BuiltModule } from './build-follow-up'
import { useCommunity } from './context'
import { followDownloadedModules } from './download-follows'
import { rememberHardwareFeedback } from './hardware-feedback'
import { accountHref } from './member-access'
import { takePendingFollows } from './pending-follows'
import { trackUsage } from './usage'

/** How long Not now stays disabled, so the invitation is read once before it can be waved away. */
export const INVITE_WAIT_SECONDS = 4
/** Six things an account adds, each readable at a glance: a verb-led label and a few words. */
const PERKS: readonly [IconName, string, string][] = [
  ['mail', 'Update emails', 'when your modules change'],
  ['warn', 'Report bugs', 'straight to the author'],
  ['plus', 'Request modules', 'vote on what comes next'],
  ['message', 'Join the forum', 'ask, help and share ideas'],
  ['star', 'Rate & like', 'help others choose'],
  ['play', 'Show your sound', 'share sets and previews'],
]
const back = () => window.location.hash.slice(1)
function names(modules: readonly BuiltModule[]) {
  const shown = modules.slice(0, 4).map(module => module.name)
  return modules.length > shown.length ? [...shown, '+' + (modules.length - shown.length) + ' more'] : shown
}
function SignupActions({ onChoose }: { onChoose: () => void }) {
  return <div className="signup-invite-actions">
    <a className="button button-primary" href={accountHref('register', back())} onClick={() => { trackUsage('download_signup_clicked'); onChoose() }}>Create free account<Icon name="arrow" size={16}/></a>
    <a className="button button-quiet" href={accountHref('login', back())} onClick={onChoose}>Sign in</a>
  </div>
}

/** After a guest's download: what an account adds, with the modules they just built. Signing up follows those modules. */
export function DownloadSignupInvite({ modules, onClose }: { modules: readonly BuiltModule[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [wait, setWait] = useState(INVITE_WAIT_SECONDS)
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement
    element?.showModal()
    trackUsage('download_signup_prompt_shown')
    return () => { element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
  }, [])
  useEffect(() => {
    if (!wait) return
    const timer = window.setTimeout(() => setWait(wait - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  return <dialog ref={dialog} className="app-dialog signup-invite-dialog" aria-labelledby="signup-invite-title" aria-describedby="signup-invite-message" onCancel={event => { event.preventDefault(); if (!wait) onClose() }} onKeyDown={event => event.stopPropagation()}>
    <p className="signup-invite-kicker"><Icon name="download" size={15}/>Your firmware is downloading</p>
    <h2 id="signup-invite-title">Join the people building Modwerk</h2>
    <p id="signup-invite-message">A free account takes a minute. It gets you:</p>
    <ul className="signup-invite-perks">{PERKS.map(([icon, title, text]) => <li key={title}><span className="signup-invite-icon" aria-hidden="true"><Icon name={icon} size={17}/></span><strong>{title}</strong><span>{text}</span></li>)}</ul>
    {modules.length > 0 && <div className="signup-invite-follow"><p>We’ll follow {modules.length === 1 ? 'the module' : 'the modules'} you just built, so you hear about every fix:</p><ul className="signup-invite-modules" aria-label="Modules in your download">{names(modules).map(name => <li key={name}>{name}</li>)}</ul></div>}
    <SignupActions onChoose={onClose}/>
    <button type="button" className="text-button signup-invite-later" disabled={wait > 0} onClick={onClose}>{wait ? `Not now (${wait}s)` : 'Not now'}</button>
    <p className="signup-invite-footer"><img src={assetUrl('modwerk-mark.svg')} width={18} height={18} alt=""/>Modwerk stays free and open source &lt;3</p>
  </dialog>
}

/** "Mini Verb, Tape Echo and Analog BD", or the first two and how many more. */
export function moduleList(modules: readonly BuiltModule[]) {
  const names = modules.map(module => module.name)
  if (names.length > 3) return names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more'
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0] ?? 'your modules'
}

/** A smaller reminder in the install guide once the invitation is closed; it can be closed for the visit. */
export function DownloadSignupCard({ modules, onClose }: { modules: readonly BuiltModule[]; onClose: () => void }) {
  return <section className="signup-invite-card" aria-labelledby="signup-invite-card-title">
    <span className="signup-invite-icon" aria-hidden="true"><Icon name="mail" size={18}/></span>
    <div>
      <h3 id="signup-invite-card-title">Get fixes for {moduleList(modules)}</h3>
      <p>A free account emails you when they update, and lets you report bugs and join the forum.</p>
      <SignupActions onChoose={() => {}}/>
    </div>
    <button type="button" className="icon-button signup-invite-card-close" aria-label="Close" onClick={onClose}><Icon name="close" size={16}/></button>
  </section>
}

/** Development only: `?preview=download-invite` shows the invitation and the install-guide card with sample modules, without a build. */
export function DownloadSignupPreview() {
  const [stage, setStage] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'download-invite' ? 'dialog' : 'closed')
  const modules = [{ id: 'miniverb', name: 'Mini Verb', version: '0.2.3' }, { id: 'tapeecho', name: 'Tape Echo', version: '0.1.5' }, { id: 'analog-bassdrum', name: 'Analog BD', version: '0.1.0' }]
  return stage === 'dialog' ? <DownloadSignupInvite modules={modules} onClose={() => setStage('card')}/> : stage === 'card' ? <DownloadSignupCard modules={modules} onClose={() => setStage('closed')}/> : null
}

let claiming = false
/** Once a guest who downloaded has a verified account, follow what they downloaded on this device and say so. */
export function PendingFollowsClaim() {
  const { session } = useCommunity(), [followed, setFollowed] = useState(0), memberId = session.user?.verified ? session.user.id : null
  useEffect(() => {
    if (!memberId || claiming) return
    const pending = takePendingFollows()
    if (!pending?.ids.length) return
    claiming = true
    if (pending.build) rememberHardwareFeedback(memberId, pending.build)
    void followDownloadedModules(pending.ids, hasBetaAccess(session)).then(result => {
      if (!result.followed) return
      window.dispatchEvent(new Event('modwerk-module-updates'))
      trackUsage('download_follows_claimed')
      setFollowed(result.followed)
    }).finally(() => { claiming = false })
  }, [memberId, session])
  if (!followed) return null
  return <p className="success-note pending-follows-note" role="status">
    <span>You’re following updates for the {followed === 1 ? 'module' : followed + ' modules'} you downloaded. Unfollow on a module page any time.</span>
    <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setFollowed(0)}><Icon name="close" size={16}/></button>
  </p>
}

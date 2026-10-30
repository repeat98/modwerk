import { useState } from 'react'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { Icon } from './Icon'
import './octatrack-link.css'

const ACTIVE: LinkState['status'][] = ['sending', 'testing', 'trial', 'finishing']
const activity = ({ status, progress = 0 }: LinkState) => status === 'sending' ? `Syncing ${Math.round(progress * 100)}%`
  : status === 'testing' ? 'Self-test' : 'Saving'

/** The beta Octatrack card's next step (connect, install, retry); nothing once connected or syncing, which the card shows. */
export function OctatrackSidebarStatus({ link, onInstall }: { link: OctatrackLink; onInstall: () => void }) {
  const { status, identity, baseUpdate } = useOctatrackLink(link)
  if (baseUpdate || ACTIVE.includes(status) || status === 'ready' && identity?.canSubmit) return null
  const install = status === 'stock' || status === 'ready' || status === 'unsupported'
  const title = install ? 'Install the base' : status === 'connecting' ? 'Connecting…' : status === 'busy' ? 'Try connecting again' : 'Connect Octatrack'
  const hint = status === 'stock' ? 'Original OS detected. Install once from the card.' : install ? 'Install from the card to get started.' : status === 'busy' ? 'Close the other browser window or app using it. This page connects by itself once it’s free.' : 'Plug in USB, then choose your Octatrack.'
  return <button type="button" className="instrument-action" title={hint} disabled={status === 'connecting'} onClick={() => { if (install) onInstall(); else void (status === 'busy' ? link.retry() : link.connect()) }}><span>{title}</span><Icon name="arrow" size={14} /></button>
}

/** The Octatrack's connection in the status bar; nothing while idle or without WebUSB. */
export function OctatrackStatus({ link }: { link: OctatrackLink }) {
  const state = useOctatrackLink(link), { status, identity } = state
  if (state.baseUpdate) return <span className="octatrack-status-bar"><span className="status-dot is-updating" />Updating the base · don’t unplug the Octatrack</span>
  if (status === 'unsupported' || status === 'idle' || status === 'connecting') return null
  const busy = ACTIVE.includes(status)
  return <span className="octatrack-status-bar"><span className={'status-dot' + (busy ? ' is-live' : identity?.canSubmit ? ' verified' : '')} />{busy ? (state.module ? 'Syncing to Octatrack · ' : 'Octatrack · ') + activity(state) : status === 'busy' ? 'Octatrack in use' : 'Octatrack connected'}</span>
}

/** A pill while an update runs, and for its result, on every page but the configuration page. */
export function OctatrackActivity({ link }: { link: OctatrackLink }) {
  const state = useOctatrackLink(link), { status, module, notice } = state
  // A result already there when the pill appears was shown where it happened (the sync dialog, the Octatrack page).
  const [dismissed, setDismissed] = useState<LinkState['notice']>(() => ACTIVE.includes(link.getState().status) ? undefined : link.getState().notice)
  const result = notice && notice !== dismissed && !ACTIVE.includes(status) ? notice : undefined
  if (!ACTIVE.includes(status) && !result) return null
  return <aside className={'octatrack-activity' + (result?.tone === 'error' ? ' is-error' : '')} aria-label="Octatrack update" role="status">
    {result ? <><span>{result.text}</span><button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setDismissed(notice)}><Icon name="close" size={15} /></button></>
      : <><span className="status-dot is-live" /><span><strong>{module}</strong> · {activity(state)}</span>
        <a className="text-button" href="#configuration">Open</a></>}
  </aside>
}

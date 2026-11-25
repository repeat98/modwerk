import { useState } from 'react'
import { LINK_BUSY, type LinkState, type OctatrackLink } from '../engine/elekloader/octatrack-link'
import { baseOutdated } from '../engine/elekloader/module-set'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { DSP_STOPPED, useOctatrackLoad } from '../hooks/useOctatrackLoad'
import { percent } from '../config/octatrack-load'
import { Icon } from './Icon'
import './octatrack-link.css'

const ACTIVE: LinkState['status'][] = ['sending', 'testing', 'trial', 'finishing']
const activity = ({ status, progress = 0 }: LinkState) => status === 'sending' ? `Syncing ${Math.round(progress * 100)}%`
  : status === 'testing' ? 'Self-test' : 'Saving'

/** The sidebar Octatrack card's next step (connect, install, retry, or update a base the site no longer syncs to); nothing
 * once connected on the current base or syncing, which the card shows. */
export function OctatrackSidebarStatus({ link, onInstall }: { link: OctatrackLink; onInstall: () => void }) {
  const { status, identity, baseUpdate } = useOctatrackLink(link)
  if (baseUpdate || ACTIVE.includes(status)) return null
  if (status === 'ready' && identity?.canSubmit) return baseOutdated(identity.base)
    ? <button type="button" className="instrument-action is-update" title="A new Modwerk base is out. Update it over USB to keep syncing module sets." onClick={onInstall}><span>Update the base</span><Icon name="arrow" size={14} /></button>
    : null
  const install = status === 'stock' || status === 'ready' || status === 'unsupported'
  const title = install ? 'Install the base' : status === 'connecting' ? 'Connecting…' : status === 'busy' ? 'Try connecting again' : 'Connect Octatrack'
  const hint = status === 'stock' ? 'Original OS detected. Install once from the card.' : install ? 'Install from the card to get started.' : status === 'busy' ? LINK_BUSY : 'Plug in USB, then choose your Octatrack.'
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

/** From this CPU load (tenths of a percent) the unit takes no further module machine or effect (the Status panel's note). */
export const CPU_NEAR_LIMIT = 850
const LOAD_ITEMS = [{ key: 'cpu', title: 'CPU', label: 'CPU' }, { key: 'tracks1to4', title: 'DSP 1–4', label: 'DSP tracks 1–4' },
  { key: 'tracks5to8', title: '5–8', label: 'DSP tracks 5–8' }] as const

/** The unit's live load as a small card in the corner of every page but Status, while it is connected on a base that
 * reports it; a click opens Status. It shows what recordLoad already reads every two seconds, so it adds no USB transfer,
 * and it steps aside while a sync or base update has the unit. */
export function OctatrackLoadWidget({ link }: { link: OctatrackLink }) {
  const { baseUpdate } = useOctatrackLink(link)
  const { points, now, ready, unsupported, stopped } = useOctatrackLoad(link)
  if (!ready || unsupported || baseUpdate) return null
  if (stopped) return <a className="load-widget is-stopped" href="#octatrack" title={DSP_STOPPED}><Icon name="warn" size={14} /><span>DSP stopped · open Status</span><Icon name="arrow" size={12} /></a>
  const last = points.at(-1), latest = last && now - last.at <= 6000 ? last.reading : null
  const near = (latest?.cpu ?? 0) >= CPU_NEAR_LIMIT
  const summary = LOAD_ITEMS.map(item => `${item.label} ${percent(latest?.[item.key])}`).join(', ')
  return <a className={'load-widget' + (near ? ' is-near' : '')} href="#octatrack" aria-label={`Octatrack load: ${summary}. Open Status.`}
    title={near ? 'From 85 % CPU your Octatrack takes no further module machine or effect. Open Status for the last five minutes.' : 'Live load, read every two seconds. Open Status for the last five minutes.'}>
    {LOAD_ITEMS.map(item => {
      const value = latest?.[item.key]
      return <span key={item.key} className={'load-widget-item' + (item.key === 'cpu' && near ? ' is-near' : '')} aria-hidden="true">
        <span className="load-widget-label">{item.title}</span>
        <span className="load-widget-bar"><span style={{ width: value == null ? 0 : `${value / 10}%` }} /></span>
        <strong>{value == null ? '—' : `${Math.round(value / 10)}%`}</strong>
      </span>
    })}
    <Icon name="arrow" size={12} />
  </a>
}

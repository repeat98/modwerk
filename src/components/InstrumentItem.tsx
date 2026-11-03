import { useSyncExternalStore } from 'react'
import { lastInventory, sameModules, type Inventory } from '../config/inventory'
import type { Configuration } from '../config/workspace'
import { DeviceImage } from '../devices/DeviceImage'
import type { DeviceProfile } from '../devices/registry'
import type { LinkState, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { Icon } from './Icon'

const noSubscription = () => () => {}
const LIVE: LinkState['status'][] = ['connecting', 'sending', 'testing', 'trial', 'finishing']
const modules = (n: number) => n + (n === 1 ? ' module' : ' modules')

/**
 * The machine you work on, in the sidebar. With a USB link (the Octatrack, beta) it is one card leading to the hub:
 * the unit (what is on it, or what this browser read when it was last connected) and the set you are editing, with
 * the Octatrack's own LED language: lit green is on the unit, outlined is waiting to load.
 * Without one (other machines, phones) it shows the module set you are editing and leads to its page.
 */
export function InstrumentItem({ device, set, href, link, current, inventory }: { device: DeviceProfile; set?: Configuration; href: string; link?: OctatrackLink | null; current: boolean; inventory?: Inventory }) {
  const status = useSyncExternalStore(link?.subscribe ?? noSubscription, () => {
    const state = link?.getState()
    return !state ? '' : state.baseUpdate ? 'updating' : state.identity?.canSubmit && state.status === 'ready' ? 'connected' : state.status
  }, () => '')
  const connection = !status || status === 'unsupported' ? '' : LIVE.includes(status as LinkState['status']) ? 'busy' : status === 'connected' || status === 'stock' || status === 'updating' ? status : 'off'
  const last = connection === 'off' || status === 'unsupported' ? lastInventory() : undefined
  const unit = status === 'updating' ? 'Updating the base · don’t unplug' : status === 'connecting' ? 'Connecting…' : connection === 'busy' ? 'Syncing…'
    : status === 'connected' ? inventory ? inventory.moduleIds.length ? modules(inventory.moduleIds.length) + ' on it' : 'No modules on it' : 'Connected'
    : status === 'stock' ? 'Original OS: install the base' : status === 'busy' ? 'In use by another window or app' : 'Not connected'
  if (!link) return <a className="sidebar-device instrument-item" href={href} aria-current={current ? 'page' : undefined} aria-label={device.name + ', ' + (set ? set.name : 'No module set yet')}>
    <span className="instrument-picture"><DeviceImage device={device} eager /></span>
    <span><strong>{device.name}</strong><small>{set ? set.name : 'No module set yet'}</small></span>
    <Icon name="arrow" size={14} />
  </a>
  const known = status === 'connected' ? inventory?.moduleIds : last?.moduleIds
  const on = status === 'connected' && !!set?.moduleIds.length && !!known && sameModules(set.moduleIds, known)
  const editing = !set?.moduleIds.length ? '' : on ? 'On your Octatrack' : status === 'connected' && known ? 'Not on your Octatrack yet' : last ? 'Last seen with ' + modules(last.moduleIds.length) : ''
  return <a className="sidebar-device instrument-item is-unit" href={href} aria-current={current ? 'page' : undefined}
    aria-label={device.name + ', ' + unit + (set ? '. Editing ' + set.name + ', ' + modules(set.moduleIds.length) + (editing ? ', ' + editing.toLowerCase() : '') : '')}>
    <span className="instrument-head">
      <span className="instrument-picture"><DeviceImage device={device} eager />{connection && <span className={'instrument-dot is-' + connection} />}</span>
      <span><strong>{device.name}</strong><small>{unit}</small></span>
      <Icon name="arrow" size={14} />
    </span>
    {set && <span className="instrument-editing">
      <em>Editing</em>
      <strong>{set.name}</strong><b>{modules(set.moduleIds.length)}</b>
      {editing && <small className={on ? 'is-on' : status === 'connected' ? 'is-load' : ''}><span className={'unit-led is-' + (on ? 'on' : status === 'connected' ? 'load' : 'off')} />{editing}</small>}
    </span>}
  </a>
}

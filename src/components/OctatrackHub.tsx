import { useMobileWorkspace } from '../hooks/useMobileWorkspace'
import { ConfigurationHandoff } from './ConfigurationHandoff'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { MODULES } from '../catalog/modules'
import { moduleUsbOnly } from '../catalog/usb-only'
import { lastInventory, sameModules, type Inventory } from '../config/inventory'
import { lastSuccessfulSync } from '../config/octatrack-progress'
import { BaseLayoutRequired, BaseUpdateRequired, baseOutdated, moduleSetReview, setLayout } from '../engine/elekloader/module-set'
import { baseLayout, type BaseLayout } from '../engine/elekloader/base-variants'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import type { Configuration } from '../config/workspace'
import { DeviceImage } from '../devices/DeviceImage'
import { DEVICES_BY_ID } from '../devices/registry'
import type { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { useOctatrackHealth } from '../hooks/useOctatrackHealth'
import { useOctatrackLink } from '../hooks/useOctatrackLink'
import { useActionsMenu } from '../hooks/useActionsMenu'
import { Icon, type IconName } from './Icon'
import { OctatrackBackups } from './OctatrackBackups'
import { OctatrackDiagnosticsSettings } from './OctatrackDiagnostics'
import { OctatrackOverview } from './OctatrackOverview'
import { OctatrackSamples } from './OctatrackSamples'
import { MissingNote, type ProjectNeeds } from './OctatrackUpdate'
import './octatrack-link.css'

const moduleName = (id: string) => MODULES.find(module => module.id === id)?.name ?? id
const modules = (n: number) => n + (n === 1 ? ' module' : ' modules')
const BUSY = ['sending', 'testing', 'trial', 'finishing']
const when = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export type HubView = 'status' | 'backups' | 'samples' | 'setup' | 'set'
export type SetAction = 'rename' | 'duplicate' | 'export' | 'share' | 'delete'
/** The Octatrack's own pages, in the list above the module sets; `#configuration` is the set you edit. */
const UNIT_VIEWS: { view: Exclude<HubView, 'set'>; title: string; href: string; icon: IconName }[] = [
  { view: 'status', title: 'Status', href: '#octatrack', icon: 'grid' },
  { view: 'backups', title: 'Backups', href: '#octatrack/backups', icon: 'download' },
  { view: 'samples', title: 'Samples', href: '#octatrack/samples', icon: 'wave' },
  { view: 'setup', title: 'Setup', href: '#octatrack/setup', icon: 'sliders' },
]

/** One set's actions, in its row and above its modules. */
function SetMenu({ set, onAction }: { set: Configuration; onAction: (id: string, action: SetAction) => void }) {
  const { open, setOpen, buttonRef, panelRef, panelId, moveFocus, choose } = useActionsMenu()
  const item = (action: SetAction, label: string) => <button type="button" className={action === 'delete' ? 'is-danger' : undefined} onClick={() => choose(() => onAction(set.id, action))}>{label}</button>
  return <div className="configuration-menu hub-set-menu">
    <button ref={buttonRef} type="button" className="icon-button" aria-label={set.name + ' actions'} title="Module set actions" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}><Icon name="more" size={17} /></button>
    {open && <div ref={panelRef} id={panelId} className="configuration-menu-panel" role="group" aria-label={set.name + ' actions'} onKeyDown={moveFocus}>
      {item('rename', 'Rename')}{item('duplicate', 'Duplicate')}{item('export', 'Export JSON')}{item('share', 'Share in forum')}<hr />{item('delete', 'Delete')}
    </div>}
  </div>
}

/**
 * Your Octatrack: the configuration page of the beta. A list on the leading side holds the Octatrack's own pages
 * (Status, Backups, Samples, Setup) and your module sets; the selected item fills the trailing side. Opening a set
 * makes it the set you edit (the library adds to it, Sync sends it). The page's header (`header`), the set's modules
 * (`grid`) and the card route (`card`: base OS file, checks, build) are App's own parts. Every page stays mounted, so
 * local samples and the load history survive moving around. Nothing goes onto the unit without the guided sync.
 */
type OctatrackHubProps = {
  view: HubView; link: OctatrackLink | null; inventory?: Inventory; sets: Configuration[]; selectedId?: string; needs?: ProjectNeeds; username?: string | null
  onSelect: (id: string) => void; onSync: (id: string) => void
  /** Opens the base installer: with a layout when the set needs the base in another USB Audio layout. */
  onInstall: (layout?: BaseLayout) => void
  onNew: () => void; onImport: () => void; onSetAction: (id: string, action: SetAction) => void
  onFill: (ids: string[]) => void; onSaveUnit: () => void; onReport: (id?: string) => void
  header: ReactNode; grid: ReactNode; card: ReactNode
}

export function OctatrackHub(props: OctatrackHubProps) {
  const mobile = useMobileWorkspace()
  return mobile ? <MobileModuleSets {...props} /> : <DesktopOctatrackHub {...props} />
}

function MobileModuleSets({ sets, selectedId, onSelect, onNew, onImport, onSetAction, header, grid }: OctatrackHubProps) {
  const selected = sets.find(set => set.id === selectedId) ?? sets[0]
  return <div className="configuration-page">
    {header}
    <section className="configuration-section" aria-label="Module sets">
      {!!sets.length && <label>Module set<select value={selected?.id} onChange={event => onSelect(event.target.value)}>{sets.map(set => <option key={set.id} value={set.id}>{set.name} · {modules(set.moduleIds.length)}</option>)}</select></label>}
      <div className="configuration-heading-actions"><button type="button" className="button button-quiet" onClick={onNew}>New module set</button><button type="button" className="button button-quiet" onClick={onImport}>Import JSON</button><a className="text-button" href="#module-sets">Starting points</a></div>
    </section>
    {selected ? <><header className="hub-editor-head"><h2>{selected.name}</h2><SetMenu set={selected} onAction={onSetAction} /></header>{grid}<ConfigurationHandoff onExport={() => onSetAction(selected.id, 'export')} exported={false} /></>
      : <p>Start a module set, then add modules from the library.</p>}
  </div>
}

function DesktopOctatrackHub({ view, link, inventory, sets, selectedId, needs, username, onSelect, onSync, onInstall, onNew, onImport, onSetAction, onFill, onSaveUnit, onReport, header, grid, card }: OctatrackHubProps) {
  const state = useOctatrackLink(link), { status, identity } = state
  // The page fits the window, so it never scrolls as a whole: the split gets the height left in the app's main area.
  // shortcut: measured when the window or main area resizes and when the page changes, not when a banner above appears.
  const split = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = split.current, main = element?.closest('main')
    if (!element || !main || typeof ResizeObserver === 'undefined') return
    const fit = () => {
      // Box positions come in zoomed pixels (the desktop app shell has zoom: .9); heights are set in CSS pixels.
      const box = main.getBoundingClientRect(), scale = box.height / main.offsetHeight || 1
      const top = (element.getBoundingClientRect().top - box.top) / scale + main.scrollTop
      element.style.setProperty('--hub-height', Math.max(560, main.clientHeight - top - (parseFloat(getComputedStyle(main).paddingBottom) || 0)) + 'px')
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(main)
    return () => observer.disconnect()
  }, [view])
  const connected = !!identity?.canSubmit && status === 'ready', busy = BUSY.includes(status), usb = !!link && status !== 'unsupported'
  const last = connected || busy ? undefined : lastInventory()
  const unitIds = connected ? inventory?.moduleIds : last?.moduleIds
  const selected = sets.find(set => set.id === selectedId) ?? sets[0]
  // USB Audio is on the unit when its base runs the set's layout (base-variants.ts); the inventory lists packages only.
  const same = (set: Configuration) => set.moduleIds.length > 0 && !!unitIds && sameModules(set.moduleIds.filter(id => id !== USB_AUDIO_MODULE), unitIds) &&
    (setLayout(set) === undefined || connected && baseLayout(identity?.base) === setLayout(set))
  const review = connected && inventory && selected ? moduleSetReview(selected, inventory, identity?.capabilities, identity?.base) : undefined
  const changes = review?.changes, updates = review?.updates ?? []
  const needsBase = review?.problem instanceof BaseUpdateRequired || connected && baseOutdated(identity?.base)
  const wantedLayout = review?.problem instanceof BaseLayoutRequired ? review.problem.layout : undefined
  const model = identity?.model ? identity.model.replace('OCTATRACK', 'Octatrack') : 'Octatrack'
  const led = connected ? 'on' : busy ? 'load' : 'off'
  const health = useOctatrackHealth(link)
  const onUnit = sets.find(same), lastSync = lastSuccessfulSync(identity?.base ?? last?.base)
  const lastName = onUnit?.name ?? (last && lastSync && sameModules(last.moduleIds, lastSync.moduleIds) ? lastSync.name : undefined)
  // The hero: the unit's state in one line and the one action it needs, on every page.
  const [line, action]: [ReactNode, ReactNode] = !usb ? ['This browser can’t use USB. Open this page in Chrome or Edge on a computer, or install from the card in Setup.', null]
    : busy ? [state.module || status !== 'testing' ? 'Syncing…' : 'Self-test running…', null]
    : connected ? [<>Connected · {inventory ? modules(inventory.moduleIds.length) + ' on it' : 'reading what’s on it…'}{onUnit && <> · same as <b>{onUnit.name}</b></>}</>, null]
    : status === 'connecting' ? ['Looking for your Octatrack…', null]
    : status === 'busy' ? ['Another browser window or app is using your Octatrack. This page connects by itself once it’s free.', <button key="retry" className="button button-quiet" onClick={() => void link?.retry()}>Try again</button>]
    : status === 'stock' || status === 'ready' ? [status === 'stock' ? 'Connected · original OS' : 'Connected · a Modwerk base this site can’t talk to', <button key="install" className="button button-primary" onClick={() => onInstall()}>Install the base</button>]
    : state.notice?.tone === 'error' ? [state.notice.text, <button key="connect" className="button button-quiet" onClick={() => void link?.connect()}>Connect</button>]
    : [<>Not connected{last ? <> · Last seen: {lastName ? <b>{lastName}</b> : modules(last.moduleIds.length)} · {when(last.at)}</> : null}</>, <button key="connect" className="button button-quiet" onClick={() => void link?.connect()}>Connect</button>]
  const panel = (name: HubView, content: ReactNode) => <section key={name} className={'hub-view hub-view-' + name} hidden={view !== name} aria-label={name === 'set' ? selected?.name ?? 'Module set' : UNIT_VIEWS.find(item => item.view === name)!.title}>{content}</section>
  // A set with a module card firmware cannot carry (usb-only.ts) is never pointed at the card.
  const cardable = !selected?.moduleIds.some(id => moduleUsbOnly(id))
  const syncLine: ReactNode = !usb ? cardable ? <>This browser can’t use USB. <a href="#octatrack/setup">Install it from the card</a> instead.</> : 'This browser can’t use USB, and this set needs it. Open this page in Chrome or Edge on a computer.'
    : needsBase ? <span role="alert">{(review?.problem ?? new BaseUpdateRequired()).message}</span>
    : review?.problem ? <span role="alert">{review.problem.message}</span>
    : changes ? review?.needsSync ? <>Adds {changes.add.length} · Removes {changes.remove.length}{updates.length > 0 && <> · Updates {updates.length}</>}{!!(changes.stockOff.length + changes.stockOn.length) && <> · Stock effects change</>}</>
      : selected?.moduleIds.length ? <span className="hub-insync"><span className="unit-led is-on" aria-hidden="true" />Already on your Octatrack</span> : 'No modules in this set.'
    : busy ? 'A sync is running.' : status === 'stock' ? 'Install the base to sync this set.' : connected ? 'Reading what’s on your Octatrack…'
    : cardable ? <>Connect your Octatrack to sync this set, or <a href="#octatrack/setup">install it from the card</a>.</> : 'Connect your Octatrack to sync this set.'
  return <div className="configuration-page octatrack-hub">
    {header}
    <div className="hub-split" ref={split}>
      <header className="hub-hero">
        <DeviceImage device={DEVICES_BY_ID.octatrack} eager />
        <div><h2 className="hub-view-title">{model}</h2>
          <p role="status"><span className={'unit-led is-' + led} aria-hidden="true" />{line}</p>
          {(connected || lastSync) && <dl className="hub-facts">
            {connected && <div><dt>Base</dt><dd><code>{identity!.base.slice(0, 8)}</code></dd></div>}
            {lastSync && <div><dt>Last sync from this browser</dt><dd><b>{lastSync.name}</b> · <time dateTime={lastSync.at}>{when(lastSync.at)}</time></dd></div>}
          </dl>}
        </div>
        {action}
      </header>
      <nav className="hub-nav" aria-label="Your Octatrack">
        <select className="hub-set-picker" aria-label="Show" value={view === 'set' && selected ? 'set:' + selected.id : view} onChange={event => { const value = event.target.value; if (value.startsWith('set:')) onSelect(value.slice(4)); else window.location.hash = UNIT_VIEWS.find(item => item.view === value)!.href }}>
          <optgroup label={model}>{UNIT_VIEWS.map(item => <option key={item.view} value={item.view}>{item.title}</option>)}</optgroup>
          {sets.length > 0 && <optgroup label="Module sets">{sets.map(set => <option key={set.id} value={'set:' + set.id}>{set.name} · {modules(set.moduleIds.length)}</option>)}</optgroup>}
        </select>
        <div className="hub-nav-group">
          <h2 className="hub-nav-label">Octatrack</h2>
          <ul className="hub-nav-list">{UNIT_VIEWS.map(item => <li key={item.view}><a className="hub-nav-item" href={item.href} aria-current={view === item.view ? 'page' : undefined}><Icon name={item.icon} size={16} /><span>{item.title}</span>{item.view === 'samples' && <span className="samples-wip">WIP</span>}</a></li>)}</ul>
        </div>
        <div className="hub-nav-group">
          <div className="hub-nav-label"><h2 id="hub-sets-title">Module sets</h2><span className="subtle">{sets.length}</span><button type="button" className="icon-button" aria-label="New module set" title="New module set" onClick={onNew}><Icon name="plus" size={16} /></button></div>
          <ul className="hub-set-list" aria-labelledby="hub-sets-title">
            {sets.map(set => { const isSelected = set.id === selected?.id, on = same(set)
              return <li key={set.id} className={'hub-set' + (isSelected ? ' is-selected' : '')}>
                <button type="button" className="hub-set-open" aria-current={view === 'set' && isSelected ? 'page' : undefined} onClick={() => onSelect(set.id)}>
                  <span className={'unit-led is-' + (on && connected ? 'on' : 'off')} aria-hidden="true" />
                  <strong>{set.name}</strong><b>{set.moduleIds.length}</b>
                  <small>{set.moduleIds.map(moduleName).join(' · ') || 'No modules yet'}</small>
                  {(on || isSelected) && <em>{[isSelected && 'Editing', on && (connected ? 'On your Octatrack' : 'Last seen on your Octatrack')].filter(Boolean).join(' · ')}</em>}
                </button>
                <SetMenu set={set} onAction={onSetAction} />
              </li> })}
          </ul>
        </div>
        <p className="hub-nav-foot"><button type="button" className="text-button" onClick={onNew}><Icon name="plus" size={14} />New module set</button><button type="button" className="text-button" onClick={onImport}>Import JSON</button><a className="text-button" href="#module-sets">Starting points</a></p>
      </nav>
      <div className="hub-pane">
        {panel('status', <OctatrackOverview link={link} inventory={inventory} sets={sets} needs={needs} health={health} active={view === 'status'} selected={selected} onOpen={onSelect} onSync={onSync} onSaveUnit={onSaveUnit} onReport={onReport} />)}
        {panel('backups', <OctatrackBackups link={link} />)}
        {panel('samples', <OctatrackSamples active={view === 'samples'} />)}
        {panel('setup', <>
          <h2 className="hub-view-title">Setup</h2>
          <section className="hub-section" aria-labelledby="setup-base-title">
            <h3 id="setup-base-title">Modwerk base</h3>
            <p>{!usb ? 'This browser can’t use USB. Install the base from the card below, or open this page in Chrome or Edge on a computer.'
              : connected ? <>Your {model} runs the Modwerk base <code>{identity!.base.slice(0, 8)}</code>.{needsBase && (wantedLayout ? ' Your set needs it in another USB Audio layout.' : ' This site needs a newer one to sync your set.')}</>
              : status === 'stock' ? <>Your {model} runs the original OS. Install the base once to sync module sets over USB.</>
              : status === 'ready' ? 'Your Octatrack runs a Modwerk base this site can’t talk to. Install the current one.'
              : 'Connect your Octatrack to see which base it runs.'}</p>
            {usb && <button type="button" className={'button ' + (status === 'stock' || needsBase || status === 'ready' && !connected ? 'button-primary' : 'button-quiet')} onClick={() => onInstall(wantedLayout)}><Icon name="download" size={16} />{wantedLayout ? 'Install base with this layout' : needsBase ? 'Install latest base' : status === 'stock' ? 'Install the base' : 'Install the base again'}</button>}
            <p className="link-hint">Going back to the original OS works from the card: <a className="text-button" href="#faq">FAQ & flashing guide</a></p>
          </section>
          {usb && <section className="hub-section" aria-labelledby="setup-connect-title">
            <h3 id="setup-connect-title">Can’t connect?</h3>
            <p><strong>Linux:</strong> Chrome needs permission to use the Octatrack. Add this rule, then unplug the Octatrack and plug it back in:</p>
            <pre className="hub-code">{'echo \'SUBSYSTEM=="usb", ATTR{idVendor}=="1935", TAG+="uaccess"\' | sudo tee /etc/udev/rules.d/70-octatrack.rules\nsudo udevadm control --reload-rules'}</pre>
            <p>Chromium from the Snap Store also needs <code>sudo snap connect chromium:raw-usb</code>.</p>
            <p><strong>Windows:</strong> Chrome can open the Octatrack only once it runs the Modwerk base. With the original OS, install the base from the card first.</p>
            <p><strong>In use by another window or app:</strong> Modwerk open in another browser, another Chrome profile or a private window holds the Octatrack, and so can another app that talks to it. Close it, and this page connects by itself. If it stays in use, quit the browser completely and open it again, or unplug the Octatrack and plug it back in.</p>
          </section>}
          {card}
          <OctatrackDiagnosticsSettings username={username} />
        </>)}
        {panel('set', selected ? <>
          <header className="hub-editor-head">
            <div><span className="guide-eyebrow">Module set · {modules(selected.moduleIds.length)}</span><h2 className="hub-view-title">{selected.name}</h2></div>
            <SetMenu set={selected} onAction={onSetAction} />
          </header>
          <div className="hub-sync" role="group" aria-label="Module set sync">
            <p>{syncLine}</p>
            {usb && <button type="button" className="button button-primary" disabled={!review || !needsBase && (!review.needsSync || !!review.problem)} onClick={() => { onSync(selected.id); if (needsBase) onInstall(wantedLayout) }}><Icon name="download" size={16} />{wantedLayout ? 'Install base with this layout' : needsBase ? 'Install latest base' : 'Sync to Octatrack'}</button>}
          </div>
          {connected && <MissingNote needs={needs} onSync={() => onSync(selected.id)} />}
          {connected && !selected.moduleIds.length && !!inventory?.moduleIds.length && <div className="hub-fill" role="note">
            <p>This set is empty, so syncing it would remove the {modules(inventory.moduleIds.length)} on your Octatrack.</p>
            <button type="button" className="button button-quiet" onClick={() => onFill(inventory.moduleIds)}>Start from what’s on it</button>
          </div>}
          {grid}
        </> : <div className="hub-empty-set"><h2 className="hub-view-title">No module sets yet</h2><p>Start one, then add modules from the library.</p><button type="button" className="button button-primary" onClick={onNew}><Icon name="plus" size={16} />New module set</button></div>)}
      </div>
    </div>
  </div>
}

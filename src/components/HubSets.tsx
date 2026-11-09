// A device page's module sets (the beta's Octatrack page, and the Zoom pedal page): the list beside the device's own
// pages, each set's actions, and the open set's header. Each page supplies what a set holds and whether it is on the device.
import type { ReactNode } from 'react'
import type { Configuration } from '../config/workspace'
import { useActionsMenu } from '../hooks/useActionsMenu'
import { Icon } from './Icon'

export type SetAction = 'rename' | 'duplicate' | 'export' | 'share' | 'delete'
const LABELS: Record<SetAction, string> = { rename: 'Rename', duplicate: 'Duplicate', export: 'Export JSON', share: 'Share in forum', delete: 'Delete' }

/** One set's actions, in its row and above its modules; `actions` leaves out what the device's sets can't do yet. */
export function SetMenu({ set, onAction, actions = ['rename', 'duplicate', 'export', 'share', 'delete'] }: { set: Configuration; onAction: (id: string, action: SetAction) => void; actions?: readonly SetAction[] }) {
  const { open, setOpen, buttonRef, panelRef, panelId, moveFocus, choose } = useActionsMenu()
  const item = (action: SetAction) => actions.includes(action) && <button type="button" className={action === 'delete' ? 'is-danger' : undefined} onClick={() => choose(() => onAction(set.id, action))}>{LABELS[action]}</button>
  return <div className="configuration-menu hub-set-menu">
    <button ref={buttonRef} type="button" className="icon-button" aria-label={set.name + ' actions'} title="Module set actions" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}><Icon name="more" size={17} /></button>
    {open && <div ref={panelRef} id={panelId} className="configuration-menu-panel" role="group" aria-label={set.name + ' actions'} onKeyDown={moveFocus}>
      {item('rename')}{item('duplicate')}{item('export')}{item('share')}{(actions.includes('delete')) && <><hr />{item('delete')}</>}
    </div>}
  </div>
}

type ListProps = {
  sets: Configuration[]; selected?: Configuration; open: boolean
  /** What a set holds, for its row. */
  contents: (set: Configuration) => string
  /** Whether a set is what the device holds (its LED), and how to say it ("On your Octatrack"). */
  state: (set: Configuration) => { on: boolean; label?: string }
  onSelect: (id: string) => void; onNew: () => void; onImport?: () => void; onSetAction: (id: string, action: SetAction) => void
  actions?: readonly SetAction[]
}

/** The list's "Module sets" group: each set with its LED, contents and actions, then New, Import and Starting points. */
export function HubSetList({ sets, selected, open, contents, state, onSelect, onNew, onImport, onSetAction, actions }: ListProps) {
  return <>
    <div className="hub-nav-group">
      <div className="hub-nav-label"><h2 id="hub-sets-title">Module sets</h2><span className="subtle">{sets.length}</span><button type="button" className="icon-button" aria-label="New module set" title="New module set" onClick={onNew}><Icon name="plus" size={16} /></button></div>
      <ul className="hub-set-list" aria-labelledby="hub-sets-title">
        {sets.map(set => { const isSelected = set.id === selected?.id, { on, label } = state(set)
          return <li key={set.id} className={'hub-set' + (isSelected ? ' is-selected' : '')}>
            <button type="button" className="hub-set-open" aria-current={open && isSelected ? 'page' : undefined} onClick={() => onSelect(set.id)}>
              <span className={'unit-led is-' + (on ? 'on' : 'off')} aria-hidden="true" />
              <strong>{set.name}</strong><b>{set.moduleIds.length}</b>
              <small>{contents(set) || 'No modules yet'}</small>
              {(label || isSelected) && <em>{[isSelected && 'Editing', label].filter(Boolean).join(' · ')}</em>}
            </button>
            <SetMenu set={set} onAction={onSetAction} actions={actions} />
          </li> })}
      </ul>
    </div>
    <p className="hub-nav-foot"><button type="button" className="text-button" onClick={onNew}><Icon name="plus" size={14} />New module set</button>{onImport && <button type="button" className="text-button" onClick={onImport}>Import JSON</button>}<a className="text-button" href="#module-sets">Starting points</a></p>
  </>
}

/** The open set's header: what it is, its name and its actions. */
export function HubSetHead({ set, kicker, onSetAction, actions }: { set: Configuration; kicker: ReactNode; onSetAction: (id: string, action: SetAction) => void; actions?: readonly SetAction[] }) {
  return <header className="hub-editor-head">
    <div><span className="guide-eyebrow">{kicker}</span><h2 className="hub-view-title">{set.name}</h2></div>
    <SetMenu set={set} onAction={onSetAction} actions={actions} />
  </header>
}

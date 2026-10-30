import type { ReactNode } from 'react'
import { MODULES } from '../catalog/modules'
import { unitState, type Inventory, type UnitState } from '../config/inventory'
import { Icon } from './Icon'
import { ModulePreview } from './ModulePreview'


/** A lit LED means it is on the Octatrack right now; an outlined one means it is only in the module set. */
export const StateChip = ({ state, className = '', children }: { state: string; className?: string; children: ReactNode }) =>
  <span className={'module-tile-state is-' + state + (className && ' ' + className)}><i aria-hidden="true" />{children}</span>

/**
 * The selected module set as tiles, straight in the Octatrack page's pane: with the unit known, what stays on it, what
 * the next sync adds and what it removes (Keep adds it back); without, just the set. A tile opens the module dialog.
 */
export function ModuleGrid({ ids, inventory, describe, onOpen, onRemove, onKeep, onSaveUnit }: { ids: string[]; inventory?: Inventory; describe: (id: string) => string; onOpen: (id: string) => void; onRemove: (id: string) => void; onKeep: (id: string) => void; onSaveUnit: () => void }) {
  const leaving = inventory ? inventory.moduleIds.filter(id => !ids.includes(id)) : []
  const tiles = [...ids, ...leaving].map(id => ({ id, state: unitState(id, ids, inventory) }))
  // State and actions sit below the artwork, where they cannot cover its labels.
  const changing = tiles.some(tile => tile.state === 'load' || tile.state === 'leaving')
  const chip: Record<UnitState, string> = { on: changing ? 'Stays' : 'On it', load: 'Adds', leaving: 'Leaves' }
  return <>
    <ul className="module-tiles" aria-label="Modules">
      {tiles.map(({ id, state }) => { const module = MODULES.find(item => item.id === id), name = module?.name ?? id
        return <li key={id} className={'module-tile' + (state ? ' is-' + state : '')}>
          <button type="button" className="module-tile-open" aria-haspopup="dialog" disabled={!module} onClick={() => onOpen(id)}>{module ? <ModulePreview id={id} compact /> : <span className="compact-preview" />}<strong>{name}</strong><small>{module ? describe(id) : 'Not in the library'}</small></button>
          <div className="module-tile-controls">
            {state && <StateChip state={state}>{chip[state]}</StateChip>}
            {state === 'leaving' ? module && <button type="button" className="module-tile-action text-button" aria-label={'Keep ' + name} onClick={() => onKeep(id)}>Keep</button>
              : <button type="button" className="module-tile-action icon-button" aria-label={'Remove ' + name} onClick={() => onRemove(id)}><Icon name="close" size={15} /></button>}
          </div>
        </li> })}
      <li className="module-tile is-add"><a href="#library"><Icon name="plus" size={20} /><strong>Add modules</strong><small>From the library</small></a></li>
    </ul>
    {inventory && inventory.moduleIds.length > 0 && <button type="button" className="text-button module-grid-save" onClick={onSaveUnit}>Save what’s on your Octatrack as a module set <Icon name="plus" size={14} /></button>}
  </>
}

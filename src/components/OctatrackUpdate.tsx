import type { Inventory, InventoryTarget } from '../config/inventory'
import type { SetChange } from '../engine/elekloader/octatrack-link'
import './octatrack-link.css'

/** The builder: the target set as what the base loads, change by change. */
export type PrepareUpdate = (target: InventoryTarget) => Promise<{ name: string; changes: SetChange[] }>
/** The base: what is on the unit. */
export type ReadInventory = () => Promise<Inventory>
/** What the unit's project names that the unit lacks: library names, names the library does not know, and how to add
 * the ones this set does not have yet (absent when it has them all). */
export interface ProjectNeeds { names: string[]; unknown: string[]; add?: () => void }
const list = (items: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items)
export function MissingNote({ needs, onSync }: { needs?: ProjectNeeds; onSync?: () => void }) {
  if (!needs || !needs.names.length && !needs.unknown.length) return null
  const { names, unknown, add } = needs, count = names.length + unknown.length
  return <section className="usb-missing" aria-label="Missing modules">
    <div role="status">
      <h3>{count} {count === 1 ? 'module missing' : 'modules missing'} from your Octatrack</h3>
      <ul aria-label="Modules your project needs">{[...names, ...unknown].map(name => <li key={name}>{name}</li>)}</ul>
      {unknown.length > 0 && <p>{list(unknown)} {unknown.length === 1 ? 'isn’t' : 'aren’t'} in the library yet.</p>}
    </div>
    <div className="usb-missing-action"><p>Your project uses {count === 1 ? 'this module' : 'these modules'}.</p>
      {names.length > 0 && (add ? <button type="button" className="button button-quiet" onClick={add}>Add to set</button>
        : onSync && <button type="button" className="button button-quiet" onClick={onSync}>Sync to Octatrack</button>)}
    </div>
  </section>
}

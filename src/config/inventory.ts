import { sha } from '../../vendor/elekloader/kit/src/bytes.ts'
import { STOCK_EFFECTS } from '../catalog/stock-effects'
import type { UsbAudioLayout } from './usb-audio'

/** What an Octatrack running the Modwerk base has on it: its modules and the stock effects left out of the menus. */
export interface Inventory {
  moduleIds: string[]; removedStockFx: string[]
  /** Exact combined machine packages reported by the unit. Never inferred from the displayed member names. */
  runtimeGroups?: { id: string; layout: number }[]
}
/** What a load makes the unit match: a module set, or the device page's edits. `usbAudio` holds the set's USB Audio
 * layout, which the base itself provides (engine/elekloader/base-variants.ts). */
export interface InventoryTarget { name: string; moduleIds: string[]; removedStockFx?: string[]; usbAudio?: { layout: UsbAudioLayout } }
export interface InventoryChanges { add: string[]; remove: string[]; stockOff: string[]; stockOn: string[] }

/** The changes that make `current` match `target`: the unit matches the set exactly, stock effects included. */
export function inventoryChanges(current: Inventory, target: InventoryTarget): InventoryChanges {
  const off = new Set(target.removedStockFx ?? [])
  return {
    add: target.moduleIds.filter(id => !current.moduleIds.includes(id)),
    remove: current.moduleIds.filter(id => !target.moduleIds.includes(id)),
    stockOff: STOCK_EFFECTS.filter(key => off.has(key) && !current.removedStockFx.includes(key)),
    stockOn: STOCK_EFFECTS.filter(key => !off.has(key) && current.removedStockFx.includes(key)),
  }
}
export const changeCount = (changes: InventoryChanges) => changes.add.length + changes.remove.length + changes.stockOff.length + changes.stockOn.length

export type UnitState = 'on' | 'load' | 'leaving'
export const UNIT_STATE: Record<UnitState, string> = { on: 'On your Octatrack', load: 'Not on your Octatrack yet', leaving: 'Leaves next sync' }
/** Where a module stands against the unit: on it, only in the module set, or on it but leaving with the next load. */
export const unitState = (id: string, setIds: readonly string[], inventory?: Inventory): UnitState | undefined =>
  !inventory ? undefined : inventory.moduleIds.includes(id) ? setIds.includes(id) ? 'on' : 'leaving' : setIds.includes(id) ? 'load' : undefined

/** What the unit's project needs that the unit lacks (its MISSING list): the catalogue ids it names, and the names
 * of modules the catalogue does not know. A module's id is the first four bytes of the SHA-256 of its catalogue id. */
export function missingFromProject(missing: { module: string; name: string }[], catalogIds: string[]) {
  if (!missing.length) return { ids: [], unknown: [] }
  const byModule = new Map(catalogIds.map(id => [sha(new TextEncoder().encode(id)).slice(0, 8), id]))
  return { ids: missing.flatMap(item => byModule.get(item.module) ?? []), unknown: missing.filter(item => !byModule.has(item.module)).map(item => item.name) }
}

/** Whether a module set has exactly the unit's modules, in any order. */
export const sameModules = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id))

/** Where the guided load stands: the review, sending, the self-test, the trial (Keep or Undo), or its result. */
export type LoadStep = 'review' | 'loading' | 'testing' | 'trial' | 'done'
export function loadStep(status: string, started: boolean, preparing: boolean): LoadStep {
  if (preparing || status === 'sending') return 'loading'
  if (status === 'testing') return 'testing'
  if (status === 'trial' || status === 'finishing') return 'trial'
  return started ? 'done' : 'review'
}

/** What this browser last read from each unit, by its base, so the sidebar and the hub can show it while the unit is away. */
const LAST_SEEN = 'modwerk.octatrack.last-seen'
export interface LastSeen { base: string; moduleIds: string[]; at: string }
function allSeen(): Record<string, Omit<LastSeen, 'base'>> {
  try { const value = JSON.parse(localStorage.getItem(LAST_SEEN) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} }
}
export function rememberInventory(base: string, inventory: Inventory, at = new Date().toISOString()) {
  try { localStorage.setItem(LAST_SEEN, JSON.stringify({ ...allSeen(), [base]: { moduleIds: inventory.moduleIds, at } })) } catch { /* without storage it says Not connected */ }
}
/** The newest record (or one base's); undefined when this browser never read one or the record is damaged. */
export function lastInventory(base?: string): LastSeen | undefined {
  const [found] = Object.entries(allSeen())
    .filter(([key, seen]) => (!base || key === base) && Array.isArray(seen?.moduleIds) && seen.moduleIds.every(id => typeof id === 'string') && typeof seen.at === 'string')
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
  return found && { base: found[0], moduleIds: found[1].moduleIds, at: found[1].at }
}

/** A listbox's keys: the option an arrow, Home or End moves to; undefined for any other key. */
export function listboxMove(key: string, index: number, count: number): number | undefined {
  if (!count) return undefined
  return key === 'ArrowDown' ? Math.min(count - 1, index + 1) : key === 'ArrowUp' ? Math.max(0, index - 1) : key === 'Home' ? 0 : key === 'End' ? count - 1 : undefined
}

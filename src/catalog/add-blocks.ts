import { MODULES } from './modules.ts'

// A note on a module that is not in the set yet: why adding it asks first, or is unavailable.
export type AddBlock = {
  // 'conflict' names selected modules the candidate cannot run beside. 'stock-fx2' only needs the stock FX2 option off,
  // which is a setting rather than a module to remove, so it never blocks the add. 'usb-only' is a module only the
  // Modwerk base over USB can load (usb-only.ts) for a member who cannot sync over USB: the add is disabled. 'limit'
  // means the set already holds SET_MODULE_LIMIT modules (set-limit.ts): the add is disabled too.
  kind: 'conflict' | 'stock-fx2' | 'usb-only' | 'limit'
  // Selected modules the candidate conflicts with, in catalogue order. Empty for 'stock-fx2'.
  withIds: string[]
  // Short, for the chip beside the add button.
  reason: string
  // The full explanation, one sentence per conflict.
  detail: string
  // Removing these and adding the candidate leaves a selection with no conflict for the candidate. Absent when the rules
  // offer no removal that keeps the candidate, so the library cannot say what to swap.
  swapRemoveIds?: string[]
  // Changes whenever the selection it describes changes, so an open prompt does not outlive its facts.
  key: string
}

/** Whether the add button is unavailable for this note rather than asking first or only informing. */
export const refusesAdd = (block?: AddBlock): block is AddBlock => block?.kind === 'usb-only' || block?.kind === 'limit'

const NAMES = new Map(MODULES.map(module => [module.id, module.name]))
const nameOf = (id: string) => NAMES.get(id) ?? id

export function moduleNameList(ids: readonly string[], limit = 2) {
  const names = ids.map(nameOf)
  if (names.length <= limit) return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] ?? ''
  return names.slice(0, limit).join(', ') + ' and ' + (names.length - limit) + ' more'
}

import { MODULES } from './modules.ts'
import { selectionConflicts, type SelectionConflict } from './selection-conflicts.ts'

// What happens to the configuration if a module that is not in it yet gets added. It answers with the same rules the
// configuration panel shows, so the library can warn before the add instead of after it.
export type AddBlock = {
  // 'conflict' names selected modules the candidate cannot run beside. 'stock-fx2' only needs the stock FX2 option off,
  // which is a setting rather than a module to remove, so it never blocks the add.
  kind: 'conflict' | 'stock-fx2'
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

const STOCK_FX2 = 'stock-fx2-space'
const NAMES = new Map(MODULES.map(module => [module.id, module.name]))
const nameOf = (id: string) => NAMES.get(id) ?? id

export function moduleNameList(ids: readonly string[], limit = 2) {
  const names = ids.map(nameOf)
  if (names.length <= limit) return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0] ?? ''
  return names.slice(0, limit).join(', ') + ' and ' + (names.length - limit) + ' more'
}

export function addBlock(selectedIds: readonly string[], candidateId: string, keepStockFx2 = false): AddBlock | undefined {
  if (selectedIds.includes(candidateId)) return undefined
  const involved = (ids: readonly string[]) => selectionConflicts(ids, keepStockFx2).filter(conflict => conflict.moduleIds.includes(candidateId))
  const conflicts = involved([...selectedIds, candidateId])
  if (!conflicts.length) return undefined
  const hard = conflicts.filter(conflict => conflict.id !== STOCK_FX2)
  if (!hard.length) return { kind: 'stock-fx2', withIds: [], reason: 'Needs stock FX2 off', detail: conflicts.map(conflict => conflict.description).join(' '), key: STOCK_FX2 }
  const selected = new Set(selectedIds)
  const withIds = MODULES.map(module => module.id).filter(id => selected.has(id) && hard.some(conflict => conflict.moduleIds.includes(id)))
  return { kind: 'conflict', withIds, reason: 'Conflicts with ' + moduleNameList(withIds), detail: hard.map(conflict => conflict.description).join(' '),
    swapRemoveIds: swapRemoval(selectedIds, candidateId, hard, involved), key: candidateId + ':' + withIds.join('+') }
}

// The conflict's own fix that keeps the candidate. Each reviewed conflict lists one fix per module it could keep.
function swapRemoval(selectedIds: readonly string[], candidateId: string, conflicts: SelectionConflict[], involved: (ids: readonly string[]) => SelectionConflict[]) {
  const remove = new Set<string>()
  for (const conflict of conflicts) {
    const fix = conflict.fixes.find(item => item.removeIds?.length && !item.removeIds.includes(candidateId))
    if (!fix) return undefined
    for (const id of fix.removeIds ?? []) if (selectedIds.includes(id)) remove.add(id)
  }
  if (!remove.size) return undefined
  // A fix that clears one conflict can leave another standing, so prove the result is clean before offering it.
  const next = [...selectedIds.filter(id => !remove.has(id)), candidateId]
  if (involved(next).some(conflict => conflict.id !== STOCK_FX2)) return undefined
  return MODULES.map(module => module.id).filter(id => remove.has(id))
}

export function addBlocks(selectedIds: readonly string[], keepStockFx2: boolean, candidateIds: readonly string[] = MODULES.map(module => module.id)) {
  const blocks: Record<string, AddBlock> = {}
  for (const id of candidateIds) {
    const block = addBlock(selectedIds, id, keepStockFx2)
    if (block) blocks[id] = block
  }
  return blocks
}

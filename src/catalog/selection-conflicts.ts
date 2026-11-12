// What a library or configuration page shows when chosen modules cannot go together, and how to resolve it.
// The Octatrack's own rules lived here while its modules were built into card firmware; on the Modwerk base the unit
// admits each package itself when a set is synced (module-set.ts), so only the shapes remain, for the machines that
// still check a selection in the page (devices/MachinePages.tsx).
export type ConflictFix = { label: string; removeIds?: string[]; keepStockFx2?: boolean }
export type SelectionConflict = { id: string; title: string; description: string; moduleIds: string[]; fixes: ConflictFix[] }

/**
 * The native declaration checks in src/catalog/native-metadata.json record every module selection
 * the pinned octabam ledger has composed, keyed by the sorted module ids joined with '+'. Almost all
 * values are empty (no problem found), and the keys repeat the same ids thousands of times, so the
 * site ships a compact form instead: the sorted id universe, each checked selection as a bit mask
 * over it, and only the selections that recorded a problem by key.
 */
export type NativeChecks = { revision: string; checks: Record<string, string[]> }
export type CompactChecks = { schemaVersion: 1; revision: string; modules: string[]; checked: number[]; problems: Record<string, string[]> }
const MAX_MODULES = 30 // masks stay exact 31-bit integers

export function selectionKey(ids: readonly string[]) { return [...ids].sort().join('+') }

export function compactChecks(metadata: NativeChecks): CompactChecks {
  const modules = [...new Set(Object.keys(metadata.checks).flatMap(key => key.split('+')))].sort()
  if (modules.length > MAX_MODULES) throw new Error(`Compatibility checks cover ${modules.length} modules; the compact bit masks allow ${MAX_MODULES}`)
  const index = new Map(modules.map((id, position) => [id, position] as const))
  const checked: number[] = [], problems: Record<string, string[]> = {}
  for (const [key, notes] of Object.entries(metadata.checks)) {
    const ids = key.split('+')
    if (selectionKey(ids) !== key || new Set(ids).size !== ids.length) throw new Error('Compatibility check keys must be sorted, unique module ids: ' + key)
    checked.push(ids.reduce((mask, id) => mask | (1 << index.get(id)!), 0))
    if (notes.length) problems[key] = notes
  }
  checked.sort((a, b) => a - b)
  for (let position = 1; position < checked.length; position++) if (checked[position] === checked[position - 1]) throw new Error('Duplicate compatibility check: ' + checked[position])
  return { schemaVersion: 1, revision: metadata.revision, modules, checked, problems }
}

/** The recorded notes for a selection: an empty list when the check passed, undefined when never recorded. */
export function recordedCheck(compact: CompactChecks, ids: readonly string[], checkedSet = new Set(compact.checked)): string[] | undefined {
  let mask = 0
  for (const id of ids) {
    const position = compact.modules.indexOf(id)
    if (position < 0) return undefined
    mask |= 1 << position
  }
  if (!checkedSet.has(mask)) return undefined
  return compact.problems[selectionKey(ids)] ?? []
}

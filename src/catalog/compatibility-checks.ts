/**
 * The native declaration checks in src/catalog/native-metadata.json record every module selection
 * the pinned octabam ledger has composed, keyed by the sorted module ids joined with '+'. Almost all
 * values are empty (no problem found), and the keys repeat the same ids thousands of times, so the
 * site ships a compact form instead: the sorted id universe, each checked selection as a bit mask
 * over it, and only the selections that recorded a problem by key.
 *
 * The masks are the bulk of that. In the committed file they are one base64 string of ascending gaps
 * (each a variable-length integer), which is about 0.8 MB and gzips to under 10 KB. A plain number
 * list was 4.8 MB, and both the compatibility panel and the firmware worker bundle this file.
 */
export type NativeChecks = { revision: string; checks: Record<string, string[]> }
export type CompactChecks = { schemaVersion: 2; revision: string; modules: string[]; checked: number[]; problems: Record<string, string[]> }
/** The committed file: `checked` is the ascending masks as gaps, seven bits per byte with the high bit set to continue, in base64. */
export type StoredChecks = Omit<CompactChecks, 'checked'> & { count: number; checked: string }
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
  return { schemaVersion: 2, revision: metadata.revision, modules, checked, problems }
}

/** The committed form of the compact checks; `openChecks` reverses it exactly. */
export function storeChecks(compact: CompactChecks): StoredChecks {
  const bytes: number[] = []
  let previous = 0
  for (const mask of compact.checked) {
    let gap = mask - previous
    previous = mask
    while (gap >= 128) { bytes.push(gap % 128 + 128); gap = Math.floor(gap / 128) }
    bytes.push(gap)
  }
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.slice(start, start + 0x8000))
  return { schemaVersion: 2, revision: compact.revision, modules: compact.modules, count: compact.checked.length, checked: btoa(binary), problems: compact.problems }
}

export function openChecks(stored: StoredChecks): CompactChecks {
  if (stored.schemaVersion !== 2) throw new Error('Unsupported compatibility checks format.')
  const binary = atob(stored.checked), checked: number[] = []
  let value = 0, scale = 1, previous = 0
  for (let index = 0; index < binary.length; index++) {
    const byte = binary.charCodeAt(index)
    value += (byte & 127) * scale
    if (byte < 128) { previous += value; checked.push(previous); value = 0; scale = 1 } else scale *= 128
  }
  if (scale !== 1 || checked.length !== stored.count) throw new Error('The compatibility checks file is damaged.')
  return { schemaVersion: 2, revision: stored.revision, modules: stored.modules, checked, problems: stored.problems }
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

/** The two-module selections recorded as passing. Pair rules use this small list so the main bundle never loads every check. */
export function passingPairs(compact: CompactChecks): string[] {
  const pairs: string[] = []
  for (const mask of compact.checked) {
    const rest = mask & (mask - 1)
    if (!rest || rest & (rest - 1)) continue // exactly two modules
    const key = selectionKey(compact.modules.filter((_, position) => mask & (1 << position)))
    if (!compact.problems[key]) pairs.push(key)
  }
  return pairs.sort()
}

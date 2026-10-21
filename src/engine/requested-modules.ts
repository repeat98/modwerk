// Reviewed source packages only. Inherited bytes come from the verified local OS.
import facts from './assets/requested-packages.json' with { type: 'json' }
import { CATALOG_SOURCE, MODULES, resolveSelection } from '../catalog/modules.ts'
import { validateStockCopies } from './stock-copy.ts'
import { parseColdFireObject } from './coldfire-elf.ts'
import { linkRomText } from './rom-package.ts'
import { OS_LOAD_ADDRESS, type OsWrite } from './os-patches.ts'
import type { CfRuntimeLink } from './coldfire-link.ts'
export { facts as requestedFacts }
type Group = typeof facts.groups[number]
type Package = typeof facts.objects[number]
type Recipe = { schema: number; requires: string; machineIds: string[]; countSites: number[]; groups: { moduleId: string; replace: { detours: Record<string, unknown>[]; refs: Record<string, unknown>[]; pokes: Record<string, unknown>[] }; runtimeUnits: string[]; suppliedBy?: string; suppliedGroup?: Group }[] }
const composition = facts.composition as Recipe
function composedGroups(groups: Group[], selection: ReadonlySet<string>): Group[] {
  if (!selection.has(composition.requires)) return groups
  if (composition.schema !== 1 || composition.requires !== 'poly8') throw new Error('Invalid machine composition recipe.')
  const count = 5 + composition.machineIds.filter(id => selection.has(id)).length
  return groups.map(group => {
    if (group.moduleId === 'poly8') return { ...group, pokes: group.pokes.map(row => composition.countSites.includes(row.address) ? { ...row, code: row.code.slice(0, -2) + (row.code.length === 8 ? count : count - 1).toString(16).padStart(2, '0') } : row) }
    const rule = composition.groups.find(row => row.moduleId === group.moduleId)
    if (!rule) return group
    if (rule.suppliedBy && selection.has(rule.suppliedBy)) {
      if (JSON.stringify(group) !== JSON.stringify(rule.suppliedGroup)) throw new Error('Bundled machine quantizer declaration drift.')
      return { ...group, detours: [], refs: [], pokes: [], tables: [] }
    }
    const remove = <T extends { address: number }>(rows: T[], reviewed: Record<string, unknown>[]): T[] => rows.filter(row => {
      const expected = reviewed.find(claim => claim.address === row.address)
      if (!expected) return true
      if (Object.entries(expected).some(([key, value]) => (row as Record<string, unknown>)[key] !== value)) throw new Error('Machine composition seam drift: ' + group.moduleId + '.')
      return false
    })
    return { ...group, detours: remove(group.detours, rule.replace.detours), refs: remove(group.refs, rule.replace.refs), pokes: remove(group.pokes, rule.replace.pokes) }
  })
}
export function requestedObjectSelected(pkg: Package, ids: readonly string[]) {
  const rule = ids.includes('poly8') ? composition.groups.find(rule => rule.moduleId === pkg.moduleId) : undefined
  return !(rule?.suppliedBy && ids.includes(rule.suppliedBy))
}
export function requestedObjectDram(pkg: Package, ids: readonly string[]) {
  return pkg.dram || (ids.includes('poly8') && composition.groups.some(rule => rule.moduleId === pkg.moduleId && rule.runtimeUnits.includes(pkg.label)))
}
export async function bytesHash(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)), b => b.toString(16).padStart(2, '0')).join('')
}
export function word32(value: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value); return b }
export function selectedRequestedGroups(ids: readonly string[]) {
  const selection = new Set(resolveSelection(ids).map(m => m.id))
  if (selection.has('usb-audio-out-tracks-main-cue')) selection.add('usb-midi')
  if (facts.schema !== 1 || facts.revision !== CATALOG_SOURCE.revision) throw new Error('The requested packages do not match the pinned catalog.')
  const groups = composedGroups(facts.groups.filter(g => selection.has(g.moduleId) && (!g.activeWith || selection.has(g.activeWith))), selection)
  // Refuse overlapping native hooks before linking or placing either module.
  const claims: { start: number; end: number; owner: string }[] = []
  for (const group of groups) {
    const rows = [
      ...group.detours.filter(row => !(group.moduleId === 'usb-midi' && row.address === 0x4001e606 && selection.has('usb-audio-out-tracks-main-cue'))).map(row => ({ address: row.address, bytes: Math.max(row.guardLength, row.writeLength) })),
      ...group.refs.map(row => ({ address: row.address, bytes: row.guardLength })),
      ...group.pokes.map(row => ({ address: row.address, bytes: Math.max(row.guardLength, row.code.length / 2) })),
      ...group.tables.flatMap(table => table.refs.map(row => ({ address: row.address, bytes: 4 }))),
    ]
    for (const row of rows) {
      if (!Number.isSafeInteger(row.address) || !Number.isSafeInteger(row.bytes) || row.address < OS_LOAD_ADDRESS || row.bytes < 1 || row.address + row.bytes > 0xffffffff) throw new Error('Invalid native declaration span.')
      const overlap = claims.find(claim => claim.owner !== group.moduleId && row.address < claim.end && claim.start < row.address + row.bytes)
      if (overlap) throw new Error('The selected modules have conflicting native declarations: ' + overlap.owner + ' and ' + group.moduleId + '.')
      claims.push({ start: row.address, end: row.address + row.bytes, owner: group.moduleId })
    }
  }
  for (const g of groups) {
    const m = MODULES.find(m => m.id === g.moduleId)
    const internal = g.moduleId === 'usb-midi' && g.key === 'USB MIDI' && g.author === 'markandrus' && g.nativeAuthor === 'markandrus/octemu'
    if (!internal && (!m || m.key !== g.key || m.author !== g.author)) throw new Error('Requested package attribution differs from the catalog.')
  }
  return groups
}
export async function readRequestedObject(label: string, original?: Uint8Array, ids: readonly string[] = []) {
  const pkg = facts.objects.find(p => p.label === label)
  if (!pkg || pkg.bytes < 52 || pkg.bytes > 8 * 1024 * 1024 || pkg.code.length !== pkg.bytes * 2 || !/^[0-9a-f]+$/.test(pkg.code)) throw new Error('Invalid requested object package.')
  if (pkg.moduleId !== 'usb-midi' && MODULES.find(m => m.id === pkg.moduleId)?.version !== pkg.version) throw new Error('Requested object version differs from the catalog.')
  const matches = pkg.variants.filter(row => row.whenModules.every(id => ids.includes(id)) && row.withoutModules.every(id => !ids.includes(id)))
  if (matches.length > 1) throw new Error('Ambiguous requested object variants.')
  const variant = matches[0] ?? pkg
  if (!Number.isSafeInteger(variant.bytes) || variant.bytes < 52 || variant.bytes > 8 * 1024 * 1024 || variant.code.length !== variant.bytes * 2 || !/^[a-f0-9]+$/.test(variant.code)) throw new Error('Invalid conditional requested object.')
  const bytes = Uint8Array.from({ length: variant.bytes }, (_, i) => parseInt(variant.code.slice(i * 2, i * 2 + 2), 16))
  if (await bytesHash(bytes) !== variant.sha256) throw new Error('Requested object checksum does not match.')
  const object = parseColdFireObject(bytes)
  validateStockCopies(object, pkg.stockCopies)
  for (const copy of pkg.stockCopies) {
    const section = object.sections[copy.section], at = copy.source - OS_LOAD_ADDRESS
    if (!original || at < 0 || at + copy.bytes > original.length) throw new Error('The inherited stock span needs verified local firmware.')
    const inherited = original.slice(at, at + copy.bytes)
    if (await bytesHash(inherited) !== copy.sha256) throw new Error('The inherited stock span fingerprint differs.')
    section.data.set(inherited, copy.offset)
  }
  return { label, object }
}
// The requested modules listed after the utility and replacing modules in the catalog that have image-linked ROM units: native places
// those units after the utility units and the replacing modules' raw pointers, in catalog order. The others listed there (Vector, Play
// Modes, Recorder Loop Fix, POLY8, Output Matrix) put their units in DRAM or fixed caves, which this pass skips.
const LATE_ROM: readonly string[] = ['mute-modes', 'quantize-live-rec-toggle']
export async function requestedRom(ids: readonly string[], cursor: number, overflow: number, caveLimit: number, cave: (address: number, bytes: Uint8Array, note: string) => Promise<void>, late = false) {
  const groups = selectedRequestedGroups(ids).filter(group => LATE_ROM.includes(group.moduleId) === late), symbols = new Map<string, number>()
  for (const group of groups) for (const pkg of facts.objects.filter(p => p.moduleId === group.moduleId && !requestedObjectDram(p, ids) && requestedObjectSelected(p, ids) && p.placement !== 'cave')) {
    const address = pkg.caveAddress ?? Math.ceil(cursor / 128) * 128
    const linked = linkRomText((await readRequestedObject(pkg.label, undefined, ids)).object, address, symbols)
    await cave(address, linked.bytes, group.moduleId + ' ' + pkg.label + ' ROM unit')
    for (const [name, at] of linked.symbols) symbols.set(name, at)
    if (address >= 0x400d6b20 && address < caveLimit) cursor = Math.max(cursor, address + linked.bytes.length)
    else if (address >= 0x400d24d0 && address < 0x400d2ce0) overflow = Math.max(overflow, Math.ceil((address + linked.bytes.length) / 4) * 4)
  }
  return { cursor, overflow, symbols }
}
export async function requestedTables(original: Uint8Array, ids: readonly string[], cursor: number, cave: (address: number, bytes: Uint8Array, note: string) => Promise<void>, symbols: ReadonlyMap<string, number>) {
  const writes: OsWrite[] = [], view = new DataView(original.buffer, original.byteOffset, original.byteLength)
  for (const group of selectedRequestedGroups(ids)) for (const table of group.tables) {
    const address = Math.ceil(cursor / 128) * 128, bytes = new Uint8Array((table.count + table.symbols.length) * 4)
    const insertAt = table.insertAt ?? table.count
    if (!Number.isInteger(insertAt) || insertAt < 0 || insertAt > table.count) throw new Error('Invalid requested table insertion.')
    const stock = original.subarray(table.old - OS_LOAD_ADDRESS, table.old - OS_LOAD_ADDRESS + table.count * 4)
    bytes.set(stock.subarray(0, insertAt * 4))
    bytes.set(stock.subarray(insertAt * 4), (insertAt + table.symbols.length) * 4)
    const values = new DataView(bytes.buffer)
    for (const [i, row] of table.symbols.entries()) {
      const target = symbols.get(row.symbol)
      if (target === undefined) throw new Error('Unresolved requested table symbol: ' + row.symbol)
      values.setUint32(((table.insertAt ?? table.count) + i) * 4, target)
    }
    await cave(address, bytes, table.label); cursor = address + bytes.length
    for (const ref of table.refs) {
      if (view.getUint32(ref.address - OS_LOAD_ADDRESS) !== ref.old) throw new Error('The requested table reference differs from stock.')
      writes.push({ address: ref.address, guardLength: 4, guardSha256: await bytesHash(word32(ref.old)), bytes: word32(address), note: table.label })
    }
  }
  return { cursor, writes }
}
export async function requestedHooks(original: Uint8Array, ids: readonly string[], symbols: ReadonlyMap<string, number>, runtime: CfRuntimeLink | null): Promise<OsWrite[]> {
  const writes: OsWrite[] = [], selected = new Set(ids)
  const target = (name: string, unit?: string) => { const at = symbols.get(unit + '::' + name) ?? symbols.get(name); if (at === undefined || at % 2) throw new Error('Unresolved requested hook: ' + name); return at }
  for (const group of selectedRequestedGroups(ids)) {
    for (const row of group.detours) {
      if (group.moduleId === 'usb-midi' && row.address === 0x4001e606 && selected.has('usb-audio-out-tracks-main-cue')) continue
      const at = row.target ?? target(row.symbol, row.unit)
      if (row.target === null && ![...facts.objects.filter(p => !requestedObjectDram(p, ids)).map(p => p.label)].includes(row.unit) && (!runtime || at < runtime.sections[0].address || at >= runtime.sections[0].address + runtime.sections[0].size)) throw new Error('The requested hook points outside runtime code.')
      const bytes = new Uint8Array(row.writeLength)
      if (row.kind === 'lea') bytes.set(original.subarray(row.address - OS_LOAD_ADDRESS, row.address - OS_LOAD_ADDRESS + 2))
      else if (row.kind === 'jmp' || row.kind === 'jsr') bytes.set(row.kind === 'jmp' ? [0x4e, 0xf9] : [0x4e, 0xb9])
      else throw new Error('Unsupported requested hook kind.')
      bytes.set(word32(at), 2)
      for (let p = 6; p < bytes.length; p += 2) bytes.set([0x4e, 0x71], p)
      // Some native guards cover fewer bytes than the emitted whole-instruction detour.
      const offset = row.address - OS_LOAD_ADDRESS, guardLength = Math.max(row.guardLength, bytes.length)
      if (await bytesHash(original.subarray(offset, offset + row.guardLength)) !== row.guardSha256) throw new Error('The requested hook guard differs from stock.')
      writes.push({ address: row.address, guardLength, guardSha256: await bytesHash(original.subarray(offset, offset + guardLength)), bytes, note: row.note })
    }
    for (const row of group.refs) writes.push({ address: row.address, guardLength: row.guardLength, guardSha256: row.guardSha256, bytes: word32(target(row.symbol, row.unit) + row.addend), note: row.note })
    for (const row of group.pokes) writes.push({ address: row.address, guardLength: row.guardLength, guardSha256: row.guardSha256, bytes: Uint8Array.from(row.code.match(/../g)!, b => parseInt(b, 16)), note: row.note })
  }
  return writes
}

/** The recorder's source caves follow utility caves in the native placement order. */
export async function requestedCaves(ids: readonly string[], cursor: number, overflow: number, caveLimit: number, cave: (address: number, bytes: Uint8Array, note: string) => Promise<void>, poolBase: number) {
  const symbols = new Map<string, number>()
  for (const group of selectedRequestedGroups(ids)) for (const pkg of facts.objects.filter(row => row.moduleId === group.moduleId && row.placement === 'cave')) {
    const object = (await readRequestedObject(pkg.label, undefined, ids)).object
    let address = Math.ceil(cursor / 128) * 128, linked = linkRomText(object, address)
    const inside = address + linked.bytes.length <= caveLimit
    if (!inside) { address = Math.ceil(overflow / 4) * 4; linked = linkRomText(object, address) }
    const view = new DataView(linked.bytes.buffer, linked.bytes.byteOffset, linked.bytes.byteLength)
    let literals = 0
    for (let i = 0; i + 4 <= linked.bytes.length; i += 2) if (view.getUint32(i) === 0x40a955e0) { literals++; view.setUint32(i, poolBase) }
    if (literals !== pkg.poolBaseLiterals) throw new Error('Recorder pool-base literal count differs from its declaration.')
    await cave(address, linked.bytes, pkg.label)
    for (const [name, value] of linked.symbols) { symbols.set(name, value); symbols.set(pkg.label + '::' + name, value) }
    if (inside) cursor = address + linked.bytes.length
    else overflow = Math.ceil((address + linked.bytes.length) / 4) * 4
  }
  return { cursor, overflow, symbols }
}

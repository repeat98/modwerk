import { requestedRom, requestedTables, requestedHooks, requestedCaves } from './requested-modules.ts'
import { composeUtilityRom } from './utility-modules.ts'
import type { CfRuntimeLink } from './coldfire-link.ts'
import descriptorRecipes from './assets/descriptor-recipes.json' with { type: 'json' }
import recipes from './assets/menu-recipes.json' with { type: 'json' }
import { CATALOG_SOURCE, resolveSelection } from '../catalog/modules.ts'
import { composeDescriptors, placementOrder } from './descriptors.ts'
import { emitLabelFormatter, emitModeFormatter, type ModeRenames } from './menu-formatters.ts'
import { readRomPackage, linkRomText, createWideDial } from './rom-package.ts'
import { applyGuardedOsWrites, type OsWrite } from './os-patches.ts'
import { MenuSpaceError } from './placement-error.ts'
export const MENU_CAVE_END = 0x400d7c3c, MENU_LONG_LIST = 0x400d7bbc
const OVERFLOW_START = 0x400d24d0, OVERFLOW_END = 0x400d2ce0
const align = (address: number, alignment: number) => Math.ceil(address / alignment) * alignment
async function zeroHash(length: number) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(length).buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
function pointer(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('A module menu pointer is outside its address range.')
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value); return bytes
}
export async function composeModuleMenus(original: Uint8Array, ids: readonly string[], caveLimit = MENU_CAVE_END, runtime: CfRuntimeLink | null = null, leading: readonly string[] = []) {
  const modules = placementOrder(resolveSelection(ids), leading), baseline = await composeDescriptors(original, ids, leading)
  if (recipes.schema !== 1 || recipes.revision !== CATALOG_SOURCE.revision || ![MENU_CAVE_END, MENU_LONG_LIST].includes(caveLimit)) throw new Error('The module menus do not match the pinned placement profile.')
  if (baseline.caveCursor > caveLimit) throw new Error('The descriptor clones run into the chooser list.')
  const writes: OsWrite[] = [...baseline.writes], regions: { address: number; bytes: number; note: string }[] = []
  const formatters: { id: string; slot: number; address: number; bytes: number; wideMaximum: number | null }[] = []
  let cursor = baseline.caveCursor, overflow = OVERFLOW_START
  async function cave(address: number, bytes: Uint8Array, note: string) {
    if (!Number.isInteger(address) || address % 2 || !bytes.length) throw new Error('Invalid module menu placement.')
    const end = address >= baseline.caveCursor ? caveLimit : address >= OVERFLOW_START && address < OVERFLOW_END ? OVERFLOW_END : address === 0x400c45b0 ? 0x400c4702 : address
    if (!((address >= baseline.caveCursor && address + bytes.length <= caveLimit) || (address >= OVERFLOW_START && address + bytes.length <= OVERFLOW_END) || (address === 0x400c45b0 && address + bytes.length <= 0x400c4702))) {
      const owner = modules.find(module => note.startsWith(module.id + ' ') || note.startsWith(module.name + ' '))
      throw new MenuSpaceError(owner ? owner.name + ' menu and patch code' : note, bytes.length, Math.max(0, end - address), owner ? [owner.id] : [])
    }
    writes.push({ address, guardLength: bytes.length, guardSha256: await zeroHash(bytes.length), bytes, note }); regions.push({ address, bytes: bytes.length, note })
  }
  // ROM units a descriptor points into (raw formatter/widget words). Native places units in chooser order, so a module that leads
  // (replaces a kept stock effect) places its units ahead of Repitch's; every other module's units follow it.
  async function placeRawPointers(descriptor: (typeof baseline.descriptors)[number]) {
    const recipe = descriptorRecipes.recipes.find(recipe => recipe.id === descriptor.id)!
    if (!recipe.rawPointers) return
    const symbols = new Map<string, number>()
    for (const unit of [...new Set(recipe.rawPointers.map(pointer => pointer.unit))]) {
      let address = align(cursor, 128), linked = linkRomText(await readRomPackage(unit), address)
      const inside = address + linked.bytes.length <= caveLimit
      if (!inside) { address = align(overflow, 4); linked = linkRomText(await readRomPackage(unit), address) }
      await cave(address, linked.bytes, descriptor.id + ' ' + unit + ' ROM unit')
      for (const [name, value] of linked.symbols) symbols.set(unit + ':' + name, value)
      if (inside) cursor = address + linked.bytes.length
      else overflow = align(address + linked.bytes.length, 4)
    }
    for (const field of recipe.rawPointers) {
      const address = symbols.get(field.unit + ':' + field.symbol)
      if (address === undefined || !Number.isInteger(field.offset) || field.offset < 0 || field.offset + 4 > descriptor.bytes.length) throw new Error('A raw descriptor pointer has no linked symbol.')
      new DataView(descriptor.bytes.buffer).setUint32(field.offset, address)
    }
    // A stock-DSP module's ColdFire detours reach its own linked units (Sidechain Compressor's sc_norm).
    for (const detour of (recipe as { detours?: { address: number; guardLength: number; guardSha256: string; unit: string; symbol: string; kind: string; bytes: number; note: string }[] }).detours ?? []) {
      const target = symbols.get(detour.unit + ':' + detour.symbol)
      if (target === undefined || target % 2 || !['jmp', 'jsr'].includes(detour.kind) || !Number.isInteger(detour.bytes) || detour.bytes < 6 || detour.bytes % 2) throw new Error('A stock-DSP module detour has no linked symbol or an unsupported kind.')
      const bytes = new Uint8Array(detour.bytes); bytes.set([0x4e, detour.kind === 'jsr' ? 0xb9 : 0xf9]); bytes.set(pointer(target), 2)
      for (let i = 6; i < bytes.length; i += 2) bytes.set([0x4e, 0x71], i)
      writes.push({ address: detour.address, guardLength: detour.guardLength, guardSha256: detour.guardSha256, bytes, note: detour.note }); regions.push({ address: detour.address, bytes: bytes.length, note: detour.note })
    }
  }
  for (const descriptor of baseline.descriptors) if (leading.includes(descriptor.id)) await placeRawPointers(descriptor)
  if (!ids.includes('poly8') && modules.some(module => module.id === 'repitch')) {
    const address = align(cursor, 128), linked = linkRomText(await readRomPackage('repitch'), address)
    await cave(address, linked.bytes, 'Repitch ROM unit'); cursor = address + linked.bytes.length
    for (const patch of recipes.repitchPatches) {
      let bytes: Uint8Array
      if (patch.kind === 'poke') {
        if (!patch.code || patch.code.length % 2 || !/^[0-9a-f]+$/.test(patch.code)) throw new Error('A Repitch poke has invalid bytes.')
        bytes = Uint8Array.from({ length: patch.code.length / 2 }, (_, i) => parseInt(patch.code!.slice(i * 2, i * 2 + 2), 16))
      } else {
        const symbol = linked.symbols.get(patch.symbol ?? '')
        if (symbol === undefined || symbol < address || symbol >= cursor || symbol % 2) throw new Error('A Repitch patch refers to an invalid symbol.')
        const target = pointer(symbol + (patch.addend ?? 0))
        if (patch.kind === 'pointer') bytes = target
        else if (patch.kind === 'detour' && patch.bytes && patch.bytes >= 6 && patch.bytes % 2 === 0) {
          bytes = new Uint8Array(patch.bytes); bytes.set([0x4e, 0xf9]); bytes.set(target, 2)
          for (let i = 6; i < bytes.length; i += 2) bytes.set([0x4e, 0x71], i)
        } else throw new Error('A Repitch patch has an unsupported kind.')
      }
      writes.push({ address: patch.address, guardLength: patch.guardLength, guardSha256: patch.guardSha256, bytes, note: patch.note }); regions.push({ address: patch.address, bytes: bytes.length, note: patch.note })
    }
  }
  const rom = await requestedRom(ids, cursor, overflow, caveLimit, cave)
  cursor = rom.cursor; overflow = rom.overflow
  const utilityUnits = await composeUtilityRom(ids, cursor, overflow, caveLimit, cave, 'linked')
  cursor = utilityUnits.cursor; overflow = utilityUnits.overflow; writes.push(...utilityUnits.writes)
  // Catalog order puts a replacing module after the requested and utility modules, so its units follow theirs unless it leads.
  for (const descriptor of baseline.descriptors) if (!leading.includes(descriptor.id)) await placeRawPointers(descriptor)
  const lateRom = await requestedRom(ids, cursor, overflow, caveLimit, cave, true)
  cursor = lateRom.cursor; overflow = lateRom.overflow
  const requestedSymbols = new Map([...(runtime?.symbols ?? []), ...rom.symbols, ...lateRom.symbols])
  if (modules.some(module => module.id === 'spectrum')) {
    const descriptor = baseline.descriptors.find(descriptor => descriptor.id === 'spectrum')!
    const address = 0x400c45b0, linked = linkRomText(await readRomPackage('spectrum-shape'), address, new Map([['CLONE_SPECTRUM', descriptor.address]]))
    await cave(address, linked.bytes, 'Spectrum SHPE formatter')
    const view = new DataView(descriptor.bytes.buffer); view.setUint32(0xca + 7 * 4, address); view.setUint32(0xfa + 7 * 4, 0)
  }
  if (modules.some(module => module.id === 'tapeecho')) {
    let address = align(cursor, 128), linked = linkRomText(await readRomPackage('tape-time'), address)
    const inside = address + linked.bytes.length <= caveLimit
    if (!inside) { address = align(overflow, 4); linked = linkRomText(await readRomPackage('tape-time'), address) }
    await cave(address, linked.bytes, 'Tape TIME formatter')
    const descriptor = baseline.descriptors.find(descriptor => descriptor.id === 'tapeecho')!
    const view = new DataView(descriptor.bytes.buffer); view.setUint32(0xca, address); view.setUint32(0xfa, 0)
    if (inside) cursor = address + linked.bytes.length
    else overflow = align(address + linked.bytes.length, 4)
  }
  const utilityCaves = await composeUtilityRom(ids, cursor, overflow, caveLimit, cave, 'caves')
  cursor = utilityCaves.cursor; overflow = utilityCaves.overflow; writes.push(...utilityCaves.writes)
  const caves = await requestedCaves(ids, cursor, overflow, caveLimit, cave, 0x40a955e0 + ((runtime as (CfRuntimeLink & { reserveBytes?: number }) | null)?.reserveBytes ?? 0))
  cursor = caves.cursor; overflow = caves.overflow
  for (const [name, value] of caves.symbols) requestedSymbols.set(name, value)
  const tables = await requestedTables(original, ids, cursor, cave, requestedSymbols)
  cursor = tables.cursor; writes.push(...tables.writes)
  writes.push(...await requestedHooks(original, ids, requestedSymbols, runtime))
  for (const descriptor of baseline.descriptors) {
    const module = modules.find(module => module.id === descriptor.id)!
    for (const recipe of recipes.recipes.filter(recipe => recipe.id === descriptor.id)) {
      if (recipe.key !== module.key || recipe.author !== module.author || !Number.isInteger(recipe.slot) || recipe.slot < 0 || recipe.slot > 11) throw new Error('A menu formatter does not match its module attribution.')
      const renames = recipe.renames as ModeRenames
      const bytes = Object.keys(renames).length ? emitModeFormatter(recipe.labels, descriptor.address + 0x16, renames) : emitLabelFormatter(recipe.labels)
      const inside = cursor + bytes.length <= caveLimit, address = inside ? cursor : overflow
      await cave(address, bytes, module.name + ' ' + recipe.name + ' formatter')
      new DataView(descriptor.bytes.buffer).setUint32(0xca + recipe.slot * 4, address)
      formatters.push({ id: descriptor.id, slot: recipe.slot, address, bytes: bytes.length, wideMaximum: recipe.wideMaximum })
      if (inside) cursor += bytes.length
      else overflow = align(address + bytes.length, 4)
    }
  }
  const rows = formatters.filter(formatter => formatter.wideMaximum !== null).map(formatter => [formatter.address, formatter.wideMaximum!] as const)
  if (rows.length) {
    let address = align(cursor, 4), linked = await createWideDial(rows, address)
    const inside = address + linked.bytes.length <= caveLimit
    if (!inside) { address = align(overflow, 4); linked = await createWideDial(rows, address) }
    await cave(address, linked.bytes, 'Shared wide dial')
    const symbol = linked.symbols.get('wide_dial_hook')
    if (symbol !== address) throw new Error('The wide dial hook has an invalid entry point.')
    const bytes = new Uint8Array(6); bytes.set([0x4e, 0xf9]); bytes.set(pointer(symbol), 2)
    writes.push({ ...recipes.wideGuard, bytes, note: 'Shared wide dial hook' }); regions.push({ address: recipes.wideGuard.address, bytes: 6, note: 'Shared wide dial hook' })
    if (inside) cursor = address + linked.bytes.length
    else overflow = align(address + linked.bytes.length, 4)
  }
  // Verify free-space and stock-site guards as one transaction. Clones are
  // private copies; failed placement never changes the caller's OS.
  await applyGuardedOsWrites(original, writes)
  return { ...baseline, writes, regions, formatters, caveCursor: cursor, overflowCursor: overflow, caveLimit }
}

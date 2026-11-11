// Chooser format facts are pinned; all stock descriptor pointers and guards
// are read from the user's own verified OS. No stock table content is bundled.
import type { CfRuntimeLink } from './coldfire-link.ts'
import metadata from './assets/chooser-metadata.json' with { type: 'json' }
import { CATALOG_SOURCE, resolveSelection } from '../catalog/modules.ts'
import { composeModuleMenus, MENU_CAVE_END, MENU_LONG_LIST } from './module-menus.ts'
import { applyGuardedOsWrites, OS_LOAD_ADDRESS, type OsWrite } from './os-patches.ts'
import { stockFx2Donors } from './static-dsp.ts'
import { ANALOG_BD_DONOR } from './analog-bd-layout.ts'
import { DSP_LOADER } from './protocol.ts'
export type ChooserProfile = { fx1: readonly string[]; fx2: readonly string[] }
async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export function defaultChoosers(ids: readonly string[], keepStockFx2 = true, loader = DSP_LOADER): ChooserProfile {
  if (metadata.schema !== 1 || metadata.revision !== CATALOG_SOURCE.revision) throw new Error('Chooser metadata does not match the pinned catalog.')
  const modules = resolveSelection(ids).map(module => {
    const entry = metadata.modules.find(entry => entry.id === module.id)
    if (!entry && module.fxId === undefined) return { id: module.id, key: module.key, fxId: null, fx1: false, fx1Only: false }
    if (!entry || entry.key !== module.key || entry.fxId !== (module.fxId ?? null)) throw new Error('The chooser declarations do not match this module version.')
    return entry
  })
  const replacement = (key: string) => modules.find(module => 'replaces' in module && module.replaces === key)?.key ?? key
  const fx1 = [...metadata.stockFx1.map(replacement), ...modules.filter(module => module.fx1 && !('replaces' in module)).map(module => module.key)]
  const own = modules.filter(module => module.fxId !== null && !module.fx1Only).map(module => module.key)
  if (!keepStockFx2) return { fx1, fx2: own }
  const kept = { fx1, fx2: [...metadata.stockFx2.map(replacement), ...own.filter(key => !modules.some(module => module.key === key && 'replaces' in module))] }
  if (loader) return kept
  // Without the loader, module code takes the place of stock effects listed on neither menu: give up only those it needs.
  const donors = stockFx2Donors(ids, kept, ids.includes('analog-bassdrum') ? [ANALOG_BD_DONOR] : [])
  return { fx1, fx2: kept.fx2.filter(key => !donors.includes(key)) }
}
/** Modules that replace a stock effect in place lead the placement order while stock FX2 rows stay (native puts them first). */
export function leadingModules(ids: readonly string[], profile: ChooserProfile) {
  const selected = resolveSelection(ids), own = metadata.modules.filter(module => selected.some(entry => entry.id === module.id))
  return profile.fx2.some(key => metadata.stockEffects.some(effect => effect.key === key)) ? own.filter(module => 'replaces' in module).map(module => module.id) : []
}
export function validateChoosers(ids: readonly string[], profile: ChooserProfile) {
  if (metadata.schema !== 1 || metadata.revision !== CATALOG_SOURCE.revision) throw new Error('Chooser metadata does not match the pinned catalog.')
  const selected = resolveSelection(ids), own = metadata.modules.filter(module => selected.some(entry => entry.id === module.id))
  for (const [slot, keys] of [['FX1', profile.fx1], ['FX2', profile.fx2]] as const) {
    if (keys.length > 30 || new Set(keys).size !== keys.length) throw new Error(slot + ' needs unique effects and space for its off row.')
    for (const key of keys) {
      const stock = metadata.stockEffects.find(effect => effect.key === key), module = own.find(module => module.key === key)
      if (!stock && (!module || module.fxId === null)) throw new Error(slot + ' contains an effect that this configuration does not include: ' + key)
      if (slot === 'FX1' && (stock ? !metadata.stockFx1.includes(key) : !module!.fx1)) throw new Error(key + ' is available on FX2 only.')
      if (slot === 'FX2' && module?.fx1Only) throw new Error(key + ' is available on FX1 only.')
    }
  }
  for (const module of own) if (module.fxId !== null && !profile.fx1.includes(module.key) && !profile.fx2.includes(module.key)) throw new Error(module.key + ' needs a row in one of the effect choosers.')
  // The resident Character template currently retains its P-memory tables.
  // Releasing every curve-bank reader requires the separate native X profile.
  const kept = profile.fx1.length ? [...profile.fx1, ...profile.fx2] : [...metadata.stockFx1, ...profile.fx2]
  if (selected.some(module => module.id === 'character') && !metadata.curveReaders.some(reader => kept.includes(reader))) throw new Error('This Character configuration needs the X-table placement engine. Keep DJ EQ available for now.')
  return { own, hidden: own.filter(module => module.fx1Only && profile.fx1.includes(module.key)).map(module => module.key) }
}
export async function composeChoosers(original: Uint8Array, ids: readonly string[], profile: ChooserProfile = defaultChoosers(ids), runtime: CfRuntimeLink | null = null, betaStartup = false) {
  const { own, hidden } = validateChoosers(ids, profile), layout = metadata.layout
  if (await hash(original) !== metadata.sourceSha256) throw new Error('Chooser composition needs the original OS fingerprint.')
  const listAddress = (profile.fx2.length + 2) * 4 <= 32 ? layout.NEW_LIST : layout.LONG_LIST
  // A module replacing a stock effect takes that effect's FX2 slot while the stock rows stay, so it leads the placement order.
  const leading = leadingModules(ids, profile)
  const menus = await composeModuleMenus(original, ids, listAddress === layout.NEW_LIST ? MENU_CAVE_END : MENU_LONG_LIST, runtime, leading, betaStartup ? 80 : 0)
  const writes: OsWrite[] = [...menus.writes], view = new DataView(original.buffer, original.byteOffset, original.byteLength)
  const read = (address: number) => view.getUint32(address - OS_LOAD_ADDRESS)
  const pointerTable = (entries: readonly number[]) => {
    const bytes = new Uint8Array(entries.length * 4), table = new DataView(bytes.buffer)
    entries.forEach((value, index) => table.setUint32(index * 4, value)); return bytes
  }
  async function write(address: number, bytes: Uint8Array, note: string, guardLength = bytes.length, zero = false) {
    const offset = address - OS_LOAD_ADDRESS
    if (offset < 0 || offset + guardLength > original.length) throw new Error('A chooser write exceeds the OS image.')
    const guarded = original.slice(offset, offset + guardLength)
    if (zero && guarded.some(byte => byte)) throw new Error('The chooser list does not fit its free region.')
    writes.push({ address, guardLength, guardSha256: await hash(guarded), bytes, note })
  }
  const none = read(layout.FX1_IDS)
  if (none !== layout.FX1_NONE) throw new Error('The stock off descriptor is outside its pinned location.')
  function descriptor(key: string) {
    const stock = metadata.stockEffects.find(effect => effect.key === key)
    if (stock) {
      const address = read(layout.FX2_IDS + stock.fxId * 4)
      if (address < OS_LOAD_ADDRESS || address + 0x192 > OS_LOAD_ADDRESS + original.length || read(address) % 256 !== stock.fxId) throw new Error('A stock chooser descriptor does not match its effect id.')
      return address
    }
    const clone = menus.descriptors.find(descriptor => descriptor.key === key)
    if (!clone) throw new Error('A chooser row is missing its module descriptor.')
    return clone.address
  }
  const id = (key: string) => metadata.stockEffects.find(effect => effect.key === key)?.fxId ?? own.find(module => module.key === key)!.fxId!
  await write(listAddress, pointerTable([none, ...profile.fx2.map(descriptor), 0]), 'FX2 chooser list', listAddress === layout.LONG_LIST ? layout.ZERO_RUN_END - layout.LONG_LIST : (profile.fx2.length + 2) * 4, true)
  async function reference(address: number, old: number, target: number, note: string, checkOpcode: boolean) {
    if (read(address) !== old) throw new Error('A chooser reference is outside its stock location.')
    if (checkOpcode && ![0x41f9,0x47f9,0x4bf9].includes(view.getUint16(address - OS_LOAD_ADDRESS - 2))) throw new Error('A chooser reference is missing its LEA opcode.')
    await write(address, pointerTable([target]), note)
  }
  async function viewport(instruction: number, operand: number, rows: number, note: string) {
    if (read(instruction) !== 0x48780007 || operand !== instruction + 2) throw new Error('The stock chooser viewport instruction does not match.')
    const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, Math.min(7, rows)); await write(operand, bytes, note)
  }
  for (const address of metadata.fx2References) await reference(address, layout.FX2_LIST, listAddress, 'FX2 chooser reference', false)
  await viewport(layout.ROWCOUNT_INSN, layout.ROWCOUNT_AT, profile.fx2.length + 1, 'FX2 chooser viewport')
  const positions = new Map<number, number>([[0,0]])
  profile.fx2.forEach((key, position) => positions.set(id(key), position + 1))
  hidden.forEach(key => positions.set(id(key), 0))
  for (const effectId of metadata.customIds) if (!own.some(module => module.fxId === effectId)) {
    await write(layout.FX2_IDS + effectId * 4, pointerTable([none]), 'Omitted module descriptor'); positions.set(effectId, 0)
  }
  await write(layout.FX2_IDS, pointerTable([none]), 'FX2 off descriptor')
  for (const [effectId, position] of positions) await write(layout.ID2POS + effectId * 4, pointerTable([position]), 'FX2 chooser cursor')
  let cursor = menus.caveCursor, overflow = menus.overflowCursor, fx1Address = layout.FX1_LIST
  if (profile.fx1.length) {
    const bytes = pointerTable([none, ...profile.fx1.map(descriptor), 0]), inside = cursor + bytes.length <= menus.caveLimit
    fx1Address = inside ? cursor : overflow
    if (!inside && fx1Address + bytes.length > layout.OVERFLOW_RUN_END) throw new Error('The effect choosers need more space than this configuration leaves. Remove an effect or shorten the chooser lists.')
    await write(fx1Address, bytes, 'FX1 chooser list', bytes.length, true)
    if (inside) cursor += bytes.length
    else overflow = Math.ceil((overflow + bytes.length) / 4) * 4
    for (const address of metadata.fx1References) await reference(address, layout.FX1_LIST, fx1Address, 'FX1 chooser reference', true)
    await viewport(layout.FX1_ROWCOUNT_INSN, layout.FX1_ROWCOUNT_AT, profile.fx1.length + 1, 'FX1 chooser viewport')
    const positions = Array<number>(32).fill(0)
    for (const [position, key] of profile.fx1.entries()) {
      const effectId = id(key); positions[effectId] = position + 1
      const module = own.find(module => module.key === key)
      if (module) {
        if (read(layout.FX1_IDS + effectId * 4) !== ('replaces' in module ? read(layout.FX2_IDS + effectId * 4) : none)) throw new Error('The module FX1 id is already claimed by a stock effect.')
        await write(layout.FX1_IDS + effectId * 4, pointerTable([descriptor(key)]), 'Module FX1 descriptor')
        if (module.replaces !== undefined) {
          // Native also takes over the replaced effect's row in the stock list, in place (build_bus.py, "a REPLACEMENT also takes over the
          // stock effect's FX1 page"). The relocated list above is what the firmware reads, so this row is stale, but the image stays identical.
          const stockDescriptor = descriptor(module.replaces), rows: number[] = []
          for (let at = layout.FX1_LIST; read(at) !== 0 && at <= layout.FX1_LIST + 32 * 4; at += 4) if (read(at) === stockDescriptor) rows.push(at)
          if (rows.length !== 1) throw new Error('The replaced effect is not listed once in the stock FX1 chooser.')
          await write(rows[0], pointerTable([descriptor(key)]), 'Replaced FX1 chooser row')
        }
      }
    }
    await write(layout.FX1_ID2POS, pointerTable(positions), 'FX1 chooser cursor table')
  }
  await applyGuardedOsWrites(original, writes)
  return { ...menus, writes, caveCursor: cursor, overflowCursor: overflow, chooser: { fx1Address, fx2Address: listAddress, fx1: [...profile.fx1], fx2: [...profile.fx2], hidden } }
}

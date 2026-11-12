import { selectedDramRegions, placeDramRegions } from './runtime-memory.ts'
import { readCoreLogger, loggerExternals, LOGGER_RESERVE_BYTES, LOGGER_RETAINED_BYTES } from './core-logger.ts'
import { readBetaStartup, BETA_STARTUP_ACTIVE_ADDRESS } from './beta-startup.ts'
import { readRequestedObject, requestedFacts, selectedRequestedGroups, requestedObjectSelected, requestedObjectDram } from './requested-modules.ts'
import { resolveSelection } from '../catalog/modules.ts'
import { placementOrder } from './descriptors.ts'
import { readColdFirePackage, joiningUnits, PLATFORM_UNITS } from './coldfire-package.ts'
import { linkColdFireRuntime, runtimeCatalogObject, type CfLinkInput } from './coldfire-link.ts'
import { createDynamicRuntimeCatalog } from './runtime-catalog.ts'
import type { StockDspCore } from './stock-dsp.ts'
import { readUsbAudioObjects } from './usb-audio.ts'
import { USB_AUDIO_MODULE, type UsbAudioConfiguration } from '../config/usb-audio.ts'
// Native arena.BASE. All accepted selections reserve the platform at its bottom.
export const PLATFORM_RUNTIME_BASE = 0x40a955e0
/** The references DRAM units make that no unit and no platform symbol or region defines (weak ones included), sorted.
 *  They resolve from the ROM units' global symbols, as a ROM unit's do natively (build_bus.py, _dram_rom_externals). */
export function romReferences(units: readonly CfLinkInput[], externals: ReadonlyMap<string, number>) {
  const wanted = new Set<string>(), defined = new Set<string>()
  for (const { object } of units) for (const symbol of object.symbols) {
    if (!symbol.name || (symbol.binding !== 1 && symbol.binding !== 2)) continue
    if (symbol.section === 0) wanted.add(symbol.name)
    else defined.add(symbol.name)
  }
  return [...wanted].filter(name => !defined.has(name) && !externals.has(name)).sort()
}
/** Adds to `externals` what each open reference resolves to: the ROM unit's symbol, or with 'provisional' the base for a
 *  strong reference (a weak one stays 0 until the ROM symbols are known). Returns every open reference. */
export function resolveRomReferences(units: readonly CfLinkInput[], externals: Map<string, number>, rom: ReadonlyMap<string, number> | 'provisional' | null, base: number) {
  const refs = romReferences(units, externals)
  for (const name of refs) {
    const strong = units.some(unit => unit.object.symbols.some(symbol => symbol.name === name && symbol.section === 0 && symbol.binding === 1))
    if (rom === 'provisional') { if (strong) externals.set(name, base) }
    else if (rom?.has(name)) externals.set(name, rom.get(name)!)
  }
  return refs
}
/** Loader-free runtime with the core logger in every configuration. `rom`: the ROM units' global symbols, once the menus
 *  have placed them (composeModuleMenus' romSymbols), or 'provisional' to link before that with each reference a DRAM unit
 *  leaves open held at the base; the layout is the same either way, since only relocated values change. `leading`: the
 *  chooser profile's leading modules (choosers.leadingModules), which native links first. */
export async function createStaticColdFireRuntime(ids: readonly string[], original?: Uint8Array, base = PLATFORM_RUNTIME_BASE, usbAudio?: UsbAudioConfiguration, betaAccess = false, startupRomAddress = BETA_STARTUP_ACTIVE_ADDRESS - 76, rom: ReadonlyMap<string, number> | 'provisional' | null = null, leading: readonly string[] = []) {
  const units = []
  const selected = selectedRequestedGroups(ids)
  // A unit that joins (native tools/build/runtime_join.py) links at its module's place
  // in the selection, and only when another module's units already make a runtime.
  const joins: { at: number; label: string }[] = []
  for (const module of placementOrder(resolveSelection(ids), leading)) {
    if (usbAudio && module.id === USB_AUDIO_MODULE) {
      if (!original) throw new Error('USB Audio needs verified local firmware.')
      units.push(...await readUsbAudioObjects(usbAudio, original)); continue
    }
    if (['tapeecho', 'euclid', 'bbd'].includes(module.id)) units.push(await readColdFirePackage(module.id))
    for (const pkg of requestedFacts.objects.filter(pkg => pkg.moduleId === module.id && requestedObjectDram(pkg, ids) && requestedObjectSelected(pkg, ids) && selected.some(g => g.moduleId === pkg.moduleId))) units.push(await readRequestedObject(pkg.label, original, ids))
    for (const label of joiningUnits(module.id)) joins.push({ at: units.length, label })
  }
  if (usbAudio && !ids.includes(USB_AUDIO_MODULE)) throw new Error('USB Audio settings require the USB Audio module.')
  if (!usbAudio && selected.some(g => g.moduleId === 'usb-midi')) for (const pkg of requestedFacts.objects.filter(pkg => pkg.moduleId === 'usb-midi')) units.push(await readRequestedObject(pkg.label, original, ids))
  if (units.length) for (const [i, join] of joins.entries()) units.splice(join.at + i, 0, await readColdFirePackage(join.label))
  const reserveBytes = (units.length ? 1707 * 6144 : 0) + LOGGER_RESERVE_BYTES
  const regions = placeDramRegions(selectedDramRegions(ids), base, base + reserveBytes - LOGGER_RETAINED_BYTES)
  units.push(await readCoreLogger())
  if (betaAccess) units.push(await readBetaStartup())
  const externals = new Map(loggerExternals(reserveBytes, base))
  if (betaAccess) externals.set('modwerk_boot_active', startupRomAddress + 76)
  for (const region of regions) {
    if (externals.has(region.symbol)) throw new Error('A DRAM region shadows a platform symbol.')
    externals.set(region.symbol, region.address)
  }
  const romRefs = resolveRomReferences(units, externals, rom, base)
  const link = linkColdFireRuntime(units, base, externals)
  for (const unit of units) if (requestedFacts.objects.some(p => p.label === unit.label) || (usbAudio && unit.label === 'usbmidi_rx')) {
    for (const symbol of unit.object.symbols) {
      if (!symbol.name || !symbol.section || symbol.section >= unit.object.sections.length) continue
      const placement = link.placements.get(unit.label)!.get(symbol.section)
      if (!placement) continue
      if (placement.mergedOffsets) {
        const span = placement.mergedOffsets.find(r => r.source <= symbol.value && symbol.value < r.source + r.count)
        if (span) link.symbols.set(unit.label + '::' + symbol.name, span.destination + symbol.value - span.source)
      } else link.symbols.set(unit.label + '::' + symbol.name, placement.address + symbol.value)
    }
  }
  return { ...link, base, reserveBytes, regions, units: units.map(unit => unit.label), romRefs }
}
export async function createColdFireRuntime(cores: readonly StockDspCore[], ids: readonly string[], betaAccess = false) {
  const selection = resolveSelection(ids), catalog = await createDynamicRuntimeCatalog(cores, ids, 0)
  const units = []
  // with_platform appends the loader after the remix's declared modules.
  for (const module of selection) if (['tapeecho', 'euclid', 'bbd'].includes(module.id)) units.push(await readColdFirePackage(module.id))
  for (const label of PLATFORM_UNITS) units.push(await readColdFirePackage(label))
  units.push({ label: 'dlcatalog', object: runtimeCatalogObject(catalog, units[0].object.flags) })
  const reserveBytes = 1707 * 6144 + LOGGER_RESERVE_BYTES
  units.push(await readCoreLogger())
  if (betaAccess) units.push(await readBetaStartup())
  const regions = placeDramRegions(selectedDramRegions(ids), PLATFORM_RUNTIME_BASE, PLATFORM_RUNTIME_BASE + reserveBytes - LOGGER_RETAINED_BYTES)
  const externals = new Map(loggerExternals(reserveBytes))
  if (betaAccess) externals.set('modwerk_boot_active', BETA_STARTUP_ACTIVE_ADDRESS)
  for (const region of regions) {
    if (externals.has(region.symbol)) throw new Error('A DRAM region shadows a platform symbol.')
    externals.set(region.symbol, region.address)
  }
  const link = linkColdFireRuntime(units, PLATFORM_RUNTIME_BASE, externals)
  const catalogBase = link.symbols.get('dl_stub_at_boot')!
  return { ...link, reserveBytes, regions, catalogBase, units: units.map(unit => unit.label), pendingResidentDsp: selection.filter(module => module.id === 'character').map(module => module.id), pendingRomUnits: selection.filter(module => module.id === 'repitch').map(module => module.id) }
}

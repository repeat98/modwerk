import { selectedDramRegions, placeDramRegions } from './runtime-memory.ts'
import { readCoreLogger, loggerExternals, LOGGER_RESERVE_BYTES, LOGGER_RETAINED_BYTES } from './core-logger.ts'
import { readBetaStartup, BETA_STARTUP_ACTIVE_ADDRESS } from './beta-startup.ts'
import { readRequestedObject, requestedFacts, selectedRequestedGroups, requestedObjectSelected, requestedObjectDram } from './requested-modules.ts'
import { resolveSelection } from '../catalog/modules.ts'
import { readColdFirePackage, PLATFORM_UNITS } from './coldfire-package.ts'
import { linkColdFireRuntime, runtimeCatalogObject } from './coldfire-link.ts'
import { createDynamicRuntimeCatalog } from './runtime-catalog.ts'
import type { StockDspCore } from './stock-dsp.ts'
import { readUsbAudioObjects } from './usb-audio.ts'
import { USB_AUDIO_MODULE, type UsbAudioConfiguration } from '../config/usb-audio.ts'
// Native arena.BASE. All accepted selections reserve the platform at its bottom.
export const PLATFORM_RUNTIME_BASE = 0x40a955e0
const MODULE_UNITS: Readonly<Record<string, readonly string[]>> = {
  tapeecho: ['tapeecho'], euclid: ['euclid'], bbd: ['bbd'],
  grnyv1: ['ogpitch', 'ogcontrol', 'oggrain', 'ogsource', 'ogview'],
}
/** Loader-free runtime with the core logger in every configuration. */
export async function createStaticColdFireRuntime(ids: readonly string[], original?: Uint8Array, base = PLATFORM_RUNTIME_BASE, usbAudio?: UsbAudioConfiguration, betaAccess = false, startupRomAddress = BETA_STARTUP_ACTIVE_ADDRESS - 76) {
  const units = []
  const selected = selectedRequestedGroups(ids)
  for (const module of resolveSelection(ids)) {
    if (usbAudio && module.id === USB_AUDIO_MODULE) {
      if (!original) throw new Error('USB Audio needs verified local firmware.')
      units.push(...await readUsbAudioObjects(usbAudio, original)); continue
    }
    for (const label of MODULE_UNITS[module.id] ?? []) units.push(await readColdFirePackage(label))
    for (const pkg of requestedFacts.objects.filter(pkg => pkg.moduleId === module.id && requestedObjectDram(pkg, ids) && requestedObjectSelected(pkg, ids) && selected.some(g => g.moduleId === pkg.moduleId))) units.push(await readRequestedObject(pkg.label, original, ids))
  }
  if (usbAudio && !ids.includes(USB_AUDIO_MODULE)) throw new Error('USB Audio settings require the USB Audio module.')
  if (!usbAudio && selected.some(g => g.moduleId === 'usb-midi')) for (const pkg of requestedFacts.objects.filter(pkg => pkg.moduleId === 'usb-midi')) units.push(await readRequestedObject(pkg.label, original, ids))
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
  return { ...link, base, reserveBytes, regions, units: units.map(unit => unit.label) }
}
export async function createColdFireRuntime(cores: readonly StockDspCore[], ids: readonly string[], betaAccess = false) {
  const selection = resolveSelection(ids), catalog = await createDynamicRuntimeCatalog(cores, ids, 0)
  const units = []
  // with_platform appends the loader after the remix's declared modules.
  for (const module of selection) for (const label of MODULE_UNITS[module.id] ?? []) units.push(await readColdFirePackage(label))
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

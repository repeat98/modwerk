import { selectionConflicts, type SelectionConflict } from './selection-conflicts'
import { addBlocks, type AddBlock } from './add-blocks'
import { moduleUsbOnly, type PackageList } from './usb-only'
import { isModulePaused } from './availability'
import { MODULES } from './modules'
import packages from '../engine/assets/octatrack-module-packages.json' with { type: 'json' }
import { USB_AUDIO_MODULE } from '../config/usb-audio'

/** Baked/card placement belongs to the card checkout. USB sets use published
 * package checks and the unit's resource/ownership admission when they sync.
 * This changes library feedback only; it never authorizes a package or load.
 * Without the Octatrack base path (no USB sync) a USB-only module cannot be added at all. */
export function libraryCompatibility(beta: boolean, ids: readonly string[], keepStockFx2: boolean, candidates: readonly string[], published?: PackageList): { conflicts: SelectionConflict[]; blocks: Record<string, AddBlock> } {
  if (beta) return { conflicts: [], blocks: {} }
  const blocks = addBlocks(ids, keepStockFx2, candidates)
  for (const id of candidates) if (!ids.includes(id) && moduleUsbOnly(id, published)) blocks[id] = usbOnlyBlock(id)
  return { conflicts: selectionConflicts(ids, keepStockFx2), blocks }
}

export function usbOnlyBlock(id: string): AddBlock {
  const name = MODULES.find(module => module.id === id)?.name ?? id
  return { kind: 'usb-only', withIds: [], reason: 'USB only', key: 'usb-only:' + id,
    detail: name + ' needs the Modwerk base, loaded over USB. Card firmware has no base, so it cannot include ' + name + '.' }
}

type PublishedPackages = { packages: readonly { id: string }[]; groups?: readonly { variants: readonly { current?: boolean; members: readonly { id: string }[] }[] }[] }
/** An Octatrack module the library offers that has no USB package (sdk/approvals/usb-card-only.json): it goes onto the
 * unit only in card firmware, the whole-image build without the base. The same list as the sync dialog's "Card only"
 * (module-set.ts USB_MODULE_IDS), read from the package list itself so the library needs no USB code. */
export function moduleCardOnly(id: string, published: PublishedPackages = packages) {
  if (id === USB_AUDIO_MODULE || isModulePaused(id) || !MODULES.some(module => module.id === id)) return false
  return !published.packages.some(entry => entry.id === id) && !published.groups?.some(group => group.variants.some(variant => variant.current && variant.members.some(member => member.id === id)))
}
/** The names of the modules that are card only today, for the card build's label. */
export const cardOnlyModuleNames = () => MODULES.filter(module => moduleCardOnly(module.id)).map(module => module.name)
/** What a card-only module's mark on its library card says. */
export const cardOnlyDetail = (name: string) => name + ' has no USB version yet. It goes onto the Octatrack only as card firmware: a whole firmware file, without the Modwerk base, that you install from the card.'
/** The same in one line, beside the welcome's Build card firmware instead (OctatrackWelcome.tsx). */
export function cardInsteadReason(names = cardOnlyModuleNames()) {
  return 'Card firmware, without the base, is for browsers without USB' + (names.length ? ' and for modules with no USB version yet (' + names.join(', ') + ')' : '') + '.'
}
/** When the whole-image card build is the way to go: a browser without WebUSB, or a module with no USB version. */
export function cardFallbackReason(names = cardOnlyModuleNames()) {
  return 'For browsers without USB (Firefox, Safari, iPad and phones)' + (names.length ? ' and for modules that have no USB version yet (' + names.join(', ') + ')' : '') +
    '. It builds your module set into one firmware file for the card, without the Modwerk base: you install it with OS UPGRADE, and every change needs a new file.'
}

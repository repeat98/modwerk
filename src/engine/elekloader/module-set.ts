// SPDX-License-Identifier: GPL-3.0-or-later
// The builder for USB module sets: what loading a set onto an Octatrack with the Modwerk base sends. Modules the site
// publishes as runtime packages (public/octatrack-modules, made from source by `npm run octatrack:module-packages`)
// are installed from them; anything the set leaves out is removed with an empty package naming its module.
import manifest from '../assets/octatrack-module-packages.json' with { type: 'json' }
import siteEvents from '../../../sdk/machines/octatrack/site-events.json' with { type: 'json' }
import baseBinding from '../../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { MODULES } from '../../catalog/modules.ts'
import { inventoryChanges, type Inventory, type InventoryTarget } from '../../config/inventory.ts'
import type { OctatrackLink, SetChange } from './octatrack-link.ts'
import { RuntimeFeature, type MissingModule, type RuntimeCapabilities } from './upload-usb.ts'
import { USB_AUDIO_MODULE } from '../../config/usb-audio.ts'
import { baseLayout, isPublishedBase, layoutIdentity, layoutName, type BaseLayout } from './base-variants.ts'

/** Why a set cannot be loaded over USB, in the user's words. */
export class ModuleSetError extends Error {}
export interface RuntimePackage {
  bytes: number; sha256: string; path: string; name?: string
  abi?: number; features?: number; sites?: number; copies?: number; fills?: number
  /** Exact IDENTIFY digest when authored code depends on this base's addresses. */
  requiredBase?: string
}
export interface MachineVariant extends RuntimePackage {
  layout: number; current: boolean; members: { id: string; version: string }[]
}
export interface RuntimePackageManifest {
  packages: (RuntimePackage & { id: string; name: string; octabam?: boolean })[]
  groups?: { id: string; name: string; variants: MachineVariant[] }[]
}
export class BaseUpdateRequired extends ModuleSetError {
  constructor(message = 'Install the latest Modwerk base from the card to sync this module set. Your selected modules will stay here.') { super(message) }
}
/** USB Audio is part of the base: its layout sets the USB descriptors, so another layout is another base, sent over
 * USB like any base update (base-variants.ts). The set's modules stay; nothing is synced until it runs. */
export class BaseLayoutRequired extends BaseUpdateRequired {
  readonly layout: BaseLayout
  constructor(layout: BaseLayout) {
    super(`${layoutName(layout)} comes with the Modwerk base. Install the base with this layout over USB first; your modules stay as they are.`)
    this.layout = layout
  }
}
/** The base the site publishes (sdk/machines/octatrack/base-binding.json), in each USB Audio layout. While USB sync is a
 * beta every tester runs it (owner, 15 October 2026): the site syncs nothing to an older base and guides the update instead. */
export const CURRENT_BASE: string = baseBinding.identity
export const baseOutdated = (base?: string) => !!base && !isPublishedBase(base)
/** The USB Audio layout a set asks of the base; undefined when it leaves USB Audio out (any layout's base takes it). */
export const setLayout = (target: InventoryTarget): BaseLayout | undefined =>
  target.moduleIds.includes(USB_AUDIO_MODULE) ? target.usbAudio?.layout ?? 'tracks-main-cue' : undefined
/** The set without USB Audio: what the runtime packages must make the unit match. */
const packagedTarget = (target: InventoryTarget): InventoryTarget => ({ ...target, moduleIds: target.moduleIds.filter(id => id !== USB_AUDIO_MODULE) })

/** A module's runtime id (sdk/runtime/loader/build.py module_id): the first four bytes of the SHA-256 of its catalogue
 * id, hex. The inventory names a module the catalogue does not know by this id. */
export const runtimeId = (id: string) => /^[0-9a-f]{8}$/.test(id) ? id : sha(new TextEncoder().encode(id)).slice(0, 8)
const BY_RUNTIME_ID = new Map(MODULES.map(module => [runtimeId(module.id), module.id]))
/** The package that removes a module: ABI 4, no image, hooks or sites (sdk/runtime/loader/README.md). */
export function removalPackage(id: string) {
  const data = Uint8Array.from([0x4d, 0x57, 0x52, 0x4d, 0, 4, ...new Array<number>(26).fill(0)])
  new DataView(data.buffer).setUint32(28, Number.parseInt(runtimeId(id), 16))
  return data
}
const list = (items: string[]) => new Intl.ListFormat('en', { type: 'conjunction' }).format(items)

/** The site's exact copy of a package, including retained variants needed to undo a replacement. */
export async function fetchPackage(entry: RuntimePackage): Promise<Uint8Array> {
  const response = await fetch(import.meta.env.BASE_URL + entry.path)
  const data = response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined
  if (!data || data.length !== entry.bytes || sha(data) !== entry.sha256)
    throw new ModuleSetError(`The site couldn’t fetch ${entry.name ?? 'a module package'} intact. Reload the page and try again.`)
  return data
}

const MACHINE_BITS: Record<string, number> = { poly8: 1, vector: 2, synth: 4 }
/** The Octatrack base's site events and tables (sdk/machines/octatrack/events.json, through events.py): hook words a
 * subscriber may carry after the core four, by hook index. */
export const SITE_EVENTS = siteEvents.events.length
const SITE_KINDS = siteEvents.events.map((event, i) => {
  if (event.index !== 4 + i) throw new Error('sdk/machines/octatrack/site-events.json is out of order: run events.py --write')
  return { kind: event.kind, record: (event as { record?: number }).record ?? 0 }
})
/** loader.h RUNTIME_RAISE: a raised event's hook word with this order points at a zero slot for the base's entry. */
const RAISE = 255
/** loader.h struct modwerk_take: claims and entry, the record a take event's hook word points at. */
const TAKE_RECORD = 8
const invalidPackage = () => new ModuleSetError('The site’s module package list is inconsistent. Reload the page before syncing.')
const bounded = (n: unknown, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max
function requirements(entry: RuntimePackage, group = false) {
  const abi = entry.abi ?? ('octabam' in entry && entry.octabam ? 7 : 6), sites = entry.sites ?? 0, copies = entry.copies ?? 0, fills = entry.fills ?? 0
  if (![6, 7, 8].includes(abi) || !bounded(sites, 128) || !bounded(copies, 128) || !bounded(fills, 64) ||
      !bounded(entry.features ?? 0, 65535) || (abi < 8 && fills) || (abi < 7 && copies) ||
      (group && abi !== 8) || (entry.requiredBase !== undefined && (typeof entry.requiredBase !== 'string' || !/^[0-9a-f]{64}$/.test(entry.requiredBase))) ||
      (abi >= 7 && [entry.features, entry.sites, entry.copies, ...(abi === 8 ? [entry.fills] : [])].some(value => value === undefined)))
    throw invalidPackage()
  // Required features follow the actual record types even if a manifest accidentally omits a bit.
  const features = (entry.features ?? 0) | (sites ? RuntimeFeature.sites : 0) | (copies ? RuntimeFeature.stockCopies : 0) |
    (fills ? RuntimeFeature.fills : 0) | (group ? RuntimeFeature.machineGroups : 0)
  return { abi, sites, copies, fills, features }
}
/** The manifest and fetched header must agree before anything is staged, including retained Undo packages. */
function checkPackage(entry: RuntimePackage, data: Uint8Array, id: string, variant?: MachineVariant) {
  const fail = () => { throw invalidPackage() }, want = requirements(entry, !!variant)
  if (data.length !== entry.bytes || sha(data) !== entry.sha256 || data.length < 68) fail()
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), abi = view.getUint16(4)
  const header = abi === 8 ? 76 : abi === 7 ? 72 : 68
  if (view.getUint32(0) !== 0x4d57524d || abi !== want.abi || data.length < header ||
      view.getUint32(28) !== Number.parseInt(runtimeId(id), 16) || view.getUint32(24) !== want.sites ||
      (abi >= 7 ? view.getUint32(68) : 0) !== want.copies || (abi === 8 ? view.getUint32(72) : 0) !== want.fills) fail()
  const flags = view.getUint16(6), image = view.getUint32(8), bss = view.getUint32(12), relocations = view.getUint32(16), hooks = view.getUint32(20)
  // Hooks 0-3 are the core handlers; an ABI 8 package that subscribes to the base's site events (feature 128) adds one
  // word per event of sdk/machines/octatrack/events.json after them: its order in the top byte, its handler below.
  const subscriber = abi === 8 && (want.features & RuntimeFeature.siteEvents) !== 0
  if (flags & ~(abi === 8 ? 7 : 3) || image + bss > 131072 || relocations > 2048 || hooks > (subscriber ? 4 + SITE_EVENTS : 4) ||
      view.getUint32(32) > 4096 || view.getUint16(36) > 256 || header + 4 * hooks + image + 4 * relocations > data.length) fail()
  if (variant) {
    const mask = variant.members.reduce((value, member) => value | MACHINE_BITS[member.id], 0), start = header + 4 * hooks
    if (flags !== 4 || bss || hooks || view.getUint32(32) || image < 16 || view.getUint16(66) !== variant.layout ||
        view.getUint32(start) !== 0x4d574d47 || data[start + 4] !== 1 || data[start + 5] !== mask ||
        data.subarray(start + 6, start + 16).some(byte => byte !== 0)) fail()
  } else if (flags & 4) fail() // a group cannot masquerade as one ordinary module
  const imageStart = header + 4 * hooks, imageRelocations: number[] = [], changedSpans: [number, number][] = []
  const overlaps = (start: number, size: number, spans: [number, number][]) => spans.some(([at, length]) => start < at + length && at < start + size)
  let subscribed = false
  for (let i = 0; i < hooks; i++) {
    const hook = view.getUint32(header + 4 * i), handler = i < 4 ? hook : hook & 0xffffff
    if (hook !== 0xffffffff && (handler >= image || handler % 2)) fail()
    subscribed ||= i >= 4 && hook !== 0xffffffff
    if (i < 4 || hook === 0xffffffff) continue
    // As the loader: a raise asks for the base's entry in a zero 4-byte slot of the image, only on a raised event; a
    // take event's word points at a whole {claims, entry} record, a table's at a whole record of the table's size.
    const { kind, record } = SITE_KINDS[i - 4] ?? fail(), at = header + 4 * hooks + handler
    if (hook >>> 24 === RAISE ? kind !== 'raise' || handler + 4 > image || data.subarray(at, at + 4).some(byte => byte !== 0) :
      handler + (kind === 'take' ? TAKE_RECORD : kind === 'table' ? record : 0) > image) fail()
  }
  if (subscribed !== subscriber) fail() // the manifest names the base feature its subscriptions need
  for (let i = 0; i < relocations; i++) {
    const at = view.getUint32(imageStart + image + 4 * i)
    if (at % 2 || at + 4 > image || (abi >= 7 ? i > 0 && at < imageRelocations[i - 1] + 4 :
      view.getUint32(imageStart + at) >= image + bss || overlaps(at, 4, imageRelocations.map(offset => [offset, 4])))) fail()
    imageRelocations.push(at)
  }
  let end = imageStart + image + 4 * relocations
  const sites: [number, number][] = []
  for (let i = 0; i < want.sites; i++) {
    if (end + 8 > data.length) fail()
    const address = view.getUint32(end), bytes = abi >= 7 ? view.getUint8(end + 4) : view.getUint16(end + 4)
    const keep = abi >= 7 ? view.getUint8(end + 5) : 0, checked = abi >= 7 ? view.getUint8(end + 6) : bytes
    const local = abi >= 7 ? view.getUint8(end + 7) : view.getUint16(end + 6), held = abi >= 7 ? 32 : bytes
    const length = 8 + held + bytes + 2 * local
    if (!bytes || bytes > 32 || address % 2 || bytes % 2 || address + Math.max(bytes, checked) > 0x100000000 ||
        !checked || checked > 32 || keep > Math.min(bytes, checked) || local > 8 || end + length > data.length || overlaps(address, bytes, sites)) fail()
    const relocated: [number, number][] = []
    for (let j = 0; j < local; j++) {
      const at = view.getUint16(end + 8 + held + bytes + 2 * j)
      if (at % 2 || at < keep || at + 4 > bytes || overlaps(at, 4, relocated) || view.getUint32(end + 8 + held + at) >= image + bss) fail()
      relocated.push([at, 4])
    }
    sites.push([address, bytes]); end += length
  }
  function reconstructed(offset: number, bytes: number) {
    if (!bytes || offset + bytes > image) fail()
    if (abi === 8) {
      if (data.subarray(imageStart + offset, imageStart + offset + bytes).some(byte => byte !== 0) ||
          overlaps(offset, bytes, changedSpans) || overlaps(offset, bytes, imageRelocations.map(at => [at, 4]))) fail()
      changedSpans.push([offset, bytes])
    }
  }
  for (let i = 0; i < want.copies; i++) {
    if (end + 44 > data.length) fail()
    const offset = view.getUint32(end), address = view.getUint32(end + 4), bytes = view.getUint16(end + 8)
    if (bytes > 32 || view.getUint16(end + 10) || address + bytes > 0x100000000) fail()
    reconstructed(offset, bytes); end += 44
  }
  for (let i = 0; i < want.fills; i++) {
    if (end + 12 > data.length || !data[end + 8] || data.subarray(end + 9, end + 12).some(byte => byte !== 0)) fail()
    reconstructed(view.getUint32(end), view.getUint32(end + 4)); end += 12
  }
  const dspWords = view.getUint32(32), dspRelocations = view.getUint16(36)
  if (end + 4 * dspWords + 2 * dspRelocations !== data.length || (!dspWords && dspRelocations) ||
      (dspWords && (view.getUint16(40) >= dspWords || view.getUint16(42) >= dspWords || !data[39] || data[39] > 3))) fail()
  for (let i = 0; i < dspWords; i++) if (view.getUint32(end + 4 * i) > 0xffffff) fail()
  let previous = -1
  for (let i = 0; i < dspRelocations; i++) {
    const at = view.getUint16(end + 4 * dspWords + 2 * i)
    if (at >= dspWords || at <= previous || view.getUint32(end + 4 * at) >= dspWords) fail()
    previous = at
  }
}

/** Expand known machine groups for display, while planning replacements from their exact inventory layouts. */
export function createRuntimeCatalogue(document: RuntimePackageManifest) {
  const published = new Map(document.packages.map(entry => [entry.id, entry]))
  const publishedIds = new Set(document.packages.map(entry => runtimeId(entry.id)))
  if (published.size !== document.packages.length || publishedIds.size !== published.size) throw invalidPackage()
  for (const entry of published.values()) requirements(entry)
  const groups = document.groups ?? [], byGroup = new Map(groups.map(group => [runtimeId(group.id), group]))
  if (groups.some(group => publishedIds.has(runtimeId(group.id)))) throw invalidPackage()
  const members = new Set(groups.flatMap(group => group.variants.flatMap(variant => variant.members.map(member => member.id))))
  const selectionKey = (ids: readonly string[]) => [...ids].sort().join(',')
  if (byGroup.size !== groups.length || new Set(groups.flatMap(group => [...new Set(group.variants.flatMap(variant => variant.members.map(member => member.id)))])).size !== groups.reduce((n, group) => n + new Set(group.variants.flatMap(variant => variant.members.map(member => member.id))).size, 0))
    throw new ModuleSetError('The site’s machine packages claim overlapping members.')
  for (const group of groups) {
    const layouts = new Set<number>(), current = new Set<string>()
    for (const variant of group.variants) {
      const key = selectionKey(variant.members.map(member => member.id))
      if (!Number.isInteger(variant.layout) || variant.layout < 1 || variant.layout > 65535 || layouts.has(variant.layout) || variant.current && current.has(key) || !variant.members.length || new Set(variant.members.map(member => member.id)).size !== variant.members.length)
        throw new ModuleSetError('The site’s machine package list is inconsistent.')
      if (variant.members.some(member => !MACHINE_BITS[member.id] || !member.version)) throw invalidPackage()
      requirements(variant, true)
      layouts.add(variant.layout); if (variant.current) current.add(key)
    }
  }
  // USB Audio comes with the base once the base is published in its layouts (base-variants.ts), not as a package.
  const ids = [...new Set([...published.keys(), ...groups.flatMap(group => group.variants.filter(variant => variant.current).flatMap(variant => variant.members.map(member => member.id))),
    ...(Object.keys((baseBinding as { variants?: object }).variants ?? {}).length > 1 ? [USB_AUDIO_MODULE] : [])])]
  const name = (id: string) => published.get(id)?.name ?? MODULES.find(module => module.id === id)?.name ?? id
  type Step = { id: string; name: string; add?: RuntimePackage; undo?: RuntimePackage; group?: boolean }
  function plan(target: InventoryTarget, current: Inventory) {
    const changes = inventoryChanges(current, target)
    if (changes.stockOff.length || changes.stockOn.length)
      throw new ModuleSetError('The Octatrack can’t take stock effects out of its menus over USB yet. Keep every stock effect in this module set to sync it.')
    const unpublished = changes.add.filter(id => !ids.includes(id))
    if (unpublished.length) throw new ModuleSetError(`${list(unpublished.map(name))} can’t be loaded over USB yet. Download the .bin for the card instead.`)
    const steps: Step[] = [], updates: string[] = []
    for (const group of groups) {
      const groupMembers = new Set(group.variants.flatMap(variant => variant.members.map(member => member.id)))
      const wanted = target.moduleIds.filter(id => groupMembers.has(id))
      const records = current.runtimeGroups?.filter(item => item.id === group.id) ?? []
      if (records.length > 1) throw new ModuleSetError('The Octatrack reported more than one copy of its machine package. Reconnect and read it again.')
      const record = records[0], previous = group.variants.find(variant => variant.layout === record?.layout)
      if (record && !previous) {
        if (wanted.length || !target.moduleIds.includes(runtimeId(group.id)))
          throw new ModuleSetError('This site doesn’t have the machine package currently on your Octatrack, so it can’t safely replace it or undo that change.')
        continue
      }
      const next = wanted.length ? group.variants.find(variant => variant.current && selectionKey(variant.members.map(member => member.id)) === selectionKey(wanted)) : undefined
      if (wanted.length && !next) throw new ModuleSetError(`${list(wanted.map(name))} don’t have a verified USB package for this combination yet.`)
      if (previous && previous.layout === next?.layout) continue
      if (next) updates.push(...wanted.filter(id => current.moduleIds.includes(id)))
      if (next || previous) steps.push({ id: group.id, name: group.name, add: next, undo: previous, group: true })
    }
    const inGroup = (id: string) => members.has(id) && current.runtimeGroups?.some(record => groups.find(group => group.id === record.id)?.variants.find(variant => variant.layout === record.layout)?.members.some(member => member.id === id))
    // Older individual machine inventories do not retain a verified package identity for exact Undo.
    const removals = changes.remove.filter(id => !inGroup(id) && !byGroup.has(id))
    for (const id of current.moduleIds) if (members.has(id) && !inGroup(id) && target.moduleIds.includes(id)) removals.push(id)
    if (removals.some(id => members.has(id)))
      throw new ModuleSetError('This site can’t identify the exact individual machine package on your Octatrack, so it can’t safely replace it or undo that change.')
    const added = changes.add.filter(id => !members.has(id))
    return { updates, steps: [
      ...[...new Set(removals)].map(id => ({ id, name: name(id), undo: published.get(id) })),
      ...steps.filter(step => !step.add),
      ...steps.filter(step => step.add),
      ...added.map(id => ({ id, name: name(id), add: published.get(id) })),
    ] as Step[] }
  }
  function requireBase(steps: Step[], capabilities?: RuntimeCapabilities, base?: string) {
    for (const step of steps) for (const entry of [step.add, step.undo]) {
      if (!entry) continue
      // A published package bound to the published base (sdk/machines/octatrack/base-binding.json) needs that base in any
      // of its USB Audio layouts, which share every address the package links against: an older base is an update.
      if (entry.requiredBase === baseBinding.identity ? !isPublishedBase(base) : entry.requiredBase && entry.requiredBase !== base)
        throw entry.requiredBase === baseBinding.identity ? new BaseUpdateRequired() :
          new ModuleSetError('This module package needs the exact Modwerk base it was prepared for. Reconnect that base before syncing.')
      const { abi, features, sites, copies } = requirements(entry, step.group)
      if ((!capabilities && (abi > 6 || features)) || capabilities && (abi > capabilities.abi || (features & capabilities.features) !== features || sites > capabilities.maxSites || copies > capabilities.maxCopies))
        throw new BaseUpdateRequired()
    }
  }
  const inventory = (modules: MissingModule[]): Inventory => {
    const moduleIds: string[] = [], runtimeGroups: NonNullable<Inventory['runtimeGroups']> = []
    for (const item of modules) {
      const group = byGroup.get(item.module), variant = group?.variants.find(variant => variant.layout === item.layout)
      if (group) runtimeGroups.push({ id: group.id, layout: item.layout })
      moduleIds.push(...variant ? variant.members.map(member => member.id) : [BY_RUNTIME_ID.get(item.module) ?? item.module])
    }
    if (new Set(moduleIds).size !== moduleIds.length) throw new ModuleSetError('The Octatrack’s module list contains overlapping machine packages. Reconnect and read it again.')
    return { moduleIds, removedStockFx: [], ...runtimeGroups.length ? { runtimeGroups } : {} }
  }
  /** The base layout the set needs, when the connected base runs another (or isn't a published base at all). */
  function requireLayout(target: InventoryTarget, base?: string) {
    const layout = setLayout(target)
    if (layout === undefined || base === undefined || baseLayout(base) === layout) return
    throw layoutIdentity(layout) ? new BaseLayoutRequired(layout) : new ModuleSetError(`${layoutName(layout)} can’t be installed over USB yet. Download the .bin for the card instead.`)
  }
  function review(full: InventoryTarget, current: Inventory, capabilities?: RuntimeCapabilities, base?: string) {
    const target = packagedTarget(full), changes = inventoryChanges(current, target)
    let updates: string[] = [], needsSync = !!(changes.add.length + changes.remove.length + changes.stockOff.length + changes.stockOn.length)
    try {
      const planned = plan(target, current)
      updates = planned.updates; needsSync = planned.steps.length > 0
      requireBase(planned.steps, capabilities, base)
      requireLayout(full, base)
      return { changes, updates, needsSync, problem: undefined as ModuleSetError | undefined }
    } catch (error) {
      if (!(error instanceof ModuleSetError)) throw error
      return { changes, updates, needsSync: needsSync || error instanceof BaseLayoutRequired, problem: error }
    }
  }
  return {
    ids, inventory, review,
    problem: (target: InventoryTarget, current: Inventory, capabilities?: RuntimeCapabilities, base?: string) => review(target, current, capabilities, base).problem,
    async prepare(full: InventoryTarget, current: Inventory, load = fetchPackage, capabilities?: RuntimeCapabilities, base?: string): Promise<{ name: string; changes: SetChange[] }> {
      const target = packagedTarget(full), { steps } = plan(target, current); requireBase(steps, capabilities, base); requireLayout(full, base)
      // Fetch and verify every forward and rollback package before the first write to the unit.
      const packages = new Map<RuntimePackage, Uint8Array>()
      await Promise.all(steps.flatMap(step => [step.add, step.undo].filter((entry): entry is RuntimePackage => !!entry).map(async entry => {
        const data = await load(entry)
        checkPackage(entry, data, step.id, step.group ? entry as MachineVariant : undefined)
        packages.set(entry, data)
      })))
      return { name: target.name, changes: steps.map(step => ({ module: step.name, data: step.add ? packages.get(step.add)! : removalPackage(step.id),
        undo: step.undo ? packages.get(step.undo)! : step.add ? removalPackage(step.id) : undefined })) }
    },
  }
}

const catalogue = createRuntimeCatalogue(manifest)
/** Only modules with an actually published package or reviewed current group variant are USB-selectable, and USB
 * Audio once the base is published in its layouts. */
export const USB_MODULE_IDS = catalogue.ids
export const inventoryFrom = catalogue.inventory
export const moduleSetProblem = catalogue.problem
export const moduleSetReview = catalogue.review
export const prepareModuleSet = catalogue.prepare

/** The link's builder and inventory for the site's checkout card. */
export function moduleSetKit(link: OctatrackLink) {
  const readInventory = async () => {
    const modules = await link.inventory()
    // Only a base that doesn't know INVENTORY lands here; couldn't-ask-now rejects with LinkBusyError, which callers retry.
    if (!modules) throw new ModuleSetError('This Octatrack’s base doesn’t list its modules. Install the latest Modwerk base, then try again.')
    return inventoryFrom(modules)
  }
  return { readInventory, prepareUpdate: async (target: InventoryTarget) => {
    const inventory = await readInventory(), identity = link.getState().identity
    return prepareModuleSet(target, inventory, fetchPackage, identity?.capabilities, identity?.base)
  } }
}

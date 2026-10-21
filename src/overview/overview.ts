// The landing page's numbers: every machine in the registry with its modules, creators and research progress.
// Counts come from the same catalogue the library shows, so the overview and the sidebar never disagree.
import { DEVICES, DEVICE_STEPS, deviceHref, type DeviceProfile } from '../devices/registry'
import { DIGI_MODS, type DigiMod } from '../devices/digi-mods'
import { LIBRARY_CATEGORIES, LIBRARY_CATEGORY_LABELS, type FirmwareModule, type ModuleCategory } from '../catalog/modules'
import { compareModules } from '../community/module-statistics'

export type OverviewKind = 'mods' | 'research' | 'open'
export type OverviewMachine = {
  device: DeviceProfile
  kind: OverviewKind
  count: number
  categories: { category: ModuleCategory; label: string; count: number }[]
  creators: number
  // Module names, most recently updated first.
  recent: string[]
  stepsDone: number
  // The first research step that is not done yet; absent once a machine has mods.
  next?: { title: string; started: boolean }
  // A core with hooks is done, so the next step is the first mod itself.
  coreReady: boolean
  href: string
  // Start developing with this machine already chosen.
  developHref: string
}
export type Overview = {
  machines: OverviewMachine[]
  modules: number
  creators: number
  withMods: number
  withoutMods: number
  // Modules by category across every machine, largest first: the key to the colour bars.
  categories: { category: ModuleCategory; label: string; count: number }[]
}

type Entry = { id: string; name: string; category: ModuleCategory; creator: string; authorName: string; addedAt?: string; updatedAt?: string }

const KIND_ORDER: Record<OverviewKind, number> = { mods: 0, research: 1, open: 2 }

export function developHref(machine: string) { return '#submit?machine=' + machine }

// How simple building a module is, said as the steps rather than as a promise about the reader. It holds for a machine
// with a core; unlocking a machine (understanding, rebuilding and booting its firmware, then a core) is reverse engineering
// and needs programming experience.
export const DEVELOP_PITCH = 'Describe your idea, paste the starter prompt into Claude or ChatGPT, and build the module together with the coding assistant, step by step.'
export const UNLOCK_NOTE = 'Unlocking a machine is reverse engineering and needs programming experience. Once it has a core, its modules start from the same starter prompt as every other.'

export function machineOverview(octatrack: readonly FirmwareModule[], digi: readonly DigiMod[] = DIGI_MODS): Overview {
  const entries = (device: DeviceProfile): Entry[] => [
    ...(device.id === 'octatrack' ? octatrack.map(module => ({ id: module.id, name: module.name, category: module.category, creator: module.author.toLowerCase(), authorName: module.authorName, addedAt: module.addedAt, updatedAt: module.updatedAt })) : []),
    ...digi.filter(mod => mod.device === device.id).map(mod => ({ id: mod.device + '-' + mod.id, name: mod.title, category: mod.libraryCategory, creator: (mod.authorLogin ?? mod.author).toLowerCase(), authorName: mod.author, updatedAt: mod.updatedAt })),
  ]
  const machines = DEVICES.map((device, order) => {
    const modules = entries(device)
    const steps = DEVICE_STEPS.map(step => ({ title: step.title, state: device.steps[step.id] }))
    const next = steps.find(step => step.state !== 'done')
    const kind: OverviewKind = modules.length ? 'mods' : device.status === 'open' ? 'open' : 'research'
    return { order, started: steps.filter(step => step.state === 'started').length, machine: {
      device, kind, count: modules.length,
      categories: LIBRARY_CATEGORIES.map(category => ({ category, label: LIBRARY_CATEGORY_LABELS[category], count: modules.filter(module => module.category === category).length })).filter(item => item.count).sort((a, b) => b.count - a.count),
      creators: new Set(modules.map(module => module.creator)).size,
      recent: [...modules].sort((a, b) => compareModules(a, b, 'updated', null)).map(module => module.name),
      stepsDone: steps.filter(step => step.state === 'done').length,
      next: modules.length || !next ? undefined : { title: next.title, started: next.state === 'started' },
      coreReady: device.steps.core === 'done',
      href: deviceHref(device.id), developHref: developHref(device.id),
    } satisfies OverviewMachine }
  })
  // Machines with mods by size, then the ones closest to a first mod, then the unexplored ones in registry order.
  machines.sort((a, b) => KIND_ORDER[a.machine.kind] - KIND_ORDER[b.machine.kind]
    || (a.machine.kind === 'mods' ? b.machine.count - a.machine.count : a.machine.kind === 'research' ? b.machine.stepsDone - a.machine.stepsDone || b.started - a.started : 0)
    || a.order - b.order)
  const all = machines.map(item => item.machine)
  const waiting = all.filter(machine => !machine.count)
  return {
    machines: all,
    modules: all.reduce((sum, machine) => sum + machine.count, 0),
    creators: new Set(DEVICES.flatMap(device => entries(device).map(module => module.creator))).size,
    withMods: all.length - waiting.length,
    withoutMods: waiting.length,
    categories: LIBRARY_CATEGORIES.map(category => ({ category, label: LIBRARY_CATEGORY_LABELS[category], count: all.reduce((sum, machine) => sum + (machine.categories.find(item => item.category === category)?.count ?? 0), 0) })).filter(item => item.count).sort((a, b) => b.count - a.count),
  }
}

// The Start developing highlight in the sidebar and phone menu is temporary: it turns back into a plain link after this day.
export const DEVELOP_HIGHLIGHT_UNTIL = '2027-01-31'
export function developHighlight(now = new Date()) { return now.toISOString().slice(0, 10) <= DEVELOP_HIGHLIGHT_UNTIL }

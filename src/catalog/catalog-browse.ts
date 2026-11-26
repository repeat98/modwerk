import { listedModules } from './availability'
import { LIBRARY_CATEGORIES } from './modules'
import { DIGI_MODS, isDigiDevice } from '../devices/digi-mods'
import { DEVICES_BY_ID, deviceHref } from '../devices/registry'
import { currentLibraryRoute, moduleHref } from '../routing'
import { MODULE_SORT_VALUES } from '../community/module-statistics'

export type CatalogBrowse = { route: string; query: string; family: string; sort: string; ids: readonly string[] }
const STORAGE_KEY = 'modwerk.catalog-browse'
const sorts = MODULE_SORT_VALUES

function validLibraryRoute(route: string) {
  if (route === 'library' || LIBRARY_CATEGORIES.includes(route as typeof LIBRARY_CATEGORIES[number])) return true
  const [machine, category, extra] = route.split('/')
  return (machine === 'all' || isDigiDevice(machine)) && !extra && (!category || LIBRARY_CATEGORIES.includes(category as typeof LIBRARY_CATEGORIES[number]))
}

function target(id: string, betaAccess = false) {
  const module = listedModules(betaAccess).find(module => module.id === id)
  if (module) return { id, name: module.name, href: moduleHref(id) }
  const mod = DIGI_MODS.find(mod => mod.device + '-' + mod.id === id)
  return mod ? { id, name: mod.title + ' · ' + DEVICES_BY_ID[mod.device].name, href: deviceHref(mod.device, 'module/' + mod.id) } : undefined
}

export function parseCatalogBrowse(json: string | null, betaAccess = false): CatalogBrowse | null {
  try {
    const value = JSON.parse(json ?? 'null')
    if (!value || typeof value.route !== 'string'
      || typeof value.query !== 'string' || typeof value.family !== 'string' || !sorts.includes(value.sort)
      || !Array.isArray(value.ids) || value.ids.length > 256 || !value.ids.every((id: unknown) => typeof id === 'string')) return null
    const route = currentLibraryRoute(value.route)
    if (!validLibraryRoute(route)) return null
    // A previously browsed module may have been removed or paused since this tab was opened.
    const ids = [...new Set<string>(value.ids)].filter(id => target(id, betaAccess))
    return { route, query: value.query, family: value.family, sort: value.sort, ids }
  } catch { return null }
}

export function readCatalogBrowse(betaAccess = false): CatalogBrowse | null {
  try { return parseCatalogBrowse(sessionStorage.getItem(STORAGE_KEY), betaAccess) } catch { return null }
}

export function saveCatalogBrowse(browse: CatalogBrowse) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(browse)) } catch { /* Paging still works for this visit without browser storage. */ }
}

export function catalogNeighbors(browse: CatalogBrowse | null | undefined, id: string, betaAccess = false) {
  if (!browse) return null
  const entries = browse.ids.flatMap(id => { const entry = target(id, betaAccess); return entry ? [entry] : [] })
  const index = entries.findIndex(entry => entry.id === id)
  if (index < 0) return null
  return { previous: entries[index - 1], next: entries[index + 1], position: index + 1, total: entries.length, backHref: '#' + browse.route }
}

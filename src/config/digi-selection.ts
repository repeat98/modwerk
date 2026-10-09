import type { BuilderMachine } from '../engine/elekloader/protocol'
import { BUILDER_SOURCE } from '../engine/elekloader/machine-build'
import { DIGI_MODS, resolveDigiSelection } from '../devices/digi-mods'
import { cleanName, normalizeModuleVersions, type Configuration } from './workspace'

/** A JSON selection backup contains no stock file, local filename, account or build output. */
export function createDigiSelection(configuration: Pick<Configuration, 'name' | 'moduleIds' | 'moduleVersions'>, device: BuilderMachine) {
  return { app: 'modwerk', schemaVersion: 1, device, name: cleanName(configuration.name), catalog: { revision: BUILDER_SOURCE.catalogRevision },
    modules: resolveDigiSelection(device, configuration.moduleIds).map(module => ({ id: module.id, version: configuration.moduleVersions[module.id] ?? module.version })) }
}
export function downloadDigiSelection(configuration: Pick<Configuration, 'name' | 'moduleIds' | 'moduleVersions'>, device: BuilderMachine) {
  const backup = createDigiSelection(configuration, device)
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2) + '\n'], { type: 'application/json' })), link = document.createElement('a')
  link.href = url; link.download = (backup.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || device) + '.json'
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/** A backup to import: its name and modules, at the library's current versions, and what the page should tell the
 * owner about it. */
export type DigiImport = { name: string; moduleIds: string[]; moduleVersions: Record<string, string>; notes: string[] }

/** A backup made with another catalog revision still imports: each module is looked up again in the current library,
 * by id. Modules no longer there are left out, and the notes say so, with each version that changed. */
export function parseDigiSelection(text: string, device: BuilderMachine): DigiImport {
  if (new TextEncoder().encode(text).length > 32 * 1024) throw new Error('Configuration backups must be smaller than 32 KB.')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('This file is not valid configuration JSON.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose a Modwerk configuration backup.')
  const item = value as { app?: unknown; schemaVersion?: unknown; device?: unknown; name?: unknown; catalog?: { revision?: unknown }; modules?: { id?: unknown; version?: unknown }[] }
  if (Object.keys(item).some(key => !['app', 'schemaVersion', 'device', 'name', 'catalog', 'modules'].includes(key)) || item.app !== 'modwerk' || item.schemaVersion !== 1 || typeof item.name !== 'string' || !Array.isArray(item.modules) || item.modules.length > 100 || item.modules.some(module => !module || typeof module.id !== 'string' || typeof module.version !== 'string')) throw new Error('Choose a Modwerk configuration backup.')
  if (item.device !== device) throw new Error('This backup belongs to a different machine. Open its configuration page to import it.')
  const revision = item.catalog?.revision
  if (typeof revision !== 'string' || !/^[\w.-]{1,64}$/.test(revision)) throw new Error('Choose a Modwerk configuration backup.')
  const saved = item.modules as { id: string; version: string }[], current = revision === BUILDER_SOURCE.catalogRevision
  const library = DIGI_MODS.filter(mod => mod.device === device)
  // with the current catalog an unknown module means an altered backup; with another, a module that has left the library
  const gone = current ? [] : saved.filter(module => !library.some(mod => mod.id === module.id)).map(module => module.id)
  const moduleIds = resolveDigiSelection(device, saved.map(module => module.id).filter(id => !gone.includes(id))).map(module => module.id)
  if (!moduleIds.length && gone.length) throw new Error('None of this backup’s modules are in the library any more: ' + gone.join(', ') + '.')
  const versions = Object.fromEntries(saved.filter(module => moduleIds.includes(module.id)).map(module => [module.id, module.version]))
  const moduleVersions = normalizeModuleVersions(moduleIds, versions, device)
  const notes: string[] = []
  if (!current) {
    const changed = moduleIds.filter(id => versions[id] !== moduleVersions[id])
    notes.push('This backup was made with module catalog ' + revision.slice(0, 7) + '; Modwerk now uses ' + BUILDER_SOURCE.catalogRevision.slice(0, 7) + '. Its modules were checked against the current library.')
    for (const id of gone) notes.push(id + ' is no longer in the library and was left out.')
    for (const id of changed) notes.push(library.find(mod => mod.id === id)!.title + ': ' + versions[id] + ' in the backup, ' + moduleVersions[id] + ' now.')
    if (!gone.length && !changed.length) notes.push('Every module is still in the library, at the same version.')
  }
  return { name: cleanName(item.name), moduleIds, moduleVersions, notes }
}

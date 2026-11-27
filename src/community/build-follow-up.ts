import { communityModule } from './modules'
import type { DownloadedBuild } from './hardware-feedback'
import type { WorkspaceReportContext } from './report-context'

/** A module in a downloaded build, named by its community ID so it maps to one home thread. */
export type BuiltModule = { id: string; name: string; version: string }

/** The catalog modules in a build, with the versions the build used where it reports them. Unknown IDs are dropped. */
export function builtModules(ids: readonly string[], versions: Readonly<Record<string, string>> = {}): BuiltModule[] {
  return ids.flatMap(id => {
    const module = communityModule(id)
    return module ? [{ id: module.id, name: module.name, version: versions[module.moduleId] ?? module.version }] : []
  })
}

/** The one-click hardware report keeps the unit, OS and full downloaded build context. */
export function hardwareReportBody(machine: string, os: string, module: BuiltModule, build: readonly BuiltModule[]) {
  const others = build.filter(item => item.id !== module.id)
  const summary = '**Works on my ' + machine + '**' + (os ? ' (OS ' + os + ')' : '') + ' · ' + module.name + ' ' + module.version
    + (others.length ? ', built together with ' + others.map(item => item.name + ' ' + item.version).join(', ') : '') + '.'
  return summary
}

/** The machine a downloaded build is for, read from its modules: device names repeat across models (Analog Rytm). */
export const downloadedMachine = (build: DownloadedBuild) => build.modules.map(item => communityModule(item.id)?.machine).find(Boolean)

/** The downloaded versions remain the report context even if the active configuration changed since downloading. */
export function downloadedReportContext(build: DownloadedBuild): WorkspaceReportContext {
  const modules = build.modules.flatMap(item => {
    const module = communityModule(item.id)
    return module ? [{ id: module.moduleId, version: item.version }] : []
  })
  return { configurationName: 'Downloaded build', modules, keepStockFx2: null, build: '', activeId: 'downloaded-build', configurations: [{ id: 'downloaded-build', name: 'Downloaded build', modules, keepStockFx2: null }] }
}

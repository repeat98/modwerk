import compiled from './assets/module-build.json' with { type: 'json' }
import { CATALOG_SOURCE, MODULES } from '../catalog/modules.ts'
import { moduleBuildPending } from '../catalog/build-support.ts'
import { moduleCardless } from '../catalog/usb-only.ts'

export type CompiledSource = { sourceCommit: string | null; sourceTreeSha256: string; moduleVersions: Record<string,string> }
export function validateCompiledModules(record: CompiledSource, modules: readonly { id: string; version: string }[] = MODULES.filter(module=>!moduleBuildPending(module.id)&&!moduleCardless(module.id))) {
  if (record.sourceCommit !== null && !/^[a-f0-9]{40}$/.test(record.sourceCommit) || !/^[a-f0-9]{64}$/.test(record.sourceTreeSha256)) throw new Error('The compiled module source identity is invalid.')
  if (Object.keys(record.moduleVersions).length !== modules.length || modules.some(module => record.moduleVersions[module.id] !== module.version)) throw new Error('Compiled module versions differ from the catalog. Rebuild the approved source before composing firmware.')
}
export function compiledModuleSource() {
  if (compiled.schemaVersion !== 1 || compiled.kind !== 'source-packages' || compiled.nativeRevision !== CATALOG_SOURCE.revision) throw new Error('The source build does not match the native composition profile.')
  validateCompiledModules(compiled)
  return { sourceCommit: compiled.sourceCommit, sourceTreeSha256: compiled.sourceTreeSha256, moduleVersions: compiled.moduleVersions }
}
export function validateCompiledPackage(id: string, version: unknown) {
  if (moduleBuildPending(id)) throw new Error('This module is awaiting Octamod build verification.')
  const module = MODULES.find(module => module.id === id)
  if (!module || module.version !== version) throw new Error('The compiled package version differs from its module catalog entry.')
}

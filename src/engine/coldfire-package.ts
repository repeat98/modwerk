import { validateCompiledPackage } from './module-build.ts'
import { CATALOG_SOURCE, MODULES } from '../catalog/modules.ts'
import packages from './assets/coldfire-packages.json' with { type: 'json' }
import { parseColdFireObject } from './coldfire-elf.ts'
export const PLATFORM_UNITS = ['dltransfer','dlhooks','dlselection','dlallocator','dlpublication','dlpublishhooks','dlpreflight','dlbuffers','dlmanager'] as const
/** Units a module lets join the DRAM runtime when another selected module carries one (placement.json). */
export function joiningUnits(moduleId: string): string[] {
  return packages.packages.filter(pkg => pkg.moduleId === moduleId && (pkg as { joinRuntime?: boolean }).joinRuntime === true).map(pkg => pkg.label)
}
export async function readColdFirePackage(label: string) {
  if (packages.schema !== 1 || packages.revision !== CATALOG_SOURCE.revision) throw new Error('ColdFire packages do not match the pinned catalog.')
  const pkg = packages.packages.find(pkg => pkg.label === label)
  if (!pkg || !pkg.dram || pkg.cpu !== '54455') throw new Error('This ColdFire unit needs a different native placement path.')
  const module = MODULES.find(module => module.id === pkg.moduleId)
  const platform = pkg.moduleId === 'dsp-dynload-stock' && pkg.key === 'DSP DYNLOAD STOCK' && pkg.author === 'repeat98' && PLATFORM_UNITS.some(unit => unit === pkg.label)
  if (!platform && (!module || module.author !== pkg.author || module.key !== pkg.key)) throw new Error('ColdFire package attribution does not match its catalog entry.')
  if (!platform) validateCompiledPackage(pkg.moduleId, pkg.version)
  if (!Number.isInteger(pkg.bytes) || pkg.bytes < 52 || pkg.bytes > 8 * 1024 * 1024 || pkg.code.length !== pkg.bytes * 2 || !/^[0-9a-f]+$/.test(pkg.code)) throw new Error('The ColdFire package has invalid object bytes.')
  const bytes = Uint8Array.from({ length: pkg.bytes }, (_, i) => parseInt(pkg.code.slice(i * 2, i * 2 + 2), 16))
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer)
  const sha = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (sha !== pkg.sha256) throw new Error('The ColdFire object checksum does not match.')
  return { label: pkg.label, object: parseColdFireObject(bytes) }
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseModuleChangelogs } from '../src/community/module-changelogs.ts'

/** Metadata-only gate: no firmware, package compilation or module execution. */
export function checkModuleChangelogs(root) {
  const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
  const octatrack = read('src/catalog/module-documents.json').modules
  const machines = read('src/catalog/machine-modules.json').modules
  const sdk = read('sdk/catalog.json').modules
  const catalog = [
    ...octatrack.map(module => ({ id: module.id, version: module.version })),
    ...machines.map(module => ({ id: module.machine + '-' + module.id, version: module.version })),
  ]
  // Draft SDK entries need valid notes before qualification can generate the public catalog.
  // Published IDs remain authoritative; source entries cannot override their release versions.
  for (const module of sdk) {
    if (!catalog.some(entry => entry.id === module.id)) {
      catalog.push({ id: module.id, version: module.version })
    }
  }
  const notes = parseModuleChangelogs(read('src/community/module-changelogs.json'), catalog)
  return { modules: catalog.length, releases: Object.values(notes).reduce((count, entries) => count + entries.length, 0) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = checkModuleChangelogs(fileURLToPath(new URL('../', import.meta.url)))
    console.log(`Module changelogs: ${result.modules} modules, ${result.releases} releases`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

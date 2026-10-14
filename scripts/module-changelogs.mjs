import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NOTES = 'src/community/module-changelogs'

/** Combines the per-module notes in src/community/module-changelogs/<id>.json into the generated, uncommitted
 * src/community/module-changelogs.json the app and Worker import. One file per module keeps module PRs apart. */
export function writeModuleChangelogs(root) {
  const modules = {}
  for (const name of readdirSync(join(root, NOTES)).filter(name => !name.startsWith('.')).sort()) {
    if (!name.endsWith('.json')) throw new Error(NOTES + '/' + name + ': release notes are <module id>.json files')
    modules[name.slice(0, -'.json'.length)] = JSON.parse(readFileSync(join(root, NOTES, name), 'utf8'))
  }
  const text = JSON.stringify({ schemaVersion: 1, modules }, null, 2) + '\n', target = join(root, NOTES + '.json')
  if (readFileSync(target, { encoding: 'utf8', flag: 'a+' }) !== text) writeFileSync(target, text)
  return JSON.parse(text)
}

/** Metadata-only gate: no firmware, package compilation or module execution. */
export async function checkModuleChangelogs(root) {
  const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
  const octatrack = read('src/catalog/module-documents.json').modules
  const machines = read('src/catalog/machine-modules.json').modules
  const catalog = [
    ...octatrack.map(module => ({ id: module.id, version: module.version })),
    ...machines.map(module => ({ id: module.machine + '-' + module.id, version: module.version })),
  ]
  const data = writeModuleChangelogs(root)
  // Loaded only now: the parser's module imports the generated file written above.
  const { parseModuleChangelogs } = await import('../src/community/module-changelogs.ts')
  const notes = parseModuleChangelogs(data, catalog)
  return { modules: catalog.length, releases: Object.values(notes).reduce((count, entries) => count + entries.length, 0) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  try {
    if (process.argv.includes('--write')) writeModuleChangelogs(root)
    else {
      const result = await checkModuleChangelogs(root)
      console.log(`Module changelogs: ${result.modules} modules, ${result.releases} releases`)
    }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

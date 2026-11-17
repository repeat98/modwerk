import { execFileSync } from 'node:child_process'
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

/** A module's first release in the library has one entry, saying what players get: versions before it never reached them
 * (docs/ADD_A_MODULE.md#release-notes-required-for-every-fix-and-module-version). isNew says whether a key has no notes on the base. */
export function firstReleaseProblem(notes, isNew) {
  for (const [id, entries] of Object.entries(notes)) if (isNew(id) && entries.length > 1)
    return id + ' is new to the library, so ' + NOTES + '/' + id + '.json holds one entry, for v' + entries[0].version + ', saying what players get. Fold the notes of '
      + entries.slice(1).map(entry => 'v' + entry.version).join(', ') + ' into it: those versions never reached players.'
  return null
}

/** Metadata-only gate: no firmware, package compilation or module execution. With a base, also the first-release rule above. */
export async function checkModuleChangelogs(root, base = null) {
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
  const onBase = id => { try { execFileSync('git', ['cat-file', '-e', base + ':' + NOTES + '/' + id + '.json'], { cwd: root, stdio: 'ignore' }); return true } catch { return false } }
  const problem = base && firstReleaseProblem(notes, id => !onBase(id))
  if (problem) throw new Error(problem)
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

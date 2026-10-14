// Shared by retained evidence: the one definition of which package rows belong to
// other modules and so are not the retained module's inputs.
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

// Every catalog module other than the retained one, at the evidence commit or
// now. Their package rows and version labels are their own releases, qualified
// on their own; retained evidence freezes its module's package and shared code.
export async function otherModuleIds(root, document, commit) {
  const ids = new Set()
  const catalogs = [JSON.parse(await readFile(resolve(root, 'sdk/catalog.json'), 'utf8'))]
  if (commit) catalogs.push(JSON.parse(execFileSync('git', ['show', commit + ':sdk/catalog.json'], { cwd: root, maxBuffer: 32 * 1024 * 1024 }).toString('utf8')))
  for (const catalog of catalogs) for (const module of catalog.modules) ids.add(module.id)
  ids.delete(document.id)
  return [...ids]
}
export function engineAsset(bytes, path, document, previousVersion, addedIds = [], otherIds = []) {
  const value = JSON.parse(bytes.toString('utf8'))
  // Rebuilt package provenance and the version label change for editorial
  // releases. Preserve every byte, address, recipe, limit and test verdict.
  delete value.sourceCommit
  const omitted = [...new Set([...addedIds, ...otherIds])]
  for (const id of omitted) if (value.moduleVersions) delete value.moduleVersions[id]
  if (value.moduleVersions?.[document.id] === document.version) value.moduleVersions[document.id] = previousVersion
  if (path === 'src/engine/assets/module-build.json') {
    delete value.approval
    delete value.sourceTreeSha256
    if (addedIds.length) delete value.compilerSha256
    delete value.files // Derived file hashes; package payloads are checked below.
    // The release independently verifies and stamps owner approval. This
    // provenance changes on every release, without changing runtime inputs.
    delete value.approval
  }
  if (path === 'src/engine/assets/analog-bd-composition-proofs.json') {
    // Derived inventory identity changes with an editorial version label. The
    // native image hashes, placements and verdicts below remain protected.
    delete value.moduleSourceTreeSha256
  }
  function visit(item) {
    if (!item || typeof item !== 'object') return
    if ((item.id === document.id || item.moduleId === document.id) && item.version === document.version) item.version = previousVersion
    for (const [key, child] of Object.entries(item)) {
      if (Array.isArray(child)) item[key] = child.filter(row => !row || typeof row !== 'object' || !omitted.includes(row.moduleId ?? row.id) && !(Array.isArray(row.ids) && row.ids.some(id => omitted.includes(id))))
      visit(item[key])
    }
  }
  visit(value)
  return value
}

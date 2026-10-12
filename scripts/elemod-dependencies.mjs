// SPDX-License-Identifier: GPL-3.0-or-later
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseElemodDependency, parseElemodBuild } from '../src/catalog/module-contract-v3.ts'
import { resolveModuleFile } from '../src/catalog/module-folder.ts'

export async function loadElemodDependencies(root, machine) {
  const folderRoot = resolve(root, 'sdk', machine.id, 'dependencies'), result = new Map()
  const entries = await readdir(folderRoot, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Dependencies need regular source folders')
    const folder = resolve(folderRoot, entry.name)
    const document = parseElemodDependency(JSON.parse(await readFile(await resolveModuleFile(folder, 'dependency.json'), 'utf8')), machine)
    if (document.id !== entry.name) throw new Error('Dependency id must match its folder')
    const build = parseElemodBuild(JSON.parse(await readFile(await resolveModuleFile(folder, document.platform.build), 'utf8')), document)
    result.set(document.id, { folder, document, build })
  }
  return result
}

// Only explicitly required dependencies may supply tables/events. Check every OS port.
export function dependencyCollections(document, build, dependencies) {
  const tables = new Set(Object.keys(build.collections)), visited = new Set(), active = new Set()
  function visit(id) {
    if (id === 'core') return // the machine's core interface supplies its tables and events
    if (active.has(id)) throw new Error('Dependency cycle: ' + id)
    if (visited.has(id)) return
    const dependency = dependencies.get(id)
    if (!dependency) throw new Error('Missing source dependency: ' + id)
    if (document.compatibility.releases.some(release => !dependency.document.compatibility.releases.includes(release))) throw new Error('Dependency missing OS port: ' + id)
    active.add(id)
    for (const next of new Set([...dependency.document.compatibility.requires, ...dependency.build.requires])) visit(next)
    for (const table of Object.keys(dependency.build.collections)) tables.add(table)
    active.delete(id); visited.add(id)
  }
  for (const id of new Set([...document.compatibility.requires, ...build.requires])) visit(id)
  return tables
}

// SPDX-License-Identifier: GPL-3.0-or-later
// The Octatrack's modules live in sdk/octatrack/modules, as every other machine's live in sdk/<machine>/modules.
// octabam's tools (sdk/octabam/tools, kept as upstream wrote them) and Elekloader's reader of them look for a modules/
// folder beside tools/, and the reviewed recipes, the base's source list and the import records name files by that
// path. So a checkout carries sdk/octabam/modules as an untracked mirror of the real folder, which this makes and
// refreshes: `npm run prepare` runs it, and so does every command that builds or checks through octabam's tools.
// A copy and not a link, because manifests and adapters resolve their own path and refuse one that leaves sdk/octabam.
// Edit modules in sdk/octatrack/modules only: a file changed in the mirror is refused, never silently overwritten.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MODULES = 'sdk/octatrack/modules', MIRROR = 'sdk/octabam/modules', STAMP = 'sdk/octabam/.modules-mirror.json'
const skipped = name => name === '__pycache__' || name === '.DS_Store' || name.endsWith('.pyc')
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
function files(folder, prefix = '', found = new Map()) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (skipped(entry.name)) continue
    const path = prefix + entry.name
    if (entry.isDirectory()) files(resolve(folder, entry.name), path + '/', found)
    else if (entry.isFile()) found.set(path, sha(resolve(folder, entry.name)))
    else throw new Error('Not a regular file: ' + path)
  }
  return found
}

/** Makes the mirror equal to the modules folder. Returns how many files it wrote or removed. */
export function mirrorOctatrackModules(root) {
  const source = resolve(root, MODULES), mirror = resolve(root, MIRROR), stamp = resolve(root, STAMP)
  if (!existsSync(source)) throw new Error(MODULES + ' is missing: this checkout is incomplete.')
  let entry = null
  try { entry = lstatSync(mirror) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (entry?.isSymbolicLink()) { unlinkSync(mirror); entry = null }
  const wanted = files(source), present = entry ? files(mirror) : new Map()
  let written = {}
  try { written = JSON.parse(readFileSync(stamp, 'utf8')) } catch { /* no mirror was made here yet */ }
  // What the last run wrote and nobody touched may be replaced; so may a file that already equals the module's.
  const foreign = [...present].filter(([path, hash]) => written[path] !== hash && wanted.get(path) !== hash).map(([path]) => path)
  if (foreign.length) throw new Error(MIRROR + ' holds files that are not a copy of ' + MODULES + ' (' + foreign.slice(0, 3).join(', ') + (foreign.length > 3 ? ' and ' + (foreign.length - 3) + ' more' : '') +
    '). The modules moved to ' + MODULES + ': put your changes there, delete ' + MIRROR + ', then run npm run prepare again.')
  let changed = 0
  for (const path of present.keys()) if (!wanted.has(path)) { rmSync(resolve(mirror, path), { force: true }); changed++ }
  for (const [path, hash] of wanted) {
    if (present.get(path) === hash) continue
    mkdirSync(dirname(resolve(mirror, path)), { recursive: true })
    copyFileSync(resolve(source, path), resolve(mirror, path)); changed++
  }
  // Folders of modules that are gone (a staged draft, a removed module), bytecode caches included.
  if (existsSync(mirror)) for (const name of readdirSync(mirror)) if (!existsSync(resolve(source, name))) { rmSync(resolve(mirror, name), { recursive: true, force: true }); changed++ }
  mkdirSync(mirror, { recursive: true })
  writeFileSync(stamp, JSON.stringify(Object.fromEntries(wanted)))
  return changed
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = mirrorOctatrackModules(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  if (changed) console.log('Mirrored ' + MODULES + ' to ' + MIRROR + ' (' + changed + ' files)')
}

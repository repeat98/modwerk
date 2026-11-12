// SPDX-License-Identifier: GPL-3.0-or-later
// The Octatrack's modules live in sdk/octatrack/modules, as every other machine's live in sdk/<machine>/modules.
// octabam's tools (sdk/octabam/tools, kept as upstream wrote them) and Elekloader's reader of them look for a modules/
// folder beside tools/, and the reviewed recipes, the base's source list and the import records name files by that
// path. So a checkout carries sdk/octabam/modules as an untracked link to the real folder: a symbolic link, or a
// directory junction on Windows, which needs no special rights. `npm run prepare` makes it; nothing commits it.
import { existsSync, lstatSync, readlinkSync, readdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const MODULES = 'sdk/octatrack/modules', LINK = 'sdk/octabam/modules'
/** Makes the link if it is missing or points elsewhere. Returns what it did: 'kept', 'made' or 'remade'. */
export function linkOctatrackModules(root, platform = process.platform) {
  const target = resolve(root, MODULES), link = resolve(root, LINK)
  if (!existsSync(target)) throw new Error(MODULES + ' is missing: this checkout is incomplete.')
  let state = 'made'
  let entry = null
  try { entry = lstatSync(link) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (entry) {
    let points = null
    try { points = resolve(dirname(link), readlinkSync(link)) } catch { /* a real folder, handled below */ }
    if (points === target) return 'kept'
    if (points !== null) { unlinkSync(link); state = 'remade' }
    // A real folder here is a checkout from before the move. Empty folders (Git leaves them behind) go; files stay yours.
    else if (entry.isDirectory() && readdirSync(link, { recursive: true, withFileTypes: true }).every(item => item.isDirectory())) { rmSync(link, { recursive: true }); state = 'remade' }
    else throw new Error(LINK + ' holds files. The modules moved to ' + MODULES + ': move what is yours there, delete ' + LINK + ', then run npm run prepare again.')
  }
  if (platform === 'win32') symlinkSync(target, link, 'junction')
  else symlinkSync('../octatrack/modules', link, 'dir')
  return state
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const state = linkOctatrackModules(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  if (state !== 'kept') console.log('Linked ' + LINK + ' to ' + MODULES)
}

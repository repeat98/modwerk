// SPDX-License-Identifier: GPL-3.0-or-later
// A draft under sdk/drafts/<id> is checked and built where every gate and builder looks: a copy under sdk/octatrack/modules/<id>
// for the run, removed when the process ends (module:doctor --draft, module:dev). Nobody copies a draft there by hand and forgets it,
// and a symlink there is refused, because the gates read the folder and git would see the link.
import { cpSync, existsSync, lstatSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

export const draftFolder = (root, id) => resolve(root, 'sdk/drafts', id)
export const listedFolder = (root, id) => resolve(root, 'sdk/octatrack/modules', id)

/** Copy the draft into place now and remove the copy when this process exits. Returns refresh(), which copies it again (watch mode). */
export function stageDraft(root, id) {
  const source = draftFolder(root, id), copy = listedFolder(root, id)
  if (!existsSync(source)) { console.error('No draft named ' + id + ' under sdk/drafts.'); process.exit(2) }
  if (existsSync(copy) || isLink(copy)) { console.error('sdk/octatrack/modules/' + id + ' exists: check the listed module instead, or rename the draft.'); process.exit(2) }
  const refresh = () => { rmSync(copy, { recursive: true, force: true }); cpSync(source, copy, { recursive: true }) }
  refresh()
  process.on('exit', () => rmSync(copy, { recursive: true, force: true }))
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(signal === 'SIGINT' ? 130 : 143))
  return refresh
}

function isLink(path) { try { return lstatSync(path).isSymbolicLink() } catch { return false } }

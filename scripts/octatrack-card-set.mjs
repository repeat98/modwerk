// SPDX-License-Identifier: GPL-3.0-or-later
// Writes a module set as the file the Modwerk base restores from the card (src/engine/elekloader/card-set.ts), from
// the packages this checkout publishes, for trying the card route on a unit before the site offers it:
//   node scripts/octatrack-card-set.mjs --out <folder outside the repository> <module id> [<module id> …]
// Copy MODWERK0.SET to the card's top folder and switch the Octatrack on with the base named below.
// The site's own code does the work, loaded through Vite as the page loads it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2), at = args.indexOf('--out')
const out = at < 0 ? '' : resolve(args[at + 1] ?? ''), ids = args.filter((_, index) => at < 0 || (index !== at && index !== at + 1))
if (!out || !ids.length) throw new Error('Usage: node scripts/octatrack-card-set.mjs --out <folder> <module id> [<module id> …]')
if (!relative(root, out).startsWith('..')) throw new Error('Write the set outside the repository: built files are never committed.')
const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true } })
try {
  const { prepareCardSet } = await vite.ssrLoadModule('/src/engine/elekloader/module-set.ts')
  const { CARD_SET_FILE } = await vite.ssrLoadModule('/src/engine/elekloader/card-set.ts')
  const { layoutName } = await vite.ssrLoadModule('/src/engine/elekloader/base-variants.ts')
  const set = await prepareCardSet({ name: 'Card set', moduleIds: ids, removedStockFx: [] }, async entry => new Uint8Array(readFileSync(join(root, 'public', entry.path))))
  mkdirSync(out, { recursive: true }); writeFileSync(join(out, CARD_SET_FILE), set.file)
  console.log(`${join(out, CARD_SET_FILE)}: ${set.modules.join(', ')} (${set.file.length} bytes, SHA-256 ${createHash('sha256').update(set.file).digest('hex')})`)
  console.log(`For the Modwerk base ${set.base.slice(0, 8)} (${layoutName(set.layout)}); a unit on another base ignores it.`)
} finally { await vite.close() }

// SPDX-License-Identifier: GPL-3.0-or-later
// Writes a module set as the file the Modwerk base restores from the card (src/engine/elekloader/card-set.ts), from
// the packages this checkout publishes, for trying the card route on a unit before the site offers it:
//   node scripts/octatrack-card-set.mjs --out <folder outside the repository> <module id> [<module id> …]
// To replay an older export, use --out <mounted card> --import <exported .SET>. Its other slot stays intact.
// The site's own code does the work, loaded through Vite as the page loads it.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), args = process.argv.slice(2), at = args.indexOf('--out')
const out = at < 0 ? '' : resolve(args[at + 1] ?? ''), ids = args.filter((_, index) => at < 0 || (index !== at && index !== at + 1))
const importing = ids[0] === '--import'
if (!out || !ids.length || (importing && ids.length !== 2)) throw new Error('Usage: node scripts/octatrack-card-set.mjs --out <folder> <module ids… | --import saved.SET>')
if (!relative(root, out).startsWith('..')) throw new Error('Write the set outside the repository: built files are never committed.')
const vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true } })
try {
  const { prepareCardSet } = await vite.ssrLoadModule('/src/engine/elekloader/module-set.ts')
  const { CARD_SET_FILE, CARD_RECOVERY_FILE, forCardImport } = await vite.ssrLoadModule('/src/engine/elekloader/card-set.ts')
  const source = importing ? readFileSync(ids[1]) : (await prepareCardSet({ name: 'Card set', moduleIds: ids, removedStockFx: [] }, async entry => new Uint8Array(readFileSync(join(root, 'public', entry.path))))).file
  mkdirSync(out, { recursive: true })
  const retained = join(out, CARD_RECOVERY_FILE)
  const file = forCardImport(source, existsSync(retained) ? readFileSync(retained) : undefined)
  const temp = join(out, '.' + randomUUID() + '.tmp')
  try {
    writeFileSync(temp, file, { flag: 'wx', flush: true })
    renameSync(temp, join(out, CARD_SET_FILE))
  } finally { rmSync(temp, { force: true }) }
  console.log(`${join(out, CARD_SET_FILE)} (${file.length} bytes, SHA-256 ${createHash('sha256').update(file).digest('hex')})`)
  console.log('For the Modwerk base ' + Buffer.from(file.subarray(20, 24)).toString('hex') + '. If copying to another card that already holds MODWERK1.SET, run --import with that card as --out.')
} finally { await vite.close() }

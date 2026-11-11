// SPDX-License-Identifier: GPL-3.0-or-later
// Stock code that enters a patched site after its first byte: a branch, a call or a table pointer to an instruction a
// detour displaced (docs/OCTATRACK_HARDWARE_TRAPS.md, "Stock can branch into the middle of a span"). Reads your own
// stock OS file, which never leaves this computer, and the sites the base and the active modules declare; so it runs
// locally, never in CI. A floor, not a proof: a target computed at run time is not seen.
//
//   npm run stock:branches -- --stock <OCTATRACK_OS1.40C.bin> [--json] [module-id ...]
//
// Exit 1 when an entry is not in sdk/machines/octatrack/inbound-branches.json, the reviewed list (addresses and a
// reason each, no stock bytes).
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import * as formats from '../vendor/elekloader/kit/src/formats.ts'
import { inboundBranches } from '../src/engine/elektron/inbound-branches.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
export const REVIEWED = 'sdk/machines/octatrack/inbound-branches.json'
const hex = value => '0x' + value.toString(16).padStart(8, '0')

/** Entries the reviewed list does not cover, and reviewed rows nothing matches any more (the list stays exact). */
export function unreviewed(entries, reviewed) {
  const key = row => [row.site, row.target, row.from].map(value => typeof value === 'number' ? hex(value) : value).join()
  const known = new Set(reviewed.map(key)), seen = new Set(entries.map(entry => key({ site: entry.site.addr, target: entry.target, from: entry.from })))
  return {
    open: entries.filter(entry => !known.has(key({ site: entry.site.addr, target: entry.target, from: entry.from }))),
    stale: reviewed.filter(row => !seen.has(key(row))),
  }
}

export const line = entry => `${hex(entry.site.addr)}+${entry.site.length} ${entry.site.owner}: ` +
  (entry.how === 'pointer' ? `a table or pointer word at ${hex(entry.from)} holds` : `stock code at ${hex(entry.from)} ${entry.flow === 'jsr' || entry.flow === 'bsr' ? 'calls' : 'branches to'}`) +
  ` ${hex(entry.target)}, ${entry.target - entry.site.addr} bytes into the site`

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ options: { stock: { type: 'string' }, json: { type: 'boolean' } }, allowPositionals: true })
  if (!values.stock) { console.error('Give your own stock OS file: npm run stock:branches -- --stock <OCTATRACK_OS1.40C.bin>'); process.exit(2) }
  const [parsed, device] = await formats.load(new Uint8Array(readFileSync(values.stock)))
  if (device.key !== 'octatrack') { console.error('This check knows the Octatrack\'s sites only; ' + device.name + ' has no site list yet.'); process.exit(2) }
  const sites = JSON.parse(execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', 'scripts/stock-code-sites.py'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }))
    .filter(site => !positionals.length || positionals.some(id => site.owner.startsWith(id + ' ')))
  const entries = inboundBranches(formats.mainImage(parsed, device), device.mainLoad, sites)
  const { open, stale } = unreviewed(entries, JSON.parse(readFileSync(root + REVIEWED, 'utf8')).reviewed)
  if (values.json) console.log(JSON.stringify({ sites: sites.length, entries: entries.map(entry => ({ ...entry, site: entry.site.addr, owner: entry.site.owner })), open: open.length, stale }))
  else {
    for (const entry of open) console.log('✗ ' + line(entry))
    for (const row of stale) console.log(`✗ ${REVIEWED} lists ${row.site} <- ${row.from}, which no site meets any more: remove the row`)
    if (open.length) console.log(`    fix: shorten the site so it ends before the entry, or keep the entered instruction stock; an entry you have shown to be data, never code, gets a reviewed row in ${REVIEWED}`)
    console.log(`Inbound branches: ${sites.length} code sites, ${entries.length} entries into a site's interior, ${entries.length - open.length} reviewed, ${open.length} open`)
  }
  process.exit(open.length || stale.length ? 1 : 0)
}

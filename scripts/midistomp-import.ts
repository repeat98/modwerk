// SPDX-License-Identifier: GPL-3.0-or-later
// Imports MIDISTOMP (github.com/matujuice/zoom-ms-midistomp, Luca Matturro, MIT) into vendor/midistomp, without Zoom's bytes.
//
//   node scripts/midistomp-import.ts MIDISTOMP_CHECKOUT --app 'ZOOM MS-70CDR v2.10 Updater.app'
//
// LICENSE, models/ and asm/ are copied unchanged. Every patch for the MS-70CDR 2.10 goes into vendor/midistomp/midistomp.json
// with its MS-70CDR entries, stock-free: an `expect` (Zoom's own bytes) becomes `expect_sha256` and `expect_length`, as
// patches/boot-logo.yaml already does for BIN/133; a `replace` (a text search in Zoom's OS) becomes writes at the
// addresses it hits in the stock 2.10 OS; and a run of 16 or more bytes a patch repeats from Zoom's files (the rule of
// sdk/machines/octatrack/elekloader/check_stock_free.py) becomes a copy from the user's own file. Nothing from Zoom's
// updater is written.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { parseAis } from '../src/engine/zoom/ais.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url)), OUT = join(ROOT, 'vendor/midistomp')
const UPSTREAM = 'https://github.com/matujuice/zoom-ms-midistomp', BUILD = 'ms70cdr-2.10'
const MIN = 16, DISTINCT = 5 // check_stock_free.py: shorter runs, and sparser windows, match stock by chance
type Part = ['hex', string] | ['copy', string, number, number]
type Entry = { model: string; addr?: number; offset?: number; expect?: string; expect_sha256?: string; data: string; source?: string }
type Patch = { name: string; description?: string; builds?: string[]; replace?: { find: string; with: string; count?: number }[]; write?: Entry[]; section?: Entry[]; bin133?: Entry[] }

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const fromHex = (text: string) => Buffer.from(String(text).replace(/\s/g, ''), 'hex')
const fail = (message: string) => { console.error(message); process.exit(1) }

const [upstreamArg, flag, appArg] = process.argv.slice(2)
if (!upstreamArg || flag !== '--app' || !appArg) fail('Usage: node scripts/midistomp-import.ts MIDISTOMP_CHECKOUT --app ZOOM_UPDATER.app')
const upstream = resolve(upstreamArg), app = resolve(appArg)
const git = (...args: string[]) => execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8' }).trim()
if (git('status', '--porcelain')) fail(upstream + ' has local changes; import a clean checkout.')
const revision = git('rev-parse', 'HEAD')

const model = parse(readFileSync(join(upstream, 'models/ms70cdr.yaml'), 'utf8'))
if (sha(readFileSync(join(app, 'Contents/MacOS/EFX Updater'))) !== model.stock_mac_updater_sha256) fail(app + " is not Zoom's stock MS-70CDR 2.10 Mac updater.")
const stock: Record<string, Buffer> = Object.fromEntries(['Main.bin', 'Preset.bin', 'boot.bin'].map(name => [name, readFileSync(join(app, 'Contents/Resources', name))]))
const img = parseAis(stock['Main.bin'])

// Every 16-byte window of Zoom's files, to find what a patch repeats from them.
const index = new Map<string, [string, number]>()
for (const [name, data] of Object.entries(stock))
  for (let o = 0; o + MIN <= data.length; o++) {
    const key = data.toString('latin1', o, o + MIN)
    if (!index.has(key) && new Set(key).size >= DISTINCT) index.set(key, [name, o])
  }
function stockFree(data: Buffer): string | Part[] {
  const parts: Part[] = []
  let at = 0
  for (let i = 0; i + MIN <= data.length;) {
    const hit = index.get(data.toString('latin1', i, i + MIN))
    if (!hit) { i++; continue }
    const [name, source] = hit
    let n = MIN
    while (i + n < data.length && source + n < stock[name].length && data[i + n] === stock[name][source + n]) n++
    if (i > at) parts.push(['hex', data.toString('hex', at, i)])
    parts.push(['copy', name, source, n])
    at = i += n
  }
  if (!parts.length) return data.toString('hex')
  return at < data.length ? [...parts, ['hex', data.toString('hex', at)]] : parts
}

const patches = [], skipped = []
for (const file of readdirSync(join(upstream, 'patches')).filter(name => name.endsWith('.yaml')).sort()) {
  const patch: Patch = parse(readFileSync(join(upstream, 'patches', file), 'utf8'))
  // Patches build on each other (midi-settings expects midi-cc's bytes), so none is tried alone here:
  // src/engine/zoom/zoom-base.test.ts checks the releases against zoomms' own output.
  if (patch.builds && !patch.builds.includes(BUILD)) { skipped.push(patch.name + ': only for ' + patch.builds.join(', ')); continue }
  const write = []
  for (const { find, with: next, count = 1 } of patch.replace ?? []) {
    const needle = Buffer.from(find, 'latin1')
    const hits = img.sections.flatMap(({ addr, data }) => {
      const found = [], hay = Buffer.from(data.buffer, data.byteOffset, data.length)
      for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) found.push(addr + i)
      return found
    })
    if (hits.length !== count) fail(`${patch.name}: ${JSON.stringify(find)} is in the stock OS ${hits.length} times, not ${count}.`)
    write.push(...hits.map(addr => ({ model: BUILD, addr, expect_sha256: sha(needle), expect_length: needle.length, data: Buffer.from(next, 'latin1').toString('hex') })))
  }
  for (const { model, addr, expect, data } of patch.write ?? [])
    if (model === BUILD) write.push({ model, addr, expect_sha256: sha(fromHex(expect!)), expect_length: fromHex(expect!).length, data: stockFree(fromHex(data)) })
  const own = (entries: Entry[] = []) => entries.filter(entry => entry.model === BUILD).map(entry => ({ ...entry, data: stockFree(fromHex(entry.data)) }))
  const entry = { name: patch.name, description: patch.description, builds: patch.builds, write, section: own(patch.section), bin133: own(patch.bin133) }
  if (!write.length && !entry.section.length && !entry.bin133.length) { skipped.push(patch.name + ': nothing for ' + BUILD); continue }
  patches.push(Object.fromEntries(Object.entries(entry).filter(([, value]) => Array.isArray(value) ? value.length : value !== undefined)))
}

// The releases MIDISTOMP's own builder makes (scripts/midistomp_builder.py: NAME and PATCHES).
const builder = readFileSync(join(upstream, 'scripts/midistomp_builder.py'), 'utf8')
const release = /^NAME = "([^"]+)"/m.exec(builder)?.[1], names = /^PATCHES = \[([^\]]*)\]/m.exec(builder)?.[1]
if (!release || !names) fail("Couldn't read the release in scripts/midistomp_builder.py.")
const document = {
  upstream: UPSTREAM, revision, license: 'MIT', build: BUILD,
  stock: {
    macUpdaterSha256: model.stock_mac_updater_sha256, windowsUpdaterSha256: model.stock_updater_sha256,
    main: { bytes: stock['Main.bin'].length, sha256: sha(stock['Main.bin']) }, preset: { bytes: stock['Preset.bin'].length, sha256: sha(stock['Preset.bin']) },
  },
  releases: { [release!]: [...names!.matchAll(/"([^"]+)"/g)].map(match => match[1]) },
  patches,
}

const copied = ['LICENSE', ...['models', 'asm'].flatMap(folder => readdirSync(join(upstream, folder), { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(upstream.length + 1))).sort()]
rmSync(OUT, { recursive: true, force: true })
for (const name of copied) {
  mkdirSync(dirname(join(OUT, name)), { recursive: true })
  copyFileSync(join(upstream, name), join(OUT, name))
}
writeFileSync(join(OUT, 'midistomp.json'), JSON.stringify(document, null, 1) + '\n')
for (const old of readdirSync(join(ROOT, 'sdk/imports')).filter(name => name.startsWith('midistomp-'))) rmSync(join(ROOT, 'sdk/imports', old))
writeFileSync(join(ROOT, 'sdk/imports', 'midistomp-' + revision.slice(0, 7) + '.json'), JSON.stringify({
  schemaVersion: 1, recorded: new Date().toISOString().slice(0, 10),
  decision: "MIDISTOMP (Luca Matturro, MIT) as the Zoom MultiStomp base: LICENSE, models/ and asm/ copied unchanged; its patches converted by scripts/midistomp-import.ts into vendor/midistomp/midistomp.json with every guard on Zoom's bytes kept as a sha256 and every run they repeat from Zoom's files as a copy from the user's own, so no Zoom bytes are in the repository.",
  repository: UPSTREAM, revision, license: 'MIT',
  files: copied.map(name => ({ from: name, to: 'vendor/midistomp/' + name, sha256: sha(readFileSync(join(upstream, name))) })),
}, null, 2) + '\n')
console.log(`MIDISTOMP ${revision.slice(0, 10)}: ${patches.length} patches for ${BUILD}, ${copied.length} files copied. Skipped:\n  ${skipped.join('\n  ')}`)

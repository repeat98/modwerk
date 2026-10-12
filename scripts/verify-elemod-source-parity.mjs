// SPDX-License-Identifier: GPL-3.0-or-later
// Local-only evidence tool. Reads the owner's firmware; writes hashes/status only.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { readEle3Syx, mainImage, ELE3_DEVICES } from '../src/engine/elektron/ele3.ts'
import { LINK_DEVICES, parseElemod, linkMods } from '../src/engine/elektron/elemod.ts'
import { materializeElemodRecipe as materializeModuleObject } from '../src/catalog/elemod-recipe.ts'
const args = process.argv.slice(2), values = name => args.flatMap((arg, i) => arg === name ? [args[i + 1]] : []), one = name => values(name)[0]
if (!one('--packages') || !one('--oracle') || !one('--out') || !values('--firmware').length) throw new Error('Usage: verify-elemod-source-parity.mjs --packages DIR --oracle DIR --out DIR --firmware machine:stock.syx [--firmware ...]')
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), json = async path => JSON.parse(await readFile(path, 'utf8'))
const packages = resolve(one('--packages')), oracle = resolve(one('--oracle')), output = resolve(one('--out')), stock = new Map(), mods = []
for (const input of values('--firmware')) {
  const colon = input.indexOf(':'), machine = input.slice(0, colon), path = input.slice(colon + 1)
  if (!['digitakt', 'digitone'].includes(machine) || !path) throw new Error('Expected machine:path for --firmware')
  const raw = new Uint8Array(await readFile(path)), device = LINK_DEVICES.find(item => item.machine === machine)
  const release = device.releases.find(item => item.syxSha256 === sha(raw))
  if (!release) throw new Error('Unrecognized stock file for ' + machine)
  stock.set(machine + ':' + release.version, mainImage(readEle3Syx(raw), ELE3_DEVICES[machine]))
}
for (const entry of await readdir(oracle, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.elemod')) continue
  const bytes = await readFile(resolve(oracle, entry.name)), doc = JSON.parse(bytes.toString('utf8')), parsed = parseElemod(doc)
  if (parsed.format === 2) mods.push({ parsed, sha256: sha(bytes) })
}
const inventory = await json(resolve(packages, 'elemod-build.json')), cases = []
if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.artifacts)) throw new Error('Invalid package inventory')
for (const entry of inventory.artifacts) {
  if (!/^(digitakt|digitone)\/[a-z][a-z0-9-]*\/\d+\.\d+\.json$/.test(entry.path)) throw new Error('Invalid package path')
  const bytes = await readFile(resolve(packages, entry.path)), plan = JSON.parse(bytes.toString('utf8'))
  if (sha(bytes) !== entry.sha256 || plan.provenance.sourceCommit !== inventory.sourceCommit || plan.machine !== entry.machine || plan.id !== entry.id || plan.version !== entry.version || plan.release !== entry.release) throw new Error('Package inventory identity/hash mismatch')
  const image = stock.get(plan.machine + ':' + plan.release), match = mod => mod.parsed.device.machine === plan.machine && mod.parsed.release.version === plan.release
  const core = mods.find(mod => match(mod) && mod.parsed.id === 'core' && mod.parsed.sections['.boot'])
  const author = mods.find(mod => match(mod) && mod.parsed.id === plan.id && !mod.parsed.sections['.boot'])
  if (!image || !core || !author) { cases.push({ machine: plan.machine, id: plan.id, release: plan.release, status: 'unverified', reason: !image ? 'Stock file not supplied' : !core ? 'Reference core not supplied' : 'Author release not supplied' }); continue }
  const compiled = parseElemod(await materializeModuleObject(plan, image))
  const own = await linkMods([core.parsed, compiled], image), reference = await linkMods([core.parsed, author.parsed], image)
  const ownSha256 = sha(own.image), referenceSha256 = sha(reference.image)
  cases.push({ machine: plan.machine, id: plan.id, release: plan.release, version: plan.version, compiler: plan.provenance.compiler, artifactSha256: entry.sha256, authorObjectSha256: author.sha256,
    ownSha256, referenceSha256, status: ownSha256 === referenceSha256 ? 'byte-parity' : 'different',
    sections: Object.fromEntries(Object.entries(compiled.sections).map(([name, section]) => [name, section.size ?? section.length])), referenceSections: Object.fromEntries(Object.entries(author.parsed.sections).map(([name, section]) => [name, section.size ?? section.length])) })
}
await mkdir(output, { recursive: true })
await writeFile(resolve(output, 'source-parity.json'), JSON.stringify({ sourceCommit: inventory.sourceCommit, cases }, null, 2) + '\n')
for (const item of cases) console.log(item.machine + '/' + item.id + ' OS ' + item.release + ': ' + item.status + (item.reason ? ' (' + item.reason + ')' : ''))
if (cases.some(item => item.status !== 'byte-parity')) process.exitCode = 1

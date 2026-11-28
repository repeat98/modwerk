// SPDX-License-Identifier: GPL-3.0-or-later
// Owner only (docs/HOSTED_BASES.md): build the base images this checkout publishes from your own OS file, with the
// browser's own path (published-base.ts for the Octatrack, Modwerk's builder with no modules for the others), and upload each with its manifest entry to the private
// modwerk-base-images bucket through your wrangler login. Images go to a private temporary folder, removed afterwards;
// nothing enters the checkout. Run it from a checkout of the deployed revision.
//
//   npm run base:publish -- --stock OCTATRACK_OS1.40C.bin [--dry-run]
//   npm run base:publish -- --machine digitakt-ii|analog-rytm-mkii|model-cycles --stock OS.syx [--dry-run]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { buildPublishedBase } from '../src/engine/elekloader/published-base.ts'
import { baseLayout, buildLayout } from '../src/engine/elekloader/base-variants.ts'
import { firmwareFilename } from '../src/config/firmware-filename.ts'
import { USB_AUDIO_PACKAGED } from '../src/config/usb-audio.ts'
import { Bridge } from '../src/engine/elektron/builder-bridge.ts'
import { sha } from '../src/engine/elektron/bytes.ts'
import { carryDevices } from '../src/engine/elekloader/carried-devices.ts'
import { baseIdentity, planBuild } from '../src/engine/elekloader/machine-build.ts'

const BUCKET = 'modwerk-base-images', MANIFEST = 'manifest.json'
const root = fileURLToPath(new URL('../', import.meta.url))
const KIT_MACHINES = ['digitakt-ii', 'analog-rytm-mkii', 'model-cycles']
const { values: args } = parseArgs({ options: { machine: { type: 'string', default: 'octatrack' }, stock: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } })
if (!args.stock || ![...KIT_MACHINES, 'octatrack'].includes(args.machine)) throw new Error('Usage: npm run base:publish -- [--machine octatrack|' + KIT_MACHINES.join('|') + '] --stock OS-FILE [--dry-run]')

const assets = join(root, 'src/engine/assets'), current = USB_AUDIO_PACKAGED ? assets : join(assets, 'linked-audio-0.7.11')
const files = { false: { package: join(current, 'octatrack-base.elemod'), variants: join(current, 'octatrack-base-variants.json'), fills: join(current, 'octatrack-base-fills.json') },
  true: { package: join(assets, 'octatrack-base-step.elemod'), variants: join(assets, 'octatrack-base-step-variants.json'), fills: join(assets, 'octatrack-base-step-fills.json') } }
const load = async (name, step) => readFileSync(files[step][name], 'utf8')
const wrangler = (...rest) => execFileSync('npx', ['wrangler', 'r2', 'object', ...rest, '--remote'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })

/** Every image the site asks for: the base it builds, and the step base for a unit too old to take it. */
export async function publishedImages(stock) {
  const images = []
  // The guide asks for exactly the layout buildLayout gives (USB Audio off while USB Audio is a module), step or not.
  for (const step of [false, true]) {
    const layout = buildLayout(undefined, step)
    const built = await buildPublishedBase(stock, load, layout, step)
    if (!step && baseLayout(built.base) !== built.layout) throw new Error('The base built as ' + built.base + ', which this checkout does not publish. Use a checkout of the deployed revision.')
    // The name a base built from your own file downloads under (firmware-filename.ts), never the internal layout name.
    const name = firmwareFilename(step ? 'step base' : 'base', built.base)
    images.push({ entry: { machine: 'octatrack', identity: built.base, sha256: built.sha256, size: built.bin.length, file: name, layout: built.layout, ...(step ? { step: true } : {}) }, bin: built.bin })
  }
  return images
}

/** A machine whose modules link into the OS (DigiBuildPanel): the base is the page's build with no modules, in the
 * page's default display version, from the core whose identity base-binding.json pins. */
export async function kitBaseImages(machine, stock, name) {
  carryDevices()
  const bridge = new Bridge(), loaded = await bridge.setStock({ name }, stock)
  if (!loaded.ok) throw new Error(loaded.error)
  const plan = planBuild(machine, loaded.os, []), identity = baseIdentity(machine, [])
  if (!plan.core || plan.core.sha256 !== identity) throw new Error('This OS file builds no published ' + machine + ' base (OS ' + loaded.os + '). Choose the OS the base is built for.')
  const core = new Uint8Array(readFileSync(join(root, 'vendor/elekloader/catalog', plan.core.file)))
  const added = bridge.addCore({ name: plan.core.file, sha256: plan.core.sha256 }, core)
  if (added.error || added.ok === false) throw new Error(added.error)
  const enabled = ['/work/core/' + plan.core.file], version = loaded.dev.default_version
  const named = bridge.version({ enabled, version })
  if (!named.ok) throw new Error(named.error)
  const built = await bridge.build({ enabled, version, name: named.name, store: null })
  if (!built.ok) throw new Error(built.error)
  const image = built.files[0], digest = sha(image.data)
  // Named like the Octatrack's (firmware-filename.ts): the machine, base and the identity's first digits.
  return [{ entry: { machine, identity, release: loaded.os, version, sha256: digest, size: image.data.length, file: 'Modwerk-' + machine + '-base-' + identity.slice(0, 8) + '.syx' }, bin: image.data }]
}

const stock = new Uint8Array(readFileSync(args.stock))
const images = args.machine === 'octatrack' ? await publishedImages(stock) : await kitBaseImages(args.machine, stock, args.stock.split('/').pop())
for (const { entry } of images) console.log(`${entry.file}: identity ${entry.identity}, sha256 ${entry.sha256} (${entry.size} bytes)`)
if (args['dry-run']) process.exit(0)

let manifest = { schema: 1, images: [] }
try { manifest = JSON.parse(wrangler('get', BUCKET + '/' + MANIFEST, '--pipe').toString('utf8')) } catch { console.log('No manifest yet: starting one.') }
if (manifest?.schema !== 1 || !Array.isArray(manifest.images)) throw new Error('The bucket manifest is not schema 1. Look at it before publishing.')
const folder = mkdtempSync(join(tmpdir(), 'modwerk-base-publish-'))
try {
  for (const { entry, bin } of images) {
    const known = manifest.images.find(image => image.machine === entry.machine && image.identity === entry.identity)
    if (known?.sha256 === entry.sha256) { Object.assign(known, entry); console.log('already hosted: ' + entry.file); continue }
    // An identity names one image: a different build of the same identity means the builder changed, so stop.
    if (known) throw new Error(entry.identity + ' is hosted with another SHA-256 (' + known.sha256 + '). Find out why before replacing it.')
    const path = join(folder, entry.file)
    writeFileSync(path, bin, { mode: 0o600 })
    wrangler('put', BUCKET + '/' + entry.machine + '/' + entry.identity, '--file', path, '--content-type', 'application/octet-stream')
    manifest.images.push(entry)
    console.log('uploaded ' + entry.file)
  }
  const path = join(folder, MANIFEST)
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  wrangler('put', BUCKET + '/' + MANIFEST, '--file', path, '--content-type', 'application/json')
  console.log(`manifest: ${manifest.images.length} images`)
} finally { rmSync(folder, { recursive: true, force: true }) }

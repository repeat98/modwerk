// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { basename, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bridge } from '../vendor/elekloader/kit/src/bridge.ts'
import { parseCatalog, planBuild } from '../vendor/elekloader/kit/src/kit/catalog.ts'
import { readFirmwareBuildManifest, sha256 } from './firmware-build-manifest.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DEVICES = { digitakt: 'digitakt-mk1', digitone: 'digitone-mk1' }
const KEYS = ['machine', 'os', 'moduleIds', 'version', 'expectedVersions', 'expectedSha256', 'riskAccepted']
const HASH = /^[a-f0-9]{64}$/

export function parseBuildRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !KEYS.includes(key))) throw new Error('Unknown build request fields.')
  // The Octatrack has no firmware with modules in it: its modules go through the Modwerk base (USB sync, or the card file).
  if (!Object.keys(DEVICES).includes(value.machine)) throw new Error('Supported machines: digitakt, digitone. Digitakt II downloads remain paused; Octatrack modules go through the Modwerk base, not a firmware build.')
  if (typeof value.os !== 'string' || !/^\d+\.\d+[A-Za-z]?$/.test(value.os)) throw new Error('Choose a stock OS version.')
  if (!Array.isArray(value.moduleIds) || !value.moduleIds.length || value.moduleIds.length > 32 || value.moduleIds.some(id => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) || new Set(value.moduleIds).size !== value.moduleIds.length) throw new Error('Choose distinct native module IDs.')
  if (value.riskAccepted !== true) throw new Error('Set riskAccepted to true after reviewing the experimental firmware and recovery instructions.')
  if (typeof value.version !== 'string' || !/^[\x20-\x7e]{4}$/.test(value.version)) throw new Error('Digi builds need a four-character ASCII display version.')
  if (value.expectedSha256 !== undefined && !HASH.test(value.expectedSha256)) throw new Error('expectedSha256 must be a lowercase SHA-256.')
  if (value.expectedVersions !== undefined && (!value.expectedVersions || typeof value.expectedVersions !== 'object' || Array.isArray(value.expectedVersions) || Object.entries(value.expectedVersions).some(([id, version]) => !/^[a-z0-9-]+$/.test(id) || typeof version !== 'string' || version.length > 80))) throw new Error('expectedVersions maps native module IDs to exact release versions.')
  return { ...value, moduleIds: [...value.moduleIds] }
}

export function siteBase(value = 'https://modwerk.app/') {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) throw new Error('The site must use HTTPS, or HTTP on localhost for development.')
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

/** Only fetch public metadata/packages. Stock firmware is never a request body. */
async function publicFile(site, path, limit = 16 * 1024 * 1024) {
  const response = await fetch(new URL(path, site), { redirect: 'error', signal: AbortSignal.timeout(30_000), cache: 'no-store' })
  if (!response.ok) throw new Error('Published asset unavailable: ' + path + ' (HTTP ' + response.status + ').')
  const chunks = []; let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('Published asset exceeds its size limit: ' + path)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Library modules among planned packages. Dependency folders (sdk/<machine>/dependencies, e.g. Machine Pages) have no
 * release of their own; their packages are checked against the published catalogue's SHA-256 pins instead. */
export function libraryModuleIds(ids, machine, root = ROOT) {
  return ids.filter(id => !existsSync(resolve(root, 'sdk', machine, 'dependencies', id, 'dependency.json')))
}

export function verifyPublishedModules(inventory, localModules, machine, ids, expectedVersions = {}) {
  if (inventory?.format !== 'modwerk-module-releases-v1' || !Array.isArray(inventory.modules)) throw new Error('Invalid published release inventory.')
  const versions = {}
  for (const id of ids) {
    const communityId = machine === 'octatrack' ? id : machine + '-' + id
    const release = inventory.modules.find(item => item.id === communityId)
    const local = localModules.find(item => item.id === id && (machine === 'octatrack' || item.machine === machine))
    if (!release || !local || release.beta) throw new Error('Module is unavailable for public downloads: ' + communityId)
    if (local.version !== release.version) throw new Error('Local module version differs from the live release: ' + communityId + '. Update your checkout.')
    if (expectedVersions[id] !== undefined && expectedVersions[id] !== release.version) throw new Error('Unexpected live version for ' + id + ': ' + release.version)
    versions[id] = release.version
  }
  if (Object.keys(expectedVersions).some(id => !ids.includes(id))) throw new Error('expectedVersions names a module outside this build.')
  return versions
}

/** Builds from deployed inputs, saves private files, then hashes their actual on-disk bytes. */
export async function buildAndSave(value, { stockPath, outputDir, site = 'https://modwerk.app/', root = ROOT }) {
  const request = parseBuildRequest(value), base = siteBase(site)
  const localManifest = await readFirmwareBuildManifest(root)
  const manifestBytes = await publicFile(base, 'firmware-builder.json', 64 * 1024)
  let deployed
  try { deployed = JSON.parse(manifestBytes) }
  catch { throw new Error('The site has no valid firmware-builder.json. Deploy local download API support first.') }
  if (deployed.format !== localManifest.format || deployed.inputsSha256 !== localManifest.inputsSha256 || JSON.stringify(deployed.elekloader) !== JSON.stringify(localManifest.elekloader)) throw new Error('Local builder differs from the deployed builder. Update your checkout to the deployed revision.')
  const inventoryBytes = await publicFile(base, 'module-releases.json', 1024 * 1024)
  const inventory = JSON.parse(inventoryBytes)
  const size = (await stat(stockPath)).size
  if (!size || size > 16 * 1024 * 1024) throw new Error('Stock firmware has an unsupported size.')
  const stock = new Uint8Array(await readFile(stockPath)), stockSha256 = sha256(stock)
  let built, files, pins, moduleVersions
  {
    const catalogBytes = await publicFile(base, 'elekloader/catalog.json')
    if (sha256(catalogBytes) !== localManifest.elekloader.catalogSha256) throw new Error('The published Elekloader catalog differs from the deployed builder fingerprint.')
    const plan = planBuild(parseCatalog(JSON.parse(catalogBytes)), DEVICES[request.machine], request.os, request.moduleIds)
    if (!plan.core || plan.missing.length) throw new Error('No compatible published packages for: ' + (plan.missing.join(', ') || 'core'))
    const modules = JSON.parse(await readFile(resolve(root, 'src/catalog/machine-modules.json'), 'utf8')).modules
    moduleVersions = verifyPublishedModules(inventory, modules, request.machine, libraryModuleIds(plan.mods.map(pin => pin.id), request.machine, root), request.expectedVersions)
    const bridge = new Bridge()
    const loaded = await bridge.setStock({ name: basename(stockPath) }, stock)
    if (!loaded.ok) throw new Error(loaded.error)
    if (loaded.dev.key !== DEVICES[request.machine] || loaded.os !== request.os) throw new Error('The stock firmware does not match the requested machine and OS.')
    for (const pin of [plan.core, ...plan.mods]) {
      const data = new Uint8Array(await publicFile(base, 'elekloader/' + encodeURIComponent(pin.file)))
      if (sha256(data) !== pin.sha256) throw new Error('Published package SHA-256 mismatch: ' + pin.file)
      const added = pin === plan.core ? bridge.addCore({ name: pin.file, sha256: pin.sha256 }, data) : bridge.addMod({ name: pin.file, sha256: pin.sha256 }, data)
      if (added.error || added.ok === false) throw new Error(added.error)
    }
    const enabled = ['/work/core/' + plan.core.file, ...plan.mods.map(pin => '/work/mods/' + pin.file)]
    const check = bridge.check({ enabled })
    if (!check.ok) throw new Error(check.problems?.join(' ') || check.headline || 'Module compatibility check failed.')
    const named = bridge.version({ enabled, version: request.version })
    if (!named.ok) throw new Error(named.error)
    built = await bridge.build({ enabled, version: request.version, name: named.name })
    if (!built.ok) throw new Error(built.error)
    files = built.files
    pins = { core: plan.core, modules: plan.mods, report: { version: built.version, device: built.device, os: built.os } }
  }
  const primary = files[0]
  if (!primary || !/\.(bin|syx)$/.test(primary.name)) throw new Error('The builder produced no firmware download.')
  const imageSha256 = sha256(primary.data)
  if (request.expectedSha256 && request.expectedSha256 !== imageSha256) throw new Error('Firmware differs from the expected private image; no download was saved.')
  // A deployment changing mid-build invalidates the proof even if the resulting bytes happen to match.
  if (!(await publicFile(base, 'firmware-builder.json', 64 * 1024)).equals(manifestBytes) || !(await publicFile(base, 'module-releases.json', 1024 * 1024)).equals(inventoryBytes)) throw new Error('The published release changed during the build. Retry against the new deployment.')
  if ((await readFirmwareBuildManifest(root)).inputsSha256 !== localManifest.inputsSha256) throw new Error('Local builder inputs changed during the build. Retry from a clean checkout.')
  await mkdir(outputDir, { recursive: true, mode: 0o700 })
  const folder = await mkdtemp(join(resolve(outputDir), 'modwerk-download-'))
  try {
    const saved = []
    for (const file of files) {
      if (basename(file.name) !== file.name || file.name === '.' || file.name === '..' || file.name.includes('\\')) throw new Error('Unsafe builder output name.')
      const path = join(folder, file.name), expected = sha256(file.data)
      await writeFile(path, file.data, { flag: 'wx', mode: 0o600 })
      const bytes = await readFile(path)
      if (sha256(bytes) !== expected || bytes.length !== file.data.length) throw new Error('Saved firmware verification failed.')
      saved.push({ path, bytes: bytes.length, sha256: expected })
    }
    const receipt = { format: 'modwerk-saved-download-v1', site: base.href, builder: deployed, inventorySha256: sha256(inventoryBytes), machine: request.machine, os: request.os, stockSha256, moduleVersions, displayVersion: built.report?.version ?? built.version, ...pins, files: saved, verifiedAt: new Date().toISOString(), verification: 'saved-local-build-from-published-inputs' }
    const receiptPath = join(folder, 'download-receipt.json')
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    return { ...receipt, receiptPath }
  } catch (error) { await rm(folder, { recursive: true, force: true }); throw error }
}

export function readOptions(args) {
  const out = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z-]+$/.test(args[i]) || args[i + 1] === undefined || args[i + 1].startsWith('--') || Object.hasOwn(out, args[i].slice(2))) throw new Error('Use distinct --option value arguments.')
    out[args[i].slice(2)] = args[i + 1]
  }
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = readOptions(process.argv.slice(2))
    if (Object.keys(options).some(key => !['stock', 'output', 'site', 'request'].includes(key)) || !options.stock || !options.output || !options.request) throw new Error('Usage: npm run firmware:download -- --stock STOCK --output PRIVATE_DIR --request REQUEST.json [--site https://modwerk.app/]')
    const result = await buildAndSave(JSON.parse(await readFile(options.request, 'utf8')), { stockPath: resolve(options.stock), outputDir: resolve(options.output), site: options.site })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

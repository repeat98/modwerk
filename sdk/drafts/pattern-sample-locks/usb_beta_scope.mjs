// SPDX-License-Identifier: MIT
// Production components, private catalogue fixture; no browser, network or device.
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { compiledModuleVersions, moduleSourceFingerprint, moduleSourcePaths } from '../../../scripts/module-source.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
assert(process.argv[2], 'Usage: node usb_beta_scope.mjs PRIVATE_PUBLIC_PATH_DIRECTORY')
const directory = path.resolve(process.argv[2])
assert(directory !== root && !directory.startsWith(root + path.sep))
const json = async filename => JSON.parse(await readFile(filename, 'utf8'))
const stage = path.join(directory, 'private-app')
const manifestPath = path.join(stage, 'src/engine/assets/octatrack-module-packages.json')
const manifestBytes = await readFile(manifestPath)
const manifest = JSON.parse(manifestBytes)
const published = await json(path.join(root, 'src/engine/assets/octatrack-module-packages.json'))
const entry = manifest.packages[0]
assert.equal(entry.id, 'pattern-sample-locks')
assert.equal(entry.usbOnly, true)
const source = await json(path.join(root, 'sdk/drafts/pattern-sample-locks/octamod.module.json'))
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } })
try {
  const { MODULES } = await server.ssrLoadModule('/src/catalog/modules.ts')
  assert(!MODULES.some(module => module.id === source.id))
  MODULES.push({ id: source.id, key: source.key, name: source.name, category: source.category,
    author: source.author.github, version: source.version })
  const { moduleUsbOnly, moduleCardless, cardBuildError } = await server.ssrLoadModule('/src/catalog/usb-only.ts')
  const { libraryCompatibility } = await server.ssrLoadModule('/src/catalog/library-compatibility.ts')
  assert(moduleUsbOnly(source.id, manifest) && moduleCardless(source.id, manifest))
  const betaCard = cardBuildError([source.id], true, manifest)
  const classicCard = cardBuildError([source.id], false, manifest)
  assert.match(betaCard, /^Pattern Sample Locks needs the Modwerk base/)
  assert.match(betaCard, /Sync this set over USB/)
  assert.match(classicCard, /in the beta for now/)
  assert.deepEqual(libraryCompatibility(true, [], true, [source.id], manifest).blocks, {})
  assert.equal(libraryCompatibility(false, [], true, [source.id], manifest).blocks[source.id].kind, 'usb-only')

  // The CLI build fixture intentionally contains just the candidate. Inventory
  // parity needs the complete published list too, preserving other USB-only
  // exclusions such as Beat Slicer. Restore the fixture after this check.
  try {
    await writeFile(manifestPath, JSON.stringify({ ...published, packages: [...published.packages, entry] }))
    const catalog = await json(path.join(stage, 'sdk/catalog.json'))
    const versions = await compiledModuleVersions(stage, catalog)
    assert(!Object.hasOwn(versions, source.id))
    assert.deepEqual(versions, await compiledModuleVersions(root, await json(path.join(root, 'sdk/catalog.json'))))
    assert(!(await moduleSourcePaths(stage)).some(filename => filename.startsWith('modules/' + source.id + '/')))
    assert.equal(await moduleSourceFingerprint(stage), await moduleSourceFingerprint(root))
  } finally { await writeFile(manifestPath, manifestBytes) }

  const { createRuntimeCatalogue, removalPackage } = await server.ssrLoadModule('/src/engine/elekloader/module-set.ts')
  const { sha } = await server.ssrLoadModule('/vendor/elekloader/kit/src/bytes.ts')
  const data = new Uint8Array(await readFile(path.join(stage, 'public', entry.path)))
  assert.equal(sha(data), '3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79')
  const catalogue = createRuntimeCatalogue({ ...published, packages: [...published.packages, entry] })
  const binding = await json(path.join(root, 'sdk/machines/octatrack/base-binding.json'))
  const capabilities = { abi: 10, features: 7 | 128 | 512, maxSites: 128, maxCopies: 128 }
  const empty = { moduleIds: [], removedStockFx: [] }
  const bases = [...new Set([binding.identity, ...Object.values(binding.variants)])]
  for (const base of bases) {
    const add = await catalogue.prepare({ name: 'USB beta', moduleIds: [source.id] }, empty, async () => data, capabilities, base)
    assert.deepEqual(add.changes[0].data, data)
    assert.deepEqual(add.changes[0].undo, removalPackage(source.id))
    const remove = await catalogue.prepare({ name: 'Remove', moduleIds: [] }, { ...empty, moduleIds: [source.id] }, async () => data, capabilities, base)
    assert.deepEqual(remove.changes[0].undo, data)
  }
  const all = [...published.packages.map(row => row.id), source.id]
  const load = async row => row.id === source.id ? data : new Uint8Array(await readFile(path.join(root, 'public', row.path)))
  assert.equal((await catalogue.prepare({ name: 'All', moduleIds: all }, empty, load, capabilities, binding.identity)).changes.length, all.length)
  const receipt = { hardware: false, published: false, privateCatalogueFixtureOnly: true, usbOnly: true,
    cardRefusal: { beta: betaCard, classic: classicCard }, classicLibraryBlocked: true, betaLibraryAllowsUsbSelection: true,
    excludedFromCardCompilerVersionsAndSources: true, existingCardSourceFingerprintUnchanged: true,
    packageSha256: sha(data), byteIdenticalToEmulatorTestedPackage: true, sevenPublicBaseAddAndRemovalUndoPreflights: bases.length,
    allPackagesPreflighted: all.length, simultaneousRuntimeCompanionsTested: false }
  await writeFile(path.join(directory, 'usb-beta-scope.json'), JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt, null, 2))
} finally { await server.close() }

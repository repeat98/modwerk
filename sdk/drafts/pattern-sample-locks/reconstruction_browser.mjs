// SPDX-License-Identifier: MIT
// Private production-component checks; opens no browser, network or device.
import assert from 'node:assert/strict'
import process from 'node:process'
import console from 'node:console'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
assert(process.argv[2] && process.argv[3], 'Usage: node reconstruction_browser.mjs PRIVATE_OUTPUT STOCK_OS')
const directory = path.resolve(process.argv[2]), stockPath = path.resolve(process.argv[3])
assert(!directory.startsWith(root + path.sep))
const json = async name => JSON.parse(await readFile(name, 'utf8'))
const bytes = async name => new Uint8Array(await readFile(name))
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } })
try {
  const { sha } = await server.ssrLoadModule('/vendor/elekloader/kit/src/bytes.ts')
  const { MODULES } = await server.ssrLoadModule('/src/catalog/modules.ts')
  const source = await json(path.join(root, 'sdk/drafts/pattern-sample-locks/octamod.module.json'))
  assert(!MODULES.some(module => module.id === source.id))
  MODULES.push({ id: source.id, key: source.key, name: source.name, category: source.category,
    author: source.author.github, version: source.version })
  const { createRuntimeCatalogue, removalPackage, BaseUpdateRequired } =
    await server.ssrLoadModule('/src/engine/elekloader/module-set.ts')
  const entry = (await json(path.join(directory, 'candidate-manifest.json'))).packages[0]
  const data = await bytes(path.join(directory, entry.path))
  assert.equal(sha(data), entry.sha256)
  const published = await json(path.join(root, 'src/engine/assets/octatrack-module-packages.json'))
  const catalogue = createRuntimeCatalogue({ ...published, packages: [...published.packages, entry] })
  const binding = await json(path.join(root, 'sdk/machines/octatrack/base-binding.json'))
  const capabilities = { abi: 10, features: 7 | 128 | 512, maxSites: 128, maxCopies: 128 }
  const empty = { moduleIds: [], removedStockFx: [] }, target = { name: 'Candidate', moduleIds: [source.id] }
  let fetches = 0
  const load = async item => { fetches++; return item.id === source.id ? data : bytes(path.join(root, 'public', item.path)) }
  const preflight = []
  for (const [layout, base] of Object.entries(binding.variants)) {
    const add = await catalogue.prepare(target, empty, load, capabilities, base)
    assert.deepEqual(add.changes[0].data, data)
    assert.deepEqual(add.changes[0].undo, removalPackage(source.id))
    const remove = await catalogue.prepare({ name: 'Remove', moduleIds: [] }, { ...empty, moduleIds: [source.id] }, load, capabilities, base)
    assert.deepEqual(remove.changes[0].undo, data)
    preflight.push({ layout, base, addAndRemovalUndo: true })
  }
  const all = { name: 'All packages', moduleIds: [...published.packages.map(item => item.id), source.id] }
  assert.equal((await catalogue.prepare(all, empty, load, capabilities, binding.identity)).changes.length, published.packages.length + 1)
  assert.equal((await catalogue.prepare(all, { ...empty, moduleIds: all.moduleIds.slice(0, -1) }, load, capabilities, binding.identity)).changes.length, 1)
  const before = fetches
  await assert.rejects(catalogue.prepare(target, empty, load, { ...capabilities, maxCopies: entry.copies - 1 }, binding.identity), BaseUpdateRequired)
  assert.equal(fetches, before)
  const negatives = []
  for (const item of await json(path.join(directory, 'negative-packages.json'))) {
    const variant = await bytes(path.join(directory, item.file))
    const changed = { ...entry, sha256: sha(variant), bytes: variant.length }
    const check = createRuntimeCatalogue({ packages: [changed] })
    const structural = !['wrong-stock-hash', 'invalid-stock-address'].includes(item.case)
    if (structural) await assert.rejects(check.prepare(target, empty, async () => variant, capabilities, binding.identity), /inconsistent/)
    else await check.prepare(target, empty, async () => variant, capabilities, binding.identity)
    negatives.push({ case: item.case, browserStructuralRejection: structural, nativeGuardRequired: !structural })
  }
  const { buildBase } = await server.ssrLoadModule('/src/engine/elekloader/octatrack-base.ts')
  const { variantPackage } = await server.ssrLoadModule('/src/engine/elekloader/base-variants.ts')
  const formats = await server.ssrLoadModule('/vendor/elekloader/kit/src/formats.ts')
  const defaultText = await readFile(path.join(root, 'src/engine/assets/octatrack-base.elemod'), 'utf8')
  const defaultFills = await json(path.join(root, 'src/engine/assets/octatrack-base-fills.json'))
  const variants = await json(path.join(root, 'src/engine/assets/octatrack-base-variants.json'))
  const recipe = await json(path.join(directory, 'candidate-recipe.json'))
  const stock = await bytes(stockPath)
  const [, device] = await formats.load(stock)
  const baseSources = []
  for (const [layout, identity] of Object.entries(binding.variants)) {
    const variant = variantPackage(defaultText, variants, layout)
    const built = await buildBase(stock, variant?.text ?? defaultText, variant?.fills ?? defaultFills)
    assert.equal(built.base, identity)
    const main = formats.mainImage(formats.parse(built.bin, device), device)
    for (const copy of recipe.copies) {
      const at = copy.address - device.mainLoad
      assert.equal(sha(main.subarray(at, at + copy.length)), copy.sha256, `${layout} changed source at ${copy.address.toString(16)}`)
    }
    baseSources.push({ layout, identity, downloadSha256: built.sha256, allCopySourceHashesMatch: true })
    console.log('Verified reconstructed source bytes on public base: ' + layout)
  }
  const report = { hardware: false, published: false, privateCatalogueFixtureOnly: true,
    candidatePackageSha256: entry.sha256, preflight, allPackagesPreflight: published.packages.length + 1,
    stockCopyCapacityRequiredBeforeFetch: entry.copies, malformedPackages: negatives, builtPublicBases: baseSources,
    limitations: 'Source-byte and preflight checks; no physical playback, card UI, complete stack or simultaneous companion runtime qualification.' }
  await writeFile(path.join(directory, 'browser-reconstruction.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('PASS: production USB preflight, malformed records and copy sources in seven public-base builds')
} finally {
  await server.close()
}

// SPDX-License-Identifier: MIT
// Private catalogue fixture: exercise production components without publication.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const directory = path.resolve(process.argv[2] ?? '')
assert(process.argv[2], 'Usage: node beta_package_parity.mjs PRIVATE_CANDIDATE_DIRECTORY')
assert(!directory.startsWith(root + path.sep), 'Artifacts must stay outside Git')
const json = async filename => JSON.parse(await readFile(filename, 'utf8'))
const bytes = async filename => new Uint8Array(await readFile(filename))
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } })
try {
  const source = await json(path.join(here, 'octamod.module.json'))
  const { MODULES } = await server.ssrLoadModule('/src/catalog/modules.ts')
  assert(!MODULES.some(module => module.id === source.id), 'Draft must remain unpublished')
  // The sole catalogue change is in this isolated JS process. No generated file
  // or admission/qualification gate is changed, and no USB connection is opened.
  MODULES.push({ id: source.id, key: source.key, name: source.name,
    category: source.category, author: source.author.github, version: source.version })
  const { createRuntimeCatalogue, removalPackage, runtimeId, BaseUpdateRequired } =
    await server.ssrLoadModule('/src/engine/elekloader/module-set.ts')
  const { parseColdFireObject } = await server.ssrLoadModule('/src/engine/coldfire-elf.ts')
  const { linkColdFireRuntime } = await server.ssrLoadModule('/src/engine/coldfire-link.ts')
  const { sha } = await server.ssrLoadModule('/vendor/elekloader/kit/src/bytes.ts')
  const candidate = (await json(path.join(directory, 'candidate-manifest.json'))).packages[0]
  const data = await bytes(path.join(directory, 'pattern-sample-locks-0.1.8-candidate.mwrm'))
  assert.equal(sha(data), candidate.sha256)
  const published = await json(path.join(root, 'src/engine/assets/octatrack-module-packages.json'))
  const catalogue = createRuntimeCatalogue({ ...published, packages: [...published.packages, candidate] })
  const binding = await json(path.join(root, 'sdk/machines/octatrack/base-binding.json'))
  const bases = [...new Set([binding.identity, ...Object.values(binding.variants)])]
  const capabilities = { abi: 10, features: 7 | 128 | 512, maxSites: 128, maxCopies: 128 }
  const empty = { moduleIds: [], removedStockFx: [] }
  const target = { name: 'Private Sample Locks candidate', moduleIds: [source.id] }
  const installed = { ...empty, moduleIds: [source.id] }
  let fetches = 0
  const load = async entry => {
    fetches++
    return entry.id === source.id ? data : bytes(path.join(root, 'public', entry.path))
  }
  const cases = []
  for (const base of bases) {
    const add = await catalogue.prepare(target, empty, load, capabilities, base)
    assert.equal(add.changes.length, 1)
    assert.deepEqual(add.changes[0].data, data)
    assert.deepEqual(add.changes[0].undo, removalPackage(source.id))
    const remove = await catalogue.prepare({ name: 'Remove', moduleIds: [] }, installed, load, capabilities, base)
    assert.deepEqual(remove.changes[0].data, removalPackage(source.id))
    assert.deepEqual(remove.changes[0].undo, data)
    cases.push({ base, standaloneAddAndRemovalUndo: true })
  }
  const companions = published.packages.map(entry => entry.id)
  const all = { name: 'Private complete package preflight', moduleIds: [...companions, source.id] }
  const compose = await catalogue.prepare(all, empty, load, capabilities, binding.identity)
  assert.equal(compose.changes.length, published.packages.length + 1)
  const retain = await catalogue.prepare(all, { ...empty, moduleIds: companions }, load, capabilities, binding.identity)
  assert.equal(retain.changes.length, 1)
  assert.deepEqual(retain.changes[0].data, data)
  assert.deepEqual(catalogue.inventory([{ module: runtimeId(source.id), name: 'SAMPLE LOCKS', handle: 1, layout: 0 }]), installed)
  const before = fetches
  await assert.rejects(catalogue.prepare(target, empty, load, { ...capabilities, abi: 7 }, binding.identity), BaseUpdateRequired)
  await assert.rejects(catalogue.prepare(target, empty, load, { ...capabilities, maxSites: 2 }, binding.identity), BaseUpdateRequired)
  assert.equal(fetches, before, 'Incompatible base must be rejected before fetching')
  const corrupt = data.slice(); corrupt[corrupt.length - 1] ^= 1
  await assert.rejects(catalogue.prepare(target, empty, async () => corrupt, capabilities, binding.identity), /intact|inconsistent/)
  const object = parseColdFireObject(await bytes(path.join(directory, 'audit/unit.o')))
  const linkCases = []
  for (const oracle of await json(path.join(directory, 'audit/card-oracles.json'))) {
    const linked = linkColdFireRuntime([{ label: 'psl', object }], oracle.base)
    assert.equal(linked.bytes.length, oracle.bytes)
    assert.equal(sha(linked.bytes), oracle.sha256)
    assert.deepEqual(Object.fromEntries(linked.symbols), oracle.exports)
    assert.equal(linked.memoryEnd, oracle.exports._end)
    linkCases.push({ base: oracle.base, bytes: oracle.bytes, sha256: oracle.sha256, globalsAndMemoryEndMatch: true })
  }
  const report = { hardware: false, published: false, privateCatalogueFixtureOnly: true,
    packageSha256: candidate.sha256, basePreflightCases: cases,
    allPackagePreflightCount: compose.changes.length, companionAdditionChanges: retain.changes.length,
    inventoryMapping: true, oldAbiAndSiteLimitRefusedBeforeFetch: true, corruptedPackageRefused: true,
    cardLinkerComponentCases: linkCases, completeCardCompositionTested: false,
    limitations: 'In-memory catalogue fixture and production component checks only. No device, audio, native stock-only UI integration, stock-free approval or public catalogue admission is established.' }
  await writeFile(path.join(directory, 'browser-parity.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await server.close()
}

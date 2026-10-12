// SPDX-License-Identifier: GPL-3.0-or-later
// Private local qualification. Firmware is read locally; report contains only hashes/layouts.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parseElemod, linkMods } from '../src/engine/elektron/elemod.ts'
import { materializeElemodRecipe as materializeModuleObject } from '../src/catalog/elemod-recipe.ts'
import { packageRecipe } from './package-elemod-recipe.mjs'
import { partsBytes } from '../vendor/elekloader/kit/src/elemod.ts'
import { isDeepStrictEqual } from 'node:util'
import { Mod2, link as kitLink } from '../vendor/elekloader/kit/src/link.ts'

const args = process.argv.slice(2), get = key => args[args.indexOf(key) + 1]
for (const key of ['--packages', '--reference', '--out', '--features']) if (!args.includes(key)) throw new Error('Expected ' + key)
const packages = resolve(get('--packages')), reference = resolve(get('--reference')), out = resolve(get('--out'))
const features = get('--features').split(',')
if (features.length > 8 || features.length < 1 || new Set(features).size !== features.length || features.some(id => !/^[a-z][a-z0-9-]*$/.test(id))) throw new Error('Invalid features')
const json = async path => JSON.parse(await readFile(path, 'utf8')), sha = bytes => createHash('sha256').update(bytes).digest('hex')
const inventory = await json(resolve(packages, 'elemod-build.json')), cases = [], objects = []
await mkdir(out, { recursive: true })
for (const os of ['1.53', '1.54']) {
  const stock = new Uint8Array(await readFile(resolve(reference, os, 'combinations/all/stock-main.bin')))
  const own = new Map(), expected = new Map()
  for (const name of await readdir(resolve(reference, os, 'mods'))) if (name.endsWith('.elemod')) {
    const doc = await json(resolve(reference, os, 'mods', name)); expected.set(doc.id, doc)
  }
  for (const artifact of inventory.artifacts.filter(item => item.release === os && item.machine === 'digitakt')) {
    if (!/^digitakt\/[a-z][a-z0-9-]*\/1\.5[34]\.json$/.test(artifact.path)) throw new Error('Invalid artifact path')
    const bytes = await readFile(resolve(packages, artifact.path)), plan = JSON.parse(bytes)
    if (sha(bytes) !== artifact.sha256 || plan.provenance.sourceCommit !== inventory.sourceCommit || plan.id !== artifact.id || plan.version !== artifact.version || plan.release !== os) throw new Error('Inventory changed')
    const module = await materializeModuleObject(plan, stock), exported = packageRecipe(plan)
    if (JSON.stringify(exported) !== JSON.stringify(module)) throw new Error('Local and source-only export differ: ' + plan.id)
    const compiled = new Mod2(module), original = new Mod2(expected.get(plan.id))
    const normalize = (mod, selected) => {
      const symbols = new Map(mod.symbols)
      if (selected && symbols.has('DT_OS154')) {
        if (!isDeepStrictEqual(symbols.get('DT_OS154'), ['abs', Number(os === '1.54')])) throw new Error('Incorrect OS selector')
        symbols.delete('DT_OS154')
      }
      return {
        sections: [...mod.sections].map(([name, section]) => [name, section.align, section.size ?? section.len, section.parts ? sha(partsBytes(section.parts, stock, mod.dev)) : null]),
        symbols: [...symbols].sort(), exports: mod.exports, imports: mod.imports, weak: [...mod.weak], relocs: mod.relocs,
        sites: mod.sites, collections: [...mod.collections], contribute: mod.contribute, copied: mod.copied, regions: mod.regions,
        names: mod.names, needsCore: mod.needsCore, requires: mod.requires,
      }
    }
    if (!isDeepStrictEqual(normalize(compiled, true), normalize(original, false))) {
      const a=normalize(compiled,true), b=normalize(original,false)
      throw new Error('Module semantic parity differs: '+plan.id+' '+Object.keys(a).filter(k=>!isDeepStrictEqual(a[k],b[k])).join(','))
    }
    const addedConflicts = compiled.conflicts.filter(id => !original.conflicts.includes(id))
    if (original.conflicts.some(id => !compiled.conflicts.includes(id)) || addedConflicts.some(id => plan.id !== 'sample-tools' || id !== 'digislicer')) throw new Error('Unreviewed conflict change')
    own.set(plan.id, module)
    await mkdir(resolve(out, os), { recursive: true })
    await writeFile(resolve(out, os, plan.id + '.elemod'), JSON.stringify(exported, null, 1) + '\n')
    objects.push({ id: plan.id, os, semanticParity: true, addedConflicts, recipeSha256: artifact.sha256, sourceTreeSha256: artifact.sourceTreeSha256, exportedSha256: sha(JSON.stringify(exported, null, 1) + '\n') })
  }
  // Core is not compiled here: take the catalogue's pinned Digitakt core for this OS (Core 2.1).
  if (!own.has('core')) {
    const catalog = await json(resolve('vendor/elekloader/catalog/catalog.json'))
    const pin = catalog.cores.find(item => item.id === 'core' && item.device === 'digitakt-mk1' && item.os === os && item.version === '2.1')
    if (!pin) throw new Error('No catalogue Core 2.1 for ' + os)
    const bytes = await readFile(resolve('vendor/elekloader/catalog', pin.file))
    if (sha(bytes) !== pin.sha256) throw new Error('Catalogue core hash differs: ' + pin.file)
    own.set('core', JSON.parse(bytes))
  }
  const resolveSelection = (docs, enabled) => {
    const selected = new Set(), active = new Set()
    const visit = id => {
      if (active.has(id)) throw new Error('Dependency cycle')
      if (selected.has(id)) return
      const doc = docs.get(id)
      if (!doc) throw new Error('Missing dependency: ' + id)
      active.add(id)
      for (const dep of doc.requires ?? []) visit(dep)
      active.delete(id); selected.add(id)
    }
    visit('core'); enabled.forEach(visit)
    return [...selected].map(id => docs.get(id))
  }
  for (let mask = 1; mask < 1 << features.length; mask++) {
    const enabled = features.filter((_, i) => mask & 1 << i), name = enabled.length === features.length ? 'all' : enabled.join('+')
    const selection = resolveSelection(own, enabled), authorSelection = resolveSelection(expected, enabled)
    const parsed = selection.map(doc => parseElemod(doc))
    const built = await linkMods(parsed, stock), reversed = await linkMods([...parsed].reverse(), stock)
    const browser = kitLink(selection.map(doc => new Mod2(doc)), stock)
    const author = kitLink(authorSelection.map(doc => new Mod2(doc)), stock)
    const native = await readFile(resolve(reference, os, 'combinations', name, 'patched-main.bin'))
    const hashes = { modwerk: sha(built.image), reverseOrder: sha(reversed.image), browserKit: sha(browser.image), elekloaderObjects: sha(author.image), nativeReference: sha(native) }
    const passed = new Set(Object.values(hashes)).size === 1
    cases.push({ os, features: enabled, passed, hashes, memory: browser.layout })
    if (!passed) { console.error(os, name, hashes); break }
  }
  console.log(os + ': ' + cases.filter(item => item.os === os && item.passed).length + ' matching selections')
}
const report = { schemaVersion: 1, sourceCommit: inventory.sourceCommit, compiler: inventory.compiler, passed: cases.length === 2 * ((1 << features.length) - 1) && cases.every(item => item.passed), objects, cases }
await writeFile(resolve(out, 'matrix.json'), JSON.stringify(report, null, 2) + '\n')
if (!report.passed) process.exitCode = 1

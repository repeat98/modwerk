// SPDX-License-Identifier: GPL-3.0-or-later
// Build a flashable .syx from your own stock OS, a core and Modwerk modules, the way the site's browser builder does:
// compile each --module with scripts/build-elemod-packages.mjs, materialize its recipe against your stock main OS,
// link it with the core (and any prebuilt --elemod), and write the stock file again with the new main OS section.
//
//   node scripts/link-image.mjs --stock Analog-Rytm_MKII_OS1.74.syx --version XX01 --out my-build.syx \
//     --elemod vendor/elekloader/catalog/core-ar2-0.7.elemod --module analog-rytm-mkii:pipo-loop
//
// Needs the cross toolchain (MODWERK_CROSS, default m68k-elf-). Your firmware is read and the result written where you
// say; neither enters Git. The result is a local test image: whether it is safe on a unit is for hardware to show.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { materializeElemodRecipe } from '../src/catalog/elemod-recipe.ts'
import { ELE3_DEVICES, mainImage, packMain, readEle3Syx, verifyEle3Build, writeEle3Syx } from '../src/engine/elektron/ele3.ts'
import { linkMods, parseElemod } from '../src/engine/elektron/elemod.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const values = flag => args.flatMap((arg, i) => arg === flag ? [args[i + 1]] : [])
const [stockPath] = values('--stock'), [out] = values('--out'), [version] = values('--version')
const prebuilt = values('--elemod'), modules = values('--module')
if (!stockPath || !out || !version || !prebuilt.length || modules.some(id => !/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(id)))
  throw new Error('Usage: link-image.mjs --stock STOCK.syx --version XX01 --out OUT.syx --elemod CORE.elemod [--elemod MORE.elemod] [--module machine:id ...]')

const json = async path => JSON.parse(await readFile(resolve(path), 'utf8'))
const stock = readEle3Syx(new Uint8Array(await readFile(resolve(stockPath))))
const mods = []
for (const path of prebuilt) mods.push(parseElemod(await json(path), path))
const machine = mods[0].device.machine
const device = ELE3_DEVICES[machine]
if (!device) throw new Error('No firmware container for ' + machine)
const image = mainImage(stock, device)

if (modules.length) {
  const tmp = await mkdtemp(resolve(tmpdir(), 'link-image-'))
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    execFileSync('node', [resolve(root, 'scripts/build-elemod-packages.mjs'), '--output', tmp, '--source-commit', commit, '--drafts', ...modules.flatMap(id => ['--module', id])], { cwd: root, stdio: 'inherit' })
    for (const id of modules) {
      const [moduleMachine, name] = id.split(':')
      const plan = await json(resolve(tmp, moduleMachine, name, mods[0].release.version + '.json'))
      mods.push(parseElemod(await materializeElemodRecipe({ ...plan.module, ...plan, sites: plan.sites }, image), id))
    }
  } finally { await rm(tmp, { recursive: true, force: true }) }
}

const linked = await linkMods(mods, image)
const built = writeEle3Syx(stock, packMain(linked.image), device, version)
const facts = verifyEle3Build(built, stock, linked.image, device, version)
await writeFile(resolve(out), built)
console.log(JSON.stringify({ out: resolve(out), sha256: createHash('sha256').update(built).digest('hex'), order: linked.order, flashHeadroom: facts.flashHeadroom }, null, 1))

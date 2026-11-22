// SPDX-License-Identifier: GPL-3.0-or-later
// Build a flashable .syx from your own stock OS, a core and Modwerk modules, the way the site's browser builder does:
// compile each --module with scripts/build-elemod-packages.mjs, materialize its recipe against your stock main OS,
// link it with the core (and any prebuilt --elemod), and write the stock file again with the new main OS section.
//
//   node scripts/link-image.mjs --stock Analog-Rytm_MKII_OS1.74.syx --version XX01 --out my-build.syx \
//     --elemod vendor/elekloader/catalog/core-ar2-0.7.elemod --module analog-rytm-mkii:sample-rate
//
// A core with mod storage lays every module's saved fields out afresh unless you pass the lockfile of the build the unit
// runs now (--lock-in): with it, every field stays where that build's projects keep it. --lock-out writes this build's
// lockfile for the next one.
//
// A Digitakt II set is built as the website builds it (src/engine/elekloader/dt2-link.ts): the kit's build, then the
// step that adds the base's and the modules' sound-chip parts, so the image is the one a musician's browser makes from
// the same stock file, packages and version.
//
// Needs the cross toolchain (MODWERK_CROSS, default m68k-elf-). Your firmware is read and the result written where you
// say; neither enters Git. The result is a local test image: whether it is safe on a unit is for hardware to show.
// It prints the image's sha256, the flash left (flashHeadroom) and the shared mod RAM and fast RAM the set leaves free
// (ramSpare, fastSpare), in bytes. On the Rytm's base, which lends send effects that RAM, it also prints the largest
// effect's ask and the room the set leaves it, in words (fxWork), and refuses a set that leaves too little.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { materializeElemodRecipe } from '../src/catalog/elemod-recipe.ts'
import { linkDt2Image } from '../src/engine/elekloader/dt2-link.ts'
import { ELE3_DEVICES, mainImage, packMain, readEle3Syx, verifyEle3Build, writeEle3Syx } from '../src/engine/elektron/ele3.ts'
import { linkMods, parseElemod } from '../src/engine/elektron/elemod.ts'
import { sendFxRoom } from '../src/engine/elekloader/rytm-fx-room.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const values = flag => args.flatMap((arg, i) => arg === flag ? [args[i + 1]] : [])
const [stockPath] = values('--stock'), [out] = values('--out'), [version] = values('--version')
const prebuilt = values('--elemod'), modules = values('--module'), [lockIn] = values('--lock-in'), [lockOut] = values('--lock-out')
if (!stockPath || !out || !version || !prebuilt.length || modules.some(id => !/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(id)))
  throw new Error('Usage: link-image.mjs --stock STOCK.syx --version XX01 --out OUT.syx --elemod CORE.elemod [--elemod MORE.elemod] [--module machine:id ...] [--lock-in OLD.lock.json] [--lock-out NEW.lock.json]')

const json = async path => JSON.parse(await readFile(resolve(path), 'utf8'))
const stockBytes = new Uint8Array(await readFile(resolve(stockPath)))
const stock = readEle3Syx(stockBytes)
const mods = [], documents = []
for (const path of prebuilt) { const document = await json(path); documents.push({ name: basename(path), document }); mods.push(parseElemod(document, path)) }
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
      const document = await materializeElemodRecipe({ ...plan.module, ...plan, sites: plan.sites }, image)
      documents.push({ name: id, document })
      mods.push(parseElemod(document, id))
    }
  } finally { await rm(tmp, { recursive: true, force: true }) }
}

// The Digitakt II's OS file carries a seal only the kit's writer redoes: build it as the website does (the kit, then the
// composition step that adds the base's and the modules' sound-chip parts), so both make the same image.
if (machine === 'digitakt-ii') {
  const files = await Promise.all(documents.map(async ({ name, document }, index) => ({ name: name.endsWith('.elemod') ? name : name.replace(':', '-') + '.elemod',
    bytes: index < prebuilt.length ? new Uint8Array(await readFile(resolve(prebuilt[index]))) : new TextEncoder().encode(JSON.stringify(document)) })))
  const result = await linkDt2Image(stockBytes, files, version, lockIn ? await json(lockIn) : null)
  if (lockOut && !result.store) throw new Error('--lock-out: this set has no mod storage, so there is no lockfile to write')
  if (lockOut) await writeFile(resolve(lockOut), JSON.stringify(result.store, null, 1) + '\n')
  await writeFile(resolve(out), result.syx)
  console.log(JSON.stringify({ out: resolve(out), sha256: createHash('sha256').update(result.syx).digest('hex'), files: files.map(file => file.name), soundChip: result.composed ? 'composed' : 'stock' }, null, 1))
  process.exit(0)
}

const linked = await linkMods(mods, image, lockIn ? await json(lockIn) : null)
if (linked.storeNotes.length) console.error(linked.storeNotes.join('\n'))
// The Rytm base's send effects work in the RAM the set leaves free: a set that leaves too little would not list one.
// An older base, which reserves a work area of its own, does not import __bss_end.
const lends = machine === 'analog-rytm-mkii' && mods.some(mod => mod.sections['.boot'] && mod.imports.includes('__bss_end'))
const fx = lends ? sendFxRoom(linked, mods[0].device.mainLoad) : undefined
if (fx && fx.largest > fx.room)
  throw new Error(`The set leaves the send effects ${fx.room} words of work area, and its largest effect asks for ${fx.largest}: drop a module or that effect.`)
if (lockOut && !linked.store) throw new Error('--lock-out: this set has no mod storage, so there is no lockfile to write')
if (lockOut) await writeFile(resolve(lockOut), JSON.stringify(linked.store, null, 1) + '\n')
const built = writeEle3Syx(stock, packMain(linked.image), device, version)
const facts = verifyEle3Build(built, stock, linked.image, device, version)
await writeFile(resolve(out), built)
console.log(JSON.stringify({ out: resolve(out), sha256: createHash('sha256').update(built).digest('hex'), order: linked.order, flashHeadroom: facts.flashHeadroom, ramSpare: linked.layout.ddrSpare, fastSpare: linked.layout.fastSpare, ...(fx && { fxWork: fx }) }, null, 1))

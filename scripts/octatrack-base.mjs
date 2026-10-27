// SPDX-License-Identifier: GPL-3.0-or-later
// The committed Octatrack base package (src/engine/assets/octatrack-base.elemod and its fills), rebuilt from source
// and your own OS 1.40C file, then proven three ways: it carries no stock bytes (check_stock_free.py), it is the
// committed one (or, with --write, becomes it), and the browser's path (octatrack-base.ts, the kit in TypeScript)
// builds a .bin byte-identical to build_core.py's NOT_FLASH_CANDIDATE.bin, which passes check_flash_safety.py.
// With --out the browser-built .bin, its MAIN.raw and build_core.py's proofs.json and symbols.json are saved there,
// a new directory outside Git: what `npm run device -- boot DIR` and the emulator's run scripts read. Firmware and generated images never enter the checkout.
//
//   npm run octatrack:base -- --stock OCTATRACK_OS1.40C.bin [--upstream ELEKLOADER] [--write] [--out NEW-DIR]
// Private transport candidates may add --usb-midi and --usb-audio "USB AUDIO OUT TRACKS MAIN CUE". --site-events builds the
// base that owns sdk/machines/octatrack/hooks.json's sites and tables and dispatches them to subscribed packages;
// --table-owners also fills its table-owner storage from module-adapters/table-owners.json (the reviewed table owners).
// --cached-modules runs installed module code from the pool's cached alias (cache maintenance on install; part of the
// beta base: without it every instruction and load of a module goes to SDRAM). --resident-stock-hooks --controllers adds the resident Sidechain, Output Matrix and Analog BD engines and admits their packages
// through committed trust rows (module-adapters/controller-policies.json). --resident-on-demand (with --resident-stock-hooks)
// keeps those engines out of the DSP cores until a package that needs one is installed, so the cores' effect arena is
// larger (docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md). Every build also writes
// sdk/machines/octatrack/base-binding.json, which the base-bound packages link against (module_packages.py). The committed
// base is the beta base, and --write takes only --beta, which names every one of its flags (BETA below):
//   npm run octatrack:base -- --stock OS.bin --beta --write
// A change that moves the base's lease entries also changes Analog BD's package: recapture its reviewed recipe
// (module-adapters/machine-recipes.json) against the new base's symbols first (docs/OCTATRACK_BETA_TEST_PLAN.md, finding 17).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { sha } from '../vendor/elekloader/kit/src/bytes.ts'
import * as formats from '../vendor/elekloader/kit/src/formats.ts'
import { buildBase } from '../src/engine/elekloader/octatrack-base.ts'
import { applyVariantPatch } from '../src/engine/elekloader/base-variants.ts'
import { USB_AUDIO_LAYOUTS } from '../src/config/usb-audio.ts'

const { values: args } = parseArgs({ options: {
  stock: { type: 'string' }, upstream: { type: 'string', default: join(homedir(), '.cache/modwerk-upstream/elekloader') },
  write: { type: 'boolean', default: false }, out: { type: 'string' },
  'usb-midi': { type: 'boolean', default: false }, 'usb-audio': { type: 'string' }, 'site-events': { type: 'boolean', default: false },
  'table-owners': { type: 'boolean', default: false },
  'resident-stock-hooks': { type: 'boolean', default: false }, 'resident-on-demand': { type: 'boolean', default: false },
  'saved-set-export': { type: 'boolean', default: false },
  controllers: { type: 'boolean', default: false }, 'usb-audio-variants': { type: 'boolean', default: false },
  'cached-modules': { type: 'boolean', default: false },
  'module-sets': { type: 'boolean', default: false }, beta: { type: 'boolean', default: false },
} })
if (!args.stock) throw new Error('Usage: npm run octatrack:base -- --stock OCTATRACK_OS1.40C.bin [--beta] [--upstream ELEKLOADER] [--write] [--out NEW-DIR]')
// The beta base's flags. A regeneration that spelled them out by hand dropped --cached-modules once (20 October 2026),
// and every base after it ran module code uncached: so --write takes only these, through --beta.
const BETA = { 'usb-midi': true, 'usb-audio': 'USB AUDIO OUT TRACKS MAIN CUE', 'site-events': true, 'table-owners': true,
  'resident-stock-hooks': true, 'resident-on-demand': true, controllers: true, 'module-sets': true, 'usb-audio-variants': true,
  'cached-modules': true }
if (args.beta) {
  const own = Object.keys(args).filter(flag => !['stock', 'upstream', 'write', 'out', 'beta'].includes(flag) && process.argv.some(arg => arg === '--' + flag || arg.startsWith('--' + flag + '=')))
  if (own.length) throw new Error('--beta is every flag of the beta base; leave out ' + own.map(flag => '--' + flag).join(', ') + '.')
  Object.assign(args, BETA)
} else if (args.write) throw new Error('--write commits the beta base: build it with --beta, not flags of your own.')
const root = resolve(import.meta.dirname, '..'), here = join(root, 'sdk/machines/octatrack/elekloader')
const adapters = join(root, 'sdk/machines/octatrack/module-adapters')
const committed = { package: join(root, 'src/engine/assets/octatrack-base.elemod'), fills: join(root, 'src/engine/assets/octatrack-base-fills.json'),
  sources: join(root, 'src/engine/assets/octatrack-base-sources.json'), binding: join(root, 'sdk/machines/octatrack/base-binding.json'),
  variants: join(root, 'src/engine/assets/octatrack-base-variants.json'),
  policies: join(adapters, 'controller-policies.json') }
const asm = process.env.ELEKLOADER_DSP_ASM ?? join(homedir(), '.cache/modwerk-upstream/octabam/vendor/dsp56300/build/source/dsp_host/dsp_asm')
const python = (script, ...rest) => execFileSync('python3', ['-B', script.includes('/') ? script : join(here, script), ...rest], { stdio: 'inherit', env: { ...process.env, ELEKLOADER_DSP_ASM: asm } })
const same = (fresh, path) => {
  if (args.write) writeFileSync(path, fresh)
  else assert(existsSync(path) && fresh.equals(readFileSync(path)), path + ' is not what this source builds: run with --write and commit it.')
}

if (args['resident-on-demand'] && !args['resident-stock-hooks']) throw new Error('--resident-on-demand needs --resident-stock-hooks.')
if (args['resident-stock-hooks'] && !args['resident-on-demand']) throw new Error('--resident-stock-hooks needs --resident-on-demand: Analog BD’s engine is its package’s.')
const work = mkdtempSync(join(tmpdir(), 'modwerk-base-')), core = join(work, 'core')
const buildLayout = (layout, output, ...rest) => python('build_core.py', '--stock', args.stock, '--upstream', args.upstream, '--output', output, '--dsp-loader',
  ...(args['usb-midi'] ? ['--usb-midi'] : []), ...(layout ? ['--usb-audio', layout] : []),
  ...(args['site-events'] ? ['--site-events'] : []), ...(args['cached-modules'] ? ['--cached-modules'] : []),
  ...(args['table-owners'] ? ['--table-owners', join(adapters, 'table-owners.json')] : []),
  ...(args['resident-stock-hooks'] ? ['--resident-stock-hooks'] : []), ...(args['resident-on-demand'] ? ['--resident-on-demand'] : []),
  ...(args['saved-set-export'] ? ['--saved-set-export'] : []), ...(args['module-sets'] ? ['--module-sets'] : []), ...rest)
const build = (output, ...rest) => buildLayout(args['usb-audio'], output, ...rest)
const defaultLayout = USB_AUDIO_LAYOUTS.find(layout => layout.key === args['usb-audio'])?.id
if (args['usb-audio-variants'] && (!args['usb-midi'] || !defaultLayout)) throw new Error('--usb-audio-variants needs --usb-midi and a --usb-audio layout, the default variant.')
if (args.controllers) {
  // Sidechain, Output Matrix and Analog BD call the base's lease entries by address, and the base admits them by their
  // hashes: build it with empty trust rows, encode the packages against that link (base_bound.py rows), then build it
  // again with their rows. build_core.py refuses the second build if any symbol moved (--controller-layout), so the
  // packages hold for the final base.
  if (!args['resident-stock-hooks']) throw new Error('--controllers needs --resident-stock-hooks.')
  const empty = join(work, 'empty'), encoded = join(work, 'controllers')
  build(empty)
  python(join(adapters, 'base_bound.py'), 'rows', '--base-symbols', join(empty, 'symbols.json'), '--upstream', args.upstream, '--out', encoded)
  same(readFileSync(join(encoded, 'controller-policies.json')), committed.policies)
  build(core, '--controller-policies', committed.policies, '--controller-layout', join(empty, 'symbols.json'))
} else build(core)
python('check_stock_free.py', join(core, 'base.elemod'), '--stock', args.stock, '--upstream', args.upstream)
for (const [key, file] of [['package', 'base.elemod'], ['fills', 'base-fills.json'], ['sources', 'base-sources.json']])
  same(readFileSync(join(core, file)), committed[key])
// What the base-bound packages link against (module-adapters/base_bound.py): its identity, arena, pool and lease entries.
const bind = (dir, out) => {
  python(join(adapters, 'base_bound.py'), 'bind', dir, ...(args.controllers ? ['--policies', committed.policies] : []), '-o', out)
  return JSON.parse(readFileSync(out, 'utf8'))
}
const binding = bind(core, join(work, 'binding.json'))

const stock = new Uint8Array(readFileSync(args.stock))
const browser = await buildBase(stock, readFileSync(committed.package, 'utf8'), JSON.parse(readFileSync(committed.fills, 'utf8')))
const native = new Uint8Array(readFileSync(join(core, 'NOT_FLASH_CANDIDATE.bin')))
assert.equal(browser.sha256, sha(native), 'The browser-built .bin differs from build_core.py\'s.')
python('check_flash_safety.py', '--stock', args.stock, '--build', core, '--upstream', args.upstream)

// Every other USB Audio layout, and USB MIDI alone: the same base with another USB block (build_core.py usb_reserve).
// Each must take the very same controller packages and link everything else where the default does, patch no stock
// site the default leaves alone (stock copies are checked against the default's sites), and build in the browser
// from the default package and its patch exactly as build_core.py builds it.
if (args['usb-audio-variants']) {
  const defaultText = readFileSync(join(core, 'base.elemod'), 'utf8'), defaultSites = new Set(JSON.parse(defaultText).sites.map(site => site.addr + '+' + site.len))
  const variants = [], identities = { [defaultLayout]: binding.identity }
  for (const layout of [...USB_AUDIO_LAYOUTS.map(item => item.id), 'off'].filter(id => id !== defaultLayout)) {
    const key = USB_AUDIO_LAYOUTS.find(item => item.id === layout)?.key, dir = join(work, 'variant-' + layout)
    if (args.controllers) {
      buildLayout(key, dir + '-empty')
      python(join(adapters, 'base_bound.py'), 'rows', '--base-symbols', join(dir + '-empty', 'symbols.json'), '--upstream', args.upstream, '--out', dir + '-encoded')
      assert(readFileSync(join(dir + '-encoded', 'controller-policies.json')).equals(readFileSync(committed.policies)), layout + ': the controller packages differ on this layout.')
      buildLayout(key, dir, '--controller-policies', committed.policies, '--controller-layout', join(dir + '-empty', 'symbols.json'))
    } else buildLayout(key, dir)
    python('check_stock_free.py', join(dir, 'base.elemod'), '--stock', args.stock, '--upstream', args.upstream)
    const own = bind(dir, dir + '-binding.json')
    assert.deepEqual({ ...own, identity: '' }, { ...binding, identity: '' }, layout + ': the base-bound packages would link differently on this layout.')
    const text = readFileSync(join(dir, 'base.elemod'), 'utf8'), extra = JSON.parse(text).sites.filter(site => !defaultSites.has(site.addr + '+' + site.len))
    assert.equal(extra.length, 0, layout + ': patches stock sites the default layout leaves alone: ' + extra.map(site => site.addr).join(', '))
    const patch = JSON.parse(execFileSync('python3', ['-B', join(root, 'scripts/octatrack-base-variant-patch.py'), join(core, 'base.elemod'), join(dir, 'base.elemod')], { maxBuffer: 1 << 28 }).toString())
    const fills = JSON.parse(readFileSync(join(dir, 'base-fills.json'), 'utf8'))
    const built = await buildBase(stock, applyVariantPatch(defaultText, patch, sha(Buffer.from(text))), fills)
    assert.equal(built.sha256, sha(readFileSync(join(dir, 'NOT_FLASH_CANDIDATE.bin'))), layout + ': the browser-built .bin differs from build_core.py\'s.')
    assert.equal(built.base, own.identity, layout + ': the browser build reports another identity.')
    python('check_flash_safety.py', '--stock', args.stock, '--build', dir, '--upstream', args.upstream)
    variants.push({ layout, identity: own.identity, packageSha256: sha(Buffer.from(text)), patch, fills })
    identities[layout] = own.identity
    console.log(layout + ': ' + own.identity + ', patch ' + JSON.stringify(patch).length + ' bytes, browser .bin ' + built.sha256)
  }
  binding.variants = identities
  same(Buffer.from(JSON.stringify({ schema: 1, packageSha256: sha(Buffer.from(defaultText)), variants }) + '\n'), committed.variants)
}
same(Buffer.from(JSON.stringify(binding, null, 1) + '\n'), committed.binding)
console.log('package ' + sha(readFileSync(committed.package)) + ', fills ' + sha(readFileSync(committed.fills)))
console.log('browser .bin = build_core.py .bin: ' + browser.sha256 + ' (' + browser.bin.length + ' bytes)')
if (args.out) {
  let tracked = true
  try { execFileSync('git', ['-C', dirname(resolve(args.out)), 'rev-parse', '--show-toplevel'], { stdio: 'pipe' }) } catch { tracked = false }
  if (tracked) throw new Error('Save firmware outside every Git checkout.')
  mkdirSync(args.out)  // new, so nothing is overwritten
  const [, device] = await formats.load(stock)
  writeFileSync(join(args.out, 'NOT_FLASH_CANDIDATE.bin'), browser.bin)
  writeFileSync(join(args.out, 'MAIN.raw'), formats.mainImage(formats.parse(browser.bin, device), device))
  for (const name of ['proofs.json', 'symbols.json']) copyFileSync(join(core, name), join(args.out, name))
  console.log('saved ' + resolve(args.out) + ': NOT_FLASH_CANDIDATE.bin, MAIN.raw, proofs.json, symbols.json')
}

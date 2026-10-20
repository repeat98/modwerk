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
// base that owns sdk/machines/octatrack/events.json's sites and tables and dispatches them to subscribed packages;
// --table-owners also fills its table-owner storage from module-adapters/table-owners.json (the reviewed table owners).
// --cached-modules runs installed module code from the pool's cached alias (cache maintenance on install; a development
// prototype until it is qualified). --resident-stock-hooks --controllers adds the resident Sidechain, Output Matrix and Analog BD engines and admits their packages
// through committed trust rows (module-adapters/controller-policies.json). --resident-on-demand (with --resident-stock-hooks)
// keeps those engines out of the DSP cores until a package that needs one is installed, so the cores' effect arena is
// larger (docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md). Every build also writes
// sdk/machines/octatrack/base-binding.json, which the base-bound packages link against (module_packages.py). The beta base:
//   npm run octatrack:base -- --stock OS.bin --usb-midi --usb-audio 'USB AUDIO OUT TRACKS MAIN CUE' --site-events --table-owners --resident-stock-hooks --resident-on-demand --controllers
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

const { values: args } = parseArgs({ options: {
  stock: { type: 'string' }, upstream: { type: 'string', default: join(homedir(), '.cache/modwerk-upstream/elekloader') },
  write: { type: 'boolean', default: false }, out: { type: 'string' },
  'usb-midi': { type: 'boolean', default: false }, 'usb-audio': { type: 'string' }, 'site-events': { type: 'boolean', default: false },
  'table-owners': { type: 'boolean', default: false },
  'resident-stock-hooks': { type: 'boolean', default: false }, 'resident-on-demand': { type: 'boolean', default: false },
  'saved-set-export': { type: 'boolean', default: false },
  controllers: { type: 'boolean', default: false },
  'cached-modules': { type: 'boolean', default: false },
} })
if (!args.stock) throw new Error('Usage: npm run octatrack:base -- --stock OCTATRACK_OS1.40C.bin [--upstream ELEKLOADER] [--write] [--out NEW-DIR]')
const root = resolve(import.meta.dirname, '..'), here = join(root, 'sdk/machines/octatrack/elekloader')
const adapters = join(root, 'sdk/machines/octatrack/module-adapters')
const committed = { package: join(root, 'src/engine/assets/octatrack-base.elemod'), fills: join(root, 'src/engine/assets/octatrack-base-fills.json'),
  sources: join(root, 'src/engine/assets/octatrack-base-sources.json'), binding: join(root, 'sdk/machines/octatrack/base-binding.json'),
  policies: join(adapters, 'controller-policies.json') }
const asm = process.env.ELEKLOADER_DSP_ASM ?? join(homedir(), '.cache/modwerk-upstream/octabam/vendor/dsp56300/build/source/dsp_host/dsp_asm')
const python = (script, ...rest) => execFileSync('python3', ['-B', script.includes('/') ? script : join(here, script), ...rest], { stdio: 'inherit', env: { ...process.env, ELEKLOADER_DSP_ASM: asm } })
const same = (fresh, path) => {
  if (args.write) writeFileSync(path, fresh)
  else assert(existsSync(path) && fresh.equals(readFileSync(path)), path + ' is not what this source builds: run with --write and commit it.')
}

if (args['resident-on-demand'] && !args['resident-stock-hooks']) throw new Error('--resident-on-demand needs --resident-stock-hooks.')
const work = mkdtempSync(join(tmpdir(), 'modwerk-base-')), core = join(work, 'core')
const build = (output, ...rest) => python('build_core.py', '--stock', args.stock, '--upstream', args.upstream, '--output', output, '--dsp-loader',
  ...(args['usb-midi'] ? ['--usb-midi'] : []), ...(args['usb-audio'] ? ['--usb-audio', args['usb-audio']] : []),
  ...(args['site-events'] ? ['--site-events'] : []), ...(args['cached-modules'] ? ['--cached-modules'] : []),
  ...(args['table-owners'] ? ['--table-owners', join(adapters, 'table-owners.json')] : []),
  ...(args['resident-stock-hooks'] ? ['--resident-stock-hooks'] : []), ...(args['resident-on-demand'] ? ['--resident-on-demand'] : []),
  ...(args['saved-set-export'] ? ['--saved-set-export'] : []), ...rest)
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
python(join(adapters, 'base_bound.py'), 'bind', core, ...(args.controllers ? ['--policies', committed.policies] : []), '-o', join(work, 'binding.json'))
same(readFileSync(join(work, 'binding.json')), committed.binding)

const stock = new Uint8Array(readFileSync(args.stock))
const browser = await buildBase(stock, readFileSync(committed.package, 'utf8'), JSON.parse(readFileSync(committed.fills, 'utf8')))
const native = new Uint8Array(readFileSync(join(core, 'NOT_FLASH_CANDIDATE.bin')))
assert.equal(browser.sha256, sha(native), 'The browser-built .bin differs from build_core.py\'s.')
python('check_flash_safety.py', '--stock', args.stock, '--build', core, '--upstream', args.upstream)
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

// Does this module fit every Modwerk workflow? Read-only: no firmware, no module code, no network.
//
//   npm run module:doctor -- <module-id>
//   npm run module:doctor -- --all        # every catalog module and every Digitakt/Digitone module; CI runs this
//
// Each line is a point where a module meets an existing workflow, with the command that fixes it when it fails. Run it until
// it is green, then walk the checklist in docs/module-guides/<category>.md, which covers what a program cannot see.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AVAILABLE_MODULES, PAUSED_MODULE_IDS } from '../src/catalog/availability.ts'
import { LIBRARY_CATEGORIES } from '../src/catalog/modules.ts'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'
import { COMPARED_BEFORE_RECORDS, NOT_COMPOSED } from './module-coverage.mjs'
import { moduleSourceFingerprint } from './module-source.mjs'
import { moduleNativeSourceSha256 } from './module-qualification.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2), all = args.includes('--all'), ids = args.filter(arg => !arg.startsWith('--'))
if ((all && ids.length) || (!all && ids.length !== 1)) throw new Error('Usage: npm run module:doctor -- <module-id>   or   npm run module:doctor -- --all')
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const exists = path => existsSync(resolve(root, path))
const catalog = json('sdk/catalog.json'), machineModules = ['digitakt', 'digitone'].flatMap(machine => exists('sdk/' + machine + '/modules') ? readdirSync(resolve(root, 'sdk', machine, 'modules'), { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('_')).map(entry => ({ id: entry.name, machine })) : [])

// The module and catalog rules every PR already enforces (versions, documentation, qualification, gauges, media): run once.
const rules = spawnSync(process.execPath, ['scripts/modules.mjs'], { cwd: root, encoding: 'utf8' })
const rulesProblem = rules.status === 0 ? '' : (rules.stderr.trim().split('\n').filter(line => line && !/^\s+at /.test(line)).slice(-1)[0] ?? 'failed')

// The qualification source hash is async; compute it once per module before the checks run.
const nativeHashes = new Map()

function octatrack(id) {
  const lines = []
  const ok = (name, detail) => lines.push({ state: 'ok', name, detail })
  const fail = (name, detail, fix) => lines.push({ state: 'fail', name, detail, fix })
  const info = (name, detail) => lines.push({ state: 'info', name, detail })
  const folder = 'sdk/octabam/modules/' + id
  const document = parseModuleDocument(json(folder + '/octamod.module.json'))
  const entry = catalog.modules.find(item => item.id === id)

  if (!entry) fail('catalog entry', 'sdk/catalog.json does not list ' + id + ', so the library, the configurator and the packages ignore it', 'add { "id", "version", "addedAt" } to sdk/catalog.json, then npm run modules:generate')
  else if (entry.version !== document.version) fail('catalog entry', 'catalog pins ' + entry.version + ' but the manifest says ' + document.version, 'set the same version in sdk/catalog.json, then npm run modules:generate')
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(entry.addedAt ?? '')) fail('catalog entry', 'addedAt is missing or not a UTC time', 'add "addedAt": "2026-10-05T12:00:00Z" (the day it was first listed) to the entry')
  else ok('catalog entry', document.version + ', added ' + entry.addedAt.slice(0, 10))

  const paused = PAUSED_MODULE_IDS.includes(id)
  if (paused) info('library', 'paused by the owner (PAUSED_MODULE_IDS in src/catalog/availability.ts): hidden, and not compared until it is reinstated')
  else if (entry && !AVAILABLE_MODULES.some(module => module.id === id)) fail('library', 'the library does not offer it', 'run npm run modules:generate')
  else if (entry) ok('library', 'offered in the library and the configurator')

  if (!LIBRARY_CATEGORIES.includes(document.category)) fail('category guide', 'category ' + document.category + ' is not a library category', 'use one of ' + LIBRARY_CATEGORIES.join(', '))
  else if (!exists('docs/module-guides/' + document.category + '.md')) fail('category guide', 'docs/module-guides/' + document.category + '.md is missing', 'write the guide for this category')
  else ok('category guide', 'walk docs/module-guides/' + document.category + '.md (and sequencing.md if it acts in time)')

  const art = readFileSync(resolve(root, 'src/components/ModulePreview.tsx'), 'utf8')
  if (exists(folder + '/presentation/thumbnail.svg') || new RegExp("^\\s+'?" + id + "'?: \\(\\) =>", 'm').test(art)) ok('thumbnail', 'the library card has art')
  else fail('thumbnail', 'no presentation/thumbnail.svg and no hand-drawn art', 'add a 320x192 presentation/thumbnail.svg that shows what the module does')

  if (rulesProblem) fail('module rules', 'npm run modules:check fails: ' + rulesProblem.slice(0, 220), 'fix what it names, then run npm run modules:check -- --base origin/main')
  else ok('module rules', 'versions, documentation, tutorial, screenshots, qualification, resource gauges (npm run modules:check)')

  const build = json('src/engine/assets/module-build.json'), buildable = document.build?.status !== 'pending'
  if (!buildable) info('packages', 'build status is pending, so the packages do not include it yet')
  else if (build.moduleVersions?.[id] !== document.version) fail('packages', 'the committed packages lack ' + id + '@' + document.version, 'rebuild and import the packages (docs/ADD_A_MODULE.md, step 4)')
  else ok('packages', 'compiled into the committed packages at ' + document.version)

  if (paused) info('native comparison', 'skipped while paused')
  else if (NOT_COMPOSED.includes(id)) info('native comparison', 'builds only on its own; standalone parity is recorded in docs/VERIFICATION.md')
  else {
    const record = exists('sdk/native-comparisons/' + id + '.json') ? json('sdk/native-comparisons/' + id + '.json') : null
    const code = nativeHashes.get(id)
    if (record) {
      if (record.moduleSourceSha256 === code && record.summary.mismatches === 0) ok('native comparison', record.summary.selections + ' selections match native octabam (' + record.summary.built + ' built, ' + record.summary.refused + ' refused)')
      else fail('native comparison', 'the record was made for different code or has mismatches', 'npm run module:verify -- ' + id + ' --os <your OCTATRACK_OS1.40C.bin>')
    } else if (COMPARED_BEFORE_RECORDS[id] === code) ok('native comparison', 'compared by the earlier exhaustive suites at this exact code')
    else fail('native comparison', 'no current comparison with native octabam', 'npm run module:verify -- ' + id + ' --os <your OCTATRACK_OS1.40C.bin>')
  }

  const checks = json('src/catalog/native-metadata.json').checks, pairs = Object.keys(checks).filter(key => key.split('+').length === 2 && key.split('+').includes(id)).length
  if (!(id in checks)) fail('declaration checks', 'the module alone has no recorded ledger check, so a build of it is refused', 'npm run module:verify -- ' + id + ' --os <your OCTATRACK_OS1.40C.bin> (it records them)')
  else ok('declaration checks', 'recorded alone and beside ' + pairs + ' other modules')

  const conflicts = document.compatibility.conflicts ?? []
  info('conflicts', (document.compatibility.effectId != null ? 'effect id ' + document.compatibility.effectId + ': refused beside Analog BD automatically; ' : '') + (conflicts.length ? 'declared: ' + conflicts.join(', ') : 'none declared') + '. Are they complete? (guide: Integrate)')
  return lines
}

function machineModule({ id, machine }) {
  const lines = [], folder = 'sdk/' + machine + '/modules/' + id
  const manifest = exists(folder + '/modwerk.module.json') ? json(folder + '/modwerk.module.json') : null
  if (!manifest) lines.push({ state: 'fail', name: 'manifest', detail: folder + '/modwerk.module.json is missing', fix: 'npm run module:new -- <id> --machine ' + machine + ' --author <login>' })
  else {
    lines.push({ state: 'ok', name: 'manifest', detail: manifest.version })
    if (!LIBRARY_CATEGORIES.includes(manifest.category)) lines.push({ state: 'fail', name: 'category guide', detail: 'category ' + manifest.category + ' is not a library category', fix: 'use one of ' + LIBRARY_CATEGORIES.join(', ') })
    else if (!exists('docs/module-guides/' + manifest.category + '.md')) lines.push({ state: 'fail', name: 'category guide', detail: 'docs/module-guides/' + manifest.category + '.md is missing', fix: 'write the guide for this category' })
    else lines.push({ state: 'ok', name: 'category guide', detail: 'walk docs/module-guides/' + manifest.category + '.md, and the Digitakt and Digitone section in it' })
  }
  // The browser builds only from the files elekloader's catalog pins (vendor/elekloader/catalog/catalog.json); a mod's id is its catalog id.
  const pins = json('vendor/elekloader/catalog/catalog.json').mods.filter(mod => mod.id === id && mod.device.startsWith(machine))
  if (pins.length) lines.push({ state: 'ok', name: 'browser builder', detail: 'pinned in the elekloader catalog for OS ' + pins.map(mod => mod.os).join(', ') })
  else lines.push({ state: 'fail', name: 'browser builder', detail: 'no pinned .elemod file for ' + machine + ', so the browser cannot build it', fix: 'npm run elekloader:update -- ... (vendor/elekloader/README.md, Updating; docs/ADD_A_MODULE.md, Digitakt and Digitone)' })
  if (rulesProblem) lines.push({ state: 'fail', name: 'module rules', detail: 'npm run modules:check fails: ' + rulesProblem.slice(0, 220), fix: 'fix what it names' })
  else lines.push({ state: 'ok', name: 'module rules', detail: 'contract v3, evidence tier, documentation (npm run modules:check)' })
  return lines
}

const symbol = { ok: '✓', fail: '✗', info: '·' }
function report(title, lines) {
  console.log('\n' + title)
  for (const line of lines) {
    console.log('  ' + symbol[line.state] + ' ' + line.name.padEnd(20) + line.detail)
    if (line.fix) console.log('    ' + ''.padEnd(20) + 'fix: ' + line.fix)
  }
  return lines.every(line => line.state !== 'fail')
}

let green = true
const octatrackIds = all ? catalog.modules.map(item => item.id) : ids.filter(id => exists('sdk/octabam/modules/' + id))
for (const id of octatrackIds) {
  const document = parseModuleDocument(json('sdk/octabam/modules/' + id + '/octamod.module.json'))
  nativeHashes.set(id, await moduleNativeSourceSha256(resolve(root, 'sdk/octabam/modules', id), document))
}
// The fingerprint of the compiled packages must match the code too: documentation edits never change it.
const fingerprintOk = !octatrackIds.length || (await moduleSourceFingerprint(root)) === json('src/engine/assets/module-build.json').sourceTreeSha256
for (const id of octatrackIds) {
  const lines = octatrack(id)
  if (!fingerprintOk) lines.push({ state: 'fail', name: 'package fingerprint', detail: 'the committed packages were built from different module code', fix: 'rebuild and import the packages (docs/ADD_A_MODULE.md, step 4)' })
  green = report(id + ' (Octatrack)', lines) && green
}
const machineIds = all ? machineModules : machineModules.filter(item => ids.includes(item.id))
for (const item of machineIds) green = report(item.id + ' (' + item.machine + ')', machineModule(item)) && green
if (!all && !octatrackIds.length && !machineIds.length) { console.error('No module named ' + ids[0] + ' under sdk/octabam/modules, sdk/digitakt/modules or sdk/digitone/modules.'); process.exit(2) }
console.log(green ? '\nEvery integration point is green. Now walk the category checklist in docs/module-guides/.' : '\nFix the lines marked ✗, then run this again.')
process.exitCode = green ? 0 : 1

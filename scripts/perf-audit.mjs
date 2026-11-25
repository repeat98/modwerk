// Performance audit for a module: worst-case cycles, a benchmark against stock, and a stress run. Offline: no firmware, no module code.
//
//   npm run perf:audit -- template dsp|coldfire|key print the skeleton of evidence/performance.json (key: ColdFire code that runs only on a key press)
//   npm run perf:audit -- check <record.json> [options] [--stamp]
//   npm run perf:audit -- selftest                  prove the judgement on known-good and known-bad records
//
// Measure with the harness (docs/MODULE_PERFORMANCE.md), write the numbers into <module>/evidence/performance.json
// and check it. `module:doctor` runs the same judgement and refuses a new module whose record is missing or fails.
// --stamp, right after you measure: a record that passes gets the hash of the module source it was measured on
// (sourceSha256), and module:doctor fails it once that source changes.
//
// options: --usable <cycles>  --ratio-note <x>  --ratio-fail <x>  --load-fail <share of a frame>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { LIMITS, judgeRecord, priceLimits, selfTest, templateRecord } from './perf-audit-analysis.mjs'
import { modulePerformanceSourceSha256 } from './module-qualification.mjs'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'

const args = process.argv.slice(2), positional = [], options = {}
const flags = { '--usable': 'usableCycles', '--ratio-note': 'ratioNote', '--ratio-fail': 'ratioFail', '--load-fail': 'loadFail' }
let stamp = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--stamp') stamp = true
  else if (!args[i].startsWith('--')) positional.push(args[i])
  else if (flags[args[i]] && Number.isFinite(Number(args[i + 1]))) options[flags[args[i]]] = Number(args[++i])
  else usage(args[i] + ' is not an option, or lacks its number')
}
const [command, ...paths] = positional

function usage(problem) {
  console.error((problem ? problem + '\n' : '') + 'Usage: npm run perf:audit -- template dsp|coldfire|key\n       npm run perf:audit -- check <record.json> [--usable <cycles>] [--ratio-note <x>] [--ratio-fail <x>] [--load-fail <share>]\n       npm run perf:audit -- selftest')
  process.exit(2)
}

const symbol = { ok: '✓', note: '·', fail: '✗' }
if (command === 'template' && ['dsp', 'coldfire', 'key'].includes(paths[0]) && paths.length === 1) console.log(JSON.stringify(templateRecord(paths[0]), null, 2))
else if (command === 'check' && paths.length === 1) {
  const file = resolve(paths[0]), record = JSON.parse(readFileSync(file, 'utf8')), limits = { ...priceLimits(manifestBeside(file)), ...options }, rows = judgeRecord(record, limits)
  for (const line of rows) {
    console.log(symbol[line.state] + ' ' + line.name.padEnd(16) + line.detail)
    if (line.fix) console.log('  ' + ''.padEnd(16) + 'fix: ' + line.fix)
  }
  const failed = rows.filter(line => line.state === 'fail').length
  console.log(failed ? '\n' + failed + ' check(s) failed. The limits are audit defaults (' + Object.entries({ ...LIMITS, ...limits }).map(([key, value]) => key + ' ' + value).join(', ') + '); say in TESTING.md what you changed and why.' : '\nNo check failed. Paste this table into TESTING.md, with the commands that produced the numbers.')
  process.exitCode = failed ? 1 : 0
  if (stamp && failed) console.log('Not stamped: a record is stamped only once every check passes.')
  else if (stamp) await stampRecord(file, record)
} else if (command === 'selftest' && !paths.length) {
  const rows = selfTest()
  for (const row of rows) console.log((row.ok ? '  ok   ' : '  FAIL ') + row.name + ': ' + row.detail)
  process.exitCode = rows.every(row => row.ok) ? 0 : 1
} else usage(command ? 'Unknown or incomplete command: ' + positional.join(' ') : '')

/** The manifest of the module whose <module>/evidence/performance.json this is, or null (a loose record, or one that does not parse). */
function manifestBeside(file) {
  const manifest = join(dirname(dirname(file)), 'octamod.module.json')
  if (basename(dirname(file)) !== 'evidence' || !existsSync(manifest)) return null
  try { return parseModuleDocument(JSON.parse(readFileSync(manifest, 'utf8'))) } catch { return null }
}

/** Write the module's current performance source hash into its record, after `version`. The record must be the module's own
 * (<module>/evidence/performance.json) and name the manifest's id and version, so a stamp never binds numbers to other code. */
async function stampRecord(file, record) {
  const folder = dirname(dirname(file))
  if (basename(file) !== 'performance.json' || basename(dirname(file)) !== 'evidence') { console.error('Not stamped: --stamp takes the module\'s own <module>/evidence/performance.json.'); process.exitCode = 1; return }
  const document = parseModuleDocument(JSON.parse(readFileSync(join(folder, 'octamod.module.json'), 'utf8')))
  if (record.module !== document.id || record.version !== document.version) { console.error(`Not stamped: the record is for ${record.module}@${record.version}, the manifest beside it is ${document.id}@${document.version}.`); process.exitCode = 1; return }
  const { schema, module, version, ...rest } = record, sourceSha256 = await modulePerformanceSourceSha256(folder, document)
  delete rest.sourceSha256
  writeFileSync(file, JSON.stringify({ schema, module, version, sourceSha256, ...rest }, null, 2) + '\n')
  console.log(`Stamped ${paths[0]}: measured on source ${sourceSha256.slice(0, 12)}…. Measure and stamp again after any change to the module's code.`)
}

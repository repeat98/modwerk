// Performance audit for a module: worst-case cycles, a benchmark against stock, and a stress run. Offline: no firmware, no module code.
//
//   npm run perf:audit -- template dsp|coldfire|key print the skeleton of evidence/performance.json (key: ColdFire code that runs only on a key press)
//   npm run perf:audit -- check <record.json> [options]
//   npm run perf:audit -- selftest                  prove the judgement on known-good and known-bad records
//
// Measure with the harness (docs/MODULE_PERFORMANCE.md), write the numbers into <module>/evidence/performance.json
// and check it. `module:doctor` runs the same judgement and refuses a new module whose record is missing or fails.
//
// options: --usable <cycles>  --ratio-note <x>  --ratio-fail <x>  --load-fail <share of a frame>
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LIMITS, judgeRecord, selfTest, templateRecord } from './perf-audit-analysis.mjs'

const args = process.argv.slice(2), positional = [], options = {}
const flags = { '--usable': 'usableCycles', '--ratio-note': 'ratioNote', '--ratio-fail': 'ratioFail', '--load-fail': 'loadFail' }
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) positional.push(args[i])
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
  const rows = judgeRecord(JSON.parse(readFileSync(resolve(paths[0]), 'utf8')), options)
  for (const line of rows) {
    console.log(symbol[line.state] + ' ' + line.name.padEnd(16) + line.detail)
    if (line.fix) console.log('  ' + ''.padEnd(16) + 'fix: ' + line.fix)
  }
  const failed = rows.filter(line => line.state === 'fail').length
  console.log(failed ? '\n' + failed + ' check(s) failed. The limits are audit defaults (' + Object.entries({ ...LIMITS, ...options }).map(([key, value]) => key + ' ' + value).join(', ') + '); say in TESTING.md what you changed and why.' : '\nNo check failed. Paste this table into TESTING.md, with the commands that produced the numbers.')
  process.exitCode = failed ? 1 : 0
} else if (command === 'selftest' && !paths.length) {
  const rows = selfTest()
  for (const row of rows) console.log((row.ok ? '  ok   ' : '  FAIL ') + row.name + ': ' + row.detail)
  process.exitCode = rows.every(row => row.ok) ? 0 : 1
} else usage(command ? 'Unknown or incomplete command: ' + positional.join(' ') : '')

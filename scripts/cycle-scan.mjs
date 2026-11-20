#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The cycle scan's records and the check over them (sdk/cycle-scan/README.md).
//
//   node scripts/cycle-scan.mjs record <id> [<id> ...]   # on your computer: scan each Octatrack module, write its record
//   node scripts/cycle-scan.mjs check                     # anywhere, CI included: judge every committed record
//
// `record` runs sdk/cycle-scan/interlock_scan.py --sweep on the module and on the stock effect its performance.json compares
// it with, and writes sdk/cycle-scan/records/<id>.json: the dearest setting's instructions, cycles and stalls a sample,
// bound to the module's source by the same hash as performance.json's sourceSha256. It needs the scan's tools and your own
// OS extraction (sdk/cycle-scan/README.md); OCTABAM_ROOT names a built tree other than sdk/octabam, and the module copy
// that tree scans must be this repository's, byte for byte in its source, or nothing is written.
//
// `check` needs neither: a record whose module source has changed since its scan fails (scan it again), and so does a
// module whose performance.json records far fewer instructions a sample than the scan saw it execute. The records live
// here, not in the module folders: those belong to their authors.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modulePerformanceSourceSha256 } from './module-qualification.mjs'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const RECORDS = 'sdk/cycle-scan/records'
export const MODULES = 'sdk/octatrack/modules'
/** A performance.json may record fewer instructions than the scan's dearest setting by this share at most: the scan
 * prices one steady block per setting, a measurement can land on a cheaper one, but not on far cheaper code. */
export const UNDER_REPORT = 0.9
/** The DSP's cycles a sample (sdk/cycle-scan/CYCLE_SCAN.md, the measured clock). */
export const CLOCK = 4532
const SCAN_REVISION = 'cc7cffc1a675a763c5b8d6fbe1659f2b322cc540'

/** The dearest run of an interlock_scan --json report, as a record keeps it. */
export function dearest(report) {
  const runs = (report.runs ?? []).filter(run => run.cycles)
  if (!runs.length) throw new Error(`${report.name ?? report.target}: the scan has no runs${report.error ? ': ' + report.error : ''}`)
  const run = runs.reduce((a, b) => (b.cycles > a.cycles ? b : a))
  const round = n => Math.round(n * 100) / 100
  return { setting: `${run.label}/${run.variant}`, settings: runs.length, instructions: round(run.instr), cycles: round(run.cycles),
    stalls: round(run.stall), stallsByKind: Object.fromEntries(Object.entries(run.stalls).filter(([, v]) => v).map(([k, v]) => [k, round(v)])) }
}

/** One record's verdict: {fail: [...], info: [...]}. `sourceSha256` is the module's source now; `performance` its
 * evidence/performance.json, or null. */
export function judge({ id, record, sourceSha256, performance }) {
  const fail = [], info = []
  if (record.schema !== 1 || record.module !== id) fail.push(`${id}: not a cycle-scan record for this module`)
  if (record.sourceSha256 !== sourceSha256)
    fail.push(`${id}: the module's source changed since its cycle scan: run node scripts/cycle-scan.mjs record ${id} on your computer`)
  const scan = record.dearest
  const measured = performance?.cycles?.unit === 'instructions/sample' ? performance.cycles.measured : undefined
  if (typeof measured !== 'number') info.push(`${id}: performance.json records no instructions a sample to compare`)
  else if (measured < scan.instructions * UNDER_REPORT)
    fail.push(`${id}: performance.json records ${measured} instructions a sample, but the cycle scan saw ${scan.instructions} executing at ` +
      `${scan.setting}: measure the dearest case again (docs/MODULE_PERFORMANCE.md)`)
  const pct = n => (100 * n / CLOCK).toFixed(1) + ' %'
  info.push(`${id}: ${scan.cycles} cycles a sample (${pct(scan.cycles)}), ${scan.stalls} of them stalls, at ${scan.setting}` +
    (record.stock ? `; stock ${record.stock.comparator} ${record.stock.cycles} (${pct(record.stock.cycles)}), ` +
      `${(scan.cycles / record.stock.cycles).toFixed(2)}x in cycles against ${(scan.instructions / record.stock.instructions).toFixed(2)}x in instructions` : ''))
  return { fail, info }
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const documentOf = folder => parseModuleDocument(readJson(join(folder, 'octamod.module.json')))
const performanceOf = folder => existsSync(join(folder, 'evidence/performance.json')) ? readJson(join(folder, 'evidence/performance.json')) : null

/** Every committed record judged, and the DSP modules that have none (told, not failed). */
export async function check(base = root) {
  const dir = join(base, RECORDS), fail = [], info = []
  const ids = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort() : []
  for (const id of ids) {
    const folder = join(base, MODULES, id)
    if (!existsSync(join(folder, 'octamod.module.json'))) { fail.push(`${id}: a cycle-scan record for a module that is not in ${MODULES}`); continue }
    const verdict = judge({ id, record: readJson(join(dir, id + '.json')), sourceSha256: await modulePerformanceSourceSha256(folder, documentOf(folder)), performance: performanceOf(folder) })
    fail.push(...verdict.fail); info.push(...verdict.info)
  }
  const unscanned = readdirSync(join(base, MODULES)).filter(id => !ids.includes(id) && performanceOf(join(base, MODULES, id))?.kind === 'dsp')
  if (unscanned.length) info.push(`no cycle scan yet: ${unscanned.sort().join(', ')}`)
  return { fail, info, records: ids.length }
}

function scan(tree, target) {
  const dir = mkdtempSync(join(tmpdir(), 'cycle-scan-')), out = join(dir, 'scan.json')
  try {
    execFileSync('python3', ['-B', join(root, 'sdk/cycle-scan/interlock_scan.py'), target, '--sweep', '--json', out],
      { cwd: tree, env: { ...process.env, OCTABAM_ROOT: tree }, stdio: ['ignore', 'ignore', 'inherit'], timeout: 1800000 })
    return readJson(out)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

async function record(ids) {
  const tree = resolve(process.env.OCTABAM_ROOT ?? join(root, 'sdk/octabam'))
  if (!existsSync(join(tree, 'vendor/dsp56300/build/source/dsp_host/dsp_host'))) throw new Error(`${tree} has no built dsp_host: run sdk/cycle-scan/build-tools.sh first.`)
  for (const id of ids) {
    const folder = join(root, MODULES, id), document = documentOf(folder), sourceSha256 = await modulePerformanceSourceSha256(folder, document)
    const scanned = join(tree, 'modules', id)
    if (!existsSync(scanned) || await modulePerformanceSourceSha256(scanned, documentOf(scanned)) !== sourceSha256)
      throw new Error(`${id}: the module ${tree} scans is not this repository's source: refresh that tree (npm run prepare there) and record again.`)
    const performance = performanceOf(folder), result = dearest(scan(tree, id))
    if (result.instructions < 5) throw new Error(`${id}: ${result.instructions} instructions a sample: its DSP entry is a stub (the module runs on the ColdFire), nothing to record.`)
    const comparator = performance?.stock?.comparator, stock = comparator ? dearest(scan(tree, comparator)) : null
    const doc = { schema: 1, module: id, version: document.version, sourceSha256, scanRevision: SCAN_REVISION,
      model: 'DSP56300FM Table A-1 cycles and the A.2 and 3.5 stalls on one steady block of each --sweep setting; a model, not a measurement',
      dearest: result, ...(stock ? { stock: { comparator, setting: stock.setting, instructions: stock.instructions, cycles: stock.cycles, stalls: stock.stalls } } : {}) }
    writeFileSync(join(root, RECORDS, id + '.json'), JSON.stringify(doc, null, 2) + '\n')
    console.log(`${id}: ${result.cycles} cycles a sample at ${result.setting} (${result.stalls} stalls)` + (stock ? `; ${comparator} ${stock.cycles}` : ''))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...ids] = process.argv.slice(2)
  try {
    if (command === 'record' && ids.length) await record(ids)
    else if (command === 'check') {
      const { fail, info, records } = await check()
      for (const line of info) console.log('  · ' + line)
      for (const line of fail) console.error('  ✗ ' + line)
      console.log(fail.length ? `Cycle scan: ${fail.length} of ${records} records fail.` : `Cycle scan: ${records} records current, none under-reported.`)
      if (fail.length) process.exitCode = 1
    } else { console.error('Usage: node scripts/cycle-scan.mjs record <id> [<id> ...] | check'); process.exitCode = 2 }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

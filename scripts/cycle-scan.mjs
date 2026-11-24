#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The cycle scan's records and the check over them (sdk/cycle-scan/README.md).
//
//   node scripts/cycle-scan.mjs record <id> [<id> ...]   # on your computer: scan each Octatrack module, write its record
//   node scripts/cycle-scan.mjs check                     # anywhere, CI included: judge every committed record
//   node scripts/cycle-scan.mjs unit [--markdown]         # anywhere: the records against the unit's in-use readings (report only)
//
// `record` runs sdk/cycle-scan/interlock_scan.py --sweep on the module and on the stock effect its performance.json compares
// it with, and writes sdk/cycle-scan/records/<id>.json: the dearest setting's instructions, cycles and stalls a sample,
// and the same at the module's defaults (where a pick on the unit starts), bound to the module's source by the same hash as performance.json's sourceSha256. It needs the scan's tools and your own
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

/** One point of a DSP core's load meter in cycles a sample. status.c's busy() reports per mille of FRAME_CYCLES
 * (72,520: 4,532 a sample, 16 samples a frame), from idle passes whose cycles were calibrated on an MKII with
 * `--dsp-burn` (11 October 2026); device:price keeps that meter in points, so a point is 45.32 cycles a sample. */
export const POINT = CLOCK / 100
/** The unit report lists a module whose in-use reading is further than this from the model at the same setting. */
export const OUTLIER = 0.1

const round = n => Math.round(n * 100) / 100
const scanned = report => {
  const runs = (report.runs ?? []).filter(run => run.cycles)
  if (!runs.length) throw new Error(`${report.name ?? report.target}: the scan has no runs${report.error ? ': ' + report.error : ''}`)
  return runs
}

/** The dearest run of an interlock_scan --json report, as a record keeps it. */
export function dearest(report) {
  const runs = scanned(report)
  const run = runs.reduce((a, b) => (b.cycles > a.cycles ? b : a))
  return { setting: `${run.label}/${run.variant}`, settings: runs.length, instructions: round(run.instr), cycles: round(run.cycles),
    stalls: round(run.stall), stallsByKind: Object.fromEntries(Object.entries(run.stalls).filter(([, v]) => v).map(([k, v]) => [k, round(v)])) }
}

/** The run of a report at one setting ("LABEL/variant"), as a record keeps it beside the dearest. */
export function atSetting(report, setting) {
  const run = scanned(report).find(run => `${run.label}/${run.variant}` === setting)
  if (!run) throw new Error(`${report.name ?? report.target}: the scan has no run at ${setting}`)
  return { setting, instructions: round(run.instr), cycles: round(run.cycles), stalls: round(run.stall) }
}

/** The meter points an in-use reading added on the core of the slot it was taken on (T1-T4 core 1, T5-T8 core 0). */
export function inUsePoints(result) {
  const track = Number(/^T(\d)/.exec(result?.inUseOn ?? '')?.[1])
  if (!result?.inUseAdds || !track) return null
  return { on: result.inUseOn, points: track <= 4 ? result.inUseAdds.dsp1to4 : result.inUseAdds.dsp5to8 }
}

/** One module's line of the unit report: its cpu-price.json in-use reading against the record's model at the same
 * setting (the defaults, where a fresh pick starts), plus what the base charges for features its package requires,
 * which run outside the effect's proc and so outside the scan. `price` is evidence/cpu-price.json or null; `extra`
 * [{name, cycles}]. */
export function unitLine({ id, record, price, extra = [] }) {
  const line = { id, version: record.version, modelDefaults: record.defaults?.cycles ?? null, modelDearest: record.dearest.cycles,
    setting: record.defaults?.setting ?? null, outside: extra, notes: [] }
  const reading = inUsePoints(price?.result)
  if (!reading) { line.notes.push('no in-use reading on the unit'); return line }
  if (price.version !== record.version) { line.notes.push(`the unit reading is for ${price.version}, the record for ${record.version}`); return line }
  Object.assign(line, { on: reading.on, points: reading.points, unit: round(reading.points * POINT), base: price.base, measuredAt: price.measuredAt })
  if (line.modelDefaults == null) { line.notes.push('the record keeps no defaults run: record it again'); return line }
  line.model = round(line.modelDefaults + extra.reduce((sum, e) => sum + e.cycles, 0))
  line.ratio = round(line.unit / line.model)
  if (Math.abs(line.unit / line.model - 1) > OUTLIER) line.outlier = true
  return line
}

/** Every record against the unit's in-use readings, and the scanned modules that lack one. */
export function unitReport(base = root) {
  const dir = join(base, RECORDS), packages = readJson(join(base, 'src/engine/assets/octatrack-module-packages.json')).packages
  const features = readJson(join(base, 'sdk/machines/octatrack/dsp-sites.json')).features
  const lines = readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => {
    const record = readJson(join(dir, name)), id = record.module, pricePath = join(base, MODULES, id, 'evidence/cpu-price.json')
    const requires = packages.find(row => row.id === id)?.requires ?? 0
    const extra = features.filter(f => requires & f.bit && typeof f.hardware === 'number').map(f => ({ name: f.name, cycles: f.hardware }))
    return unitLine({ id, record, price: existsSync(pricePath) ? readJson(pricePath) : null, extra })
  })
  return { lines, missing: lines.filter(line => line.unit == null).map(line => line.id) }
}

/** The unit report as the Markdown table in sdk/cycle-scan/README.md. */
export function unitMarkdown({ lines }) {
  const f = n => n == null ? '–' : String(Math.round(n))
  const rows = lines.map(l => `| ${l.id} ${l.version.replace(/-experimental$/, '')} | ${l.points == null ? '–' : `${l.points} = ${f(l.unit)} (${l.on})`} | ` +
    `${l.setting ?? '–'} | ${f(l.modelDefaults)}${l.outside.length ? ' + ' + l.outside.map(e => `${e.cycles} ${e.name}`).join(' + ') : ''} | ${f(l.modelDearest)} | ` +
    `${l.ratio == null ? '–' : l.ratio.toFixed(2)} | ${l.outlier ? '**outlier**' : l.notes.join('; ') || 'within ' + OUTLIER * 100 + ' %'} |`)
  return ['| Module | Unit, in use (points = cycles a sample) | Defaults run | Model at defaults (+ base features) | Model, dearest | Unit ÷ model | Verdict |',
    '|---|---|---|---|---|---|---|', ...rows].join('\n')
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

/** The setting of the sweep's run at the module's defaults (sdk/cycle-scan/defaults_setting.py). */
const defaultsSetting = (tree, id) => JSON.parse(execFileSync('python3', ['-B', join(root, 'sdk/cycle-scan/defaults_setting.py'), id],
  { cwd: tree, env: { ...process.env, OCTABAM_ROOT: tree }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })).setting

async function record(ids) {
  const tree = resolve(process.env.OCTABAM_ROOT ?? join(root, 'sdk/octabam'))
  if (!existsSync(join(tree, 'vendor/dsp56300/build/source/dsp_host/dsp_host'))) throw new Error(`${tree} has no built dsp_host: run sdk/cycle-scan/build-tools.sh first.`)
  for (const id of ids) {
    const folder = join(root, MODULES, id), document = documentOf(folder), sourceSha256 = await modulePerformanceSourceSha256(folder, document)
    const scanned = join(tree, 'modules', id)
    if (!existsSync(scanned) || await modulePerformanceSourceSha256(scanned, documentOf(scanned)) !== sourceSha256)
      throw new Error(`${id}: the module ${tree} scans is not this repository's source: refresh that tree (npm run prepare there) and record again.`)
    const performance = performanceOf(folder), report = scan(tree, id), result = dearest(report)
    if (result.instructions < 5) throw new Error(`${id}: ${result.instructions} instructions a sample: its DSP entry is a stub (the module runs on the ColdFire), nothing to record.`)
    const defaults = atSetting(report, defaultsSetting(tree, id))
    const comparator = performance?.stock?.comparator, stock = comparator ? dearest(scan(tree, comparator)) : null
    const doc = { schema: 1, module: id, version: document.version, sourceSha256, scanRevision: SCAN_REVISION,
      model: 'DSP56300FM Table A-1 cycles and the A.2 and 3.5 stalls on one steady block of each --sweep setting; a model, not a measurement',
      dearest: result, defaults, ...(stock ? { stock: { comparator, setting: stock.setting, instructions: stock.instructions, cycles: stock.cycles, stalls: stock.stalls } } : {}) }
    writeFileSync(join(root, RECORDS, id + '.json'), JSON.stringify(doc, null, 2) + '\n')
    console.log(`${id}: ${result.cycles} cycles a sample at ${result.setting} (${result.stalls} stalls), ${defaults.cycles} at its defaults (${defaults.setting})` +
      (stock ? `; ${comparator} ${stock.cycles}` : ''))
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
    } else if (command === 'unit') {
      const report = unitReport()
      if (ids.includes('--markdown')) console.log(unitMarkdown(report))
      else for (const l of report.lines) console.log(`  ${l.outlier ? '!' : '·'} ${l.id}: ` + (l.unit == null ? l.notes.join('; ') :
        `unit ${l.unit} cycles a sample (${l.points} points on ${l.on}), model ${l.model} at ${l.setting}` +
        (l.outside.length ? ` with ${l.outside.map(e => e.name + ' ' + e.cycles).join(', ')}` : '') + `, ${l.ratio}x` + (l.outlier ? ': an outlier' : '')))
      if (report.missing.length && !ids.includes('--markdown')) console.log(`No in-use reading to compare: ${report.missing.join(', ')}. A report only; nothing fails.`)
    } else { console.error('Usage: node scripts/cycle-scan.mjs record <id> [<id> ...] | check | unit [--markdown]'); process.exitCode = 2 }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

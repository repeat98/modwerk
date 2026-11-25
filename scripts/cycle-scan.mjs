#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// The cycle scan's records and the check over them (sdk/cycle-scan/README.md).
//
//   node scripts/cycle-scan.mjs record <id> [<id> ...]   # on your computer: scan each Octatrack module, write its record
//   node scripts/cycle-scan.mjs check                     # anywhere, CI included: judge every committed record
//   node scripts/cycle-scan.mjs unit [--markdown|--write] # anywhere: the records against the unit's in-use readings (report only;
//                                                         # --write puts the table into sdk/cycle-scan/README.md, which check holds to it)
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
import { moduleEarlierPerformanceSourceSha256, modulePerformanceSourceSha256 } from './module-qualification.mjs'
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

/** The meter points an in-use reading added on the core of the slot it was taken on (T1-T4 core 1, T5-T8 core 0): the mean,
 * and the peak, the core's busiest block, which device:price keeps from 24 November 2026 (null in an older record). */
export function inUsePoints(result) {
  const track = Number(/^T(\d)/.exec(result?.inUseOn ?? '')?.[1])
  if (!result?.inUseAdds || !track) return null
  const core = track <= 4 ? 'dsp1to4' : 'dsp5to8', peak = result.inUseAdds[core + 'Peak']
  return { on: result.inUseOn, points: result.inUseAdds[core], peak: typeof peak === 'number' ? peak : null }
}

/** The base identities a text names: each hex run of eight or more digits, cut to eight ("development twin d3d71297 of base
 * 0.7.8 (main 02dfa20ca)" names d3d71297 and 02dfa20c). */
export const identities = text => (String(text ?? '').match(/\b[0-9a-f]{8,}\b/g) ?? []).map(id => id.slice(0, 8))

/** The case a cycle-scan record models: the version and the published package it covers (the package row of that version),
 * the setting, and what plays. dsp_host runs the proc block after block, as a playing unit does, and feeds no key bus, so a
 * key-bus effect is scanned with its key bus silent. `keyBus` says whether the module reads the key bus at all. */
export function scanCase({ record, row, keyBus = false }) {
  return { version: record.version, package: row?.version === record.version ? row.sha256 ?? null : null, setting: record.defaults?.setting ?? null,
    transport: 'playing', keyBus: keyBus ? record.inputs?.keyBus ?? 'silent' : null }
}

/** The case a device:price reading measured (evidence/cpu-price.json): the version and package, the setting (a fresh pick
 * starts at the defaults), what played (`inputs`, recorded from 24 November 2026: the transport always, the key bus when the
 * caller named it; device:price always reads playing) and the base it ran on. */
export function unitCase({ price, record, keyBus = false }) {
  return { version: price.version, package: price.result?.packageSha256 ?? null, setting: price.result?.setting ?? record.defaults?.setting ?? null,
    transport: price.inputs?.transport ?? 'playing', keyBus: keyBus ? price.inputs?.keyBus ?? 'not stated' : null, base: price.base ?? null }
}

/** Why a reading and a model are not the same case: [] when they are. `extra` is the base charges added to the model, each
 * with the base identities it was timed on (`bases`): a reading on another base ran another build of that base code. */
export function notComparable(scan, unit, extra = []) {
  const why = []
  if (scan.package && unit.package && scan.package !== unit.package)
    why.push(`the unit measured package ${unit.package.slice(0, 8)}, not the published ${scan.version} (${scan.package.slice(0, 8)})`)
  if (scan.setting !== unit.setting) why.push(`the unit read it at ${unit.setting}, the model is at ${scan.setting}`)
  if (scan.transport !== unit.transport) why.push(`the unit read with the sequencer ${unit.transport}, the scan runs every block`)
  if (scan.keyBus !== unit.keyBus) why.push(unit.keyBus === 'not stated'
    ? `the reading does not say what its key bus carried, the scan's was ${scan.keyBus}`
    : `its key bus was ${unit.keyBus} on the unit and ${scan.keyBus} in the scan`)
  const seen = identities(unit.base)
  for (const charge of extra) if (charge.bases?.length && !charge.bases.some(id => seen.includes(id)))
    why.push(`the unit read on ${seen[0] ?? (unit.base || 'an unnamed base')}, the ${charge.name} charge (${charge.cycles}) was timed on ${charge.bases[0]}`)
  return why
}

/** One module's line of the unit report: its cpu-price.json in-use reading against the record's model, only where both are
 * the same case (notComparable); else the line says why not and gives no ratio. The mean is compared with the model at the
 * defaults (where a fresh pick starts), the peak, where the reading kept one, with the dearest setting, which bounds every
 * setting. Both add what the base charges for features the package requires, which run outside the effect's proc and so
 * outside the scan. `price` is evidence/cpu-price.json or null; `extra` [{name, cycles, bases?}]; `row` the USB package row. */
export function unitLine({ id, record, price, extra = [], row, keyBus = false }) {
  const line = { id, version: record.version, modelDefaults: record.defaults?.cycles ?? null, modelDearest: record.dearest.cycles,
    setting: record.defaults?.setting ?? null, outside: extra.map(({ name, cycles }) => ({ name, cycles })), notes: [] }
  const reading = inUsePoints(price?.result)
  if (!reading) { line.notes.push('no in-use reading on the unit'); return line }
  if (price.version !== record.version) { line.notes.push(`the unit reading is for ${price.version}, the record for ${record.version}`); return line }
  Object.assign(line, { on: reading.on, points: reading.points, unit: round(reading.points * POINT), base: price.base, measuredAt: price.measuredAt })
  if (reading.peak != null) Object.assign(line, { peak: reading.peak, unitPeak: round(reading.peak * POINT) })
  if (line.modelDefaults == null) { line.notes.push('the record keeps no defaults run: record it again'); return line }
  const charges = extra.reduce((sum, e) => sum + e.cycles, 0)
  line.model = round(line.modelDefaults + charges)
  const why = notComparable(scanCase({ record, row, keyBus }), unitCase({ price, record, keyBus }), extra)
  if (why.length) { line.notComparable = why; return line }
  line.ratio = round(line.unit / line.model)
  if (Math.abs(line.unit / line.model - 1) > OUTLIER) line.outlier = true
  if (line.unitPeak != null) {
    line.modelPeak = round(line.modelDearest + charges)
    line.peakRatio = round(line.unitPeak / line.modelPeak)
    if (line.unitPeak > line.modelPeak * (1 + OUTLIER)) line.peakAbove = true
  }
  return line
}

/** Every record against the unit's in-use readings, and the scanned modules that lack one. */
export function unitReport(base = root) {
  const dir = join(base, RECORDS), packages = readJson(join(base, 'src/engine/assets/octatrack-module-packages.json')).packages
  const sites = readJson(join(base, 'sdk/machines/octatrack/dsp-sites.json')), features = sites.features
  const keyBusBits = features.filter(f => f.name === 'keybus').map(f => f.bit)
  // A base charge's evidence names the base it was timed on (keybus-tap-timing-*.json's `base`).
  const timedOn = f => { const path = f.evidence && join(base, 'sdk/machines/octatrack', f.evidence); return path && existsSync(path) ? identities(JSON.stringify(readJson(path).base)) : [] }
  const lines = readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => {
    const record = readJson(join(dir, name)), id = record.module, pricePath = join(base, MODULES, id, 'evidence/cpu-price.json')
    const row = packages.find(item => item.id === id), requires = row?.requires ?? 0
    const extra = features.filter(f => requires & f.bit && typeof f.hardware === 'number').map(f => ({ name: f.name, cycles: f.hardware, bases: timedOn(f) }))
    // A key-bus reader: its package requires the key bus, or the module owns a key-bus site (Sidechain Compressor's tap).
    const keyBus = keyBusBits.some(bit => requires & bit) || sites.sites.some(site => site.module === id && keyBusBits.includes(site.feature))
    return unitLine({ id, record, price: existsSync(pricePath) ? readJson(pricePath) : null, extra, row, keyBus })
  })
  return { lines, missing: lines.filter(line => line.unit == null).map(line => line.id) }
}

/** The unit report as the Markdown table in sdk/cycle-scan/README.md. */
export function unitMarkdown({ lines }) {
  const f = n => n == null ? '–' : String(Math.round(n)), base = l => l.outside.length ? ' + ' + l.outside.map(e => `${e.cycles} ${e.name}`).join(' + ') : ''
  const verdict = l => l.notComparable ? 'not comparable: ' + l.notComparable.join('; ')
    : l.ratio == null ? l.notes.join('; ') : (l.outlier ? '**outlier**' : 'within ' + OUTLIER * 100 + ' %') + (l.peakAbove ? '; **peak above the dearest model**' : '')
  const rows = lines.map(l => `| ${l.id} ${l.version.replace(/-experimental$/, '')} | ${l.points == null ? '–' : `${l.points} = ${f(l.unit)} (${l.on})`} | ` +
    `${l.peak == null ? '–' : `${l.peak} = ${f(l.unitPeak)}`} | ${l.setting ?? '–'} | ${f(l.modelDefaults)}${base(l)} | ${f(l.modelDearest)}${base(l)} | ` +
    `${l.ratio == null ? '–' : l.ratio.toFixed(2)} | ${l.peakRatio == null ? '–' : l.peakRatio.toFixed(2)} | ${verdict(l)} |`)
  return ['| Module | Unit, in use (points = cycles a sample) | Unit, peak | Defaults run | Model at defaults (+ base features) | Model, dearest (+ base features) | Unit ÷ model | Peak ÷ dearest | Verdict |',
    '|---|---|---|---|---|---|---|---|---|', ...rows].join('\n')
}

export const README = 'sdk/cycle-scan/README.md'
const TABLE_START = '<!-- generated: node scripts/cycle-scan.mjs unit --write (cycle-scan check fails when it differs) -->', TABLE_END = '<!-- end of the generated table -->'
/** The README's text with the table between its markers replaced. */
export function withTable(text, table) {
  const start = text.indexOf(TABLE_START), end = text.indexOf(TABLE_END)
  if (start < 0 || end < start) throw new Error(`${README} has lost the generated table's markers`)
  return text.slice(0, start + TABLE_START.length) + '\n' + table + '\n' + text.slice(end)
}
/** A failure when the README's committed table is not what the records and readings generate now, else null. */
export function tableDrift(base = root) {
  const path = join(base, README)
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf8')
  return withTable(text, unitMarkdown(unitReport(base))) === text ? null
    : `${README}: the table under "Checked against the unit" is not what the records and the unit readings give now: run node scripts/cycle-scan.mjs unit --write`
}

/** One record's verdict: {fail: [...], info: [...]}. `sourceSha256` is the module's source now; `earlierSha256` the same
 * source with presentation/, which records scanned before 25 November 2026 name; `performance` its evidence/performance.json, or null. */
export function judge({ id, record, sourceSha256, earlierSha256, performance }) {
  const fail = [], info = []
  if (record.schema !== 1 || record.module !== id) fail.push(`${id}: not a cycle-scan record for this module`)
  if (record.sourceSha256 !== sourceSha256 && !(earlierSha256 && record.sourceSha256 === earlierSha256))
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

/** Modules first listed on or after this day are refused when the base would charge less than the scan models; earlier
 * ones are reported (LOFI2's hardware figure, 637, sits under its modelled 654 at DOWN/max, 23 November 2026). */
export const CHARGE_COVERS_MODEL_FROM = '2026-11-24'
/** A charge within this share above the model is listed as a near miss. */
export const NEAR_MISS = 0.05

/** What the base's DSP admission charges an instance a sample for a package's declared figure: a hardware figure as it
 * is, an emulator figure (executed instructions, modeled cycles) at 7/4, rounded as the base rounds (dsp.c, charged()). */
export const charged = (cycles, kind) => kind === 'hardware' ? cycles : Math.floor((cycles * 7 + 3) / 4)

/** The admission charge against the scan's dearest cycles: {fail, info}. `row` is the module's USB package row
 * (src/engine/assets/octatrack-module-packages.json) or undefined; `listed` its catalogue date or undefined (a draft). */
export function judgeCharge({ id, record, row, listed }) {
  const fail = [], info = []
  if (typeof row?.cycles !== 'number') { info.push(`${id}: its package declares no DSP cycles, so the admission charge is not compared`); return { fail, info } }
  if (row.version !== record.version) { info.push(`${id}: the package is ${row.version}, the cycle scan ${record.version}: the charge is not compared`); return { fail, info } }
  const charge = charged(row.cycles, row.cyclesKind), model = record.dearest.cycles, ratio = (charge / model).toFixed(3)
  const said = `${id}: the base charges ${charge} cycles a sample (${row.cycles} ${row.cyclesKind}${row.cyclesKind === 'hardware' ? '' : ' x 7/4'}) ` +
    `against ${model} modelled at ${record.dearest.setting}, ${ratio}x`
  if (charge >= model) { if (charge < model * (1 + NEAR_MISS)) info.push(said + `: a near miss, under ${NEAR_MISS * 100} % of room`); return { fail, info } }
  const fix = 'declare at least the modelled cycles, or a hardware figure measured at that setting (docs/MODULE_PERFORMANCE.md)'
  if (!listed || listed.slice(0, 10) >= CHARGE_COVERS_MODEL_FROM) fail.push(said + `: under the model; ${fix}`)
  else info.push(said + `: under the model. Reported, not refused (listed before ${CHARGE_COVERS_MODEL_FROM}); at its next release: ${fix}`)
  return { fail, info }
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const documentOf = folder => parseModuleDocument(readJson(join(folder, 'octamod.module.json')))
const performanceOf = folder => existsSync(join(folder, 'evidence/performance.json')) ? readJson(join(folder, 'evidence/performance.json')) : null

/** Every committed record judged, and the DSP modules that have none (told, not failed). */
export async function check(base = root) {
  const dir = join(base, RECORDS), fail = [], info = []
  const ids = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).sort() : []
  const packages = readJson(join(base, 'src/engine/assets/octatrack-module-packages.json')).packages, catalog = readJson(join(base, 'sdk/catalog.json')).modules
  for (const id of ids) {
    const folder = join(base, MODULES, id)
    if (!existsSync(join(folder, 'octamod.module.json'))) { fail.push(`${id}: a cycle-scan record for a module that is not in ${MODULES}`); continue }
    const record = readJson(join(dir, id + '.json'))
    const document = documentOf(folder)
    const verdict = judge({ id, record, sourceSha256: await modulePerformanceSourceSha256(folder, document), earlierSha256: await moduleEarlierPerformanceSourceSha256(folder, document), performance: performanceOf(folder) })
    const charge = judgeCharge({ id, record, row: packages.find(row => row.id === id), listed: catalog.find(entry => entry.id === id)?.addedAt })
    fail.push(...verdict.fail, ...charge.fail); info.push(...verdict.info, ...charge.info)
  }
  const unscanned = readdirSync(join(base, MODULES)).filter(id => !ids.includes(id) && performanceOf(join(base, MODULES, id))?.kind === 'dsp')
  if (unscanned.length) info.push(`no cycle scan yet: ${unscanned.sort().join(', ')}`)
  // The README's unit table is generated: it fell behind the key-bus charge once (51 there, 43 in dsp-sites.json).
  const drift = ids.length ? tableDrift(base) : null
  if (drift) fail.push(drift)
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
      console.log(fail.length ? `Cycle scan: ${fail.length} failure${fail.length === 1 ? '' : 's'} over ${records} records.` : `Cycle scan: ${records} records current, none under-reported.`)
      if (fail.length) process.exitCode = 1
    } else if (command === 'unit') {
      const report = unitReport()
      if (ids.includes('--markdown')) console.log(unitMarkdown(report))
      else if (ids.includes('--write')) {
        const path = join(root, README), text = readFileSync(path, 'utf8'), next = withTable(text, unitMarkdown(report))
        if (next !== text) writeFileSync(path, next)
        console.log(next === text ? `${README}: the table is current.` : `${README}: wrote the table.`)
      } else for (const l of report.lines) console.log(`  ${l.notComparable ? '×' : l.outlier || l.peakAbove ? '!' : '·'} ${l.id}: ` + (l.unit == null ? l.notes.join('; ') :
        `unit ${l.unit} cycles a sample (${l.points} points on ${l.on}${l.peak == null ? '' : `, peak ${l.peak}`}), model ${l.model} at ${l.setting}` +
        (l.outside.length ? ` with ${l.outside.map(e => e.name + ' ' + e.cycles).join(', ')}` : '') +
        (l.notComparable ? `: not comparable: ${l.notComparable.join('; ')}` : `, ${l.ratio}x` + (l.outlier ? ': an outlier' : '') +
          (l.peakRatio == null ? '' : `; peak ${l.unitPeak} against ${l.modelPeak} at the dearest, ${l.peakRatio}x` + (l.peakAbove ? ': above the model' : '')))))
      if (report.missing.length && !ids.includes('--markdown') && !ids.includes('--write')) console.log(`No in-use reading to compare: ${report.missing.join(', ')}. A report only; nothing fails.`)
    } else { console.error('Usage: node scripts/cycle-scan.mjs record <id> [<id> ...] | check | unit [--markdown | --write]'); process.exitCode = 2 }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

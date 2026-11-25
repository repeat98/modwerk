#!/usr/bin/env node
// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// The release record of an Octatrack module, written from its evidence instead of by hand (docs/MODULE_QUALIFICATION.md).
//
//   npm run module:qualify -- <id> --procedure DIR [--package FILE.mwrm] [--base TEXT] [--write]
//       Drafts tests.qualification and the measured resource gauges from what is already measured: the test procedure's record
//       (DIR/procedure.json, its device:price readings DIR/price.json), the package it tested (DIR/procedure.json names it; or
//       --package), evidence/performance.json (perf:audit), evidence/cpu-price.json and frame-cost.json, media/capture.json.
//       price.json's reading becomes evidence/cpu-price.json, resources.cpuPrice and evidence/frame-cost.json, as device:price
//       --write would have written them; --base names the base the unit ran, which the record needs (device:price --base).
//       It prints what changes; --write writes it. sourceSha256 is computed last, over the folder as it will be written.
//   npm run module:qualify -- <id> --check     # a stale sourceSha256, fields still marked as drafts, evidence for another version
//   npm run module:qualify -- <id> --rehash [--write]   # only sourceSha256, after a change to files that are not code
//   Options: --draft (sdk/drafts/<id> when both it and the listed folder exist), --image SHA (the tested image when it is
//   not the procedure's package), --tester LOGIN, --model MKI|MKII.
//
// A listed module (sdk/octatrack/modules/<id>) or a draft (sdk/drafts/<id>). Numbers and identities come from the evidence and
// replace what the manifest says; words a person has to stand behind (rationales, conditions, the hardware summary and its
// limitations, the tutorial) are kept as written. Where the manifest has none, they are drafted from the data and start with
// DRAFT, which --check and module:doctor refuse until the author has read and edited them. A value with no source stays out,
// with a note saying what would supply it. Nothing here runs module code or touches a unit.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { parseModuleDocument, requireModuleQualificationForPublication } from '../src/catalog/module-contract.ts'
import { BASELINE_PATH, moduleNativeSourceSha256, parseQualificationBaseline } from './module-qualification.mjs'
import { CPU_PRICE_RECORD, FRAME_COST_RECORD, curveProblem, manifestJson } from './module-cpu-price.mjs'
import { curveRecord, moduleFolder, priceRecord } from './octatrack-price.mjs'
import { LIMITS } from './perf-audit-analysis.mjs'

/** The mark a drafted text starts with until its author has read it. */
export const DRAFT = '[module:qualify draft] '
const PERFORMANCE_RECORD = 'evidence/performance.json', CAPTURE_RECORD = 'media/capture.json'
const GATES = ['Worst-case cycles under parameter modulation and maximum load', 'Exact memory region and maximum-instance totals',
  'Owner-reviewed real-hardware evidence with actual coverage and limitations']
const UNIT_STEPS = ['unit-read', 'unit-pass', 'soak', 'cost-unit', 'restore']
const json2 = value => JSON.stringify(value, null, 2) + '\n'
const readJson = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
const short = sha => String(sha).slice(0, 8)

/** What a runtime package's header says (sdk/runtime/loader/README.md): code and data bytes, and from ABI 5 its DSP effect. */
export function packageFacts(data) {
  if (data.length < 32 || data.toString('ascii', 0, 4) !== 'MWRM') throw new Error('not an Octatrack runtime package (no MWRM header)')
  const abi = data.readUInt16BE(4), dsp = abi >= 5 && data.length >= 50
  return { abi, sha256: createHash('sha256').update(data).digest('hex'), imageBytes: data.readUInt32BE(8), bssBytes: data.readUInt32BE(12),
    dspWords: dsp ? data.readUInt32BE(32) : 0, slots: dsp ? data[39] : 0, cycles: dsp ? data.readUInt16BE(44) : 0, cyclesKind: dsp ? data[46] : 0,
    stateWords: dsp ? data[47] : 0, bufferWords: dsp ? data.readUInt16BE(48) : 0 }
}

/** The tiers a measurement suggests (docs/MODULE_RESOURCE_GAUGES.md). Suggestions: the author keeps or changes the level. */
export const suggestCpuLevel = price => price < 0.5 ? 'minimal' : price < 2 ? 'low' : price < 10 ? 'moderate' : 'high'
export const suggestDspLevel = share => share < 0.25 ? 'minimal' : share < 0.5 ? 'low' : share < 1 ? 'moderate' : 'high'
export const suggestMemoryLevel = bytes => bytes < 512 ? 'minimal' : bytes < 16384 ? 'low' : bytes < 65536 ? 'moderate' : 'high'

/** The module's folder: the listed one, or the draft (`draft`: the draft even when both exist). */
export function qualifyFolder(root, id, draft = false) {
  if (draft) return existsSync(resolve(root, 'sdk/drafts', id, 'octamod.module.json')) ? resolve(root, 'sdk/drafts', id) : null
  return moduleFolder(root, id)
}

/** Everything the record is drafted from. `procedure`: a test:procedure --out folder; `packagePath`: the tested .mwrm. */
export function readEvidence({ folder, procedure, packagePath }) {
  const evidence = { performance: readJson(join(folder, PERFORMANCE_RECORD)), cpuPrice: readJson(join(folder, CPU_PRICE_RECORD)),
    frameCost: readJson(join(folder, FRAME_COST_RECORD)), capture: readJson(join(folder, CAPTURE_RECORD)), procedure: null, price: null, package: null }
  if (procedure) {
    evidence.procedure = readJson(join(procedure, 'procedure.json'))
    if (!evidence.procedure) throw new Error(join(procedure, 'procedure.json') + ' is missing: name the folder npm run test:procedure -- --out wrote')
    evidence.price = readJson(join(procedure, 'price.json'))
  }
  const named = packagePath ?? evidence.procedure?.build?.package?.path
  if (named && existsSync(named)) evidence.package = packageFacts(readFileSync(named))
  else if (packagePath) throw new Error('No package at ' + packagePath)
  const tested = evidence.procedure?.build?.package?.sha256
  if (evidence.package && tested && evidence.package.sha256 !== tested) throw new Error('The package ' + short(evidence.package.sha256) + ' is not the one the procedure tested (' + short(tested) + ')')
  return evidence
}

/** Keep what a person wrote; draft it from the data only where nothing is written. */
function wording(old, drafted, path, reads) {
  if (typeof old === 'string' && old.trim()) return old
  reads.push(path)
  return DRAFT + drafted
}

/** The drafted manifest and evidence files: { document, files: { path: text }, notes, reads, changedLevels }. Pure: reads only `evidence`.
 *  sourceSha256 is left as it was; sourceHashOf computes it over the result. */
export function draftRecord({ document: original, evidence, options = {} }) {
  const document = structuredClone(original), notes = [], reads = [], files = {}, id = document.id, version = document.version
  const { performance: perfAny, procedure, price, capture } = evidence
  const pkg = evidence.package
  let { cpuPrice: priceRec, frameCost: curveRec } = evidence

  // 1. The procedure: this module, this version.
  if (procedure && (procedure.target?.id !== id || procedure.target?.version !== version))
    throw new Error('The procedure tested ' + procedure.target?.id + ' ' + procedure.target?.version + ', not ' + id + ' ' + version)

  // 2. The price and the curve from the procedure's device:price run, as device:price --write writes them.
  const result = price?.results?.find(item => item.id === id)
  if (price && !result) notes.push('price.json holds no reading of ' + id + ': the CPU price and the curve stay as they are')
  if (result) {
    const base = options.base ?? price.base
    if (priceRec?.measuredAt === price.measuredAt && priceRec?.version === version) notes.push(CPU_PRICE_RECORD + ' already holds this run (' + price.measuredAt + '): kept as it is')
    else if (!base) notes.push('the CPU price and the curve in price.json are not written: name the base the unit ran with --base TEXT (as device:price --base takes it: "development twin 8fd6d456 of base 0.8.1, the owner\'s MKII, OS 1.40C")')
    else {
      const made = priceRecord({ document, result, base, scene: price.scene, seconds: price.seconds, measuredAt: price.measuredAt, readings: price.readings ?? 1, inputs: price.inputs })
      if (made.problem) notes.push('the CPU price is not written: ' + made.problem)
      else { files[CPU_PRICE_RECORD] = json2(made.record); document.resources.cpuPrice = made.cpuPrice; priceRec = made.record }
      if (result.curve && !result.curve.error) {
        const curve = curveRecord({ result, version, base, scene: price.scene, seconds: price.seconds, measuredAt: price.measuredAt })
        if (curve.problem) notes.push('the curve is not written: ' + curve.problem)
        else {
          files[FRAME_COST_RECORD] = json2(curve.record); curveRec = curve.record
          const problem = curveProblem(curve.record)
          if (problem) notes.push('NOT RELEASABLE on this curve: ' + problem)
        }
      }
    }
  }

  // 3. The performance record, when it is this version's.
  const perf = perfAny?.module === id && perfAny?.version === version ? perfAny : null
  if (perfAny && !perf) notes.push(PERFORMANCE_RECORD + ' is for ' + perfAny.module + ' ' + perfAny.version + ': its numbers stay out until it is measured for ' + version)
  if (!perfAny) notes.push('no ' + PERFORMANCE_RECORD + ': cycles and the DSP gauge stay as they are (npm run perf:audit -- template dsp|coldfire)')
  if (!pkg) notes.push('no package: storage and memory are kept as written (name it with --package FILE.mwrm, or a procedure that built one)')
  const dsp = perf?.kind === 'dsp'
  const resources = document.resources
  if (procedure?.date) resources.recorded = procedure.date

  // 4. The measured gauges: storage from the package, processing from the performance record.
  if (pkg) {
    const old = resources.storage?.method === 'unmeasured' ? {} : resources.storage ?? {}
    const program = pkg.dspWords ? pkg.dspWords + ' program words on each DSP core it runs on; ' + pkg.stateWords + ' words of state per instance; ' + (pkg.bufferWords ? pkg.bufferWords + ' delay-buffer words' : 'no delay buffer') + '; ' : ''
    resources.storage = { ...(pkg.dspWords ? { label: 'DSP program / state', display: pkg.dspWords + ' words / ' + pkg.stateWords + '-word state' } : { label: 'ColdFire code', display: (pkg.imageBytes + pkg.bssBytes) + ' bytes' }),
      value: null, unit: 'see display', method: 'static',
      conditions: wording(old.conditions, 'The USB package ' + short(pkg.sha256) + ': ' + program + pkg.imageBytes + ' bytes of ColdFire code and data, ' + (pkg.bssBytes ? pkg.bssBytes + ' bytes of bss' : 'no bss') + '.', 'resources.storage.conditions', reads),
      source: old.source ?? 'TESTING.md' }
  }
  if (perf) {
    const old = resources.processing?.method === 'unmeasured' ? {} : resources.processing ?? {}, c = perf.cycles ?? {}
    const unit = resources.cpuPrice && priceRec?.result?.inUseAdds && priceRec.result.inUseOn ? ' On the unit the DSP load of ' + (/^T[1-4]/.test(priceRec.result.inUseOn) ? 'T1-T4' : 'T5-T8') + ' rose ' + (/^T[1-4]/.test(priceRec.result.inUseOn) ? priceRec.result.inUseAdds.dsp1to4 : priceRec.result.inUseAdds.dsp5to8) + ' points with it on ' + priceRec.result.inUseOn + '.' : ''
    resources.processing = dsp
      ? { label: 'DSP instruction peak', display: Math.round(c.measured) + ' instructions/sample per instance', value: null, unit: 'see display', method: 'emulator',
        conditions: wording(old.conditions, 'perf:audit record: worst ' + c.measured + ' executed instructions a sample (static floor ' + c.static + '), against ' + perf.stock?.comparator + ' ' + perf.stock?.comparatorWorst + ' and ' + perf.stock?.dearestWorst + ' for the dearest stock effect. Executed instructions, not chip cycles.' + unit, 'resources.processing.conditions', reads),
        source: old.source ?? PERFORMANCE_RECORD }
      : { label: 'ColdFire worst event', display: c.measured + ' cycles/event', value: null, unit: 'see display', method: old.method && old.method !== 'unmeasured' ? old.method : 'emulator',
        conditions: wording(old.conditions, 'perf:audit record: worst event ' + c.measured + ' cycles' + (c.static ? ' (static bound ' + c.static + ')' : '') + ' of a ' + c.budget + '-cycle deadline.' + unit, 'resources.processing.conditions', reads),
        source: old.source ?? PERFORMANCE_RECORD }
  }

  // 5. The qualification record: kept for this version's tested build, drafted where the evidence supplies it.
  const oldQ = document.tests.qualification?.moduleVersion === version ? document.tests.qualification : null
  const steps = procedure?.steps ?? [], unitSteps = steps.filter(step => UNIT_STEPS.includes(step.id))
  const failed = steps.filter(step => step.status === 'failed'), unitPassed = unitSteps.filter(step => step.status === 'passed')
  const revision = procedure?.build?.revision
  let q = oldQ ? structuredClone(oldQ) : null
  if (procedure && failed.length) notes.push('the procedure failed at ' + failed.map(step => step.title).join(', ') + ': no hardware record is drafted from it')
  else if (procedure && !unitPassed.length) notes.push('no unit step passed in the procedure (' + (unitSteps[0]?.reason ?? 'not run') + '): no hardware record is drafted from it')
  else if (procedure && !/^[a-f0-9]{40}$/.test(revision ?? '')) notes.push('the procedure names no source commit (' + revision + '): no hardware record is drafted from it')
  else if (procedure) {
    if (procedure.build.dirty) notes.push('the procedure ran on a checkout with uncommitted changes, so ' + short(revision) + ' is not exactly the tested source: commit, rebuild and run it again before release')
    const oldH = oldQ?.hardware, sameBuild = oldH?.sourceRevision === revision
    const tested = procedure.build.package?.sha256
    const image = options.image ?? (sameBuild ? oldQ.imageSha256 : null) ?? tested
    if (!image) notes.push('no tested image: the procedure names no package; give it with --image SHA')
    const shot = capture && capture.packageSha256 === tested ? capture : null
    q = { moduleVersion: version, sourceSha256: oldQ?.sourceSha256 ?? '0'.repeat(64), cycles: oldQ?.cycles, memory: oldQ?.memory, imageSha256: image, hardware: null, documentation: oldQ?.documentation ?? document.tests.documentation }
    if (oldH && sameBuild && oldH.kind !== 'functional') q.hardware = oldH
    else {
      const model = options.model ?? (sameBuild ? oldH.model : undefined) ?? shot?.model ?? null
      if (!model) notes.push('the model is not recorded (null): give it with --model MKI|MKII')
      let tester = options.tester ?? (sameBuild ? oldH.tester : undefined) ?? shot?.capturedBy
      if (!tester) { tester = document.author.github; reads.push('tests.qualification.hardware.tester (the author, ' + tester + '; --tester LOGIN when someone else ran it)') }
      const passed = steps.filter(step => step.status === 'passed' && step.id !== 'build').map(step => step.title)
      const notRun = steps.filter(step => step.status === 'not run').map(step => 'Not run: ' + step.title.toLowerCase() + (step.reason ? ' (' + step.reason + ')' : '') + '.')
      const toDo = steps.filter(step => step.status === 'to do').flatMap(step => step.todo ?? []).map(item => 'Not done yet: ' + item + '.')
      const summary = 'On ' + (model ? 'an Octatrack ' + model : 'an Octatrack (model not recorded)') + ', ' + procedure.date + ', npm run test:procedure ran on package ' + short(tested) + ' built from ' + short(revision) +
        ': ' + passed.join(', ') + ' passed' + (curveRec?.version === version ? '; the CPU price ' + (resources.cpuPrice?.value ?? '?') + ' % of a frame, the instance curve first ' + curveRec.first + ', each ' + curveRec.each + ', admitted alone on the empty and the medium pattern' : '') + '.'
      const limitations = sameBuild && oldH.limitations?.length ? oldH.limitations : [...notRun, ...toDo].slice(0, 16).map(item => DRAFT + item)
      if (!(sameBuild && oldH.limitations?.length)) reads.push('tests.qualification.hardware.limitations')
      q.hardware = { kind: 'functional', status: 'reported', model, testedOn: procedure.date, tester, sourceRevision: revision, imageSha256: image,
        summary: wording(sameBuild ? oldH.summary : undefined, summary, 'tests.qualification.hardware.summary', reads), limitations, report: oldH?.report ?? 'TESTING.md' }
    }
    document.tests.evidenceRevision = revision
    if (q.hardware.kind === 'functional') document.tests.hardwareStatus = 'reported' // a detailed record keeps its own status
    document.tests.summary = wording(original.tests.hardwareStatus !== 'untested' && original.tests.qualification ? original.tests.summary : undefined,
      'npm run test:procedure on ' + (q.hardware.model ?? 'an Octatrack') + ' (' + procedure.date + '): ' + unitPassed.length + ' of ' + unitSteps.length + ' unit steps passed' + (perf ? '; perf:audit ' + (dsp ? 'worst ' + perf.cycles.measured + ' instructions a sample' : 'worst event ' + perf.cycles.measured + ' cycles') : '') + '.', 'tests.summary', reads)
    if (!document.tests.gates?.length) document.tests.gates = GATES
  }
  if (q) {
    // Cycles: one record a processor, from the perf:audit record when the manifest has none for this version.
    if (!q.cycles && perf) {
      const c = perf.cycles, s = perf.stress ?? {}
      if (dsp && c.static > 0 && Number.isInteger(c.instancesPerCore)) {
        const worst = Math.ceil(c.static), n = c.instancesPerCore
        q.cycles = [{ processor: 'dsp', worstCase: worst, maxConfiguration: worst * n, maxInstances: Math.min(16, 2 * n), budget: LIMITS.usableCycles, unit: 'cycles/sample', method: 'static',
          conditions: {
            parameterExtremes: DRAFT + 'Static floor ' + c.static + ' a sample from the perf:audit record; measured ' + c.measured + ' at the dearest case. Add any per-call setup, initialization and trigger-split cost the floor leaves out. ' + String(c.method ?? '').slice(0, 3000),
            parameterModulation: DRAFT + 'Stress run: ' + s.lfosPerTrack + ' LFOs a track, ' + s.lockedSlots + ' locked slots, ' + s.seconds + ' s, ' + s.clobbers + ' clobbers, ' + s.hangs + ' hangs. Say how LFOs, locks, scenes and CC reach the code.',
            modeSwitching: DRAFT + 'Not in the evidence: say how mode, bypass and Part changes were covered, or why the module has none.',
            maxLoad: DRAFT + n + ' instances a core, ' + Math.min(16, 2 * n) + ' on both: ' + n + ' x ' + worst + ' = ' + worst * n + ' of the ' + LIMITS.usableCycles + ' cycles a core can spend a sample. Stress: ' + s.instancesPerCore + ' a core on ' + s.tracks + ' tracks.',
            inputConditions: DRAFT + 'Not in the evidence: say which inputs (silence, full scale, impulses, feedback) the bound and the stress run cover.' },
          report: PERFORMANCE_RECORD }]
        reads.push('tests.qualification.cycles[0] (worstCase is the static floor: it must also cover setup and trigger splits; and its five conditions)')
      } else if (!dsp && (c.static > 0 || c.measured > 0) && c.budget > 0) {
        const worst = Math.ceil(c.static > 0 ? c.static : c.measured)
        q.cycles = [{ processor: 'coldfire', worstCase: worst, maxConfiguration: worst, maxInstances: 1, budget: Math.round(c.budget), unit: 'cycles/event', method: c.static > 0 ? 'static' : 'emulator',
          conditions: Object.fromEntries(['parameterExtremes', 'parameterModulation', 'modeSwitching', 'maxLoad', 'inputConditions'].map(key => [key, DRAFT + 'Not in the evidence: ' + key + ' (docs/MODULE_QUALIFICATION.md#worst-case-cycle-counts). ' + (key === 'parameterExtremes' ? String(c.method ?? '').slice(0, 3000) : '')])),
          report: PERFORMANCE_RECORD }]
        reads.push('tests.qualification.cycles[0] (its five conditions, and maxInstances)')
      } else notes.push('the performance record gives no cycle bound to draft from: write tests.qualification.cycles by hand')
    } else if (q.cycles && perf && dsp) {
      const record = q.cycles.find(item => item.processor === 'dsp'), perSample = record && (record.unit === 'cycles/block' ? record.worstCase / 16 : record.worstCase)
      if (record && record.unit !== 'cycles/event' && perSample < perf.cycles.static) reads.push('tests.qualification.cycles: worstCase ' + record.worstCase + ' ' + record.unit + ' is under the static floor ' + perf.cycles.static + ' a sample in ' + PERFORMANCE_RECORD)
    }
    // Memory: the package's own allocations when the manifest has none for this version; else checked against the package.
    if (!q.memory && pkg) {
      const regions = [], maxInstances = q.cycles?.[0]?.maxInstances ?? 1
      if (pkg.dspWords) regions.push({ name: 'DSP program, the package\'s effect on each core it runs on', space: 'dsp-p', words: pkg.dspWords, wordBits: 24, bytes: pkg.dspWords * 3, scope: 'shared' })
      if (pkg.stateWords) regions.push({ name: 'DSP state per instance, the package\'s state words', space: 'dsp-x', words: pkg.stateWords, wordBits: 24, bytes: pkg.stateWords * 3, scope: 'instance' })
      if (pkg.imageBytes) regions.push({ name: 'ColdFire code and data of the USB package', space: 'cpu-ram', words: pkg.imageBytes, wordBits: 8, bytes: pkg.imageBytes, scope: 'shared' })
      if (pkg.bssBytes) regions.push({ name: 'ColdFire bss of the USB package', space: 'cpu-ram', words: pkg.bssBytes, wordBits: 8, bytes: pkg.bssBytes, scope: 'shared' })
      if (pkg.bufferWords) notes.push('the package reads ' + pkg.bufferWords + ' delay-buffer words: add that region to tests.qualification.memory.regions with its space and scope')
      const perInstanceBytes = regions.filter(r => r.scope === 'instance').reduce((sum, r) => sum + r.bytes, 0), sharedBytes = regions.filter(r => r.scope === 'shared').reduce((sum, r) => sum + r.bytes, 0)
      if (regions.length) {
        q.memory = { regions, perInstanceBytes, sharedBytes, maxInstances, totalBytes: perInstanceBytes * maxInstances + sharedBytes,
          conditions: DRAFT + 'From the header of the USB package ' + short(pkg.sha256) + ' (ABI ' + pkg.abi + '). Add what the header cannot show: stock blocks the effect reuses, the stack, Y memory, scratch, and why none are left out.', report: 'TESTING.md' }
        reads.push('tests.qualification.memory (the regions are the package header\'s; add what it cannot show)')
      }
    } else if (q.memory && pkg?.dspWords) {
      const program = q.memory.regions.filter(r => r.space === 'dsp-p')
      if (program.length && !program.some(r => r.words === pkg.dspWords)) reads.push('tests.qualification.memory: no dsp-p region holds the package\'s ' + pkg.dspWords + ' program words')
      if (pkg.stateWords && !q.memory.regions.some(r => r.space === 'dsp-x' && r.scope === 'instance' && r.words >= pkg.stateWords)) reads.push('tests.qualification.memory: no per-instance dsp-x region covers the package\'s ' + pkg.stateWords + ' state words')
    }
    // Documentation: the tutorial is the author's; drafted from the access steps when there is none.
    if (!q.documentation) {
      const steps = (document.access?.steps?.length >= 3 ? document.access.steps : document.presentation?.usage ?? []).slice(0, 12)
      if (steps.length >= 3) {
        q.documentation = { tutorial: { title: 'Quick tutorial', steps: steps.map(step => DRAFT + step) }, screenshots: (document.access?.screenshots ?? []).length ? document.access.screenshots : document.media.filter(item => item.otUi).map(item => item.path), screenshotStyle: 'black-and-white' }
        reads.push('tests.qualification.documentation.tutorial (from the access steps: setup, a control example, the result and how to stop)')
      } else notes.push('no tutorial: write tests.qualification.documentation.tutorial (three steps or more) by hand')
    }
    const missing = ['cycles', 'memory', 'hardware', 'documentation', 'imageSha256'].filter(key => !q[key])
    if (missing.length) { notes.push('tests.qualification is not written: it lacks ' + missing.join(', ')); q = null }
    else document.tests.qualification = { moduleVersion: q.moduleVersion, sourceSha256: q.sourceSha256, cycles: q.cycles, memory: q.memory, imageSha256: q.imageSha256, hardware: q.hardware, documentation: q.documentation }
  } else if (!procedure && !oldQ) notes.push('no procedure and no qualification record for ' + version + ': name the test procedure\'s folder with --procedure DIR')

  // 6. The gauges: levels suggested from the measurements, rationales drafted where none is written.
  const share = perf && dsp && perf.stock?.dearestWorst > 0 ? perf.cycles.measured / perf.stock.dearestWorst : null
  const memoryBytes = document.tests.qualification?.memory?.totalBytes
  const estimates = {
    cpu: typeof resources.cpuPrice?.value === 'number' && resources.cpuPrice.measure === 'frame-interrupt' && priceRec?.result ? { level: suggestCpuLevel(resources.cpuPrice.value), source: CPU_PRICE_RECORD,
      rationale: 'On the unit the frame interrupt rose ' + priceRec.result.inUseAdds?.frame + ' points with it on ' + priceRec.result.inUseOn + ' and ' + priceRec.result.atRestAdds?.frame + ' installed and unused' + (curveRec?.version === version ? '; the instance curve read first ' + curveRec.first + ', each ' + curveRec.each : '') + '.' } : null,
    dsp: share !== null ? { level: suggestDspLevel(share), source: PERFORMANCE_RECORD,
      rationale: perf.cycles.measured + ' executed instructions a sample worst case, ' + (perf.cycles.measured / perf.stock.comparatorWorst).toFixed(2) + ' of ' + perf.stock.comparator + ' (' + perf.stock.comparatorWorst + ') and ' + share.toFixed(2) + ' of the dearest stock effect (' + perf.stock.dearestWorst + '). Chip timing is unmeasured.' }
      : perf && !dsp && pkg && !pkg.dspWords ? { level: 'minimal', source: PERFORMANCE_RECORD, rationale: 'No DSP code: the package carries no DSP words.' } : null,
    memory: typeof memoryBytes === 'number' ? { level: suggestMemoryLevel(memoryBytes), source: 'TESTING.md', rationale: memoryBytes + ' bytes at ' + document.tests.qualification.memory.maxInstances + ' instances (tests.qualification.memory).' } : null,
  }
  const impact = resources.impact ? structuredClone(resources.impact) : {}, changedLevels = []
  for (const [key, estimate] of Object.entries(estimates)) {
    const old = impact[key]
    if (old) { if (estimate && old.level !== estimate.level) changedLevels.push('resources.impact.' + key + '.level is ' + old.level + '; the measurements suggest ' + estimate.level + ' (' + estimate.rationale + ')'); continue }
    if (!estimate) continue
    // Memory is counted from the build (the package header, the inventory), not compared with a measurement.
    impact[key] = { level: estimate.level, basis: key === 'memory' ? 'source-estimate' : 'measured-comparison', rationale: DRAFT + estimate.rationale, source: estimate.source }
    reads.push('resources.impact.' + key + ' (level ' + estimate.level + ' suggested from the measurement)')
  }
  if (['cpu', 'dsp', 'memory'].every(key => impact[key])) {
    impact.conditions = wording(impact.conditions, 'One active instance at the dearest setting measured' + (resources.cpuPrice ? '; on the unit, the frame-interrupt price on ' + (priceRec?.scene ?? 'the procedure\'s scene') : '') + '.', 'resources.impact.conditions', reads)
    resources.impact = { conditions: impact.conditions, cpu: impact.cpu, dsp: impact.dsp, memory: impact.memory }
  } else if (!resources.impact) notes.push('resources.impact is not written: ' + ['cpu', 'dsp', 'memory'].filter(key => !impact[key]).join(', ') + ' has no measurement here (a CPU price, a DSP performance record, a memory inventory)')
  return { document, files, notes, reads, changedLevels }
}

/** sourceSha256 over the folder as it will be: `files` written into a copy first, so nothing in the module changes for a dry run. */
export async function sourceHashOf(folder, document, files = {}) {
  if (!Object.keys(files).length) return moduleNativeSourceSha256(folder, document)
  const copy = mkdtempSync(join(tmpdir(), 'module-qualify-'))
  try {
    cpSync(folder, copy, { recursive: true, verbatimSymlinks: true })
    for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(copy, path)), { recursive: true }); writeFileSync(join(copy, path), text) }
    return await moduleNativeSourceSha256(copy, document)
  } finally { rmSync(copy, { recursive: true, force: true }) }
}

/** Every string in resources and tests still marked DRAFT, by its path. */
export function draftedFields(document) {
  const found = [], walk = (value, path) => {
    if (typeof value === 'string') { if (value.includes(DRAFT.trim())) found.push(path) }
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, path + '[' + i + ']'))
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, path + '.' + key)
  }
  walk(document.resources, 'resources'); walk(document.tests, 'tests')
  return found
}

/** The changes from one manifest to another, a line a field: "~ path: old -> new", "+ path: new", "- path: old". */
export function fieldDiff(before, after) {
  const flat = (value, path = '', out = new Map()) => {
    if (value && typeof value === 'object') { const entries = Array.isArray(value) ? value.map((item, i) => [path + '[' + i + ']', item]) : Object.entries(value).map(([key, item]) => [path ? path + '.' + key : key, item]); if (!entries.length) out.set(path, JSON.stringify(value)); for (const [at, item] of entries) flat(item, at, out) }
    else out.set(path, JSON.stringify(value))
    return out
  }
  const a = flat(before), b = flat(after), cut = text => text.length > 160 ? text.slice(0, 157) + '...' : text, lines = []
  for (const [path, value] of b) if (!a.has(path)) lines.push('+ ' + path + ': ' + cut(value)); else if (a.get(path) !== value) lines.push('~ ' + path + ': ' + cut(a.get(path)) + ' -> ' + cut(value))
  for (const [path, value] of a) if (!b.has(path)) lines.push('- ' + path + ': ' + cut(value))
  return lines
}

/** The module's files that differ from `revision` (the tested commit), by Git's blob hashes, wherever the folder sat then
 *  (a draft moves to sdk/octatrack/modules at its release). Null when this clone lacks the commit or the folder. */
export function changedSince(root, folder, revision) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
  const id = basename(folder), files = []
  const list = (dir, prefix = '') => { for (const entry of readdirSync(dir, { withFileTypes: true })) { if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name === '.DS_Store') continue; if (entry.isDirectory()) list(join(dir, entry.name), prefix + entry.name + '/'); else if (entry.isFile()) files.push(prefix + entry.name) } }
  list(folder)
  for (const at of ['sdk/octatrack/modules/' + id, 'sdk/drafts/' + id, 'sdk/octabam/modules/' + id]) {
    let listing
    try { listing = git('ls-tree', '-r', revision, '--', at + '/') } catch { return null }
    if (!listing.trim()) continue
    const then = new Map(listing.trim().split('\n').map(line => { const [meta, path] = line.split('\t'); return [path.slice(at.length + 1), meta.split(' ')[2]] }))
    const hashes = files.length ? git('hash-object', '--', ...files.map(path => join(folder, path))).trim().split('\n') : []
    const changed = files.filter((path, i) => then.get(path) !== hashes[i] && path !== 'octamod.module.json')
    return { at, changed, removed: [...then.keys()].filter(path => !files.includes(path)) }
  }
  return null
}

/** What --check (and module:doctor's qualification line) refuses: a stale sourceSha256, with what changed since the tested commit and
 *  the command that refreshes it, and fields still marked DRAFT. `nativeSha`: the folder's moduleNativeSourceSha256, when known. */
export async function qualifyProblems({ root, folder, document, nativeSha, evidence = true }) {
  const problems = [], q = document.tests?.qualification, id = document.id
  const baseline = (() => { try { return parseQualificationBaseline(JSON.parse(readFileSync(resolve(root, BASELINE_PATH), 'utf8'))) } catch { return new Map() } })()
  if (q && !document.tests.retainedEvidence && baseline.get(id)?.version !== document.version) {
    const now = nativeSha ?? await moduleNativeSourceSha256(folder, document)
    if (now !== q.sourceSha256) {
      const since = q.hardware?.sourceRevision && changedSince(root, folder, q.hardware.sourceRevision)
      problems.push({ detail: 'tests.qualification.sourceSha256 is ' + short(q.sourceSha256) + ', the source now hashes to ' + short(now) +
        (since ? '; changed since the tested commit ' + short(q.hardware.sourceRevision) + ': ' + ([...since.changed, ...since.removed.map(path => path + ' (removed)')].join(', ') || 'nothing but the manifest') : ''),
        fix: 'if only evidence, presentation or other files that are not code changed: npm run module:qualify -- ' + id + ' --rehash --write; if code changed, run the test procedure again and npm run module:qualify -- ' + id + ' --procedure DIR --write' })
    }
  }
  const drafted = draftedFields(document)
  if (drafted.length) problems.push({ detail: drafted.length + ' field' + (drafted.length === 1 ? ' is' : 's are') + ' still marked as drafted by module:qualify: ' + drafted.slice(0, 4).join(', ') + (drafted.length > 4 ? ' and ' + (drafted.length - 4) + ' more' : ''),
    fix: 'read each against the evidence, edit it, and delete "' + DRAFT.trim() + '" (docs/MODULE_QUALIFICATION.md#write-the-record-from-the-evidence)' })
  // The evidence's own versions (module:doctor has its own lines for these, so it passes evidence: false).
  if (evidence) for (const [path, name] of [[PERFORMANCE_RECORD, 'perf:audit'], [FRAME_COST_RECORD, 'device:price --curve'], [CPU_PRICE_RECORD, 'device:price']]) {
    const record = readJson(join(folder, path)), of = record?.version
    if (record && of !== document.version) problems.push({ detail: path + ' is for ' + of + ', not ' + document.version, fix: 'measure this version (' + name + '), then npm run module:qualify -- ' + id + ' --procedure DIR --write' })
  }
  return problems
}

async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { procedure: { type: 'string' }, package: { type: 'string' }, base: { type: 'string' },
    image: { type: 'string' }, tester: { type: 'string' }, model: { type: 'string' }, write: { type: 'boolean' }, check: { type: 'boolean' }, rehash: { type: 'boolean' }, draft: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
  if (args.help || positionals.length !== 1) {
    console.log('Usage: npm run module:qualify -- <id> [--procedure DIR] [--package FILE.mwrm] [--base TEXT] [--image SHA] [--tester LOGIN] [--model MKI|MKII] [--draft] [--write]\n' +
      '       npm run module:qualify -- <id> --check     |     npm run module:qualify -- <id> --rehash [--write]   (docs/MODULE_QUALIFICATION.md)')
    process.exit(args.help ? 0 : 2)
  }
  if (args.image && !/^[a-f0-9]{64}$/.test(args.image)) throw new Error('--image takes the tested image\'s SHA-256 (64 hex digits)')
  if (args.model && !['MKI', 'MKII'].includes(args.model)) throw new Error('--model is MKI or MKII')
  const root = resolve(import.meta.dirname, '..'), id = positionals[0], folder = qualifyFolder(root, id, args.draft)
  if (!folder) { console.error('No module named ' + id + ' under sdk/octatrack/modules or sdk/drafts.'); process.exit(2) }
  const manifestPath = join(folder, 'octamod.module.json'), text = readFileSync(manifestPath, 'utf8'), original = JSON.parse(text), where = relative(root, folder)

  if (args.check) {
    const problems = await qualifyProblems({ root, folder, document: original })
    if (!problems.length) console.log(where + ': the qualification record matches the source, and nothing is left marked as a draft.')
    for (const problem of problems) console.log('✗ ' + problem.detail + '\n  fix: ' + problem.fix)
    process.exitCode = problems.length ? 1 : 0
    return
  }
  let document, files = {}, notes = [], reads = [], changedLevels = []
  if (args.rehash) {
    if (!original.tests.qualification) { console.error(where + ' has no tests.qualification to rehash.'); process.exit(2) }
    document = structuredClone(original)
    const revision = original.tests.qualification.hardware?.sourceRevision, since = revision && changedSince(root, folder, revision)
    if (since) console.log('Changed since the tested commit ' + short(revision) + ' (' + since.at + '): ' + ([...since.changed, ...since.removed.map(path => path + ' (removed)')].join(', ') || 'nothing but the manifest') +
      '.\nIf any of these is code, the evidence is for other source: run the test procedure again instead.')
  } else {
    const evidence = readEvidence({ folder, procedure: args.procedure && resolve(args.procedure), packagePath: args.package && resolve(args.package) })
    ;({ document, files, notes, reads, changedLevels } = draftRecord({ document: original, evidence, options: { base: args.base, image: args.image, tester: args.tester, model: args.model } }))
  }
  if (document.tests.qualification) document.tests.qualification.sourceSha256 = await sourceHashOf(folder, document, files) // last: over everything above
  let invalid = null
  try { parseModuleDocument(document) } catch (error) { invalid = error.message }
  let releasable = null
  if (!invalid) try { requireModuleQualificationForPublication(parseModuleDocument(document)) } catch (error) { releasable = error.message }

  const diff = fieldDiff(original, document)
  console.log('module:qualify ' + id + ' (' + where + ')' + (args.procedure ? ' from ' + args.procedure : ''))
  console.log(diff.length ? '\nChanges to octamod.module.json:\n' + diff.map(line => '  ' + line).join('\n') : '\nNo change to octamod.module.json.')
  for (const [path, body] of Object.entries(files)) console.log('  ' + (existsSync(join(folder, path)) ? (readFileSync(join(folder, path), 'utf8') === body ? '= ' : '~ ') : '+ ') + path)
  if (reads.length) console.log('\nRead these: drafted from the data and marked "' + DRAFT.trim() + '"; --check and module:doctor fail until you edit each and delete the mark:\n' + reads.map(line => '  - ' + line).join('\n'))
  if (changedLevels.length) console.log('\nGauge levels kept as written:\n' + changedLevels.map(line => '  - ' + line).join('\n'))
  if (notes.length) console.log('\nLeft out or kept:\n' + notes.map(line => '  - ' + line).join('\n'))
  if (invalid) console.log('\nThe drafted manifest does not parse: ' + invalid + '. Nothing is written.')
  else if (releasable) console.log('\nNot releasable yet: ' + releasable)
  if (!args.write || invalid) { if (!invalid && (diff.length || Object.keys(files).length)) console.log('\nRun it again with --write to write this.'); process.exitCode = invalid ? 1 : 0; return }
  for (const [path, body] of Object.entries(files)) { mkdirSync(dirname(join(folder, path)), { recursive: true }); writeFileSync(join(folder, path), body) }
  writeFileSync(manifestPath, manifestJson(document, text))
  console.log('\nWrote ' + [where + '/octamod.module.json', ...Object.keys(files).map(path => where + '/' + path)].join(', ') + '. Then: npm run module:qualify -- ' + id + ' --check, and npm run module:doctor -- ' + (where.startsWith('sdk/drafts') ? '--draft ' : '') + id + '.')
}

if (import.meta.filename === process.argv[1]) await main()

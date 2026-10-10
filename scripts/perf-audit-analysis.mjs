// Offline performance checks for a module: worst-case cycles, a benchmark against stock, and a stress run.
// No firmware and no module code runs here. You measure with the harness you already have, write the numbers into
// evidence/performance.json (`template` prints the skeleton) and `check` judges them. See docs/module-guides/README.md, "Performance".

/** Audit defaults, not repository rules; the CLI can override each and TESTING.md says why. */
export const LIMITS = {
  usableCycles: 3120,    // per DSP core per sample that module code may spend: tools/build/cycle_count.py USABLE (hardware, triangulated)
  share: 0.5,            // note when one module takes more than this share of a budget
  ratioNote: 1.5,        // measured cost over the named stock effect's: above it, say why
  ratioFail: 3,          // above it, fail unless the record carries a justification
  frameUs: 362.8,        // 16 samples at 44.1 kHz: the frame the ColdFire interrupt must fit in (cfmeter.py)
  loadNote: 0.05,        // longest frame interrupt added by the module, as a share of the frame
  loadFail: 0.1,
  idleNote: 5,           // percentage points of idle time the module takes under the same flood
  idleFail: 10,
  dspSeconds: 30,        // stress render length
  midiSeconds: 60,       // MIDI flood length
  midiRate: 1000,        // messages per second: a 3-byte message takes 960 us at 31.25 kbaud, so ~1040 is the wire's limit
  lfos: 3,               // stress_project.py: three active LFOs per track
  locks: 12,             // locked slots per step; stress_project.py locks 15 and a module has 12 parameters
}

const HEX64 = /^[0-9a-f]{64}$/
const KINDS = ['dsp', 'coldfire']
const present = value => typeof value === 'number' && Number.isFinite(value)
const positive = value => present(value) && value > 0
const text = (value, length = 1) => typeof value === 'string' && value.trim().length >= length

export function templateRecord(kind) {
  if (!KINDS.includes(kind)) throw new Error('kind is dsp or coldfire')
  const method = '<tool, command and conditions that produced these numbers>'
  return kind === 'dsp' ? {
    schema: 1, module: '<id>', version: '<manifest version>', kind,
    cycles: { unit: 'instructions/sample', static: null, measured: null, instancesPerCore: null, method },
    stock: { comparator: '<the stock effect closest in function, e.g. PLATE REV>', comparatorWorst: null, dearestWorst: null, baseline: 'out/stock_dsp_bench/results.json', stockSha256: '<stock_sha256 from that file>', justification: '' },
    stress: { instancesPerCore: null, tracks: 8, lfosPerTrack: null, lockedSlots: null, seconds: null, guard: null, dirty: null, clobbers: null, hangs: null },
  } : {
    schema: 1, module: '<id>', version: '<manifest version>', kind,
    cycles: { unit: 'cycles/event', static: null, measured: null, budget: null, method },
    load: { frameUs: LIMITS.frameUs, stockLongestUs: null, moduleLongestUs: null, stockIdlePercent: null, moduleIdlePercent: null, method: '<cfmeter.py capture, same flood on the stock image and on the image with the module>' },
    stress: { floodMessagesPerSecond: null, clockBpm: null, seconds: null, stuckNotes: null, hangs: null, dropped: null, droppedExplanation: '' },
  }
}

/** Judge a performance record. Returns rows { name, state: 'ok' | 'note' | 'fail', detail, fix? }. */
export function judgeRecord(record, options = {}) {
  const limits = { ...LIMITS, ...options }, rows = []
  const row = (name, state, detail, fix) => rows.push({ name, state, detail, ...(fix ? { fix } : {}) })
  if (!record || typeof record !== 'object' || record.schema !== 1) { row('record', 'fail', 'not a performance record (schema 1)', 'start from: npm run perf:audit -- template dsp|coldfire'); return rows }
  if (!KINDS.includes(record.kind)) { row('record', 'fail', 'kind is ' + JSON.stringify(record.kind), 'dsp or coldfire'); return rows }
  const { cycles = {}, stock = {}, load = {}, stress = {} } = record, dsp = record.kind === 'dsp'
  row('record', 'ok', record.kind + ' record for ' + record.module + '@' + record.version)

  // 1. Cycle count: the static floor and the dearest measured case, both against the budget.
  const unit = dsp ? 'instructions/sample' : 'cycles/event'
  if (!positive(cycles.static) || !positive(cycles.measured) || !text(cycles.method, 10)) row('cycles', 'fail', 'static, measured and method are all required (' + unit + ')', dsp ? 'static: python3 tools/build/cycle_count.py; measured: dsp_host at the dearest knob and mode settings, knobs moving' : 'static: an upper bound per event; measured: the worst event under the flood')
  else if (cycles.unit !== unit) row('cycles', 'fail', 'unit is ' + JSON.stringify(cycles.unit) + ', expected ' + unit)
  else if (cycles.measured > cycles.static * 1.0001 && !dsp) row('cycles', 'fail', 'measured ' + cycles.measured + ' exceeds the static bound ' + cycles.static + ', so the bound is not an upper bound', 'recount the dearest path')
  else if (dsp) {
    const n = cycles.instancesPerCore, total = cycles.static * n
    if (!Number.isInteger(n) || n < 1) row('cycles', 'fail', 'instancesPerCore must be a whole number from 1: the most you support on one core')
    else if (total > limits.usableCycles) row('cycles', 'fail', n + ' x ' + cycles.static + ' = ' + total + ' per sample exceeds the ' + limits.usableCycles + ' a core can spend', 'lower instancesPerCore, or make the loop cheaper')
    else row('cycles', total > limits.usableCycles * limits.share ? 'note' : 'ok', n + ' x ' + cycles.static + ' = ' + total + ' of ' + limits.usableCycles + ' per sample per core (' + Math.round(100 * total / limits.usableCycles) + '%), measured ' + cycles.measured + ' per instance' + (total > limits.usableCycles * limits.share ? '; over half a core: say what stays free for stock effects and other modules' : ''))
  } else if (!positive(cycles.budget)) row('cycles', 'fail', 'budget (the event deadline in cycles) is required')
  else if (cycles.measured > cycles.budget) row('cycles', 'fail', 'worst event ' + cycles.measured + ' exceeds its deadline ' + cycles.budget)
  else row('cycles', cycles.measured > cycles.budget * limits.share ? 'note' : 'ok', 'worst event ' + cycles.measured + ' of ' + cycles.budget + ' cycles (' + Math.round(100 * cycles.measured / cycles.budget) + '%)' + (cycles.measured > cycles.budget * limits.share ? '; over half the deadline: say why' : ''))

  // 2. Benchmark against stock: a DSP module against the stock effect closest in function, a MIDI module against the stock image under the same flood.
  if (dsp) {
    if (!text(stock.comparator, 3) || !positive(stock.comparatorWorst) || !positive(stock.dearestWorst) || !HEX64.test(stock.stockSha256 ?? '')) row('stock benchmark', 'fail', 'comparator, comparatorWorst, dearestWorst and stockSha256 are required', 'python3 tools/harness/benchmark_stock_dsp.py, then copy the comparator\'s "worst", the dearest "worst" and "stock_sha256" from out/stock_dsp_bench/results.json')
    else if (stock.comparatorWorst > stock.dearestWorst) row('stock benchmark', 'fail', 'the comparator cannot be dearer than the dearest stock effect')
    else if (!positive(cycles.measured)) row('stock benchmark', 'fail', 'needs cycles.measured')
    else {
      const ratio = cycles.measured / stock.comparatorWorst, dearer = cycles.measured > stock.dearestWorst, excused = text(stock.justification, 40)
      const detail = cycles.measured + ' vs ' + stock.comparator + ' ' + stock.comparatorWorst + ' (' + ratio.toFixed(2) + 'x); the dearest stock effect is ' + stock.dearestWorst
      if (ratio > limits.ratioFail || dearer) row('stock benchmark', excused ? 'note' : 'fail', detail + (excused ? '; justified in the record' : ': dearer than ' + (dearer ? 'every stock effect' : limits.ratioFail + 'x its stock counterpart') + ', so a musician fits fewer of them'), excused ? undefined : 'make it cheaper, or explain in stock.justification (at least 40 characters) what the extra cost buys; the owner reads it')
      else row('stock benchmark', ratio > limits.ratioNote ? 'note' : 'ok', detail + (ratio > limits.ratioNote ? '; say in TESTING.md what the extra cost buys' : ''))
    }
  } else {
    const frame = positive(load.frameUs) ? load.frameUs : limits.frameUs
    if (![load.stockLongestUs, load.moduleLongestUs, load.stockIdlePercent, load.moduleIdlePercent].every(present) || !text(load.method, 10)) row('stock benchmark', 'fail', 'stockLongestUs, moduleLongestUs, stockIdlePercent, moduleIdlePercent and method are required', 'python3 tools/harness/cfmeter.py on a capture of the stock image and of the image with the module, under the same flood')
    else {
      const added = (load.moduleLongestUs - load.stockLongestUs) / frame, idle = load.stockIdlePercent - load.moduleIdlePercent
      const state = added > limits.loadFail || idle > limits.idleFail ? 'fail' : added > limits.loadNote || idle > limits.idleNote ? 'note' : 'ok'
      row('stock benchmark', state, 'under the same flood the longest frame interrupt grows by ' + (load.moduleLongestUs - load.stockLongestUs).toFixed(1) + ' us (' + (100 * added).toFixed(1) + '% of the ' + frame.toFixed(1) + ' us frame) and idle time falls by ' + idle.toFixed(1) + ' points vs stock' + (state === 'ok' ? '' : state === 'note' ? '; say what it costs' : ''), state === 'fail' ? 'move work out of the interrupt, or do it once per event and not per message' : undefined)
    }
  }

  // 3. Stress: the way the module is used when it is worked hardest.
  const problems = [], emulated = dsp && stress.harness === 'ot_emu'
  if (emulated) {
    // Code reached only through stock-code hooks (no dispatch entry, no effect id) has no instance for dsp_host to
    // render on its own: the run is the whole built image under the ColdFire port, stress project loaded and playing.
    if (cycles.instancesPerCore !== 1 || stress.instancesPerCore !== 1) problems.push('an ot_emu run covers hooked code: one instance per core')
    if (!(stress.tracks >= 8)) problems.push('tracks must be 8')
    if (!(stress.lfosPerTrack >= limits.lfos)) problems.push('lfosPerTrack must be at least ' + limits.lfos)
    if (!(stress.lockedSlots >= limits.locks)) problems.push('lockedSlots must be at least ' + limits.locks)
    if (!(stress.seconds >= limits.dspSeconds)) problems.push('seconds must be at least ' + limits.dspSeconds)
    if (stress.guard !== null || stress.dirty !== null) problems.push('guard and dirty are dsp_host flags: null for an ot_emu run')
    if (stress.lateReadbacks !== 0) problems.push('lateReadbacks must be 0 (DSP read-back words not in time)')
    if (stress.hangs !== 0) problems.push('hangs must be 0')
    if (!text(stress.method, 40)) problems.push('method must say which image, project, routing and patterns ran')
  } else if (dsp) {
    if (!(stress.instancesPerCore >= cycles.instancesPerCore)) problems.push('instancesPerCore ' + stress.instancesPerCore + ' is below the ' + cycles.instancesPerCore + ' you claim')
    if (!(stress.tracks >= 8)) problems.push('tracks must be 8')
    if (!(stress.lfosPerTrack >= limits.lfos)) problems.push('lfosPerTrack must be at least ' + limits.lfos)
    if (!(stress.lockedSlots >= limits.locks)) problems.push('lockedSlots must be at least ' + limits.locks)
    if (!(stress.seconds >= limits.dspSeconds)) problems.push('seconds must be at least ' + limits.dspSeconds)
    if (stress.guard !== true) problems.push('guard must be true (dsp_host -guard)')
    if (stress.dirty !== true) problems.push('dirty must be true (dsp_host -dirty)')
    if (stress.clobbers !== 0) problems.push('clobbers must be 0')
    if (stress.hangs !== 0) problems.push('hangs must be 0')
  } else {
    if (!(stress.floodMessagesPerSecond >= limits.midiRate)) problems.push('floodMessagesPerSecond must be at least ' + limits.midiRate)
    if (!(stress.clockBpm >= 240)) problems.push('clockBpm must be at least 240')
    if (!(stress.seconds >= limits.midiSeconds)) problems.push('seconds must be at least ' + limits.midiSeconds)
    if (stress.stuckNotes !== 0) problems.push('stuckNotes must be 0 (after stop, Part change, bypass and channel change)')
    if (stress.hangs !== 0) problems.push('hangs must be 0')
    if (!present(stress.dropped)) problems.push('dropped must be the number of messages lost')
    else if (stress.dropped > 0 && !text(stress.droppedExplanation, 20)) problems.push('dropped is ' + stress.dropped + ' and droppedExplanation does not say why')
  }
  row('stress', problems.length ? 'fail' : 'ok', problems.length ? problems.join('; ') : (emulated ? 'whole image under ot_emu: eight tracks, ' + stress.lfosPerTrack + ' LFOs and ' + stress.lockedSlots + ' locked slots, ' + stress.seconds + ' s, no late read-back, no hang' : dsp ? stress.instancesPerCore + ' per core, eight tracks, ' + stress.lfosPerTrack + ' LFOs and ' + stress.lockedSlots + ' locked slots, ' + stress.seconds + ' s, no clobber, no hang' : stress.floodMessagesPerSecond + ' messages/s at ' + stress.clockBpm + ' BPM for ' + stress.seconds + ' s, no stuck note, no hang, ' + stress.dropped + ' dropped'),
    problems.length ? (dsp ? 'python3 tools/harness/stress_project.py, then render it with dsp_host -guard -dirty (tools/harness/pressure.py render)' : 'flood the module with notes, CC and clock at the wire rate, stop mid-note and change Part, then count') : undefined)
  return rows
}

/** Only missing measurements may be excused by the existing exact-source owner approval.
 * The publication validator separately validates the complete approval and documentation.
 * Measured failures and ordinary audit verdicts remain failures. */
export function ownerWaivedPerformanceRow(record, row, approval, sourceSha256) {
  if (row.state !== 'fail' || !HEX64.test(sourceSha256 ?? '') || approval?.kind !== 'owner-approved-update' || approval.approvedBy !== 'repeat98' || approval.id !== record.module || approval.version !== record.version || approval.sourceSha256 !== sourceSha256 || !Array.isArray(approval.waived)) return false
  if (row.name === 'cycles') return approval.waived.includes('chip-worst-case-cycles') && record.kind === 'coldfire' && record.cycles?.unit === 'cycles/event' && ['static', 'measured', 'budget'].every(key => record.cycles[key] === null) && text(record.cycles.method, 10)
  if (!approval.waived.includes('current-build-hardware') || record.kind !== 'coldfire') return false
  if (row.name === 'stock benchmark') return ['stockLongestUs', 'moduleLongestUs', 'stockIdlePercent', 'moduleIdlePercent'].every(key => record.load?.[key] === null) && text(record.load?.method, 10)
  if (row.name === 'stress') return ['floodMessagesPerSecond', 'clockBpm', 'seconds', 'stuckNotes', 'hangs', 'dropped'].every(key => record.stress?.[key] === null)
  return false
}

/** Known-good and known-bad records, run through the same judgement, so a verdict can be trusted. Returns { name, ok, detail } rows. */
export function selfTest() {
  const rows = [], row = (name, ok, detail) => rows.push({ name, ok, detail })
  const state = (record, name, options) => judgeRecord(record, options).find(line => line.name === name)?.state
  const dspGood = { schema: 1, module: 'demo', version: '0.1.0', kind: 'dsp', cycles: { unit: 'instructions/sample', static: 300, measured: 280, instancesPerCore: 4, method: 'cycle_count.py and dsp_host, knobs moving' }, stock: { comparator: 'PLATE REV', comparatorWorst: 250, dearestWorst: 600, baseline: 'out/stock_dsp_bench/results.json', stockSha256: 'a'.repeat(64), justification: '' }, stress: { instancesPerCore: 4, tracks: 8, lfosPerTrack: 3, lockedSlots: 15, seconds: 60, guard: true, dirty: true, clobbers: 0, hangs: 0 } }
  const midiGood = { schema: 1, module: 'demo', version: '0.1.0', kind: 'coldfire', cycles: { unit: 'cycles/event', static: 900, measured: 700, budget: 4000, method: 'static bound and an event counter under the flood' }, load: { frameUs: 362.8, stockLongestUs: 40, moduleLongestUs: 48, stockIdlePercent: 70, moduleIdlePercent: 68, method: 'cfmeter.py, same flood' }, stress: { floodMessagesPerSecond: 1040, clockBpm: 300, seconds: 120, stuckNotes: 0, hangs: 0, dropped: 0, droppedExplanation: '' } }
  const fails = record => judgeRecord(record).filter(line => line.state === 'fail').map(line => line.name)
  const hooked = { ...dspGood, cycles: { ...dspGood.cycles, instancesPerCore: 1 }, stress: { harness: 'ot_emu', instancesPerCore: 1, tracks: 8, lfosPerTrack: 3, lockedSlots: 15, seconds: 30, guard: null, dirty: null, lateReadbacks: 0, hangs: 0, method: 'ot_emu, the built image, stress project playing A01-A04, every track routed through the hook' } }
  row('an ot_emu run of hooked code passes', fails(hooked).length === 0, judgeRecord(hooked).map(line => line.name + ' ' + line.state).join(', '))
  row('an ot_emu run cannot claim dsp_host flags or more than one instance', state({ ...hooked, stress: { ...hooked.stress, guard: true } }, 'stress') === 'fail' && state({ ...hooked, cycles: { ...hooked.cycles, instancesPerCore: 4 }, stress: { ...hooked.stress, instancesPerCore: 4 } }, 'stress') === 'fail', 'guard true, 4 per core')
  row('an ot_emu run with a late read-back fails', state({ ...hooked, stress: { ...hooked.stress, lateReadbacks: 2 } }, 'stress') === 'fail', 'lateReadbacks 2')
  row('a sound DSP record passes', fails(dspGood).length === 0, judgeRecord(dspGood).map(line => line.name + ' ' + line.state).join(', '))
  row('a sound MIDI record passes', fails(midiGood).length === 0, judgeRecord(midiGood).map(line => line.name + ' ' + line.state).join(', '))
  row('the unfilled template fails every check', ['dsp', 'coldfire'].every(kind => ['cycles', 'stock benchmark', 'stress'].every(name => state(templateRecord(kind), name) === 'fail')), 'cycles, stock benchmark and stress')
  const heavy = { ...dspGood, cycles: { ...dspGood.cycles, measured: 900 } }
  row('a DSP module dearer than every stock effect fails', state(heavy, 'stock benchmark') === 'fail', '900 vs 600')
  row('a written justification turns that into a note', state({ ...heavy, stock: { ...heavy.stock, justification: 'A 64-tap linear-phase filter: the stock EQ has no equivalent and aliasing is the reason.' } }, 'stock benchmark') === 'note', 'note')
  row('4 x 900 cycles do not fit one core', state({ ...dspGood, cycles: { ...dspGood.cycles, static: 900 } }, 'cycles') === 'fail', '3600 > ' + LIMITS.usableCycles)
  row('a stress run without -guard fails', state({ ...dspGood, stress: { ...dspGood.stress, guard: false } }, 'stress') === 'fail', 'guard false')
  row('a stress run that clobbered fails', state({ ...dspGood, stress: { ...dspGood.stress, clobbers: 1 } }, 'stress') === 'fail', 'clobbers 1')
  row('a worst event over its deadline fails', state({ ...midiGood, cycles: { ...midiGood.cycles, measured: 4100 } }, 'cycles') === 'fail', '4100 > 4000')
  row('a measurement above the static bound fails', state({ ...midiGood, cycles: { ...midiGood.cycles, static: 600 } }, 'cycles') === 'fail', '700 > 600')
  row('a module that adds 15% of a frame to the interrupt fails', state({ ...midiGood, load: { ...midiGood.load, moduleLongestUs: 95 } }, 'stock benchmark') === 'fail', '55 us of 362.8')
  row('a stuck note fails', state({ ...midiGood, stress: { ...midiGood.stress, stuckNotes: 2 } }, 'stress') === 'fail', 'stuckNotes 2')
  row('dropped messages need an explanation', state({ ...midiGood, stress: { ...midiGood.stress, dropped: 3 } }, 'stress') === 'fail' && state({ ...midiGood, stress: { ...midiGood.stress, dropped: 3, droppedExplanation: 'Beyond 1040 messages a second the wire itself drops them.' } }, 'stress') === 'ok', 'dropped 3')
  return rows
}

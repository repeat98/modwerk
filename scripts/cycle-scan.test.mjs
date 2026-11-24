import { describe, expect, it } from 'vitest'
import { CHARGE_COVERS_MODEL_FROM, POINT, UNDER_REPORT, atSetting, charged, check, dearest, identities, inUsePoints, judge, judgeCharge, notComparable, scanCase,
  tableDrift, unitCase, unitLine, unitMarkdown, unitReport, withTable } from './cycle-scan.mjs'

const record = (more = {}) => ({ schema: 1, module: 'fx', version: '0.1.0', sourceSha256: 'a'.repeat(64),
  dearest: { setting: 'MODE=B/max', settings: 4, instructions: 400, cycles: 650, stalls: 90, stallsByKind: { arith: 60 } },
  stock: { comparator: 'LO-FI', setting: 'defaults/def', instructions: 280, cycles: 306, stalls: 16 }, ...more })
const performance = measured => ({ kind: 'dsp', cycles: { unit: 'instructions/sample', measured } })

describe('cycle scan records', () => {
  it('keeps the dearest run of a scan report', () => {
    const report = { name: 'fx', runs: [
      { label: 'A', variant: 'def', instr: 100, cycles: 150.123, stall: 10, stalls: { arith: 10, agu: 0 } },
      { label: 'B', variant: 'max', instr: 120, cycles: 200.456, stall: 30, stalls: { arith: 20, agu: 10 } },
      { label: 'C', variant: 'min', error: 'dsp_host failed' }] }
    expect(dearest(report)).toEqual({ setting: 'B/max', settings: 2, instructions: 120, cycles: 200.46, stalls: 30, stallsByKind: { arith: 20, agu: 10 } })
    expect(() => dearest({ name: 'fx', runs: [], error: 'not scanned' })).toThrow(/no runs: not scanned/)
  })
  it('passes a current record whose recorded cost is at or near the scan', () => {
    const verdict = judge({ id: 'fx', record: record(), sourceSha256: 'a'.repeat(64), performance: performance(410) })
    expect(verdict.fail).toEqual([])
    expect(verdict.info[0]).toMatch(/650 cycles a sample \(14\.3 %\).*stock LO-FI 306 .*2\.12x in cycles against 1\.43x in instructions/)
    expect(judge({ id: 'fx', record: record(), sourceSha256: 'a'.repeat(64), performance: performance(400 * UNDER_REPORT) }).fail).toEqual([])
  })
  it('fails a record whose module source changed since the scan', () => {
    expect(judge({ id: 'fx', record: record(), sourceSha256: 'b'.repeat(64), performance: performance(410) }).fail)
      .toEqual([expect.stringMatching(/source changed since its cycle scan: run node scripts\/cycle-scan\.mjs record fx/)])
  })
  it('fails a performance record far below what the scan saw executing', () => {
    expect(judge({ id: 'fx', record: record(), sourceSha256: 'a'.repeat(64), performance: performance(300) }).fail)
      .toEqual([expect.stringMatching(/records 300 instructions a sample, but the cycle scan saw 400 executing at MODE=B\/max/)])
  })
  it('tells, not fails, a module without instructions to compare, and refuses a record for another module', () => {
    const none = judge({ id: 'fx', record: record(), sourceSha256: 'a'.repeat(64), performance: null })
    expect(none.fail).toEqual([])
    expect(none.info[0]).toMatch(/records no instructions a sample/)
    expect(judge({ id: 'other', record: record(), sourceSha256: 'a'.repeat(64), performance: performance(410) }).fail[0]).toMatch(/not a cycle-scan record for this module/)
  })
  it('charges as the base does: a hardware figure as it is, an emulator figure at 7/4 rounded', () => {
    expect([charged(382, 'executed'), charged(411, 'modeled'), charged(637, 'hardware'), charged(81, 'executed')]).toEqual([669, 720, 637, 142])
  })
  it('passes a charge with room, names a near miss, and refuses one under the model for a module listed from the date', () => {
    const row = (cycles, cyclesKind = 'executed', version = '0.1.0') => ({ id: 'fx', version, cycles, cyclesKind })
    expect(judgeCharge({ id: 'fx', record: record(), row: row(400), listed: '2026-12-01' })).toEqual({ fail: [], info: [] })
    expect(judgeCharge({ id: 'fx', record: record(), row: row(380), listed: '2026-12-01' }).info[0]).toMatch(/charges 665 .*against 650 .*a near miss/)
    expect(judgeCharge({ id: 'fx', record: record(), row: row(600, 'hardware'), listed: CHARGE_COVERS_MODEL_FROM + 'T00:00:00Z' }).fail[0])
      .toMatch(/charges 600 cycles a sample \(600 hardware\) against 650 .*under the model/)
    expect(judgeCharge({ id: 'fx', record: record(), row: row(360), listed: undefined }).fail).toHaveLength(1)
  })
  it('reports, not refuses, an under-charge on a module listed before the date, and skips what it cannot compare', () => {
    const early = judgeCharge({ id: 'fx', record: record(), row: { id: 'fx', version: '0.1.0', cycles: 600, cyclesKind: 'hardware' }, listed: '2026-10-12T23:40:23Z' })
    expect(early.fail).toEqual([])
    expect(early.info[0]).toMatch(/Reported, not refused \(listed before 2026-11-24\)/)
    expect(judgeCharge({ id: 'fx', record: record(), row: undefined, listed: '2026-12-01' }).info[0]).toMatch(/declares no DSP cycles/)
    expect(judgeCharge({ id: 'fx', record: record(), row: { id: 'fx', version: '0.0.9', cycles: 100, cyclesKind: 'executed' }, listed: '2026-12-01' }))
      .toEqual({ fail: [], info: [expect.stringMatching(/package is 0\.0\.9, the cycle scan 0\.1\.0/)] })
  })
  it('keeps the run at a named setting beside the dearest', () => {
    const report = { name: 'fx', runs: [{ label: 'A', variant: 'def', instr: 100.123, cycles: 150.126, stall: 10, stalls: {} },
      { label: 'A', variant: 'max', instr: 120, cycles: 200, stall: 30, stalls: {} }] }
    expect(atSetting(report, 'A/def')).toEqual({ setting: 'A/def', instructions: 100.12, cycles: 150.13, stalls: 10 })
    expect(() => atSetting(report, 'B/def')).toThrow(/no run at B\/def/)
  })
})

describe('the unit report', () => {
  const price = (more = {}) => ({ version: '0.1.0', base: 'twin', measuredAt: '2026-11-18', result: { inUseOn: 'T1 FX2', inUseAdds: { dsp1to4: 14.3, dsp5to8: 0.6 } }, ...more })
  const withDefaults = record({ defaults: { setting: 'MODE=A/def', instructions: 380, cycles: 600, stalls: 80 } })
  it('reads the meter of the core the slot is on, at 45.32 cycles a point', () => {
    expect(POINT).toBe(45.32)
    expect(inUsePoints({ inUseOn: 'T1 FX2', inUseAdds: { dsp1to4: 7.5, dsp5to8: 0.9 } })).toEqual({ on: 'T1 FX2', points: 7.5, peak: null })
    expect(inUsePoints({ inUseOn: 'T5 FX1', inUseAdds: { dsp1to4: 6.3, dsp5to8: 5.5, dsp1to4Peak: 9, dsp5to8Peak: 8.1 } })).toEqual({ on: 'T5 FX1', points: 5.5, peak: 8.1 })
    expect(inUsePoints({ atRestAdds: {} })).toBeNull()
  })
  it('compares the peak with the dearest run, which bounds every setting, and flags one above it', () => {
    const peaked = peak => price({ result: { inUseOn: 'T1 FX2', inUseAdds: { dsp1to4: 14.3, dsp5to8: 0.6, dsp1to4Peak: peak, dsp5to8Peak: 1 } } })
    expect(unitLine({ id: 'fx', record: withDefaults, price: peaked(15) })).toMatchObject({ peak: 15, unitPeak: 679.8, modelPeak: 650, peakRatio: 1.05 })
    const above = unitLine({ id: 'fx', record: withDefaults, price: peaked(16), extra: [{ name: 'keybus', cycles: 43 }] })
    expect(above).toMatchObject({ unitPeak: 725.12, modelPeak: 693, peakRatio: 1.05 })
    expect(above.peakAbove).toBeUndefined()
    expect(unitLine({ id: 'fx', record: withDefaults, price: peaked(16) }).peakAbove).toBe(true)
    expect(unitMarkdown({ lines: [unitLine({ id: 'fx', record: withDefaults, price: peaked(16) })] })).toContain('| 16 = 725 | MODE=A/def | 600 | 650 | 1.08 | 1.12 | within 10 %; **peak above the dearest model** |')
  })
  it('compares the reading with the model at the defaults and lists an outlier', () => {
    const near = unitLine({ id: 'fx', record: withDefaults, price: price() })
    expect(near).toMatchObject({ unit: 648.08, model: 600, ratio: 1.08, setting: 'MODE=A/def' })
    expect(near.outlier).toBeUndefined()
    const far = unitLine({ id: 'fx', record: withDefaults, price: price({ result: { inUseOn: 'T2 FX2', inUseAdds: { dsp1to4: 20, dsp5to8: 0 } } }) })
    expect(far).toMatchObject({ unit: 906.4, ratio: 1.51, outlier: true })
  })
  it('adds what the base charges for a required feature, outside the proc', () => {
    const line = unitLine({ id: 'fx', record: withDefaults, price: price(), extra: [{ name: 'keybus', cycles: 51 }] })
    expect(line).toMatchObject({ model: 651, ratio: 1 })
  })
  it('says why a module has nothing to compare', () => {
    expect(unitLine({ id: 'fx', record: withDefaults, price: null }).notes).toEqual(['no in-use reading on the unit'])
    expect(unitLine({ id: 'fx', record: withDefaults, price: price({ version: '0.0.9' }) }).notes[0]).toMatch(/for 0\.0\.9, the record for 0\.1\.0/)
    expect(unitLine({ id: 'fx', record: record(), price: price() }).notes[0]).toMatch(/keeps no defaults run/)
  })
  it('reports every committed record and fails nothing', () => {
    const report = unitReport()
    expect(report.lines.length).toBeGreaterThan(0)
    expect(unitMarkdown(report).split('\n')).toHaveLength(report.lines.length + 2)
  })
})

describe('only like cases are compared', () => {
  const price = (more = {}) => ({ version: '0.1.0', base: 'development twin d3d71297 of base 0.7.8 (main 02dfa20ca)', measuredAt: '2026-11-18',
    result: { inUseOn: 'T1 FX2', inUseAdds: { dsp1to4: 7.5, dsp5to8: 0.9 } }, ...more })
  const ring = record({ defaults: { setting: 'DUCK/def', instructions: 2.5, cycles: 5, stalls: 0 } })
  const tap = [{ name: 'keybus', cycles: 43, bases: ['856cbbcf', '9ac83b23', '1c937ed6'] }]
  it('reads the base identities a base names, eight hex digits each', () => {
    expect(identities('development twin d3d71297 of base 0.7.8 (main 02dfa20ca)')).toEqual(['d3d71297', '02dfa20c'])
    expect(identities('8850f5399c453b9c (development twin, ef6099b0a)')).toEqual(['8850f539', 'ef6099b0'])
    expect(identities(undefined)).toEqual([])
  })
  it('keeps a key-bus effect read with an unstated or live key bus, on another base than its charge, out of the ratio', () => {
    const line = unitLine({ id: 'ring-sc', record: ring, price: price(), extra: tap, keyBus: true })
    expect(line.ratio).toBeUndefined()
    expect(line.outlier).toBeUndefined()
    expect(line.notComparable).toEqual([
      'the reading does not say what its key bus carried, the scan\'s was silent',
      'the unit read on d3d71297, the keybus charge (43) was timed on 856cbbcf',
    ])
    expect(unitMarkdown({ lines: [line] })).toMatch(/\| – \| – \| not comparable: the reading does not say what its key bus carried/)
    const live = unitLine({ id: 'ring-sc', record: ring, price: price({ base: 'twin 856cbbcf', inputs: { transport: 'playing', keyBus: 'live' } }), extra: tap, keyBus: true })
    expect(live.notComparable).toEqual(['its key bus was live on the unit and silent in the scan'])
  })
  it('pairs a key-bus effect read with a silent key bus on the base its charge was timed on', () => {
    const silent = price({ base: 'development twin 1c937ed6', inputs: { transport: 'playing', keyBus: 'silent' } })
    expect(unitLine({ id: 'ring-sc', record: ring, price: silent, extra: tap, keyBus: true })).toMatchObject({ model: 48, ratio: 7.08, outlier: true })
  })
  it('refuses a reading of another package, another setting or a stopped sequencer', () => {
    const row = { id: 'fx', version: '0.1.0', sha256: 'c'.repeat(64) }, scan = scanCase({ record: ring, row })
    expect(scan).toEqual({ version: '0.1.0', package: 'c'.repeat(64), setting: 'DUCK/def', transport: 'playing', keyBus: null })
    const unit = more => unitCase({ price: price(more), record: ring })
    expect(notComparable(scan, unit())).toEqual([]) // an older reading names no package: its version stands for it
    expect(notComparable(scan, unit({ result: { packageSha256: 'c'.repeat(64) } }))).toEqual([])
    expect(notComparable(scan, unit({ result: { packageSha256: '9f22861f'.padEnd(64, '0') } }))).toEqual(['the unit measured package 9f22861f, not the published 0.1.0 (cccccccc)'])
    expect(notComparable(scan, unit({ result: { setting: 'DUCK/max' } }))).toEqual(['the unit read it at DUCK/max, the model is at DUCK/def'])
    expect(notComparable(scan, unit({ inputs: { transport: 'stopped' } }))).toEqual(['the unit read with the sequencer stopped, the scan runs every block'])
    expect(scanCase({ record: ring, row: { ...row, version: '0.1.1' } }).package).toBeNull() // the row is another version's package
  })
})

describe('the README\'s unit table', () => {
  // Generated from sdk/cycle-scan/records/, each module's evidence/cpu-price.json, sdk/machines/octatrack/dsp-sites.json and
  // src/engine/assets/octatrack-module-packages.json; a change to any of them that moves a row must regenerate it.
  it('is what node scripts/cycle-scan.mjs unit --markdown generates now', () => {
    expect(tableDrift()).toBeNull()
  })
  it('replaces only what lies between its markers, and fails without them', () => {
    const start = '<!-- generated: node scripts/cycle-scan.mjs unit --write (cycle-scan check fails when it differs) -->'
    const text = `# x\n${start}\n| old |\n<!-- end of the generated table -->\nafter\n`
    expect(withTable(text, '| new |')).toBe(`# x\n${start}\n| new |\n<!-- end of the generated table -->\nafter\n`)
    expect(() => withTable('# no table', '| new |')).toThrow(/sdk\/cycle-scan\/README.md has lost the generated table's markers/)
  })
})

describe('the committed records', () => {
  it('finds every committed record current and none under-reported', async () => {
    const result = await check()
    expect(result.fail).toEqual([])
  })
})

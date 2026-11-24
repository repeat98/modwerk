import { describe, expect, it } from 'vitest'
import { POINT, UNDER_REPORT, atSetting, check, dearest, inUsePoints, judge, unitLine, unitMarkdown, unitReport } from './cycle-scan.mjs'

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
    expect(inUsePoints({ inUseOn: 'T1 FX2', inUseAdds: { dsp1to4: 7.5, dsp5to8: 0.9 } })).toEqual({ on: 'T1 FX2', points: 7.5 })
    expect(inUsePoints({ inUseOn: 'T5 FX1', inUseAdds: { dsp1to4: 6.3, dsp5to8: 5.5 } })).toEqual({ on: 'T5 FX1', points: 5.5 })
    expect(inUsePoints({ atRestAdds: {} })).toBeNull()
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

describe('the committed records', () => {
  it('finds every committed record current and none under-reported', async () => {
    const result = await check()
    expect(result.fail).toEqual([])
  })
})

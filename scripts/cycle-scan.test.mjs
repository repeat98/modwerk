import { describe, expect, it } from 'vitest'
import { CHARGE_COVERS_MODEL_FROM, UNDER_REPORT, charged, check, dearest, judge, judgeCharge } from './cycle-scan.mjs'

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
  it('finds every committed record current and none under-reported', async () => {
    const result = await check()
    expect(result.fail).toEqual([])
  })
})

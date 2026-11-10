import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeRecord, selfTest, templateRecord, ownerWaivedPerformanceRow } from './perf-audit-analysis.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const audit = (...args) => spawnSync(process.execPath, ['scripts/perf-audit.mjs', ...args], { cwd: root, encoding: 'utf8' })

describe('perf audit', () => {
  it('proves its judgement on known-good and known-bad records', () => {
    for (const row of selfTest()) expect(row.ok, row.name + ': ' + row.detail).toBe(true)
    expect(audit('selftest').status).toBe(0)
  })

  it('refuses the unfilled template and says what to run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-audit-'))
    try {
      const file = join(dir, 'performance.json')
      writeFileSync(file, audit('template', 'coldfire').stdout)
      const result = audit('check', file)
      expect(result.status).toBe(1)
      expect(result.stdout).toContain('cfmeter.py')
      expect(judgeRecord(templateRecord('dsp')).filter(line => line.state === 'fail').length).toBe(3)
      const key = audit('template', 'key')
      expect(key.status).toBe(0)
      expect(JSON.parse(key.stdout)).toMatchObject({ kind: 'coldfire', trigger: 'key' })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('rejects what is not a record', () => {
    expect(judgeRecord(null)[0].state).toBe('fail')
    expect(judgeRecord({ schema: 1, kind: 'nope' })[0].state).toBe('fail')
    expect(audit('check').status).toBe(2)
  })
})


describe('exact-source performance exceptions', () => {
  const source = 'a'.repeat(64)
  const approval = { kind: 'owner-approved-update', approvedBy: 'repeat98', id: 'example', version: '0.1.0', sourceSha256: source, waived: ['chip-worst-case-cycles', 'current-build-hardware'] }
  const record = () => ({ ...templateRecord('coldfire'), module: 'example', version: '0.1.0' })
  it('keeps the raw audit failing and excuses only the explicitly missing fields', () => {
    const r = record(), rows = judgeRecord(r)
    expect(rows.filter(row => row.state === 'fail')).toHaveLength(3)
    for (const row of rows.filter(row => row.state === 'fail')) expect(ownerWaivedPerformanceRow(r, row, approval, source)).toBe(true)
    expect(ownerWaivedPerformanceRow(r, rows[0], approval, source)).toBe(false)
  })
  it('rejects stale, wrong-owner, wrong-version and incomplete approval scope', () => {
    const r = record(), row = judgeRecord(r).find(row => row.name === 'cycles')
    for (const change of [{ sourceSha256: 'b'.repeat(64) }, { approvedBy: 'contributor' }, { version: '0.2.0' }, { id: 'other' }, { kind: 'other' }, { waived: ['current-build-hardware'] }]) expect(ownerWaivedPerformanceRow(r, row, { ...approval, ...change }, source)).toBe(false)
    expect(ownerWaivedPerformanceRow(r, row, approval, null)).toBe(false)
  })
  it('excuses a missing static bound only beside a measurement within its budget', () => {
    const r = record(), cycles = () => judgeRecord(r).find(row => row.name === 'cycles')
    Object.assign(r.cycles, { measured: 100, budget: 1000 })
    expect(cycles().state).toBe('fail')
    expect(ownerWaivedPerformanceRow(r, cycles(), approval, source)).toBe(true)
    r.cycles.measured = 1001
    expect(ownerWaivedPerformanceRow(r, cycles(), approval, source)).toBe(false)
    Object.assign(r.cycles, { measured: 100, budget: null })
    expect(ownerWaivedPerformanceRow(r, cycles(), approval, source)).toBe(false)
    Object.assign(r.cycles, { measured: 100, budget: 1000, static: 150 })
    expect(cycles().state).toBe('ok')
  })
  it('never excuses a failed or partly supplied measurement', () => {
    const r = record()
    r.cycles.measured = 1
    expect(ownerWaivedPerformanceRow(r, judgeRecord(r).find(row => row.name === 'cycles'), approval, source)).toBe(false)
    r.load.moduleLongestUs = 1000
    expect(ownerWaivedPerformanceRow(r, judgeRecord(r).find(row => row.name === 'stock benchmark'), approval, source)).toBe(false)
    r.stress.hangs = 1
    expect(ownerWaivedPerformanceRow(r, judgeRecord(r).find(row => row.name === 'stress'), approval, source)).toBe(false)
  })
})

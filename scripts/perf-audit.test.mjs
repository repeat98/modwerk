import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { judgeRecord, selfTest, templateRecord, ownerWaivedPerformanceRow, stampVerdict, priceLimits, approvalCoversSource } from './perf-audit-analysis.mjs'
import { moduleEarlierPerformanceSourceSha256, modulePerformanceSourceSha256 } from './module-qualification.mjs'
import { parseModuleDocument } from '../src/catalog/module-contract.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const audit = (...args) => spawnSync(process.execPath, ['scripts/perf-audit.mjs', ...args], { cwd: root, encoding: 'utf8' })

describe('performance stamp', () => {
  const now = 'a'.repeat(64), before = 'b'.repeat(64)
  it('passes numbers taken on this source, fails other source, and asks only new modules for a stamp', () => {
    expect(stampVerdict({ sourceSha256: now }, now, true).state).toBe('ok')
    expect(stampVerdict({ sourceSha256: before }, now, false)).toMatchObject({ state: 'fail', detail: expect.stringContaining('measured on other source') })
    expect(stampVerdict({}, now, true).state).toBe('fail')
    expect(stampVerdict({}, now, false).state).toBe('note')
  })

  it('stamps a passing record with the source it sits beside, and the stamp does not change that source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'perf-stamp-')), folder = join(dir, 'pattern-sample-locks'), file = join(folder, 'evidence/performance.json')
    try {
      cpSync(join(root, 'sdk/octatrack/modules/pattern-sample-locks'), folder, { recursive: true })
      const document = parseModuleDocument(JSON.parse(readFileSync(join(folder, 'octamod.module.json'), 'utf8')))
      const stamped = audit('check', file, '--stamp')
      expect(stamped.status, stamped.stdout + stamped.stderr).toBe(0)
      const record = JSON.parse(readFileSync(file, 'utf8'))
      expect(Object.keys(record).slice(0, 4)).toEqual(['schema', 'module', 'version', 'sourceSha256'])
      expect(record.sourceSha256).toBe(await modulePerformanceSourceSha256(folder, document))
      expect(audit('check', file, '--stamp').status).toBe(0)
      expect(JSON.parse(readFileSync(file, 'utf8')).sourceSha256).toBe(record.sourceSha256)
      // New art for the library card is not new code: the numbers stand (Mackity, #2148, re-stamped for each thumbnail edit).
      mkdirSync(join(folder, 'presentation'), { recursive: true })
      writeFileSync(join(folder, 'presentation/thumbnail.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 192"><circle r="9"/></svg>\r\n')
      expect(stampVerdict(record, await modulePerformanceSourceSha256(folder, document), true).state).toBe('ok')
      // A stamp written before the art left the hash names the source with it, and holds while that source is unchanged.
      const earlier = await moduleEarlierPerformanceSourceSha256(folder, document), stampedEarlier = { ...record, sourceSha256: earlier }
      expect(stampVerdict(stampedEarlier, await modulePerformanceSourceSha256(folder, document), true, file, earlier)).toMatchObject({ state: 'ok', detail: expect.stringContaining('the next --stamp writes') })
      // A code change after the numbers were taken: the doctor's verdict fails until they are measured and stamped again.
      writeFileSync(join(folder, 'native.c'), readFileSync(join(folder, 'native.c'), 'utf8') + '\n/* changed */\n')
      expect(stampVerdict(record, await modulePerformanceSourceSha256(folder, document), false).state).toBe('fail')
      expect(stampVerdict(stampedEarlier, await modulePerformanceSourceSha256(folder, document), false, file, await moduleEarlierPerformanceSourceSha256(folder, document)).state).toBe('fail')
      // A record for another version is never stamped.
      writeFileSync(file, JSON.stringify({ ...record, version: '9.9.9' }))
      expect(audit('check', file, '--stamp').stderr).toContain('Not stamped')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

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

describe('track machines and exact-source approvals', () => {
  const source = 'a'.repeat(64)
  const machine = price => ({ category: 'machines', resources: { cpuPrice: { value: price, measure: 'machine-render' } } })
  const loaded = (added, idle) => ({ ...templateRecord('coldfire'), module: 'example', version: '0.1.0',
    load: { frameUs: 362.8, stockLongestUs: 280, moduleLongestUs: 280 + added, stockIdlePercent: 40, moduleIdlePercent: 40 - idle, method: 'matched runs, same recording and MIDI' } })
  const benchmark = (record, options) => judgeRecord(record, options).find(row => row.name === 'stock benchmark')
  it('judges a machine\'s load against the CPU price the base books for it', () => {
    expect(priceLimits(machine(35))).toEqual({ cpuPrice: 35, loadFail: 0.35, idleFail: 35 })
    for (const document of [{ category: 'effects', resources: machine(35).resources }, { category: 'machines', resources: { cpuPrice: { value: 35, measure: 'device-price' } } }, machine(0), null])
      expect(priceLimits(document)).toEqual({})
    const grain = loaded(101.6, 16.5)
    expect(benchmark(grain).state).toBe('fail')
    expect(benchmark(grain, priceLimits(machine(35)))).toMatchObject({ state: 'note' })
    expect(benchmark(grain, priceLimits(machine(35))).detail).toContain('35% of a frame the base books')
    expect(benchmark(loaded(140, 16.5), priceLimits(machine(35))).state).toBe('fail')
    expect(benchmark(loaded(101.6, 36), priceLimits(machine(35))).state).toBe('fail')
  })
  it('binds a record to an approval only at its exact owner, version and source', () => {
    const approval = { kind: 'owner-approved-update', approvedBy: 'repeat98', id: 'example', version: '0.1.0', sourceSha256: source }
    expect(approvalCoversSource(approval, 'example', '0.1.0', source)).toBe(true)
    for (const [change, id, version, hash] of [[{}, 'example', '0.1.0', 'b'.repeat(64)], [{}, 'example', '0.2.0', source], [{}, 'other', '0.1.0', source],
      [{ approvedBy: 'contributor' }, 'example', '0.1.0', source], [{ kind: 'other' }, 'example', '0.1.0', source], [{}, 'example', '0.1.0', null]])
      expect(approvalCoversSource({ ...approval, ...change }, id, version, hash)).toBe(false)
    expect(approvalCoversSource(null, 'example', '0.1.0', source)).toBe(false)
  })
  it('excuses a flood whose stuck notes or lost messages were not counted, never a failed one', () => {
    const approval = { kind: 'owner-approved-update', approvedBy: 'repeat98', id: 'example', version: '0.1.0', sourceSha256: source, waived: ['chip-worst-case-cycles', 'current-build-hardware'] }
    const flood = change => ({ ...templateRecord('coldfire'), module: 'example', version: '0.1.0',
      stress: { floodMessagesPerSecond: 1096, clockBpm: 240, seconds: 50, stuckNotes: null, hangs: 0, dropped: null, droppedExplanation: 'receive errors and drops counted, delivery not', ...change } })
    const excused = (record, scope = approval) => ownerWaivedPerformanceRow(record, judgeRecord(record).find(row => row.name === 'stress'), scope, source)
    expect(judgeRecord(flood({})).find(row => row.name === 'stress').state).toBe('fail')
    expect(excused(flood({}))).toBe(true)
    expect(excused(flood({ stuckNotes: 0 }))).toBe(true)
    expect(excused(flood({}), { ...approval, waived: ['chip-worst-case-cycles'] })).toBe(false)
    for (const change of [{ hangs: 1 }, { stuckNotes: 2 }, { dropped: 3 }, { floodMessagesPerSecond: 47.5 }, { clockBpm: 100 }, { seconds: 5 }, { hangs: null }])
      expect(excused(flood(change))).toBe(false)
  })
})

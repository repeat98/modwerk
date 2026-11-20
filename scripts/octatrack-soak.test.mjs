import { describe, expect, it } from 'vitest'
import { PROFILES, generate, landed, monitor, parsePrograms, random, readHealth, shrink, summarize } from './octatrack-soak.mjs'

describe('fast soak', () => {
  it('makes the same run from the same seed, and a different one from another', () => {
    const a = generate({ seed: 3401, seconds: 30, rate: 20 }), b = generate({ seed: 3401, seconds: 30, rate: 20 })
    expect(a).toEqual(b)
    expect(a.ops).toHaveLength(600)
    expect(generate({ seed: 3402, seconds: 30, rate: 20 }).ops).not.toEqual(a.ops)
    expect(random(1)()).toBe(random(1)())
  })
  it('paces operations at the rate and keeps every message a short MIDI message', () => {
    const run = generate({ seed: 7, seconds: 10, rate: 25, programs: [0, 5, 16] })
    expect(run.ops.map(o => o.t).slice(0, 4)).toEqual([0, 40, 80, 120])
    for (const op of run.ops) {
      expect(op.send.length).toBeGreaterThan(0)
      for (const [ms, words] of op.send) {
        expect(ms).toBeGreaterThanOrEqual(0)
        expect(words).toMatch(/^(?:[89a-f][0-9a-f])(?:[0-7][0-9a-f]){0,2}$/) // status byte, then data bytes under 0x80
      }
      if (op.op === 'pc' || op.op === 'burst') for (const [, words] of op.send) expect([0, 5, 16]).toContain(parseInt(words.slice(2), 16))
    }
  })
  it('weights transitions most in mix and stays within the profile', () => {
    const counts = {}
    for (const op of generate({ seed: 11, seconds: 100, rate: 20 }).ops) counts[op.op] = (counts[op.op] ?? 0) + 1
    const transitions = (counts.pc ?? 0) + (counts.burst ?? 0) + (counts.startstop ?? 0) + (counts.start ?? 0) + (counts.stop ?? 0)
    expect(transitions / 2000).toBeGreaterThan(0.45)
    expect(Object.keys(counts).every(k => k in PROFILES.mix)).toBe(true)
    const pcOnly = generate({ seed: 11, seconds: 20, rate: 20, profile: 'pc' }).ops
    expect(pcOnly.every(o => o.op in PROFILES.pc)).toBe(true)
    expect(() => generate({ seed: 1, profile: 'none' })).toThrow(/Unknown profile/)
  })
  it('sends program changes on the program channel and the crossfader on the auto channel', () => {
    const run = generate({ seed: 5, seconds: 50, rate: 20, pcChannel: 11, autoChannel: 11 })
    const pc = run.ops.find(o => o.op === 'pc'), xf = run.ops.find(o => o.op === 'xfade')
    expect(pc.send[0][1].slice(0, 2)).toBe('ca')
    expect(xf.send[0][1].slice(0, 4)).toBe('ba30')
  })
  it('reads program lists', () => {
    expect(parsePrograms('0-3')).toEqual([0, 1, 2, 3])
    expect(parsePrograms('0-1, 16,16')).toEqual([0, 1, 16])
    expect(() => parsePrograms('3-1')).toThrow()
    expect(() => parsePrograms('0-128')).toThrow()
    expect(() => parsePrograms('A1')).toThrow()
  })
  it('reads the health line, and an error as an error', () => {
    const h = { frames: 10, stalls: 0, errors: 0, ticks: 5, cpu: 40, crash: 2, stall: 1, playing: true }
    expect(readHealth('serving\n' + JSON.stringify({ health: h }) + '\n')).toEqual(h)
    expect(readHealth('error: This base does not answer development requests: build it with --dev.\n')).toEqual({ error: 'error: This base does not answer development requests: build it with --dev.' })
    expect(readHealth('')).toEqual({ error: 'no answer' })
  })
  it('judges health: records and counters must not move, frames and ticks must', () => {
    const base = { frames: 100, stalls: 0, errors: 0, ticks: 50, cpu: 40, crash: 3, stall: 1, playing: true }
    const step = (h, k) => ({ ...h, frames: h.frames + k, ticks: h.ticks + k })
    let judge = monitor()
    expect(judge(base, 0)).toBeNull()
    expect(judge(step(base, 1), 50)).toBeNull()
    expect(judge({ ...step(base, 2), crash: 4 }, 100)).toMatchObject({ reason: 'crash' }) // an earlier crash (3) is not this run's
    judge = monitor(); judge(base, 0)
    expect(judge({ ...step(base, 1), stall: 2 }, 50)).toMatchObject({ reason: 'stall' })
    judge = monitor(); judge(base, 0)
    expect(judge({ ...step(base, 1), stalls: 1 }, 50)).toMatchObject({ reason: 'stall' })
    judge = monitor(); judge(base, 0)
    expect(judge({ ...step(base, 1), errors: 2 }, 50)).toMatchObject({ reason: 'loader errors' })
    judge = monitor({ framesStillMs: 600 }); judge(base, 0)
    expect(judge({ ...base, ticks: 51 }, 300)).toBeNull() // still frames, not yet long enough
    expect(judge({ ...base, ticks: 52 }, 650)).toMatchObject({ reason: 'frames stopped' })
    judge = monitor({ ticksStillMs: 1500 }); judge(base, 0)
    expect(judge({ ...base, frames: 101 }, 1000)).toBeNull()
    expect(judge({ ...base, frames: 102 }, 1600)).toMatchObject({ reason: 'frozen' })
    judge = monitor(); judge(base, 0)
    expect(judge({ error: 'error: no reply within 5000 ms' }, 10)).toMatchObject({ reason: 'link' })
  })
  it('finds the shortest failing prefix by halving', async () => {
    const tried = []
    const fails = threshold => async n => { tried.push(n); return n >= threshold }
    expect(await shrink(2205, fails(1301))).toBe(1301)
    expect(tried.length).toBeLessThanOrEqual(12)
    expect(await shrink(1, fails(1))).toBe(1)
    expect(await shrink(10, fails(1))).toBe(1)
  })
  it('summarizes pace, landed pattern changes and health-read times', () => {
    const patterns = [[0, 0, 0, 0], [0, 0, 0, 2], [0, 2, 0, 2], [0, 2, 0, 2], [1, 0, 1, 0], [1, 0, 1, 0]] // a queue alone is no change
    expect(landed(patterns)).toBe(2)
    expect(summarize({ done: 600, ms: 30000, reads: [4, 6, 5, 30, 5], cpu: [40, 61, 55], patterns })).toEqual({
      operations: 600, seconds: 30, perSecond: 20, patternChanges: 2, patternChangesPerMinute: 4, healthMs: { median: 5, p95: 30, most: 30 }, cpuMost: 61 })
    expect(summarize({ done: 0, ms: 0, reads: [], cpu: [] })).toMatchObject({ perSecond: 0, patternChanges: 0, healthMs: { median: null }, cpuMost: null })
  })
})

import { describe, expect, it } from 'vitest'
import { runSelftest, SELFTEST_FAILURES, waitUntilSaved } from './selftest'
import { parseSelftest, SELFTEST_BYTES, type SelftestRecord } from './upload-usb'

const record = (state: number, failed = 0, done = 0, total = 4, saved = 7, savedCount = 2): SelftestRecord =>
  ({ state, failed, modules: 2, dsp: 2, intact: 2, ran: 2, peaks: { cpu: 500, tracks1to4: 600, tracks5to8: 550 }, done, total,
    frameGap: 48000, saved, savedCount, live: 2, culprit: 0, culpritName: '', refusal: 0 })
/** A unit whose self-test answers `states` in turn, the first to the start request. */
function unit(states: (SelftestRecord | undefined)[]) {
  const calls: boolean[] = []
  return { calls, selftest: async (start: boolean) => { calls.push(start); return states[Math.min(calls.length - 1, states.length - 1)] } }
}

describe('the base self-test as the update stress test', () => {
  it('passes when the unit reports passed, after polling while it runs, with progress', async () => {
    const u = unit([record(1, 0, 0), record(1, 0, 2), record(2, 0, 4)]), seen: number[] = []
    expect(await runSelftest(u, { pollMs: 0, progress: done => seen.push(done) })).toBeNull()
    expect(u.calls).toEqual([true, false, false])
    expect(seen).toEqual([0, 2])
  })
  it('names the first failure, in the order of selftest.h', async () => {
    expect(await runSelftest(unit([record(1), record(3, 4 | 256)]), { pollMs: 0 })).toBe(SELFTEST_FAILURES[2]) /* the fault, not the CPU */
    expect(await runSelftest(unit([record(1), record(3, 2048)]), { pollMs: 0 })).toBe(SELFTEST_FAILURES[11]) /* SELFTEST_FEATURE */
    expect(await runSelftest(unit([record(1), record(3, 128)]), { pollMs: 0 })).toBe('a module doesn’t fit on either DSP core, even with the other effects there removed')
  })
  it('passes a set that only peaked over 90 %, which the runtime guards', async () => {
    expect(await runSelftest(unit([record(1), record(3, 256)]), { pollMs: 0 })).toBeNull() /* SELFTEST_CPU */
    expect(await runSelftest(unit([record(1), record(3, 8 | 256)]), { pollMs: 0 })).toBeNull() /* and SELFTEST_PEAK */
    expect(await runSelftest(unit([record(1), record(3)]), { pollMs: 0 })).toBe('the Octatrack reported a failure')
  })
  it('asks for a power cycle when the DSP stopped, naming no module', async () => {
    const stopped = { ...record(3, 4 | 128), culpritName: 'Euclid' }
    expect(await runSelftest(unit([record(1), stopped]), { pollMs: 0 })).toBe('the Octatrack’s DSP stopped; switch the Octatrack off and on, then sync again')
  })
  it('says when it cannot start (playing, or the loader busy)', async () => {
    expect(await runSelftest(unit([record(0)]), { pollMs: 0, startMs: 0 })).toMatch(/stop playback/)
    const busy = unit([record(0), record(1), record(2)]) // a new module's DSP code still being published, then free
    expect(await runSelftest(busy, { pollMs: 0, startMs: 1000 })).toBeNull()
    expect(busy.calls).toEqual([true, true, false])
  })
  it('lets a base without the self-test through untested, but not one that stops answering', async () => {
    expect(await runSelftest(unit([undefined]), { pollMs: 0 })).toBeNull()
    expect(await runSelftest(unit([record(1), undefined]), { pollMs: 0 })).toMatch(/stopped answering/)
  })
  it('gives up after its time limit', async () => {
    expect(await runSelftest(unit([record(1)]), { pollMs: 1, timeoutMs: 5 })).toBe('it took too long')
  })
  it('reads the base record, big-endian, 96 bytes', () => {
    const view = new DataView(new ArrayBuffer(SELFTEST_BYTES))
    ;[2, 3, 0, 6, 6, 6, 6, 669, 571, 536, 8, 8, 0, 0, 52000, 7, 6, 6, 0x873d83cc].forEach((v, i) => view.setUint32(4 * i, v))
    ;[...'E-Verb'].forEach((ch, i) => view.setUint8(76 + i, ch.charCodeAt(0)))
    view.setUint32(92, 7)
    expect(parseSelftest(view)).toEqual({ state: 2, failed: 0, modules: 6, dsp: 6, intact: 6, ran: 6,
      peaks: { tracks1to4: 669, tracks5to8: 571, cpu: 536 }, done: 8, total: 8, frameGap: 52000, saved: 7, savedCount: 6, live: 6,
      culprit: 0x873d83cc, culpritName: 'E-Verb', refusal: 7 })
    expect(() => parseSelftest(new DataView(new ArrayBuffer(72)))).toThrow()
  })
  it('names the module that failed, when the unit names one', async () => {
    const named = (failed: number) => ({ ...record(3, failed), culprit: 1, culpritName: 'E-Verb' })
    expect(await runSelftest(unit([record(1), named(128)]), { pollMs: 0 })).toBe('E-Verb doesn’t fit on either DSP core, even with the other effects there removed')
    expect(await runSelftest(unit([record(1), named(1024)]), { pollMs: 0 })).toBe('E-Verb’s code on the DSP doesn’t match its package')
  })
  it('names a late frame and damaged code', async () => {
    expect(await runSelftest(unit([record(1), record(3, 512)]), { pollMs: 0 })).toMatch(/frame came late/)
    expect(await runSelftest(unit([record(1), record(3, 1024)]), { pollMs: 0 })).toMatch(/code on the DSP/)
  })
  it('after Keep, waits for the set saved on the card and read back', async () => {
    expect(await waitUntilSaved(unit([record(0, 0, 0, 0, 7, 1), record(0, 0, 0, 0, 7, 2)]), { pollMs: 0 })).toBe(true) /* both modules */
    expect(await waitUntilSaved(unit([record(0, 0, 0, 0, 8, 0)]), { pollMs: 0 })).toBe(false)  /* the save failed */
    expect(await waitUntilSaved(unit([record(0, 0, 0, 0, 1, 1)]), { pollMs: 1, timeoutMs: 5 })).toBe(false) /* never saved */
    expect(await waitUntilSaved(unit([undefined]), { pollMs: 0 })).toBe(true) /* an old base */
  })
})

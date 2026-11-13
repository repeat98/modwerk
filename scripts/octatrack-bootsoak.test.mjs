import { describe, expect, it } from 'vitest'
import { readBoot, summarize } from './octatrack-bootsoak.mjs'

describe('RAM boot soak', () => {
  it('reads a boot from device.mjs boot\u2019s output', () => {
    const armed = '  staged 100%\narmed: the unit restarts into 0123456789abcdef… from RAM; a power cycle returns to the flashed base\n'
    expect(readBoot({ status: 0, stdout: armed + 'booted: base 0123456789abcdef…\n' })).toEqual({ ok: true, rearmed: false })
    expect(readBoot({ status: 0, stdout: armed + 'came back on the flashed base fedcba9876543210…: arming again from it\n' + armed + 'booted: base 0123456789abcdef…\n' })).toEqual({ ok: true, rearmed: true })
    expect(readBoot({ status: 1, stdout: armed, stderr: 'The unit did not come back within 60 s; a power cycle boots the flashed base. \n' })).toMatchObject({ ok: false, armed: true, reason: 'no USB within 60 s of the restart' })
    expect(readBoot({ status: 1, stdout: armed, stderr: 'The unit came back on base 1111111111111111…, not the one sent; a power cycle boots the flashed base.\n' })).toMatchObject({ ok: false, reason: 'came back on another base' })
    expect(readBoot({ status: 1, stdout: '', stderr: 'connect ENOENT /tmp/none.sock\n' })).toMatchObject({ ok: false, armed: false, reason: 'never armed (the link was not up before the boot)' })
    expect(readBoot({ status: null, stdout: armed, error: { code: 'ETIMEDOUT' } })).toMatchObject({ ok: false, reason: 'the boot command itself timed out' })
    // "booted" with a failing exit status is not a boot that came back
    expect(readBoot({ status: 1, stdout: armed + 'booted: base 0123456789abcdef…\n' }).ok).toBe(false)
  })
  it('counts every boot in the log and says what rate the clean ones still allow', () => {
    const boot = (cycle, seconds, more = {}) => ({ cycle, seconds, ok: true, rearmed: false, ...more })
    expect(summarize([])).toEqual({ boots: 0, back: 0, failed: 0, rearmed: 0, seconds: null, rate: null })
    const clean = Array.from({ length: 20 }, (_, i) => boot(i + 1, 12 + i % 5))
    expect(summarize([...clean.slice(0, 10), { summary: {} }, ...clean.slice(10)])).toEqual({
      boots: 20, back: 20, failed: 0, rearmed: 0, seconds: { least: 12, median: 14, most: 16 }, rate: 'none in 20: under 1 in 6 at 95 %' })
    expect(summarize(Array.from({ length: 300 }, (_, i) => boot(i + 1, 13))).rate).toBe('none in 300: under 1 in 100 at 95 %')
    expect(summarize([...clean, boot(21, 61, { ok: false, reason: 'no USB within 60 s of the restart' }), boot(22, 13, { rearmed: true })])).toMatchObject({
      boots: 22, back: 21, failed: 1, rearmed: 1, rate: '1 in 22' })
  })
})

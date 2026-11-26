import { describe, expect, it } from 'vitest'
import { describeDsp, describeStream, parseStreamReply, STREAM_DSP_BITS, STREAM_REPLY_BYTES } from './stream-probe.mjs'

// A reply as stream_probe.c lays it out: 51 big-endian words.
function reply(set = {}) {
  const words = new Array(51).fill(0)
  Object.assign(words, { 0: 0x4d575350, 1: 64, 2: 1, 3: 1000, 4: 1000, 5: 1000, 6: 1000, 10: 1000, 13: STREAM_DSP_BITS, 14: 0x1fd5, 15: 1 }, set)
  const bytes = new Uint8Array(4 * words.length), view = new DataView(bytes.buffer)
  words.forEach((w, i) => view.setUint32(4 * i, w >>> 0))
  return bytes
}

describe('stream probe reply', () => {
  it('names the counts and turns each window into min, mean and max', () => {
    // unmask: min 33,000, max 40,000, 4 blocks summing to 2^32 + 100 counts
    const r = parseStreamReply(reply({ 31: 33000, 32: 40000, 33: 4, 34: 1, 35: 100, 7: 2 }))
    expect(r).toMatchObject({ words: 64, armed: true, failed: false, sent: 1000, straddles: 2, taken: true, counters: 0x1fd5 })
    expect(r.windows.unmask).toEqual({ min: 33000, max: 40000, count: 4, mean: (2 ** 32 + 100) / 4 })
    expect(r.windows.start.count).toBe(0)
    const text = describeStream(r)
    expect(text).toContain('64 halfwords a frame: sending')
    expect(text).toContain('unmask   min 250.0 us (68.9 %)')
    expect(text).toContain('start    none in this window')
    expect(r.windows.baseline.count).toBe(0)
  })

  it('reads the checker counters and refuses a torn or partial read', () => {
    const counters = { 41: 3, 42: 5000, 43: 4990, 44: 1, 45: 9, 46: 0, 47: 2, 48: 4990, 49: 0x10, 50: 3 }
    const text = describeDsp(parseStreamReply(reply(counters)))
    expect(text).toContain('5000 frames, 4990 good, 1 bad, 9 missing, 0 out of order, 2 with bits 16-23 set')
    expect(text).toContain("last bad block's differences $000010")
    expect(describeDsp(parseStreamReply(reply({ ...counters, 50: 4 })))).toContain('torn read (serials 3 and 4)')
    expect(describeDsp(parseStreamReply(reply({ ...counters, 13: 100 })))).toBe('DSP checker: 100 of 240 bits read')
  })

  it('names a stopped probe and refuses other replies', () => {
    expect(describeStream(parseStreamReply(reply({ 2: 4 })))).toContain('stopped by the watchdog')
    expect(() => parseStreamReply(new Uint8Array(STREAM_REPLY_BYTES))).toThrow('--stream-probe')
    expect(() => parseStreamReply(reply().subarray(4))).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { DEVICE_LOG_BYTES, DEVICE_LOG_PAGE, DEVICE_LOG_PAGES, parseDeviceLog } from './device-log'
import { describeStallFrames, stallLateness } from '../../community/octatrack-diagnostics-contract'
import { validateDiagnostic } from '../../../server/octatrack-diagnostics'

/** A log as diag.h lays it out, big-endian: header, freeze slot, 96 loads, 32 incidents. */
function log(edit: (view: DataView) => void) {
  const data = new Uint8Array(DEVICE_LOG_PAGES * DEVICE_LOG_PAGE), view = new DataView(data.buffer)
  view.setUint32(0, 0x4d574447); view.setUint32(4, 1); view.setUint32(8, 0x1234); view.setUint32(12, 3); view.setUint32(16, 9)
  edit(view)
  return data
}
const LOADS = 40 + 92, INCIDENTS = LOADS + 28 * 96

describe('the unit’s diagnostics log', () => {
  it('reads diag.h’s layout and keeps written records, oldest first', () => {
    const parsed = parseDeviceLog(log(view => {
      const at = LOADS + 28 * 5 // ring slot 5 holds seq 7, slot 0 seq 2
      view.setUint32(at, 7); view.setUint32(at + 4, 3); view.setUint32(at + 8, 25)
      ;[400, 600, 300, 350, 200, 250, 600, 300].forEach((v, i) => view.setUint16(at + 12 + 2 * i, v))
      view.setUint32(LOADS, 2); view.setUint32(LOADS + 4, 2)
      const i = INCIDENTS + 92 * 3
      view.setUint32(i, 8); view.setUint32(i + 4, 3); view.setUint32(i + 8, 61); view.setUint32(i + 12, 16536)
      view.setUint16(i + 16, 3); view.setUint16(i + 18, 950); view.setUint16(i + 20, 500); view.setUint16(i + 22, 400)
      view.setUint8(i + 24, 1); view.setUint8(i + 48, 33); view.setUint8(i + 79, 19)
      view.setUint32(i + 80, 0x400cbf2c); view.setUint32(i + 84, 2880); view.setUint32(i + 88, 1)
      view.setUint32(INCIDENTS + 92 * 4 + 16, 0x00020000) // kind set, seq 0: being written, left out
    }))!
    expect(parsed).toMatchObject({ nonce: 0x1234, boot: 3, seq: 9 })
    expect(parsed.loads.map(load => load.seq)).toEqual([2, 7])
    expect(parsed.loads[1]).toEqual({ seq: 7, boot: 3, minute: 25, cpu: [400, 600], dsp5to8: [300, 350], dsp1to4: [200, 250], samples: 600, playing: 300 })
    expect(parsed.incidents).toHaveLength(1)
    expect(parsed.incidents[0]).toMatchObject({ seq: 8, boot: 3, second: 61, a: 16536, kind: 'freeze', cpu: 950, dsp5to8: 500, dsp1to4: 400, screen: 0x400cbf2c, tempo24: 2880, playing: true })
    expect(parsed.incidents[0].machines[0]).toBe(1); expect(parsed.incidents[0].fx[0]).toBe(33); expect(parsed.incidents[0].keys[15]).toBe(19)
  })
  it('refuses another magic or version and a short read', () => {
    expect(parseDeviceLog(log(view => view.setUint32(4, 3)))).toBeUndefined()
    expect(parseDeviceLog(log(view => view.setUint32(0, 0)))).toBeUndefined()
    expect(parseDeviceLog(new Uint8Array(DEVICE_LOG_BYTES - 1))).toBeUndefined()
    expect(DEVICE_LOG_PAGE % 64).not.toBe(0)
  })
})

describe('the unit’s diagnostics log, version 2', () => {
  const V2_LOADS = 40 + 92, V2_INCIDENTS = V2_LOADS + 32 * 96, V2_END = V2_INCIDENTS + 92 * 32
  function log2(edit: (view: DataView) => void) {
    const data = new Uint8Array(DEVICE_LOG_PAGES * DEVICE_LOG_PAGE), view = new DataView(data.buffer)
    view.setUint32(0, 0x4d574447); view.setUint32(4, 2); view.setUint32(8, 0x1234); view.setUint32(12, 3); view.setUint32(16, 9)
    edit(view)
    return data
  }
  it('reads the gaps, the base and set records and the crash and stall records after the log', () => {
    const parsed = parseDeviceLog(log2(view => {
      const at = V2_LOADS + 32 * 2
      view.setUint32(at, 5); view.setUint32(at + 4, 3); view.setUint32(at + 8, 15)
      ;[400, 600, 300, 350, 200, 250, 600, 300, 2000, 10].forEach((v, i) => view.setUint16(at + 12 + 2 * i, v))
      const b = V2_INCIDENTS
      view.setUint32(b, 2); view.setUint32(b + 4, 3); view.setUint32(b + 8, 0); view.setUint32(b + 12, 0x320fc454); view.setUint16(b + 16, 7)
      const s = V2_INCIDENTS + 92
      view.setUint32(s, 3); view.setUint32(s + 4, 3); view.setUint32(s + 8, 4); view.setUint32(s + 12, 2); view.setUint16(s + 16, 6)
      ;[0x95, 0xcf, 0xf6, 0x96, 0xbc, 0xf0, 0xd6, 0x74].forEach((v, i) => view.setUint8(s + 24 + i, v))
      view.setUint32(V2_END, 0x4d574352); view.setUint32(V2_END + 4, 12); view.setUint32(V2_END + 8, 4 << 18 | 0x2000); view.setUint32(V2_END + 12, 0x40c52322)
      view.setUint32(V2_END + 116, 0x4fefffd4); view.setUint32(V2_END + 148, 0)
      view.setUint32(V2_END + 180, 0x4d575354); view.setUint32(V2_END + 184, 2); view.setUint32(V2_END + 188, 1); view.setUint32(V2_END + 192, 17328); view.setUint32(V2_END + 196, 2); view.setUint32(V2_END + 200, 806180)
      view.setUint32(32, 1) // stall_seen: the unit started after the first stall, so the second is this start's
    }))!
    expect(parsed.version).toBe(2)
    expect(parsed.loads[0]).toMatchObject({ seq: 5, frameGap: 2000, tickGap: 10 })
    expect(parsed.incidents.map(r => r.kind)).toEqual(['base', 'set'])
    expect(parsed.incidents[0].a).toBe(0x320fc454)
    expect(parsed.incidents[1]).toMatchObject({ a: 2 }); expect(parsed.incidents[1].machines.slice(0, 8)).toEqual([0x95, 0xcf, 0xf6, 0x96, 0xbc, 0xf0, 0xd6, 0x74])
    expect(parsed.crash).toMatchObject({ count: 12, vector: 4, sr: 0x2000, pc: 0x40c52322 }); expect(parsed.crash!.code[0]).toBe(0x4fefffd4); expect(parsed.crash!.memory[0]).toBe(0)
    expect(parsed.stall).toMatchObject({ count: 2, reason: 1, ticks: 17328 }); expect(parsed.stallSeen).toBe(1); expect(parsed.stall!.report).toEqual([806180, 0])
    // The site uploads these records as they are read here; the Worker refused version 2 loads and the records until 8 November 2026.
    const upload = (log: object) => () => validateDiagnostic({ id: crypto.randomUUID(), event: 'device_log', phase: 'ready', log })
    expect(upload({ loads: parsed.loads, incidents: [] })).not.toThrow()
    expect(upload({ loads: [], incidents: parsed.incidents })).not.toThrow()
    expect(upload({ loads: [], incidents: [], crash: parsed.crash, stall: parsed.stall })).not.toThrow()
    expect(parsed.stall!.frames).toBeUndefined() // a base before the trace: zeros after the stall record
  })
  it('reads how late a stall’s last frames began, and names the late entry', () => {
    const trace = (...frames: [number, number][]) => [[363, 100], [363, 100], ...frames].flat()
    // A 520 µs frame interrupt puts the next frame 150 µs late; two more come back to back, then none.
    const hit = trace([363, 100], [513, 520], [213, 100], [363, 100])
    expect(stallLateness(hit)).toEqual([0, 0, 0, 150, 0, 0])
    expect(describeStallFrames(hit)).toMatch(/the last began 0 0 0 150 0 0 us late: one 150 us late, 2 before the last, after a frame interrupt of 520 us: fits the late entry \(110 to 190 us\)$/)
    // Later than the window the DSP skips a frame and runs on; earlier it catches up. Neither is the late entry.
    expect(stallLateness(trace([563, 570], [363, 100]))).toEqual([0, 0, 200, 200])
    expect(describeStallFrames(trace([563, 570], [363, 100]))).toMatch(/none 110 to 190 us late, so not the late entry$/)
    expect(describeStallFrames(trace([463, 470], [263, 100]))).toMatch(/the last began 0 0 100 0 us late: none/)
    // A skipped frame leaves the count a frame behind, which is on time again; so is the first frame after a long silence.
    expect(stallLateness(trace([710, 700], [363, 100]))).toEqual([0, 0, 0, 0])
    expect(stallLateness(trace([513, 520], [5000, 100], [363, 100]))).toEqual([0, 0, 150, 0, 0])
    // An entry in the window long before the stop is not what stopped it.
    expect(describeStallFrames(trace([513, 520], [213, 100], ...Array.from({ length: 8 }, (): [number, number] => [363, 100])))).toMatch(/so not the late entry$/)
  })
  it('reads the frames kept with the stall record, in µs, and no other stall’s', () => {
    const traced = (count: number) => {
      const data = new Uint8Array(DEVICE_LOG_PAGES * DEVICE_LOG_PAGE)
      data.set(log2(view => { view.setUint32(V2_END + 180, 0x4d575354); view.setUint32(V2_END + 184, 2) }))
      const view = new DataView(data.buffer), at = V2_END + 180 + 456
      view.setUint32(at, 0x4d574654); view.setUint32(at + 4, count)
      ;[749, 206, 2063, 1650].forEach((v, i) => view.setUint16(at + 8 + 2 * (252 + i), v)) // the last two frames: on time, then 1 ms late after an 800 µs run
      return parseDeviceLog(data)!.stall!
    }
    expect(traced(2).frames).toEqual([363, 100, 1000, 800])
    expect(describeStallFrames(traced(2).frames)).toBe('2 frames before it: last gaps 363 1000 us (363 is on time); longest 1000 us, 0 frames before the last, after a frame interrupt of 800 us (the longest ran 800 us); the last began 0 274 us late: none 110 to 190 us late, so not the late entry')
    expect(traced(1).frames).toBeUndefined()
    expect(describeStallFrames(undefined)).toBe('')
    expect(() => validateDiagnostic({ id: crypto.randomUUID(), event: 'device_log', phase: 'ready', log: { loads: [], incidents: [], stall: traced(2) } })).not.toThrow()
    expect(() => validateDiagnostic({ id: crypto.randomUUID(), event: 'device_log', phase: 'ready', log: { loads: [], incidents: [], stall: { ...traced(2), frames: [1] } } })).toThrow()
  })
  it('leaves the records out when their magic is missing', () => {
    const parsed = parseDeviceLog(log2(() => {}))!
    expect(parsed.crash).toBeUndefined(); expect(parsed.stall).toBeUndefined(); expect(parsed.loads).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { encodeModuleSet, parseSetIdentity, SET_MAX_ABI } from './set-package'

const base = '31'.repeat(32), baseline = '45'.repeat(32)
const pkg = (id: number, length = 33) => {
  const data = new Uint8Array(length), view = new DataView(data.buffer)
  view.setUint32(0, 0x4d57524d); view.setUint16(4, 4); view.setUint32(28, id)
  return data
}
describe('one module-set offer', () => {
  it('binds every bounded package and zero padding to the exact base and baseline', () => {
    const first = pkg(11), last = pkg(22, 35), data = encodeModuleSet(base, baseline, [first, last]), view = new DataView(data.buffer)
    expect(view.getUint32(0)).toBe(0x4d574d53); expect(view.getUint16(4)).toBe(1); expect(view.getUint16(6)).toBe(2)
    expect(view.getUint32(8)).toBe(data.length); expect(view.getUint32(12)).toBe(0)
    expect(Buffer.from(data.subarray(16, 48)).toString('hex')).toBe(base)
    expect(Buffer.from(data.subarray(48, 80)).toString('hex')).toBe(baseline)
    expect(view.getUint32(80)).toBe(33); expect(data.subarray(84, 117)).toEqual(first)
    expect(data.subarray(117, 120)).toEqual(new Uint8Array(3)); expect(view.getUint32(120)).toBe(35)
    first[0] = 0; expect(data[84]).toBe(0x4d) // the caller cannot mutate a staged offer
  })
  it('retains ABI 9 requirements alongside legacy packages in the same offer', () => {
    const reader = pkg(11, 80), header = new DataView(reader.buffer)
    header.setUint16(4, 9); header.setUint16(76, 8)
    const legacy = pkg(22), data = encodeModuleSet(base, baseline, [reader, legacy]), view = new DataView(data.buffer)
    expect(view.getUint16(6)).toBe(2)
    expect(data.subarray(84, 164)).toEqual(reader)
    expect(view.getUint16(84 + 76)).toBe(8)
    expect(data.subarray(168, 168 + legacy.length)).toEqual(legacy)
  })
  it('takes every ABI the base takes, ABI 10 (Analog BD 0.1.5) among them', () => {
    const loader = readFileSync(new URL('../../../sdk/runtime/loader/loader.h', import.meta.url), 'utf8')
    expect(Number(/#define RUNTIME_ABI (\d+)u/.exec(loader)?.[1])).toBe(SET_MAX_ABI)
    const engine = pkg(11); engine[5] = SET_MAX_ABI
    expect(new DataView(encodeModuleSet(base, baseline, [engine]).buffer).getUint16(6)).toBe(1)
  })
  it('refuses duplicates, malformed packages and capacity exhaustion before any upload', () => {
    for (const packages of [[], [pkg(0)], [pkg(1), pkg(1)], [new Uint8Array(31)], Array.from({ length: 21 }, (_, i) => pkg(i + 1)), [pkg(1, 2097152)]])
      expect(() => encodeModuleSet(base, baseline, packages)).toThrow()
    const bad = pkg(1); bad[5] = SET_MAX_ABI + 1
    expect(() => encodeModuleSet(base, baseline, [bad])).toThrow()
    expect(() => encodeModuleSet('', baseline, [pkg(1)])).toThrow()
  })
  it('accepts only a complete known baseline census', () => {
    const data = new Uint8Array(40), view = new DataView(data.buffer)
    view.setUint32(0, 0x4d575344); view.setUint8(4, 1); view.setUint8(5, 1); view.setUint16(6, 19)
    data.set(Buffer.from(baseline, 'hex'), 8)
    expect(parseSetIdentity(view)).toBe(baseline)
    view.setUint8(5, 0); expect(() => parseSetIdentity(view)).toThrow()
    view.setUint8(5, 1); view.setUint16(6, 21); expect(() => parseSetIdentity(view)).toThrow()
    expect(() => parseSetIdentity(new DataView(data.buffer, 0, 39))).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { encodeModuleSet, frameCostTable, parseSetIdentity, SET_CHANGES, SET_COSTS, SET_MAX_ABI } from './set-package'
import { existsSync } from 'node:fs'

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
  it('takes one change per installed module, up to the base\'s 128', () => {
    const changes = (n: number) => Array.from({ length: n }, (_, i) => pkg(1000 + i))
    expect(new DataView(encodeModuleSet(base, baseline, changes(SET_CHANGES)).buffer).getUint16(6)).toBe(128)
    expect(() => encodeModuleSet(base, baseline, changes(SET_CHANGES + 1))).toThrow(/between 1 and 128/)
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
    for (const packages of [[], [pkg(0)], [pkg(1), pkg(1)], [new Uint8Array(31)], Array.from({ length: SET_CHANGES + 1 }, (_, i) => pkg(i + 1)), [pkg(1, 2097152)]])
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
    view.setUint8(5, 1); view.setUint16(6, SET_CHANGES); expect(parseSetIdentity(view)).toBe(baseline)
    view.setUint16(6, SET_CHANGES + 1); expect(() => parseSetIdentity(view)).toThrow()
    expect(() => parseSetIdentity(new DataView(data.buffer, 0, 39))).toThrow()
  })
  it('appends the measured frame costs as v2, by package id, for a base that keeps them', () => {
    const costs = [{ module: 5, use: 77, wake: 4, rest: 15 }, { module: 0x9f482bb9, use: 114, wake: 0, rest: 0 }]
    const one = pkg(11), data = encodeModuleSet(base, baseline, [one], costs), view = new DataView(data.buffer)
    expect(view.getUint16(4)).toBe(2); expect(view.getUint32(8)).toBe(data.length)
    const at = 84 + 36
    expect(view.getUint32(at)).toBe(2)
    expect([view.getUint32(at + 4), view.getUint16(at + 8), view.getUint16(at + 10), view.getUint16(at + 12), view.getUint16(at + 14)]).toEqual([5, 77, 4, 15, 0])
    expect([view.getUint32(at + 16), view.getUint16(at + 20), view.getUint16(at + 22), view.getUint16(at + 24)]).toEqual([0x9f482bb9, 114, 0, 0])
    expect(data.length).toBe(at + 4 + 24)
    for (const bad of [[costs[1], costs[0]], [costs[0], costs[0]], [{ module: 5, use: 1, wake: 2001, rest: 0 }], [{ module: 5, use: 2001, wake: 0, rest: 0 }],
      [{ module: 5, use: 1, wake: 0, rest: 2001 }], [{ module: 0, use: 1, wake: 0, rest: 0 }], [{ module: 5, use: 1.5, wake: 0, rest: 0 }]])
      expect(() => encodeModuleSet(base, baseline, [one], bad)).toThrow(/frame costs/)
    expect(() => encodeModuleSet(base, baseline, [one], Array.from({ length: SET_COSTS + 1 }, (_, i) => ({ module: i + 1, use: 1, wake: 0, rest: 0 })))).toThrow(/frame costs/)
    expect(new DataView(encodeModuleSet(base, baseline, [one]).buffer).getUint16(4)).toBe(1) // v1 without costs
  })
  it('sends every module the base-owned record lists, in per mille, under its package id', () => {
    const table = frameCostTable()
    expect(table.length).toBeGreaterThan(0)
    expect(frameCostTable({ tapeecho: { first: 13, each: 3.7 } }, null)).toEqual([{ module: 0x9f482bb9, use: 37, wake: 93, rest: 0 }]) // build.py's id, per mille
    expect(frameCostTable({ tapeecho: { first: 13, each: 3.7, rest: 2.5 } }, null)[0].rest).toBe(25) // installed and unused
    expect(frameCostTable({ x: { first: 1, each: 2 } }, null)[0].wake).toBe(0) // never below each
    const shipped = JSON.parse(readFileSync(new URL('../../../sdk/machines/octatrack/frame-costs.json', import.meta.url), 'utf8'))
    const echo = shipped.costs.tapeecho
    expect(table.find(c => c.module === 0x9f482bb9)).toEqual({ module: 0x9f482bb9, use: Math.round(echo.each * 10), wake: Math.round(echo.first * 10) - Math.round(echo.each * 10), rest: Math.round((echo.rest ?? 0) * 10) })
    const own = table.slice(-15)
    expect(own.map(c => c.module)).toEqual(Array.from({ length: 15 }, (_, i) => 0xfffffff1 + i))
    expect(own[0].use).toBe(Math.round(shipped.stock.trackStock * 10)); expect(own[1].use).toBe(Math.round(shipped.stock.line * 10))
    expect(own.slice(2, 11).map(c => c.use)).toEqual(shipped.stock.reserveBySteps.map((f: number) => Math.round(f * 10)))
    expect([own[11].use, own[12].use, own[13].use, own[14].use]).toEqual([shipped.stock.reserveMargin, shipped.stock.reserveFloor, shipped.stock.trackPlay, shipped.stock.measuredMargin].map((f: number) => Math.round(f * 10)))
    expect(frameCostTable({ x: { first: 1, each: 1 } }, null)).toHaveLength(1) // no stock: the base's compiled figures
    expect(() => encodeModuleSet(base, baseline, [pkg(11)], table)).not.toThrow()
    expect(() => encodeModuleSet(base, baseline, [pkg(11)], [{ module: 5, use: 0, wake: 0, rest: 0 }])).not.toThrow() // measured free
    const record = JSON.parse(readFileSync(new URL('../../../sdk/machines/octatrack/frame-costs.json', import.meta.url), 'utf8'))
    for (const [id, cost] of Object.entries(record.costs) as [string, { first: number; each: number; rest?: number; measured: string }][]) {
      expect(existsSync(new URL(`../../../sdk/octatrack/modules/${id}/octamod.module.json`, import.meta.url)), id).toBe(true)
      expect(cost.measured.length, id).toBeGreaterThan(10)
      expect(cost.each >= 0 && cost.first >= cost.each && cost.first <= 100 && (cost.rest ?? 0) >= 0 && (cost.rest ?? 0) <= 100, id).toBe(true)
    }
  })
})

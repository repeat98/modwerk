import { describe, expect, it } from 'vitest'
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { packSection } from '../elektron/codec/pack.ts'
import { depackSection } from '../elektron/codec/depack.ts'
import { packRun } from './run-pack.ts'

const load = 0x40000400, runLoad = 0x40000500, start = 0x40a955e0

describe('the base .run stored packed', () => {
  it('replaces the trailing plain .run with the kit section that unpacks to it', () => {
    const run = Uint8Array.from({ length: 4096 }, (_, i) => (i % 97) ^ (i >> 9))
    const main = new Uint8Array(runLoad - load + run.length)
    main.fill(0x4e, 0, runLoad - load)
    main.set(run, runLoad - load)
    const packed = packRun(main, { run_load: runLoad, ddr: [start, start + run.length] }, load)
    expect(packed.subarray(0, runLoad - load)).toEqual(main.subarray(0, runLoad - load))
    expect(packed.length).toBeLessThan(main.length)
    expect(depackSection(packed.subarray(runLoad - load))).toEqual(run)
  })

  it('refuses an image that does not end with its linked .run', () => {
    const main = new Uint8Array(runLoad - load + 16)
    expect(() => packRun(main, { run_load: runLoad, ddr: [start, start + 12] }, load)).toThrow('linked .run')
    expect(() => packRun(main, { run_load: load, ddr: [start, start + main.length] }, load)).toThrow('linked .run')
  })

  it('packs the bytes build_core.py packs (sdk/tests/test_run_pack.py pins the same digest)', () => {
    const base = Uint8Array.from({ length: 40000 }, (_, i) => ((i * i >> 3) ^ (i >> 7)) & 0xff)
    const data = new Uint8Array(52000)
    data.set(base)
    for (let k = 0; k < 3; k++) data.set(base.subarray(1000, 5000), 40000 + 4000 * k)
    expect(sha(packSection(data))).toBe('5b6b45e7041999bafc6b033b54293555634303df90ce3fb8cfa39e0f52951eb3')
  })
})

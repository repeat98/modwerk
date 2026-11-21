import { describe, expect, it } from 'vitest'
import { depack, depackSection } from './depack.ts'
import { pack, packOptimal, packSectionOptimal } from './pack.ts'

// The optimal parse is several times slower than greedy: on a loaded runner these take seconds, past vitest's 5 s.
const SLOW = 60_000

// Synthetic inputs only: a seeded random stream, runs, a repeated record and text-like data with shifted repeats.
function input(kind: string, n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n)
  let x = seed * 2654435761 >>> 0 || 1
  const next = () => (x = Math.imul(x ^ x >>> 15, 0x2c1b3c6d) + 0x9e3779b9 >>> 0)
  for (let i = 0; i < n; i++) {
    if (kind === 'random') out[i] = next() & 0xff
    else if (kind === 'runs') out[i] = (i >> 5) & 3 ? 0 : next() & 0xff
    else if (kind === 'records') out[i] = i % 48 < 6 ? (i / 48 | 0) & 0xff : (i % 48) * 7 & 0xff
    else out[i] = next() % 5 ? 'abcdefgh'.charCodeAt((i + (i >> 9)) % 8) : next() & 0xff
  }
  return out
}

describe('the optimal packer', () => {
  it('depacks to its input, with the end marker where the greedy packer puts it', () => {
    for (const kind of ['random', 'runs', 'records', 'text'])
      for (const n of [0, 1, 2, 3, 4, 7, 100, 4096, 70000]) {
        const data = input(kind, n, n + 1), stream = packOptimal(data)
        const [out, end] = depack(stream, 0, stream.length)
        expect(out, kind + '/' + n).toEqual(data)
        expect(end, kind + '/' + n).toBe(stream.length)
        expect(depackSection(packSectionOptimal(data)), kind + '/' + n).toEqual(data)
      }
  }, SLOW)

  it('is never larger than the greedy packer on compressible data, and smaller where offsets repeat', () => {
    for (const kind of ['runs', 'records', 'text']) {
      const data = input(kind, 60000, 7)
      expect(packOptimal(data).length, kind).toBeLessThanOrEqual(pack(data).length)
    }
    const records = input('records', 60000, 7)
    expect(packOptimal(records).length).toBeLessThan(pack(records).length * 0.95)
  }, SLOW)
})

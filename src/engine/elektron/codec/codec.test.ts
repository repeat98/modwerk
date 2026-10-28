import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { packSection } from './pack.ts'
import { depackSection } from './depack.ts'
import { contentChecksum, encode8in7, encodeSyx, packetChecksum } from './transport.ts'
import * as kit from './coldfire-kit.ts'
import * as modwerk from '../coldfire-isa.ts'
import vectors from './codec-vectors.json'

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
function input(kind: string, n: number, seed: number) {
  let s = seed >>> 0
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32
  const a = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (kind === 'random') a[i] = (r() * 256) | 0
    else if (kind === 'low') a[i] = (r() * 4) | 0
    else if (kind === 'near') a[i] = i > 64 && r() < 0.8 ? a[i - 1 - ((r() * 64) | 0)] : (r() * 256) | 0
    else if (kind === 'far') a[i] = i > 5000 && r() < 0.9 ? a[i - 3320 - ((r() * 16) | 0)] : (r() * 16) | 0
    else if (kind === 'long') a[i] = i % 3000 < 2600 ? i % 7 : (r() * 256) | 0
  }
  return a
}
const refusal = (bytes: Uint8Array) => {
  try { return 'ok ' + sha(depackSection(bytes)) } catch (error) { return (error as Error).constructor.name + ': ' + (error as Error).message }
}

// The sweeps pack 2 MB and decode 655,360 words: well past vitest's 5 s default on a loaded runner.
describe('Modwerk firmware codec', { timeout: 60_000 }, () => {
  it('packs every input to the recorded bytes, in both modes, and depacks it back', () => {
    for (const kind of ['random', 'low', 'near', 'far', 'long', 'zero']) for (const n of [0, 1, 2, 3, 7, 100, 4096, 70000, 300000]) {
      const data = input(kind, n, n + kind.length), key = kind + '/' + n as keyof typeof vectors.pack, packed = packSection(data)
      expect(sha(packed), key).toBe(vectors.pack[key])
      expect(sha(packSection(data, false)), key).toBe(vectors.store[key])
      expect(depackSection(packed), key).toEqual(data)
    }
  })
  it('refuses damaged sections as recorded', () => {
    const good = packSection(input('near', 4096, 9))
    expect({
      truncated: refusal(good.subarray(0, good.length - 40)), header: refusal(good.subarray(0, 3)),
      sum: refusal(Uint8Array.from(good, (v, i) => i === 7 ? v ^ 1 : v)), junk: refusal(input('random', 600, 3)),
    }).toEqual(vectors.depack)
  })
  it('encodes the SysEx transport as recorded', () => {
    const got: Record<string, string | number> = {}
    for (const n of [0, 1, 6, 7, 8, 101, 1000, 4095]) {
      const data = input('random', n, n), start = input('low', 16, 1), end = input('low', 16, 2)
      start[0] = end[0] = 0xf0; start[15] = end[15] = 0xf7
      got['8in7/' + n] = sha(encode8in7(data))
      got['syx/' + n] = sha(encodeSyx(data, 0x0a, start, end))
      got['content/' + n] = contentChecksum(input('random', n * 4, n))
      got['packet/' + n] = packetChecksum(input('low', 126, n), n & 0x7f)
    }
    expect(got).toEqual(vectors.transport)
  })
  it('classifies every ColdFire opword as recorded, in both variants', () => {
    const got: Record<string, string> = {}
    for (const [name, cf] of [['kit', kit], ['modwerk', modwerk]] as const) for (const ext of [0x0000, 0xffff, 0x0100, 0x5a3c, -1]) {
      const hash = createHash('sha256')
      for (let op = 0; op < 0x10000; op++) {
        const image = new Uint8Array(ext < 0 ? 2 : 10)
        image[0] = op >> 8; image[1] = op & 0xff
        for (let i = 2; i < image.length; i += 2) { image[i] = ext >> 8; image[i + 1] = ext & 0xff }
        let line
        try { line = JSON.stringify(cf.decodeColdFire(cf.readerAt(image, 0x1000)(0x1000), 0x1000)) } catch (error) { line = 'throw ' + (error as Error).constructor.name }
        hash.update(line + '\n')
      }
      got[name + '/' + (ext < 0 ? 'end' : ext.toString(16))] = hash.digest('hex')
    }
    expect(got).toEqual(vectors.coldfire)
  })
})

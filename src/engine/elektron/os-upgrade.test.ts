import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encode8in7 } from './codec/transport'
import { crc32, decodeReply, sendUpgrade, unpack7, upgradeMessages, UpgradeError, HEADER, type UpgradeLine } from './os-upgrade'

const synthetic = (n: number) => Uint8Array.from({ length: n }, (_, i) => i * 31 + 7 & 0xff)
const sha = (parts: Uint8Array[]) => createHash('sha256').update(Buffer.concat(parts)).digest('hex')

// sdk/machines/analog-rytm-mkii/tools/rytm_link.py's ek_upgrade_messages on the same synthetic files.
const RYTM_LINK: [number, number, string][] = [
  [0, 1, 'e9e30a2c1e8f8fe35fccde30ae56f090948c45a9d93844e24d148517f7306655'],
  [1, 2, '850761e0812eb5992a70396167418d1bdbc702ab02aef3c72827488162cf6da6'],
  [2047, 2, '73aabde8b1c3e0bcff6a2c198e19b000e52913232610fc268e74cc5c3cc4100a'],
  [2048, 2, '6010eacdcc2a7eeace88febab086a3092804281c92c5ff494cc3b57d55129ab0'],
  [2049, 3, '10d964067f6e77365f1bad84f7f67d5c8c61657623be41d34faebc1b5f284a55'],
  [5000, 4, 'e5afe3e9d8e748d3f3727bd31a79adc1b59f207a65f4ae500e6c435efe22e4bb'],
]

/** A unit that answers like the stock OS, with the status `answer` gives each message (null: no answer). */
function unit(answer: (i: number) => number | null): UpgradeLine {
  const queue: Uint8Array[] = []
  let sent = 0
  return {
    send(data: Uint8Array) {
      const d = unpack7(data.subarray(HEADER.length, -1)), i = sent++, status = answer(i)
      if (status === null) return
      const body = i === 0 ? [d[0], d[1], d[0], d[1], 0xd0, status, 0] : [d[0], d[1], d[0], d[1], 0xd1, 0, 0, 0, 0, status, 0]
      queue.push(Uint8Array.from([...HEADER, ...encode8in7(Uint8Array.from(body)), 0xf7]))
    },
    async next() { return queue.shift() ?? null },
  }
}

describe('the Elektron OS upgrade over USB MIDI', () => {
  it('sends exactly the messages Modwerk\'s Rytm link sends', () => {
    for (const [n, count, digest] of RYTM_LINK) {
      const messages = upgradeMessages(synthetic(n))
      expect(messages.map(m => m.seq), String(n)).toEqual(Array.from({ length: count }, (_, i) => i + 1))
      expect(sha(messages.map(m => m.data)), String(n)).toBe(digest)
    }
  })

  it('packs 8 bits in 7 and back, and checks blocks as zlib\'s crc32 seeded with 0xffffffff', () => {
    const data = synthetic(1000)
    expect(unpack7(encode8in7(data))).toEqual(data)
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0), 0xffffffff)).toBe(0xffffffff)
    expect(decodeReply(Uint8Array.of(0xf0, 0x00, 0x20, 0x3c, 0x01, 0x00, 0xf7))).toBeNull()
  })

  it('returns once the last block is answered done, and refuses every other ending', async () => {
    const syx = synthetic(5000), progress: number[] = []
    await sendUpgrade(unit(i => (i === 3 ? 1 : 0)), syx, p => progress.push(p.sent))
    expect(progress).toEqual([1, 2, 3, 4])
    const cases: [(i: number) => number | null, RegExp][] = [
      [i => (i === 0 ? 2 : 0), /refused the upgrade/],
      [i => (i === 2 ? 3 : 0), /refused block 2/],
      [i => (i === 1 ? 1 : 0), /said done at block 1/],
      [() => 0, /never said the upload was complete/],
      [i => (i === 2 ? null : 0), /did not answer message 3/],
    ]
    for (const [answer, error] of cases) {
      await expect(sendUpgrade(unit(answer), syx, undefined, 50)).rejects.toThrow(error)
    }
    await expect(sendUpgrade(unit(() => null), syx, undefined, 10)).rejects.toBeInstanceOf(UpgradeError)
  })
})

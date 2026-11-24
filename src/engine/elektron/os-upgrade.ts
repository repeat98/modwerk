// SPDX-License-Identifier: GPL-3.0-or-later
// Elektron's OS upgrade over USB MIDI, as the stock OS takes it from Transfer: a start (0x50) naming the .syx file's
// size, then the file in 2 KiB writes (0x51), each with its CRC, each answered before the next goes. The unit says
// "done" only after the last block and then asks UPGRADE OS NOW?; nothing is erased until a person presses YES there.
// The messages are the ones Modwerk's Rytm link sends (sdk/machines/analog-rytm-mkii/tools/rytm_link.py, from
// elektroid's elektron.c); a test pins them to that tool's output. Transport-free: the page gives it a line.

import { encode8in7 } from './codec/transport'

export const HEADER = [0xf0, 0x00, 0x20, 0x3c, 0x10, 0x00] as const
export const BLOCK = 0x800
const START = 0x50, WRITE = 0x51, START_REPLY = 0xd0, WRITE_REPLY = 0xd1

/** encode8in7's inverse: each group of 8 bytes, its first holding the next seven's top bits. */
export function unpack7(data: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < data.length; i += 8) {
    const top = data[i]
    data.subarray(i + 1, i + 8).forEach((c, k) => out.push(c | (top & 0x40 >> k ? 0x80 : 0)))
  }
  return Uint8Array.from(out)
}

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1
  return c
})

/** zlib's crc32(data, value): the stock OS checks each block with value 0xffffffff, not the usual 0. */
export function crc32(data: Uint8Array, value = 0): number {
  let c = (value ^ 0xffffffff) >>> 0
  for (const b of data) c = TABLE[(c ^ b) & 0xff] ^ c >>> 8
  return (c ^ 0xffffffff) >>> 0
}

const message = (seq: number, body: number[] | Uint8Array): Uint8Array =>
  Uint8Array.from([...HEADER, ...encode8in7(Uint8Array.from([seq >> 8 & 0xff, seq & 0xff, 0, 0, ...body])), 0xf7])

const u32 = (v: number, little: boolean) => {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, v >>> 0, little)
  return Array.from(b)
}

export type UpgradeMessage = { seq: number; data: Uint8Array }

/** The start and every block write for this .syx file, in order. */
export function upgradeMessages(syx: Uint8Array): UpgradeMessage[] {
  const out: UpgradeMessage[] = []
  let seq = 1
  out.push({ seq, data: message(seq, [START, ...u32(syx.length, true), ...new TextEncoder().encode('sysex'), 0, 1]) })
  for (let off = 0; off < syx.length; off += BLOCK) {
    const block = syx.subarray(off, off + BLOCK)
    seq++
    out.push({ seq, data: message(seq, [WRITE, ...u32(crc32(block, 0xffffffff), false), ...u32(block.length, false), ...u32(off, false), ...block]) })
  }
  return out
}

/** A reply's payload if `sysex` is one of this protocol's messages, else null. */
export function decodeReply(sysex: Uint8Array): Uint8Array | null {
  if (sysex.length < HEADER.length + 1 || HEADER.some((b, i) => sysex[i] !== b) || sysex[sysex.length - 1] !== 0xf7) return null
  return unpack7(sysex.subarray(HEADER.length, -1))
}

/** What the page talks through: send one message, and the next SysEx message from the unit within `ms` (or null). */
export type UpgradeLine = { send(data: Uint8Array): void; next(ms: number): Promise<Uint8Array | null> }
export type UpgradeProgress = { sent: number; total: number }

export class UpgradeError extends Error {}

/** Send the upgrade and wait for each answer. Resolves once the unit said the upload is complete: it then shows
 * UPGRADE OS NOW?, and only YES on the unit erases and writes the flash. Every refusal throws before that, with the
 * unit still on its OS. */
export async function sendUpgrade(line: UpgradeLine, syx: Uint8Array, onProgress?: (p: UpgradeProgress) => void, timeoutMs = 10000): Promise<void> {
  const messages = upgradeMessages(syx), total = messages.length
  for (let i = 0; i < total; i++) {
    const { seq, data } = messages[i], want = i === 0 ? START_REPLY : WRITE_REPLY, statusAt = i === 0 ? 5 : 9
    line.send(data)
    let reply: Uint8Array | null = null
    for (const end = Date.now() + timeoutMs; !reply && Date.now() < end;) {
      const got = await line.next(Math.max(1, end - Date.now()))
      if (!got) break
      const d = decodeReply(got)
      if (d && d.length > statusAt && (d[2] << 8 | d[3]) === seq && d[4] === want) reply = d
    }
    if (!reply) throw new UpgradeError(`The unit did not answer message ${i + 1} of ${total}; it stays on its OS.`)
    const status = reply[statusAt]
    if (i === 0 && status !== 0) throw new UpgradeError(`The unit refused the upgrade (status ${status}). Leave every menu and try again.`)
    if (i > 0 && status > 1) throw new UpgradeError(`The unit refused block ${i} of ${total - 1} (status ${status}); it stays on its OS.`)
    onProgress?.({ sent: i + 1, total })
    if (i > 0 && status === 1) {
      if (i !== total - 1) throw new UpgradeError(`The unit said done at block ${i} of ${total - 1}; it stays on its OS.`)
      return
    }
  }
  throw new UpgradeError('The unit never said the upload was complete; it stays on its OS.')
}

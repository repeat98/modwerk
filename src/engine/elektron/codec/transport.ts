// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's encoder for the .syx wire format of Elektron OS updates: 8-in-7 packing, checksums and
// the data messages between two framing messages.

export const MFR = Uint8Array.of(0x00, 0x20, 0x3c), FIRST_COUNTER = 242, CHUNK_SIZE = 101

// Each group of up to 7 bytes becomes a marker holding their bit 7s (byte j at bit 6 - j), then the low 7 bits.
export function encode8in7(data: Uint8Array): Uint8Array {
  const n = data.length, out = new Uint8Array(n + Math.ceil(n / 7))
  let o = 0
  for (let i = 0; i < n; i += 7) {
    const marker = o++
    for (let j = 0; j < 7 && i + j < n; j++) {
      const b = data[i + j]
      out[marker] |= (b >> 7) << 6 - j
      out[o++] = b & 0x7f
    }
  }
  return out
}

export function contentChecksum(container: Uint8Array): number {
  const view = new DataView(container.buffer, container.byteOffset, container.byteLength)
  let sum = 0
  for (let i = 0; i + 4 <= container.length; i += 4) sum = sum + ((i / 4 + 1) ^ view.getUint32(i)) >>> 0
  return sum
}

// Over the counter and payload, body bytes 6..124; bytes missing from a short body count as 0.
export function packetChecksum(body: Uint8Array, k: number): number {
  let sum = k
  for (let i = 0; i < 119; i++) sum += (body[6 + i] ?? 0) ^ i + k
  return sum & 0x7f
}

const digits = (out: Uint8Array, at: number, v: number, end = out.length) => {
  for (let i = 0; i < 3; i++) if (at + i < end) out[at + i] = v >> 14 - 7 * i & 0x7f
}

export function encodeSyx(stream: Uint8Array, deviceId: number, framingStart: Uint8Array, framingEnd: Uint8Array): Uint8Array {
  const k = framingStart[8], count = Math.ceil(stream.length / CHUNK_SIZE)
  const out = new Uint8Array(framingStart.length + 128 * count + framingEnd.length), chunk = new Uint8Array(CHUNK_SIZE)
  const framing = (f: Uint8Array, at: number) => { out.set(f, at); digits(out, at + 12, count, at + f.length) }
  framing(framingStart, 0)
  for (let t = 0; t < count; t++) {
    const at = framingStart.length + 128 * t
    chunk.fill(0).set(stream.subarray(CHUNK_SIZE * t, CHUNK_SIZE * (t + 1)))
    out[at] = 0xf0
    out.set(MFR, at + 1)
    out[at + 4] = deviceId
    out[at + 6] = 0x7e
    digits(out, at + 7, FIRST_COUNTER + t)
    out.set(encode8in7(chunk), at + 10)
    out[at + 126] = packetChecksum(out.subarray(at + 1, at + 126), k)
    out[at + 127] = 0xf7
  }
  framing(framingEnd, out.length - framingEnd.length)
  return out
}

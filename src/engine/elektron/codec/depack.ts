// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's depacker for the LZ bit stream in Elektron firmware sections (the format the boot code
// depacks, written by pack.ts).

export const BIAS = 767, REUSE = 2, FAR = 3328

export class EOFError extends Error {}

// Indices in [d.length, end) read as undefined, which the arithmetic below turns into 0: a tag byte
// of 0, a literal 0 and a raw offset of 0. Only a header declaring more stream than the buffer holds gets there.
export class Bits {
  tag = 0
  readonly d: Uint8Array
  p: number
  readonly end: number

  constructor(d: Uint8Array, p: number, end: number) { this.d = d; this.p = p; this.end = end }

  byte(): number {
    if (this.p >= this.end) throw new EOFError()
    return this.d[this.p++]
  }

  // tag holds the unread bits of the current tag byte followed by a 1 marker.
  bit(): number {
    this.tag = this.tag << 1 & 0x1ff
    if (!(this.tag & 0xff)) this.tag = this.byte() << 1 | 1
    return this.tag >> 8
  }

  gamma(): number {
    let v = 1
    for (;;) {
      v = v * 2 + this.bit()
      if (this.bit()) return v
      if (v > 0x2000000) throw new Error('gamma overflow')
    }
  }
}

// Doubles the capacity until count more bytes fit.
function grow(out: Out, count: number) {
  let size = out.d.length
  while (size < out.n + count) size *= 2
  const d = new Uint8Array(size)
  d.set(out.d.subarray(0, out.n))
  out.d = d
}

export class Out {
  d: Uint8Array
  n = 0

  constructor(size = 65536) { this.d = new Uint8Array(size) }

  push(b: number): void {
    if (this.n === this.d.length) grow(this, 1)
    this.d[this.n++] = b
  }

  // Byte by byte, so an overlapping copy repeats its source.
  copy(off: number, count: number): void {
    if (this.n + count > this.d.length) grow(this, count)
    const d = this.d
    for (let n = this.n, stop = n + count; n < stop; n++) d[n] = d[n - off]
    this.n += count
  }

  bytes(): Uint8Array { return this.d.slice(0, this.n) }
}

export function depack(data: Uint8Array, pos: number, end: number): [Uint8Array, number] {
  const s = new Bits(data, pos, end), out = new Out()
  let last = 1
  for (;;) {
    if (s.bit()) { out.push(s.byte()); continue }
    const g = s.gamma()
    let off = last
    if (g !== REUSE) {
      const raw = (g * 256 + s.byte()) >>> 0
      if (raw === BIAS) return [out.bytes(), s.p]
      off = last = (raw - BIAS) >>> 0
    }
    let length = s.bit() * 2 + s.bit() || s.gamma() + 2
    if (off > FAR) length++
    if (off === 0 || off > out.n) throw new Error(`offset ${off} outside ${out.n} bytes of output`)
    out.copy(off, length + 1)
  }
}

export function depackSection(stream: Uint8Array): Uint8Array {
  const length = (stream[0] << 24 | stream[1] << 16 | stream[2] << 8 | stream[3]) >>> 0
  const [out, p] = depack(stream, 8, 8 + length)
  if (p !== 8 + length) throw new Error(`end marker at ${p - 8} of ${length} stream bytes`)
  return out
}

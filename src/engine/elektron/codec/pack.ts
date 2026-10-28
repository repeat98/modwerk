// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's packer for Elektron firmware sections: a greedy LZ77 match finder writing the
// aPLib-style bit stream that depack.ts depacks.

const MIN = 3, FAR = 3328, MAXOFF = 65536, MAXCOUNT = 2048, WINDOW = 24, EARLY = 64

// Control bits go into tag bytes, most significant first; a tag byte is placed in the stream when its
// first bit is written, so payload bytes written in between land before the next tag byte.
class Writer {
  out: Uint8Array
  n = 0
  tag = 0
  mask = 0

  constructor(capacity: number) { this.out = new Uint8Array(capacity) }

  bit(b: number) {
    if (!this.mask) { this.tag = this.n++; this.mask = 0x80 }
    if (b) this.out[this.tag] |= this.mask
    this.mask >>= 1
  }

  // The digits of v after its leading 1, each followed by a stop bit (1 after the last).
  gamma(v: number, payload = -1) {
    for (let k = 30 - Math.clz32(v); k >= 0; k--) { this.bit(v >> k & 1); this.bit(k ? 0 : 1) }
    if (payload >= 0) this.out[this.n++] = payload
  }

  literal(b: number) { this.bit(1); this.out[this.n++] = b }

  match(off: number, count: number) {
    const length = count - (off > FAR ? 2 : 1), raw = off + 767
    this.bit(0)
    this.gamma(raw >> 8, raw & 0xff)
    if (length <= 3) { this.bit(length >> 1); this.bit(length & 1) } else { this.bit(0); this.bit(0); this.gamma(length - 2) }
  }

  // gamma(2^24 + 2) with 0xff makes the depacker's raw offset wrap to exactly 767.
  end() { this.bit(0); this.gamma(0x1000002, 0xff) }
}

// Positions recorded per 3-byte key, newest first: an open-addressed table of chain heads plus a
// link to the previous position with the same key. Only the WINDOW newest of a chain are ever visited.
function greedy(d: Uint8Array, w: Writer) {
  const n = d.length, last = n - 4
  if (last < 0) { for (const b of d) w.literal(b); return }
  const bits = Math.max(4, 33 - Math.clz32(n)), mask = (1 << bits) - 1, shift = 32 - bits
  const keys = new Int32Array(mask + 1).fill(-1), heads = new Int32Array(mask + 1), prev = new Int32Array(n)
  const key = (p: number) => d[p] << 16 | d[p + 1] << 8 | d[p + 2]
  const slot = (k: number) => {
    let s = Math.imul(k, 0x9e3779b1) >>> shift
    while (keys[s] !== k && keys[s] !== -1) s = s + 1 & mask
    return s
  }
  const record = (p: number, s: number) => {
    if (keys[s] === -1) { keys[s] = key(p); prev[p] = -1 } else prev[p] = heads[s]
    heads[s] = p
  }
  let i = 0
  while (i <= last) {
    const s = slot(key(i)), limit = Math.min(MAXCOUNT, n - i)
    let best = 0, bestOff = 0
    for (let j = keys[s] === -1 ? -1 : heads[s], seen = 0; j >= 0 && seen < WINDOW; j = prev[j], seen++) {
      const off = i - j
      if (off > MAXOFF) break // chains run newest first, so every later candidate is further still
      if (best >= limit || d[j + best] !== d[i + best]) continue // cannot beat the best so far
      let len = 0
      while (len < limit && d[j + len] === d[i + len]) len++
      if (len > best && len >= (off > FAR ? MIN + 1 : MIN)) {
        best = len; bestOff = off
        if (len >= EARLY) break
      }
    }
    record(i, s)
    if (!best) { w.literal(d[i++]); continue }
    w.match(bestOff, best)
    const stop = Math.min(i + best - 1, last)
    for (let p = i + 1; p <= stop; p++) record(p, slot(key(p)))
    i += best
  }
  while (i < n) w.literal(d[i++])
}

export function pack(data: Uint8Array, compress = true): Uint8Array {
  const n = data.length, w = new Writer(n + 1 + (n + 56 >> 3)) // the all-literal size; matches only shrink it
  if (compress) greedy(data, w)
  else for (const b of data) w.literal(b)
  w.end()
  return w.out.slice(0, w.n)
}

export function packSection(data: Uint8Array, compress = true): Uint8Array {
  const stream = pack(data, compress), out = new Uint8Array(8 + stream.length), view = new DataView(out.buffer)
  let sum = 0
  for (const b of stream) sum += b
  view.setUint32(0, stream.length)
  view.setUint32(4, sum >>> 0)
  out.set(stream, 8)
  return out
}

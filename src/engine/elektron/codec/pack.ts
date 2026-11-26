// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's packer for Elektron firmware sections: a greedy LZ77 match finder writing the
// aPLib-style bit stream that depack.ts depacks, and an optimal parse of the same format for updates that must fit a
// unit's limit (packOptimal).

const MIN = 3, FAR = 3328, MAXOFF = 65536, MAXCOUNT = 2048, WINDOW = 24, EARLY = 64, OPTIMAL_WINDOW = 64

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

  // The offset-reuse code: gamma 2 and no offset byte; the depacker copies from the last match's offset.
  reuse(off: number, count: number) {
    const length = count - (off > FAR ? 2 : 1)
    this.bit(0)
    this.gamma(2)
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

export function packSection(data: Uint8Array, compress = true): Uint8Array { return frame(pack(data, compress)) }

// A stream behind its 8-byte header: its length and its byte sum.
function frame(stream: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + stream.length), view = new DataView(out.buffer)
  let sum = 0
  for (const b of stream) sum += b
  view.setUint32(0, stream.length)
  view.setUint32(4, sum >>> 0)
  out.set(stream, 8)
  return out
}

// ---- the optimal parse: the smallest stream this bit format allows for the matches the chains find ----
// Every position is reached by its cheapest path in bits: a literal, a match at a new offset, or the offset-reuse code
// (gamma 2: the previous match's offset, no offset byte), which Elektron's own packer uses and the boot code depacks.
// Each position keeps the offset its path last used, so a reuse is priced against that path only. Slower than greedy,
// so it is used where an update must fit a unit's limit (fitUpdate); pack() stays the kit's greedy packer.
const gammaBits = (v: number) => 2 * (31 - Math.clz32(v))
const lengthBits = (count: number, off: number) => { const length = count - (off > FAR ? 2 : 1); return length <= 3 ? 2 : 2 + gammaBits(length - 2) }
const shortest = (off: number) => (off > FAR ? 3 : 2)
const LITERAL = 0, REUSED = 1, MATCH = 2

function optimal(d: Uint8Array, w: Writer) {
  const n = d.length
  const cost = new Float64Array(n + 1).fill(Infinity), from = new Int32Array(n + 1), kind = new Uint8Array(n + 1)
  const offset = new Int32Array(n + 1), last = new Int32Array(n + 1)
  cost[0] = 0; last[0] = 1
  const reach = (to: number, c: number, at: number, k: number, off: number, lastOff: number) => {
    if (c < cost[to]) { cost[to] = c; from[to] = at; kind[to] = k; offset[to] = off; last[to] = lastOff }
  }
  const bits = Math.max(4, 33 - Math.clz32(n)), mask = (1 << bits) - 1, shift = 32 - bits
  const keys = new Int32Array(mask + 1).fill(-1), heads = new Int32Array(mask + 1), prev = new Int32Array(n)
  const key = (p: number) => d[p] << 16 | d[p + 1] << 8 | d[p + 2]
  const slot = (k: number) => {
    let s = Math.imul(k, 0x9e3779b1) >>> shift
    while (keys[s] !== k && keys[s] !== -1) s = s + 1 & mask
    return s
  }
  for (let i = 0; i < n; i++) {
    const here = cost[i], limit = Math.min(MAXCOUNT, n - i)
    reach(i + 1, here + 9, i, LITERAL, 0, last[i])
    const r = last[i]
    if (r <= i) {
      let len = 0
      while (len < limit && d[i + len] === d[i + len - r]) len++
      for (let c = shortest(r); c <= len; c++) reach(i + c, here + 3 + lengthBits(c, r), i, REUSED, r, r)
    }
    if (i + 3 > n) continue
    const s = slot(key(i))
    let best = 1
    for (let j = keys[s] === -1 ? -1 : heads[s], seen = 0; j >= 0 && seen < OPTIMAL_WINDOW; j = prev[j], seen++) {
      const off = i - j
      if (off > MAXOFF) break
      if (best >= limit || d[j + best] !== d[i + best]) continue
      let len = 0
      while (len < limit && d[j + len] === d[i + len]) len++
      if (len <= best) continue
      const offBits = 9 + gammaBits(off + 767 >> 8)
      for (let c = Math.max(best + 1, shortest(off)); c <= len; c++) reach(i + c, here + offBits + lengthBits(c, off), i, MATCH, off, off)
      best = len
    }
    if (keys[s] === -1) { keys[s] = key(i); prev[i] = -1 } else prev[i] = heads[s]
    heads[s] = i
  }
  const path: number[] = []
  for (let at = n; at > 0; at = from[at]) path.push(at)
  for (let k = path.length - 1, at = 0; k >= 0; at = path[k--]) {
    const to = path[k]
    if (kind[to] === LITERAL) w.literal(d[at])
    else if (kind[to] === MATCH) w.match(offset[to], to - at)
    else w.reuse(offset[to], to - at)
  }
}

/** pack() with the optimal parse: the same bit format and end marker, a smaller stream. */
export function packOptimal(data: Uint8Array): Uint8Array {
  const w = new Writer(data.length + 1 + (data.length + 56 >> 3))
  optimal(data, w)
  w.end()
  return w.out.slice(0, w.n)
}

/** packSection() with the optimal parse. */
export function packSectionOptimal(data: Uint8Array): Uint8Array { return frame(packOptimal(data)) }

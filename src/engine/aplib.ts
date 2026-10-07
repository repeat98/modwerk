// Adapted from Marcel Bierling's independent MIT-licensed firmware-tool codec.
// See /licenses/elektron-firmware-tool.txt. No firmware content is embedded.
const HEADER_SIZE = 8
const OFFSET_BIAS = 767
const FAR_OFFSET = 3328
const MAX_MATCH = 2048
export const MAX_SECTION_SIZE = 16 * 1024 * 1024

function checksum(bytes: Uint8Array): number {
  let sum = 0
  for (const byte of bytes) sum = (sum + byte) >>> 0
  return sum
}

class BitReader {
  private position = 0
  private tag = 0
  private remaining = 0
  private readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) { this.bytes = bytes }
  byte(): number {
    if (this.position >= this.bytes.length) throw new Error('The compressed firmware section is truncated.')
    return this.bytes[this.position++]
  }
  bit(): number {
    if (this.remaining === 0) { this.tag = this.byte(); this.remaining = 8 }
    return (this.tag >>> --this.remaining) & 1
  }
  gamma(): number {
    let value = 1
    for (let pairs = 0; pairs < 26; pairs++) {
      value = value * 2 + this.bit()
      if (this.bit()) return value
    }
    throw new Error('The compressed firmware section contains an invalid length.')
  }
  get consumed(): number { return this.position }
}

export function unpackSection(packed: Uint8Array, limit = MAX_SECTION_SIZE): Uint8Array {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SECTION_SIZE) throw new Error('The firmware section size limit is invalid.')
  if (packed.length < HEADER_SIZE) throw new Error('The compressed firmware section header is truncated.')
  const header = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
  const length = header.getUint32(0)
  if (length !== packed.length - HEADER_SIZE) throw new Error('The compressed firmware section length does not match.')
  const stream = packed.subarray(HEADER_SIZE)
  if (checksum(stream) !== header.getUint32(4)) throw new Error('The compressed firmware section checksum does not match.')
  if (length === 0) return new Uint8Array()
  const reader = new BitReader(stream)
  let output = new Uint8Array(Math.min(4096, limit)), size = 0, lastOffset = 1
  function reserve(count: number) {
    if (size + count > limit) throw new Error('The decompressed firmware section exceeds its size limit.')
    if (size + count > output.length) {
      const larger = new Uint8Array(Math.min(limit, Math.max(size + count, output.length * 2)))
      larger.set(output); output = larger
    }
  }
  for (;;) {
    if (reader.bit()) { reserve(1); output[size++] = reader.byte(); continue }
    const gamma = reader.gamma()
    let offset: number
    if (gamma === 2) offset = lastOffset
    else {
      const low = reader.byte()
      // Native end marker uses a 32-bit wrap of (0x1000002 << 8) + 255.
      if (gamma === 0x1000002 && low === 255) break
      if (gamma < 3 || gamma > Math.floor((limit + OFFSET_BIAS) / 256)) throw new Error('The compressed firmware section contains an invalid offset.')
      offset = gamma * 256 + low - OFFSET_BIAS
      lastOffset = offset
    }
    const shortLength = reader.bit() * 2 + reader.bit()
    const count = (shortLength || reader.gamma() + 2) + (offset > FAR_OFFSET ? 1 : 0) + 1
    if (offset < 1 || offset > size) throw new Error('The compressed firmware section refers outside its decoded data.')
    reserve(count)
    // Copy bytewise: matches may overlap, including a one-byte repeated run.
    for (let i = 0; i < count; i++) { output[size] = output[size - offset]; size++ }
  }
  if (reader.consumed !== stream.length || size === 0) throw new Error('The compressed firmware section has an invalid end marker.')
  return output.slice(0, size)
}

class BitWriter {
  private output: Uint8Array
  private size = HEADER_SIZE
  private tagPosition = 0
  private remaining = 0
  constructor(inputLength: number) { this.output = new Uint8Array(Math.ceil(inputLength * 1.5) + 256) }
  bit(value: number) {
    if (this.remaining === 0) { this.tagPosition = this.size++; this.remaining = 8 }
    if (value & 1) this.output[this.tagPosition] |= 1 << (this.remaining - 1)
    this.remaining--
  }
  byte(value: number) { this.output[this.size++] = value }
  gamma(value: number) {
    for (let bit = 30 - Math.clz32(value); bit >= 0; bit--) { this.bit(value >>> bit); this.bit(bit === 0 ? 1 : 0) }
  }
  finish(): Uint8Array {
    const result = this.output.slice(0, this.size)
    const header = new DataView(result.buffer)
    header.setUint32(0, result.length - HEADER_SIZE)
    header.setUint32(4, checksum(result.subarray(HEADER_SIZE)))
    return result
  }
}

function gammaCost(value: number) { return 2 * (31 - Math.clz32(value)) }
function matchCost(offset: number, length: number, lastOffset: number) {
  const base = length - 1 - (offset > FAR_OFFSET ? 1 : 0)
  return 1 + (offset === lastOffset ? 2 : gammaCost((offset + OFFSET_BIAS) >>> 8) + 8)
    + (base <= 3 ? 2 : 2 + gammaCost(base - 2))
}

// Preserve the native parser's chain order, strict tie handling and reuse state.
// This is packaging only; it runs no emulator or hardware quality gates.
// `maxOffset` bounds how far back a match may reach; the default leaves the search unbounded, as before.
export function packSection(data: Uint8Array, maxOffset = MAX_SECTION_SIZE): Uint8Array {
  const length = data.length
  if (length > MAX_SECTION_SIZE) throw new Error('The firmware section exceeds its size limit.')
  if (!Number.isSafeInteger(maxOffset) || maxOffset < 1) throw new Error('The match distance limit is invalid.')
  if (length === 0) return new Uint8Array(HEADER_SIZE)
  const head = new Int32Array(1 << 17).fill(-1)
  const previous = new Int32Array(length)
  const cost = new Uint32Array(length + 1).fill(0xffffffff)
  const last = new Uint32Array(length + 1)
  const from = new Int32Array(length + 1)
  const offsets = new Uint32Array(length + 1)
  const lengths = new Uint32Array(length + 1)
  cost[0] = 0; last[0] = 1; from[0] = -1
  const hash = (position: number) => ((data[position] << 8) ^ data[position + 1]) & 0x1ffff
  function run(a: number, b: number, cap: number) {
    let count = 0
    while (count < cap && data[a + count] === data[b + count]) count++
    return count
  }
  function relax(position: number, nextCost: number, offset: number, source: number, chosenOffset: number, chosenLength: number) {
    if (nextCost < cost[position]) {
      cost[position] = nextCost; last[position] = offset; from[position] = source
      offsets[position] = chosenOffset; lengths[position] = chosenLength
    }
  }
  for (let i = 0; i < length; i++) {
    const currentCost = cost[i], lastOffset = last[i], cap = Math.min(length - i, MAX_MATCH)
    relax(i + 1, currentCost + 9, lastOffset, i, 0, 0)
    if (i + 1 < length) {
      if (i >= lastOffset) {
        const count = run(i - lastOffset, i, cap), minimum = lastOffset > FAR_OFFSET ? 3 : 2
        for (let size = minimum; size <= count; size++) relax(i + size, currentCost + matchCost(lastOffset, size, lastOffset), lastOffset, i, lastOffset, size)
      }
      let j = head[hash(i)], chain = 2048, longest = 1
      while (j >= 0 && chain-- > 0) {
        const offset = i - j
        if (offset > maxOffset) break // chains run newest first, so every later candidate is further back still
        const count = run(j, i, cap)
        if (count > longest) {
          const minimum = offset > FAR_OFFSET ? 3 : 2
          for (let size = Math.max(longest + 1, minimum); size <= count; size++) relax(i + size, currentCost + matchCost(offset, size, lastOffset), offset, i, offset, size)
          longest = count
          if (count >= cap) break
        }
        j = previous[j]
      }
      const key = hash(i); previous[i] = head[key]; head[key] = i
    }
  }
  const path: number[] = []
  for (let position = length; position > 0; position = from[position]) path.push(position)
  const writer = new BitWriter(length)
  let lastOffset = 1
  for (let i = path.length - 1; i >= 0; i--) {
    const position = path[i], size = lengths[position], offset = offsets[position]
    if (size === 0) { writer.bit(1); writer.byte(data[from[position]]); continue }
    writer.bit(0)
    if (offset === lastOffset) writer.gamma(2)
    else { const raw = offset + OFFSET_BIAS; writer.gamma(raw >>> 8); writer.byte(raw & 255); lastOffset = offset }
    const base = size - 1 - (offset > FAR_OFFSET ? 1 : 0)
    if (base <= 3) { writer.bit(base >>> 1); writer.bit(base) }
    else { writer.bit(0); writer.bit(0); writer.gamma(base - 2) }
  }
  writer.bit(0); writer.gamma(0x1000002); writer.byte(255)
  return writer.finish()
}

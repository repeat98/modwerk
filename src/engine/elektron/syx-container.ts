// SPDX-License-Identifier: GPL-3.0-or-later
// Elektron OS .syx files of the ELE3 family (Digitakt mk1 and II, Digitone mk1, Analog Rytm MKII, Analog Four MKII,
// Model:Cycles, Model:Samples): read one, rebuild it with a new main OS, and verify the result.
//
// The writer changes one thing: the stored bytes of the machine's main OS section. Every other section's stored
// bytes, the ELE3 header (but its 4-character version field) and the framing messages (but their message count) are
// the stock file's. A sealed machine (trailer 'hmac') gets a 32-byte HMAC-SHA256 of the container after its last
// section, keyed from the stock file's own bootstrap (sealKey). verify() re-reads an output with the reader, not the
// writer, and refuses it unless every other section is stock and the main OS depacks, in place as the bootloader
// depacks it, to the expected image.
import { ascii, be32, byteSum, concat, decodeAscii, equal, find, hmacSha256, putU32, sha, sha256, u32 } from './bytes.ts'
import { packSection } from './codec/pack.ts'
import { BIAS, Bits, FAR, Out, REUSE, depackSection } from './codec/depack.ts'
import { CHUNK_SIZE, FIRST_COUNTER, MFR, contentChecksum, encodeSyx, packetChecksum } from './codec/transport.ts'
import { type Device, versionAt } from './devices.ts'
import { hexw, repr } from './py.ts'

export const COUNT_OFF = 0x1c, TABLE_OFF = 0x20, ENTRY_SZ = 16
/** The HMAC-SHA256 trailer of a sealed machine. */
export const DIGEST = 32

export class SyxError extends Error {}

/** A section table entry: [section id, offset, stored length, destination]. */
export type Entry = [number, number, number, number]

/** The F0..F7 messages of a .syx file. */
function splitMessages(raw: Uint8Array): Uint8Array[] {
  const messages: Uint8Array[] = []
  for (let at = 0; at < raw.length;) {
    if (raw[at] !== 0xf0) throw new SyxError(`byte ${at} is not F0`)
    const end = raw.indexOf(0xf7, at)
    if (end < 0) throw new SyxError(`message at ${at} has no F7`)
    messages.push(raw.subarray(at, end + 1))
    at = end + 1
  }
  return messages
}

/** The data messages' payloads (bytes 10..125), 7-bit groups each led by their high bits, as one byte stream. */
function decodePayloads(messages: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(messages.length * 116)
  let n = 0
  for (const message of messages) {
    const payload = message.subarray(10, 126)
    for (let k = 0; k < payload.length;) {
      const highs = payload[k++]
      for (let bit = 6; bit >= 0 && k < payload.length; bit--) out[n++] = payload[k++] | (((highs >> bit) & 1) << 7)
    }
  }
  return out.subarray(0, n)
}

/** How a section is stored: a packed stream (length, byte sum, stream), raw with an empty header, or raw. */
export function classify(raw: Uint8Array): 'packed' | 'raw-header' | 'raw' {
  if (raw.length < 8) return 'raw'
  const length = u32(raw, 0), sum = u32(raw, 4)
  if (length + 8 <= raw.length && byteSum(raw, 8, 8 + length) === sum) return 'packed'
  return sum === 0 ? 'raw-header' : 'raw'
}

/** A stored section's bytes as the machine loads them. */
export function unstore(raw: Uint8Array): Uint8Array {
  switch (classify(raw)) {
    case 'packed': return depackSection(raw)
    case 'raw-header': return raw.slice(8)
    default: return raw.slice()
  }
}

const isElektron = (m: Uint8Array) => m[1] === MFR[0] && m[2] === MFR[1] && m[3] === MFR[2]

/** A parsed Elektron OS .syx. */
export class Syx {
  readonly raw: Uint8Array
  readonly sha256: string
  readonly framing: [Uint8Array, Uint8Array]
  readonly data: Uint8Array[]
  readonly deviceId: number
  readonly k: number
  readonly total: number
  readonly checksum: number
  readonly container: Uint8Array
  readonly tail: Uint8Array
  readonly header: Uint8Array
  readonly table: Entry[]
  readonly dataStart: number
  readonly stored: Map<number, Uint8Array>
  readonly kind = 'syx'
  readonly seed = null

  constructor(raw: Uint8Array) {
    this.raw = raw
    this.sha256 = sha(raw)
    const messages = splitMessages(raw)
    const first = messages[0], last = messages[messages.length - 1]
    if (messages.length < 3 || first.length !== 16 || last.length !== 16) throw new SyxError('no 16-byte framing messages at both ends')
    this.framing = [first, last]
    this.data = messages.slice(1, -1)
    if (this.data.some(m => m.length !== 128)) throw new SyxError('a data message is not 128 bytes')
    if (!messages.every(isElektron)) throw new SyxError('manufacturer id is not Elektron')
    this.deviceId = first[4]
    this.k = first[8]
    const stream = decodePayloads(this.data)
    if (stream.length < 8) throw new SyxError('no ELE3 container')
    this.total = u32(stream, 0)
    this.checksum = u32(stream, 4)
    if (!equal(stream.subarray(8, 12), ascii('ELE3')) || 8 + this.total > stream.length) throw new SyxError('no ELE3 container')
    this.container = stream.slice(8, 8 + this.total)
    this.tail = stream.slice(8 + this.total)
    this.header = this.container.slice(0, COUNT_OFF)
    const count = u32(this.container, COUNT_OFF)
    if (count <= 0 || count > 16 || TABLE_OFF + count * ENTRY_SZ > this.total) throw new SyxError(`${count} sections: not a table this container can hold`)
    this.table = Array.from({ length: count }, (_, i): Entry => {
      const at = TABLE_OFF + ENTRY_SZ * i
      return [u32(this.container, at), u32(this.container, at + 4), u32(this.container, at + 8), u32(this.container, at + 12)]
    })
    this.dataStart = Math.min(...this.table.map(entry => entry[1]))
    if (TABLE_OFF + count * ENTRY_SZ > this.dataStart) throw new SyxError(`${count} sections do not fit the table`)
    this.stored = new Map()
    for (const [id, offset, length] of this.table) {
      if (this.stored.has(id) || offset + length > this.total) throw new SyxError(`section ${id}: duplicate or outside the container`)
      this.stored.set(id, this.container.subarray(offset, offset + length))
    }
  }

  get versionAt(): number { return versionAt(this.deviceId) }

  get version(): string { return decodeAscii(this.header.subarray(this.versionAt, this.versionAt + 4)) }

  /** A section's bytes as the machine loads them. */
  section(id: number): Uint8Array {
    const stored = this.stored.get(id)
    if (!stored) throw new Error(`KeyError: ${id}`)
    return unstore(stored)
  }
}

const zeros = (n: number) => new Uint8Array(n)
const padTo = (n: number, unit: number) => (unit - (n % unit)) % unit

/** A main OS image as its stored section, with zeros to a multiple of 4 as Elektron stores a packed section (the
 * table's length counts them, the section header's does not). */
export function packMain(image: Uint8Array): Uint8Array {
  const section = packSection(image)
  return section.length % 4 ? concat([section, zeros(padTo(section.length, 4))]) : section
}

/** A sealed machine's HMAC key, derived from `stock` as its bootstrap derives it: in the section dev.hmacKeyFrom
 * names, the seed text, a NUL and a 32-byte constant C; the key is C ^ sha256(seed) ^ sha256(reversed seed). */
export function sealKey(stock: Syx, dev: Device): Uint8Array {
  const [id, seedText] = dev.hmacKeyFrom!
  const seed = ascii(seedText), section = stock.section(id)
  const marker = concat([seed, Uint8Array.of(0)])
  const at = find(section, marker)
  if (at < 0 || find(section, marker, at + 1) >= 0) throw new SyxError(`section ${id} does not hold the seal seed once`)
  const constant = section.subarray(at + marker.length, at + marker.length + DIGEST)
  if (constant.length !== DIGEST) throw new SyxError(`section ${id} ends inside the seal constant`)
  const forward = sha256(seed), backward = sha256(seed.slice().reverse())
  return constant.map((x, i) => x ^ forward[i] ^ backward[i])
}

/** The .syx bytes of `stock` with its main OS section's stored bytes replaced by `storedMain` and, if given, its
 * ELE3 version field set. */
export function write(stock: Syx, storedMain: Uint8Array, dev: Device, version: string | null = null): Uint8Array {
  if (dev.trailer !== null && dev.trailer !== 'hmac') throw new SyxError(`${dev.name} files are sealed (${dev.trailer}); the builder cannot write them`)
  const key = dev.trailer === 'hmac' ? sealKey(stock, dev) : null
  if (key && !equal(hmacSha256(key, stock.container.subarray(0, -DIGEST)), stock.container.subarray(-DIGEST)))
    throw new SyxError('the stock file\'s seal does not verify with the key its bootstrap gives')
  const header = stock.header.slice()
  if (version !== null) {
    const field = ascii(version)
    if (field.length !== 4) throw new SyxError('the version field is exactly 4 characters')
    header.set(field, dev.versionAt)
  }
  // the table area as stock has it, the header and each entry rewritten for the sections that follow it
  const head = stock.container.slice(0, stock.dataStart)
  head.set(header, 0)
  const parts: Uint8Array[] = [head]
  let length = head.length
  stock.table.forEach(([id, , , destination], i) => {
    const bytes = id === dev.mainSection ? storedMain : stock.stored.get(id)!
    const at = TABLE_OFF + ENTRY_SZ * i
    for (const [k, value] of [id, length, bytes.length, destination].entries()) putU32(head, at + 4 * k, value)
    const pad = padTo(length + bytes.length, 16)
    parts.push(bytes, zeros(pad))
    length += bytes.length + pad
  })
  let container = concat(parts)
  if (key) container = concat([container, hmacSha256(key, container)])
  return encodeSyx(concat([be32(container.length, contentChecksum(container)), container]), stock.deviceId, stock.framing[0], stock.framing[1])
}

/** The main OS depacked as the bootloader depacks it in place: the stored section staged at dev.stage and the
 * output written from dev.mainLoad over it. The image, and the smallest distance in bytes between the writer and
 * the next unread stream byte: above 0 throughout, the in-place result equals depacking anywhere else. */
export function inplaceDepack(stored: Uint8Array, dev: Device): [Uint8Array, number | null] {
  const length = u32(stored, 0)
  const bits = new Bits(stored, 8, 8 + length)
  const out = new Out(Math.max(1 << 16, length * 3))
  const streamOffset = dev.stage! - dev.mainLoad
  let gap: number | null = null
  const closer = (distance: number) => { if (gap === null || distance < gap) gap = distance }
  let lastOffset = 1
  for (;;) {
    if (bits.bit()) {
      closer(streamOffset + bits.p - out.n)
      out.push(bits.byte())
      continue
    }
    const g = bits.gamma()
    let offset: number
    if (g === REUSE) offset = lastOffset
    else {
      const raw = (g * 256 + bits.byte()) >>> 0
      if (raw === BIAS) break
      offset = lastOffset = (raw - BIAS) >>> 0
    }
    const short = 2 * bits.bit() + bits.bit()
    const n = (short || bits.gamma() + 2) + (offset > FAR ? 1 : 0)
    if (offset === 0 || offset > out.n) throw new SyxError('the main OS: a match reaches before the output')
    closer(streamOffset + bits.p - (out.n + n)) // the last byte this match writes
    out.copy(offset, n + 1)
  }
  if (bits.p !== 8 + length) throw new SyxError('the main OS: the end marker is not at the declared length')
  return [out.bytes(), gap]
}

const hx = (n: number, width = 8) => '0x' + hexw(n, width)
const count = (m: Uint8Array) => (m[12] << 14) | (m[13] << 7) | m[14]

export type Section = { stored: number; stored_sha256: string; stock: boolean }
/** What verify reports (the manifest's "output"), in the manifest's key order. */
export type Facts = Record<string, any> & { sections: Map<string, Section> }

/** Throws SyxError unless `out` is `stock` with only the main OS changed and that depacks in place to `wantMain`;
 * the facts of the file otherwise. */
export function verify(out: Uint8Array, stock: Syx, wantMain: Uint8Array, dev: Device, version: string | null = null): Facts {
  const o = new Syx(out)
  const main = dev.mainSection
  for (const m of o.data) if (m[4] !== stock.deviceId) throw new SyxError(`a data message has device id 0x${hexw(m[4], 2)}`)
  const failing = o.data.filter(m => packetChecksum(m.subarray(1, -1), o.k) !== m[m.length - 2]).length
  if (failing) throw new SyxError(`${failing} data messages fail their checksum`)
  o.data.forEach((m, i) => {
    const counter = (m[7] << 14) | (m[8] << 7) | m[9]
    if (counter !== FIRST_COUNTER + i) throw new SyxError(`data message ${i} carries counter ${counter}`)
  })
  o.framing.forEach((frame, i) => {
    if (count(frame) !== o.data.length) throw new SyxError(`framing count ${count(frame)} != ${o.data.length} data messages`)
    const stockFrame = stock.framing[i]
    if (!equal(frame.subarray(0, 12), stockFrame.subarray(0, 12)) || !equal(frame.subarray(15), stockFrame.subarray(15))) throw new SyxError('a framing message differs from stock beyond its count')
  })
  const checksum = contentChecksum(o.container)
  if (checksum !== o.checksum) throw new SyxError(`content checksum 0x${hexw(checksum)} != preamble 0x${hexw(o.checksum)}`)
  if (o.tail.length >= CHUNK_SIZE || o.tail.some(x => x !== 0)) throw new SyxError(`${o.tail.length} bytes after the container, or not zero`)
  const layout = (table: Entry[]) => table.map(([id, , , destination]) => `${id}:${destination}`).join(',')
  if (layout(o.table) !== layout(stock.table)) throw new SyxError('section order or destinations differ from stock')
  let at = stock.dataStart
  for (const [id, offset, length] of o.table) {
    if (offset !== at) throw new SyxError(`section ${id} at 0x${offset.toString(16)}, not 0x${at.toString(16)}`)
    at = offset + length + padTo(offset + length, 16)
  }
  if (dev.trailer === 'hmac') {
    if (o.total !== at + DIGEST) throw new SyxError(`container length ${o.total} is not the 16-aligned end ${at} and the seal`)
    if (!equal(hmacSha256(sealKey(stock, dev), o.container.subarray(0, -DIGEST)), o.container.subarray(-DIGEST))) throw new SyxError('the HMAC trailer does not verify')
  } else if (o.total !== at) {
    throw new SyxError(`container length ${o.total} is not the 16-aligned end ${at}`)
  }
  if (dev.flashAt + o.total > dev.flashLimit) throw new SyxError(`the container ends at flash 0x${(dev.flashAt + o.total).toString(16)} > 0x${dev.flashLimit.toString(16)}`)
  const changed = [...Array(COUNT_OFF).keys()].filter(i => o.header[i] !== stock.header[i])
  if (changed.some(i => i < dev.versionAt || i >= dev.versionAt + 4)) throw new SyxError(`ELE3 header differs outside the version field: ${repr(changed)}`)
  if (version !== null && o.version !== version) throw new SyxError(`version field ${repr(o.version)}, not ${repr(version)}`)
  const afterEntries = (s: Syx) => s.container.subarray(TABLE_OFF + ENTRY_SZ * s.table.length, stock.dataStart)
  if (!equal(afterEntries(o), afterEntries(stock))) throw new SyxError('the table area after the entries differs from stock')
  for (const id of stock.stored.keys()) {
    if (id === main) continue
    if (!o.stored.has(id) || !equal(o.stored.get(id)!, stock.stored.get(id)!)) throw new SyxError(`section ${id} is not stock`)
    if (!equal(o.section(id), stock.section(id))) throw new SyxError(`section ${id} does not depack as stock`)
  }
  const stored = o.stored.get(main)!
  if (classify(stored) !== 'packed') throw new SyxError('the main OS is not a packed stream with a valid byte sum')
  const [image, gap] = inplaceDepack(stored, dev)
  if (!equal(image, wantMain)) throw new SyxError('the main OS does not depack to the patched image')
  if (!equal(depackSection(stored), image)) throw new SyxError('the main OS: the depacker disagrees with the in-place depack')
  if (gap! <= 0) throw new SyxError(`the main OS: the in-place depack overwrites unread input (gap ${gap})`)
  // sections in table order, keyed by id: a Map keeps the order a plain object would sort
  const sections = new Map<string, Section>(o.table.map(([id, , length]) => [String(id), { stored: length, stored_sha256: sha(o.stored.get(id)!), stock: id !== main }]))
  return {
    sha256: sha(out), bytes: out.length, messages: o.data.length + 2,
    content_checksum: hx(o.checksum), container_len: o.total,
    flash_end: hx(dev.flashAt + o.total, 6),
    flash_headroom: dev.flashLimit - dev.flashAt - o.total,
    ele3_version: o.version,
    main: { section: main, stored: stored.length, image: image.length, sha256: sha(image), staged_to: hx(dev.stage! + stored.length), inplace_min_gap: gap },
    sections,
  }
}

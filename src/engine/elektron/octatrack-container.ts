// SPDX-License-Identifier: GPL-3.0-or-later
// The Octatrack's OS files: the ELEK container, carried either by the legacy SysEx transport (.syx) or by the
// ELUP card file (.bin). Read one, rebuild it with a new main OS, verify the result. The card file's checksum and
// word cipher are as elektron-firmware-tool (MIT) documents them. Rebuilding the stock 1.40C files from their own
// main OS reproduces both byte for byte.
import { ascii, byteSum, concat, decodeAscii, equal, putU32, sha, u32 } from './bytes.ts'
import { packSection } from './codec/pack.ts'
import { depackSection } from './codec/depack.ts'
import type { Device } from './devices.ts'
import { hexw, repr, type Loose } from './py.ts'

const ELEK = ascii('ELEK'), ELUP = ascii('ELUP')
/** Where the main OS section (its [length][byte sum] header, then the stream) starts. */
export const SECT = 0x12
/** The header's ten-character version field. */
export const VERSION: [number, number] = [0x08, 0x12]
const CHUNK = 63
const FIRST_OFFSET = 0x4000
const ELEKTRON = [0x00, 0x20, 0x3c]
const KEYS = { lowXor: 0x9e3b16a2, highXor: 0x764e28ca, lowMix: 0x360fa955, highMix: 0xef4a9ab6 }
const DEFAULT_SEED = 0x2f1349d2

export class ElekError extends Error {}

// The legacy SysEx transport: data messages of up to 63 bytes, each with its flash offset as six nibbles and a
// checksum, then an empty data message and an end marker carrying the length.

const toNibbles = (v: number) => [20, 16, 12, 8, 4, 0].map(shift => (v >>> shift) & 0xf)
const fromNibbles = (nibbles: ArrayLike<number>) => Array.from(nibbles).reduce((v, x) => (v << 4) | x, 0)

export function packetChecksum(data: Uint8Array, nib: ArrayLike<number>): number {
  return (byteSum(data) + (nib[1] & 7) + nib[3] + nib[5] + ((nib[2] + nib[4]) << 4)) & 0xff
}

/** 8-in-7: each group of up to seven bytes led by a byte of their high bits. Elektron's encoder works in a 63-byte
 * buffer that keeps the previous message's bytes past a short final group, and that group's marker carries their
 * high bits too: `previous` is that buffer's earlier content. */
function encode87(data: Uint8Array, previous: Uint8Array): number[] {
  const buffer = new Uint8Array(CHUNK)
  buffer.set(previous.subarray(0, CHUNK))
  buffer.set(data)
  const out: number[] = []
  for (let group = 0; group < data.length; group += 7) {
    let marker = 0
    for (let n = 0; n < 7 && group + n < CHUNK; n++) if (buffer[group + n] & 0x80) marker |= 0x40 >> n
    out.push(marker, ...Array.from(data.subarray(group, group + 7), x => x & 0x7f))
  }
  return out
}

function decode87(payload: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let k = 0; k < payload.length;) {
    const highs = payload[k++]
    for (let bit = 6; bit >= 0 && k < payload.length; bit--) out.push(payload[k++] | (((highs >> bit) & 1) << 7))
  }
  return Uint8Array.from(out)
}

export function encodeSyx(container: Uint8Array, devId: number): Uint8Array {
  const head = [0xf0, ...ELEKTRON, devId, 0x00]
  const out: number[] = []
  let previous: Uint8Array = new Uint8Array(0)
  for (let offset = 0; offset < container.length; offset += CHUNK) {
    const data = container.subarray(offset, offset + CHUNK)
    const nibbles = toNibbles(FIRST_OFFSET + offset)
    const checksum = packetChecksum(data, nibbles)
    out.push(...head, 0x7e, checksum >> 4, checksum & 0xf, ...nibbles, ...encode87(data, previous), 0xf7)
    previous = data
  }
  out.push(...head, 0x7e, 0xf7, ...head, 0x7f, ...toNibbles(container.length), 0xf7)
  return Uint8Array.from(out)
}

/** The device id and the container a .syx carries, every message checked. */
export function decodeSyx(raw: Uint8Array): [number, Uint8Array] {
  const messages: Uint8Array[] = []
  for (let at = 0; at < raw.length;) {
    if (raw[at] !== 0xf0) throw new ElekError(`byte ${at} is not F0`)
    const end = raw.indexOf(0xf7, at)
    if (end < 0) throw new ElekError(`the message at ${at} has no F7`)
    messages.push(raw.subarray(at, end + 1))
    at = end + 1
  }
  if (messages.length < 3) throw new ElekError('too few messages for an OS file')
  const dev = messages[0].length > 4 ? messages[0][4] : -1
  messages.forEach((m, n) => {
    if (m[1] !== ELEKTRON[0] || m[2] !== ELEKTRON[1] || m[3] !== ELEKTRON[2] || m[4] !== dev || m[5] !== 0)
      throw new ElekError(`message ${n}: not an Elektron message for device 0x${hexw(dev, 2)}`)
  })
  const data = messages.slice(0, -2), empty = messages[messages.length - 2], marker = messages[messages.length - 1]
  if (!equal(empty, Uint8Array.of(0xf0, ...ELEKTRON, dev, 0, 0x7e, 0xf7))) throw new ElekError('no empty data message before the end marker')
  if (marker.length !== 14 || marker[6] !== 0x7f) throw new ElekError('no end marker')
  const parts: Uint8Array[] = []
  let length = 0
  data.forEach((m, n) => {
    if (m[6] !== 0x7e || m.length < 17) throw new ElekError(`message ${n} is not a data message`)
    const nibbles = m.subarray(9, 15)
    if (m.subarray(7, 15).some(x => x > 0xf)) throw new ElekError(`message ${n}: a nibble field over 0xF`)
    const offset = fromNibbles(nibbles)
    if (offset !== FIRST_OFFSET + length) throw new ElekError(`message ${n} carries offset 0x${offset.toString(16)}, not 0x${(FIRST_OFFSET + length).toString(16)}`)
    const bytes = decode87(m.subarray(15, -1))
    if (bytes.length <= 0 || bytes.length > CHUNK || (bytes.length < CHUNK && n !== data.length - 1)) throw new ElekError(`message ${n} carries ${bytes.length} bytes`)
    if (packetChecksum(bytes, nibbles) !== ((m[7] << 4) | m[8])) throw new ElekError(`message ${n} fails its checksum`)
    parts.push(bytes)
    length += bytes.length
  })
  const declared = fromNibbles(marker.subarray(7, 13))
  if (declared !== length) throw new ElekError(`the end marker says ${declared} bytes, the messages carry ${length}`)
  return [dev, concat(parts)]
}

// The ELUP card file: 'ELUP', a seed, then the container's length and words, each enciphered with the previous
// cipher word as its key, and the enciphered sum of the plain words.

const swapHalves = (v: number) => ((v << 16) | (v >>> 16)) >>> 0
const swapBytes = (v: number) => (((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24)) >>> 0
const highKey = (key: number) => (key & 0x800000) !== 0

function encipher(key: number, word: number): number {
  return highKey(key) ? (swapBytes((word ^ key ^ KEYS.highMix) >>> 0) ^ KEYS.highXor) >>> 0 : (swapHalves((word ^ key ^ KEYS.lowMix) >>> 0) ^ KEYS.lowXor) >>> 0
}

function decipher(key: number, word: number): number {
  return highKey(key) ? (key ^ KEYS.highMix ^ swapBytes((word ^ KEYS.highXor) >>> 0)) >>> 0 : (key ^ KEYS.lowMix ^ swapHalves((word ^ KEYS.lowXor) >>> 0)) >>> 0
}

export function encodeBin(container: Uint8Array, seed: number): Uint8Array {
  const body = concat([container, new Uint8Array((4 - (container.length % 4)) % 4)])
  const plainWords = [body.length, ...Array.from({ length: body.length / 4 }, (_, i) => u32(body, 4 * i))]
  const out = new Uint8Array(8 + 4 * (plainWords.length + 1))
  out.set(ELUP, 0)
  putU32(out, 4, seed)
  let key = seed >>> 0, sum = 0
  plainWords.forEach((word, i) => {
    key = encipher(key, word)
    putU32(out, 8 + 4 * i, key)
    sum = (sum + word) >>> 0
  })
  putU32(out, 8 + 4 * plainWords.length, encipher(key, sum))
  return out
}

/** The seed and the container (padded to 4) a card file carries, its checksum checked. */
export function decodeBin(raw: Uint8Array): [number, Uint8Array] {
  if (!equal(raw.subarray(0, 4), ELUP) || raw.length % 4 || raw.length < 16) throw new ElekError('not an ELUP card file')
  const words = raw.length / 4, seed = u32(raw, 4)
  const plain = new Uint8Array(4 * (words - 3))
  let key = seed, sum = 0
  for (let w = 2; w < words - 1; w++) {
    const cipher = u32(raw, 4 * w), word = decipher(key, cipher)
    putU32(plain, 4 * (w - 2), word)
    sum = (sum + word) >>> 0
    key = cipher
  }
  if (decipher(key, u32(raw, 4 * (words - 1))) !== sum) throw new ElekError('the card file fails its checksum')
  const declared = u32(plain, 0)
  if (declared !== plain.length - 4) throw new ElekError(`the card file declares ${declared} bytes and carries ${plain.length - 4}`)
  return [seed, plain.slice(4)]
}

/** str.strip() of ASCII text, as Python strips it. */
// eslint-disable-next-line no-control-regex -- Python strips these control characters as whitespace
const strip = (s: string) => s.replace(/^[ \t\n\r\x0b\x0c\x1c-\x1f]+|[ \t\n\r\x0b\x0c\x1c-\x1f]+$/g, '')

/** A parsed Octatrack OS file, from its .syx or its .bin. */
export class ElekFile {
  readonly raw: Uint8Array
  readonly sha256: string
  readonly kind: 'syx' | 'bin'
  readonly seed: number | null
  readonly deviceId: number | null
  readonly container: Uint8Array
  readonly header: Uint8Array
  readonly stored: Map<number, Uint8Array>
  readonly tail: Uint8Array
  readonly table: [number, number, number, number][]

  constructor(raw: Uint8Array) {
    this.raw = raw
    this.sha256 = sha(raw)
    const isBin = equal(raw.subarray(0, 4), ELUP)
    this.kind = isBin ? 'bin' : 'syx'
    let container: Uint8Array
    if (isBin) { [this.seed, container] = decodeBin(raw); this.deviceId = null } else { [this.deviceId, container] = decodeSyx(raw); this.seed = null }
    if (!equal(container.subarray(0, 4), ELEK) || container.length < SECT + 8) throw new ElekError('no ELEK container')
    const length = u32(container, SECT), sum = u32(container, SECT + 4)
    if (SECT + 8 + length > container.length) throw new ElekError('the section runs past the container')
    if (byteSum(container, SECT + 8, SECT + 8 + length) !== sum) throw new ElekError('the section fails its byte sum')
    this.container = container
    this.header = container.slice(0, SECT)
    this.stored = new Map([[3, container.subarray(SECT, SECT + 8 + length)]])
    this.tail = container.slice(SECT + 8 + length)
    this.table = [[3, SECT, 8 + length, 0]]
  }

  get build(): string { return decodeAscii(this.header.subarray(4, 8)) }
  get version(): string { return strip(decodeAscii(this.header.subarray(VERSION[0], VERSION[1]))) }

  section(sid: number): Uint8Array {
    if (sid !== 3) throw new ElekError('an ELEK container has one section, the main OS')
    return depackSection(this.stored.get(3)!)
  }
}

/** The header's version bytes: the name right-justified, padded with spaces. */
export function versionField(dev: Device, version: string): Uint8Array {
  const name = ascii(version)
  if (name.length <= 0 || name.length > dev.versionLen) throw new ElekError(`the version is 1 to ${dev.versionLen} ASCII characters`)
  const field = new Uint8Array(dev.versionLen).fill(0x20)
  field.set(name, dev.versionLen - name.length)
  return field
}

/** The ELEK container: `stock`'s header (its version field set, if given), the new section, padded to even length. */
export function container(stock: ElekFile, storedMain: Uint8Array, dev: Device, version: string | null = null): Uint8Array {
  const header = stock.header.slice()
  if (version !== null) header.set(versionField(dev, version), VERSION[0])
  const body = concat([header, storedMain])
  return concat([body, new Uint8Array(body.length % 2)])
}

/** `stock` with its main OS replaced, as a .syx and as a card file. */
export function write(stock: ElekFile, storedMain: Uint8Array, dev: Device, version: string | null = null, seed: number | null = null) {
  const body = container(stock, storedMain, dev, version)
  return { syx: encodeSyx(body, stock.deviceId ?? dev.sysexId), bin: encodeBin(body, seed ?? stock.seed ?? DEFAULT_SEED) }
}

const hx = (n: number, width = 8) => '0x' + hexw(n, width)

/** Throws ElekError unless every output is `stock` with only the main OS (and the version field) changed, the main
 * OS depacks to `wantMain` and the protected ranges are stock's; the facts of the outputs otherwise. */
export function verify(outputs: Record<string, Uint8Array>, stock: ElekFile, wantMain: Uint8Array, dev: Device, stockMain: Uint8Array, version: string | null = null) {
  const o = new ElekFile(outputs.syx)
  if (o.deviceId !== dev.sysexId) throw new ElekError(`device id 0x${hexw(o.deviceId!, 2)}, not 0x${hexw(dev.sysexId, 2)}`)
  const changed = [...Array(SECT).keys()].filter(i => o.header[i] !== stock.header[i])
  if (changed.some(i => i < VERSION[0] || i >= VERSION[1])) throw new ElekError(`the ELEK header differs outside the version field: ${repr(changed)}`)
  if (version !== null && !equal(o.header.subarray(VERSION[0], VERSION[1]), versionField(dev, version))) throw new ElekError(`the version field is ${repr(o.version)}, not ${repr(version)}`)
  if (o.tail.some(x => x !== 0) || o.container.length % 2) throw new ElekError('the container\'s padding is not zeros to an even length')
  const image = o.section(3)
  if (!equal(image, wantMain)) throw new ElekError('the main OS does not depack to the patched image')
  for (const [lo, hi, why] of dev.protected) {
    const a = lo - dev.mainLoad, b = hi - dev.mainLoad
    if (!equal(image.subarray(a, b), stockMain.subarray(a, b))) throw new ElekError(`${hx(lo)}-${hx(hi)} (${why}) is not stock`)
  }
  const budget = dev.flashLimit - dev.flashAt
  if (o.container.length > budget) throw new ElekError(`the container is ${o.container.length} bytes; the OS region in flash holds ${budget}`)
  const stored = o.stored.get(3)!
  const facts: Record<string, Loose> = {
    sha256: sha(outputs.syx), bytes: outputs.syx.length, messages: outputs.syx.filter(x => x === 0xf7).length,
    container_len: o.container.length, flash_end: hx(dev.flashAt + o.container.length, 6),
    flash_headroom: budget - o.container.length, version: o.version,
    main: { section: 3, stored: stored.length, image: image.length, sha256: sha(image), inplace_min_gap: null, inplace: 'not simulated: where the bootloader unpacks from is unknown' },
    untouched: ['the container header but for the version', ...dev.protected.map(([lo, hi, why]) => `${why} (${hx(lo)}-${hx(hi)})`)],
    sections: new Map([['3', { stored: stored.length, stored_sha256: sha(stored), stock: false }]]),
  }
  if ('bin' in outputs) {
    const [seed, carried] = decodeBin(outputs.bin)
    if (!equal(carried, concat([o.container, new Uint8Array((4 - (o.container.length % 4)) % 4)]))) throw new ElekError('the card file does not carry the same container as the .syx')
    facts.bin = { sha256: sha(outputs.bin), bytes: outputs.bin.length, seed: hx(seed) }
  }
  return facts
}

export const packMain = (image: Uint8Array): Uint8Array => packSection(image)

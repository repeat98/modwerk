// SPDX-License-Identifier: GPL-3.0-or-later
// ELE3 containers in Digitakt / Digitone mk1 OS files: read, rebuild with a new main OS, verify.
// The layout follows elektron-firmware-tool (MIT) and digikit / elekloader (GPL-2.0-or-later). A rebuild changes only
// the main OS section's stored bytes, the 4-character version field and the framing messages' count; everything else
// is copied from the owner's own stock file. No firmware content is embedded here.
import { packSection, unpackSection } from '../aplib.ts'
import { CHUNK_SIZE, FIRST_COUNTER, contentChecksum, decodeDataMessages, encodeSyx, framingCount, packetChecksum, splitMessages } from './sysex.ts'

const COUNT_OFFSET = 0x1c, TABLE_OFFSET = 0x20, ENTRY_SIZE = 16, VERSION_FIELD = [0x14, 0x18] as const
const OFFSET_BIAS = 767, FAR_OFFSET = 3328
// Elektron's own ELE3 streams never reach further back than 1 MiB, and each packed section is stored with zeros up to a
// 4-byte boundary that its table length counts (dn2_firmware_explore, docs/ele3-format.md and codec/limits.py; the same
// holds for Model:Cycles 1.13). Builds without either still boot through the normal update, but images like that have
// stalled in the startup-menu recovery flash, so packMain stays inside both.
export const MATCH_WINDOW = 1 << 20

export type Ele3Device = { mainSection: number; mainLoad: number; stage: number; flashAt: number; flashLimit: number; sysexId: number }

// Facts about each machine's container and loader, from public research (elekloader device profiles).
export const ELE3_DEVICES: Record<'digitakt' | 'digitone', Ele3Device> = {
  digitakt: { mainSection: 3, mainLoad: 0x40000400, stage: 0x40200000, flashAt: 0x80000, flashLimit: 0x380000, sysexId: 0x0a },
  digitone: { mainSection: 3, mainLoad: 0x40000400, stage: 0x40200000, flashAt: 0x80000, flashLimit: 0x380000, sysexId: 0x0d },
}

export type Ele3Section = { id: number; offset: number; length: number; destination: number }
export type Ele3File = {
  raw: Uint8Array; deviceId: number; transferConstant: number; framing: [Uint8Array, Uint8Array]; dataMessages: Uint8Array[]
  total: number; checksum: number; container: Uint8Array; tail: Uint8Array; header: Uint8Array
  table: Ele3Section[]; dataStart: number; stored: Map<number, Uint8Array>; version: string
}

const u32 = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at)
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index])

export function readEle3Syx(raw: Uint8Array): Ele3File {
  const messages = splitMessages(raw)
  if (messages.length < 3 || messages[0].length !== 16 || messages[messages.length - 1].length !== 16) throw new Error('The file has no 16-byte framing messages at both ends.')
  const dataMessages = messages.slice(1, -1)
  if (dataMessages.some(message => message.length !== 128)) throw new Error('A data message is not 128 bytes long.')
  if (messages.some(message => message[1] !== 0x00 || message[2] !== 0x20 || message[3] !== 0x3c)) throw new Error('The manufacturer is not Elektron.')
  const decoded = decodeDataMessages(dataMessages)
  const total = u32(decoded, 0), checksum = u32(decoded, 4)
  if (String.fromCharCode(...decoded.subarray(8, 12)) !== 'ELE3' || 8 + total > decoded.length) throw new Error('The file holds no ELE3 container.')
  const container = decoded.slice(8, 8 + total)
  const count = u32(container, COUNT_OFFSET)
  if (count < 1 || count > 16 || TABLE_OFFSET + count * ENTRY_SIZE > total) throw new Error('The section table is not valid.')
  const table: Ele3Section[] = Array.from({ length: count }, (_, index) => {
    const at = TABLE_OFFSET + index * ENTRY_SIZE
    return { id: u32(container, at), offset: u32(container, at + 4), length: u32(container, at + 8), destination: u32(container, at + 12) }
  })
  const dataStart = Math.min(...table.map(section => section.offset))
  if (TABLE_OFFSET + count * ENTRY_SIZE > dataStart) throw new Error('The sections overlap the table.')
  const stored = new Map<number, Uint8Array>()
  for (const section of table) {
    if (stored.has(section.id) || section.offset + section.length > total) throw new Error('Section ' + section.id + ' is duplicated or outside the container.')
    stored.set(section.id, container.subarray(section.offset, section.offset + section.length))
  }
  return {
    raw, deviceId: messages[0][4], transferConstant: messages[0][8], framing: [messages[0], messages[messages.length - 1]], dataMessages,
    total, checksum, container, tail: decoded.subarray(8 + total), header: container.subarray(0, COUNT_OFFSET), table, dataStart, stored,
    version: String.fromCharCode(...container.subarray(...VERSION_FIELD)),
  }
}

/** A stored section is packed when its header's length and byte sum hold; it may carry zero padding after the stream. */
export function classifySection(raw: Uint8Array): 'packed' | 'raw-header' | 'raw' {
  if (raw.length < 8) return 'raw'
  const length = u32(raw, 0), sum = u32(raw, 4)
  if (length + 8 <= raw.length) {
    let total = 0
    for (let i = 8; i < 8 + length; i++) total = (total + raw[i]) >>> 0
    if (total === sum) return 'packed'
  }
  return sum === 0 ? 'raw-header' : 'raw'
}

/** The packed stream without its padding, refusing padding that is not zero. */
export function packedStream(raw: Uint8Array): Uint8Array {
  const end = 8 + u32(raw, 0)
  if (raw.subarray(end).some(byte => byte !== 0)) throw new Error('A packed section has nonzero bytes after its stream.')
  return raw.subarray(0, end)
}

export function sectionImage(raw: Uint8Array): Uint8Array {
  const kind = classifySection(raw)
  return kind === 'packed' ? unpackSection(packedStream(raw)) : kind === 'raw-header' ? raw.slice(8) : raw.slice()
}

export function mainImage(file: Ele3File, device: Ele3Device): Uint8Array {
  const stored = file.stored.get(device.mainSection)
  if (!stored) throw new Error('The file has no main OS section.')
  return sectionImage(stored)
}

/** The stock file with the main OS section's stored bytes replaced and, optionally, a new 4-character version. */
export function writeEle3Syx(stock: Ele3File, storedMain: Uint8Array, device: Ele3Device, version?: string): Uint8Array {
  const parts: Uint8Array[] = [stock.container.slice(0, stock.dataStart)]
  const head = parts[0], view = new DataView(head.buffer)
  if (version !== undefined) {
    if (!/^[\x20-\x7e]{4}$/.test(version)) throw new Error('The version shown on the unit is exactly 4 printable characters.')
    head.set(Array.from(version, character => character.charCodeAt(0)), VERSION_FIELD[0])
  }
  let length = stock.dataStart
  stock.table.forEach((section, index) => {
    const data = section.id === device.mainSection ? storedMain : stock.stored.get(section.id)!
    view.setUint32(TABLE_OFFSET + index * ENTRY_SIZE, section.id)
    view.setUint32(TABLE_OFFSET + index * ENTRY_SIZE + 4, length)
    view.setUint32(TABLE_OFFSET + index * ENTRY_SIZE + 8, data.length)
    view.setUint32(TABLE_OFFSET + index * ENTRY_SIZE + 12, section.destination)
    const padded = new Uint8Array(data.length + (-data.length & 15))
    padded.set(data)
    parts.push(padded); length += padded.length
  })
  const container = new Uint8Array(length)
  let at = 0
  for (const part of parts) { container.set(part, at); at += part.length }
  const stream = new Uint8Array(8 + length)
  new DataView(stream.buffer).setUint32(0, length)
  new DataView(stream.buffer).setUint32(4, contentChecksum(container))
  stream.set(container, 8)
  return encodeSyx(stream, stock.deviceId, stock.framing[0], stock.framing[1])
}

/** The main OS packed as Elektron stores it: matches within MATCH_WINDOW, then zeros up to a 4-byte boundary. */
export function packMain(image: Uint8Array): Uint8Array {
  const packed = packSection(image, MATCH_WINDOW), stored = new Uint8Array(packed.length + (-packed.length & 3))
  stored.set(packed)
  return stored
}

/**
 * Depack the main OS as the bootloader does, in place: the stream staged at `stage`, the image written from `mainLoad`
 * over it. Returns the image and the smallest distance between the writer and the next unread stream byte; a distance
 * above zero throughout means the in-place result equals an ordinary depack.
 */
export function inplaceDepack(stored: Uint8Array, device: Ele3Device): { image: Uint8Array; gap: number } {
  const stream = packedStream(stored), length = stream.length - 8, base = device.stage - device.mainLoad
  let position = 8, tag = 0, remaining = 0, lastOffset = 1, gap = Infinity
  const out: number[] = []
  const byte = () => { if (position >= 8 + length) throw new Error('The main OS stream is truncated.'); return stream[position++] }
  const bit = () => { if (remaining === 0) { tag = byte(); remaining = 8 } return (tag >>> --remaining) & 1 }
  const gamma = () => { let value = 1; for (let pairs = 0; pairs < 26; pairs++) { value = value * 2 + bit(); if (bit()) return value } throw new Error('The main OS stream has an invalid length.') }
  for (;;) {
    if (bit()) { gap = Math.min(gap, base + position - out.length); out.push(byte()); continue }
    const g = gamma()
    let offset: number
    if (g === 2) offset = lastOffset
    else {
      const raw = ((g * 256) + byte()) % 0x100000000
      if (raw === OFFSET_BIAS) break
      offset = (raw - OFFSET_BIAS + 0x100000000) % 0x100000000
      lastOffset = offset
    }
    const short = bit() * 2 + bit()
    const count = (short || gamma() + 2) + (offset > FAR_OFFSET ? 1 : 0)
    if (offset === 0 || offset > out.length) throw new Error('A main OS match reaches before the output.')
    gap = Math.min(gap, base + position - (out.length + count))
    for (let i = 0; i <= count; i++) out.push(out[out.length - offset])
  }
  if (position !== 8 + length) throw new Error('The main OS end marker is not at the declared length.')
  return { image: Uint8Array.from(out), gap }
}

export type Ele3BuildFacts = { bytes: number; messages: number; containerLength: number; flashEnd: number; flashHeadroom: number; version: string; mainStored: number; mainImage: number; inplaceGap: number }

/** Refuses unless `output` is `stock` with only the main OS changed, depacking in place to `wantMain`. */
export function verifyEle3Build(output: Uint8Array, stock: Ele3File, wantMain: Uint8Array, device: Ele3Device, version?: string): Ele3BuildFacts {
  const built = readEle3Syx(output)
  if (built.dataMessages.some(message => message[4] !== stock.deviceId)) throw new Error('A data message carries another device id.')
  built.dataMessages.forEach((message, index) => {
    if (packetChecksum(message.subarray(1, 127), built.transferConstant) !== message[126]) throw new Error('Data message ' + index + ' fails its checksum.')
    if (((message[7] << 14) | (message[8] << 7) | message[9]) !== FIRST_COUNTER + index) throw new Error('Data message ' + index + ' carries the wrong counter.')
  })
  built.framing.forEach((message, index) => {
    if (framingCount(message) !== built.dataMessages.length) throw new Error('A framing message counts the wrong number of data messages.')
    const stockFrame = stock.framing[index]
    if (!equal(message.subarray(0, 12), stockFrame.subarray(0, 12)) || !equal(message.subarray(15), stockFrame.subarray(15))) throw new Error('A framing message differs from stock beyond its count.')
  })
  if (contentChecksum(built.container) !== built.checksum) throw new Error('The content checksum does not match the preamble.')
  if (built.tail.length >= CHUNK_SIZE || built.tail.some(byte => byte !== 0)) throw new Error('Bytes after the container are not zero padding.')
  if (built.table.map(s => s.id + ':' + s.destination).join() !== stock.table.map(s => s.id + ':' + s.destination).join()) throw new Error('Section order or destinations differ from stock.')
  let at = stock.dataStart
  for (const section of built.table) {
    if (section.offset !== at) throw new Error('Section ' + section.id + ' is not where the layout puts it.')
    at = section.offset + section.length + (-(section.offset + section.length) & 15)
  }
  if (built.total !== at) throw new Error('The container length is not the 16-aligned end of its sections.')
  if (device.flashAt + built.total > device.flashLimit) throw new Error('The container does not fit the flash.')
  for (let i = 0; i < COUNT_OFFSET; i++) if (built.header[i] !== stock.header[i] && !(i >= VERSION_FIELD[0] && i < VERSION_FIELD[1])) throw new Error('The ELE3 header differs outside the version field.')
  if (version !== undefined && built.version !== version) throw new Error('The version field is not ' + version + '.')
  const tableEnd = (file: Ele3File) => file.container.subarray(TABLE_OFFSET + file.table.length * ENTRY_SIZE, file.dataStart)
  if (!equal(tableEnd(built), tableEnd(stock))) throw new Error('The table area after the entries differs from stock.')
  for (const [id, stored] of stock.stored) if (id !== device.mainSection && !equal(built.stored.get(id)!, stored)) throw new Error('Section ' + id + ' is not stock.')
  const main = built.stored.get(device.mainSection)!
  if (classifySection(main) !== 'packed') throw new Error('The main OS is not a packed stream with a valid byte sum.')
  const { image, gap } = inplaceDepack(main, device)
  if (!equal(image, wantMain)) throw new Error('The main OS does not depack to the expected image.')
  if (!equal(unpackSection(packedStream(main)), image)) throw new Error('The depacker disagrees with the in-place depack.')
  if (gap <= 0) throw new Error('The in-place depack would overwrite unread input.')
  return { bytes: output.length, messages: built.dataMessages.length + 2, containerLength: built.total, flashEnd: device.flashAt + built.total, flashHeadroom: device.flashLimit - device.flashAt - built.total, version: built.version, mainStored: main.length, mainImage: image.length, inplaceGap: gap }
}

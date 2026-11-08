// SPDX-License-Identifier: GPL-3.0-or-later
// ELE2 containers in Analog Rytm MKI OS files: read, rebuild with a new main OS, verify.
// The SysEx transport is the one ELE3 files use (sysex.ts). The container has no section table: a header, then one
// packed main OS stream. Layout from docs/RYTM_MKI_OS_RESEARCH.md and elektron-firmware-tool (MIT). A rebuild changes
// only the stream, the 4-character version field and the framing messages' count; the rest is copied from the owner's
// own stock file. No firmware content is embedded here.
import { unpackSection } from '../aplib.ts'
import { classifySection, inplaceDepack, packedStream } from './ele3.ts'
import { CHUNK_SIZE, FIRST_COUNTER, contentChecksum, decodeDataMessages, encodeSyx, framingCount, packetChecksum, splitMessages } from './sysex.ts'

const MAGIC = 'ELE2', HEADER_SIZE = 0x18, VERSION_FIELD = [0x10, 0x14] as const, LOAD_OFFSET = 0x14

export type Ele2Machine = 'analog-rytm-mki'
export type Ele2Device = {
  mainLoad: number; stage: number; flashAt: number; flashLimit: number; sysexId: number
  /** Main OS ranges, as absolute addresses [start, end), that a build must keep byte-identical to stock, with the reason. */
  keep: [number, number, string][]
}

// Facts about each machine's container and loader, measured on stock MKI 1.74 (docs/RYTM_MKI_OS_RESEARCH.md).
export const ELE2_DEVICES: Record<Ele2Machine, Ele2Device> = {
  // The OS container sits at flash 0x20000; the lowest calibration record the OS reads is at 0x780000.
  'analog-rytm-mki': {
    mainLoad: 0x40000400, stage: 0x40200000, flashAt: 0x20000, flashLimit: 0x780000, sysexId: 0x07,
    keep: [
      [0x40000592, 0x400005d8, 'the OS entry compares the bootstrap versions and may rewrite boot flash'],
      [0x4028c768, 0x402a1b84, 'the embedded bootstrap image and its version'],
    ],
  },
}

export type Ele2File = {
  raw: Uint8Array; deviceId: number; transferConstant: number; framing: [Uint8Array, Uint8Array]; dataMessages: Uint8Array[]
  total: number; checksum: number; container: Uint8Array; tail: Uint8Array; header: Uint8Array
  load: number; stored: Uint8Array; version: string
}

const u32 = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at)
const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index])

export function readEle2Syx(raw: Uint8Array): Ele2File {
  const messages = splitMessages(raw)
  if (messages.length < 3 || messages[0].length !== 16 || messages[messages.length - 1].length !== 16) throw new Error('The file has no 16-byte framing messages at both ends.')
  const dataMessages = messages.slice(1, -1)
  if (dataMessages.some(message => message.length !== 128)) throw new Error('A data message is not 128 bytes long.')
  if (messages.some(message => message[1] !== 0x00 || message[2] !== 0x20 || message[3] !== 0x3c)) throw new Error('The manufacturer is not Elektron.')
  const decoded = decodeDataMessages(dataMessages)
  const total = u32(decoded, 0), checksum = u32(decoded, 4)
  if (String.fromCharCode(...decoded.subarray(8, 12)) !== MAGIC || 8 + total > decoded.length || total < HEADER_SIZE + 8) throw new Error('The file holds no ELE2 container.')
  const container = decoded.slice(8, 8 + total)
  const end = HEADER_SIZE + 8 + u32(container, HEADER_SIZE)
  if (end > total) throw new Error('The main OS stream runs past the container.')
  return {
    raw, deviceId: messages[0][4], transferConstant: messages[0][8], framing: [messages[0], messages[messages.length - 1]], dataMessages,
    total, checksum, container, tail: decoded.subarray(8 + total), header: container.subarray(0, HEADER_SIZE),
    load: u32(container, LOAD_OFFSET), stored: container.subarray(HEADER_SIZE, end),
    version: String.fromCharCode(...container.subarray(...VERSION_FIELD)),
  }
}

export function mainImage(file: Ele2File): Uint8Array {
  if (classifySection(file.stored) !== 'packed') throw new Error('The main OS is not a packed stream with a valid byte sum.')
  return unpackSection(packedStream(file.stored))
}

/** The stock file with the main OS stream replaced and, optionally, a new 4-character version. */
export function writeEle2Syx(stock: Ele2File, storedMain: Uint8Array, version?: string): Uint8Array {
  const length = HEADER_SIZE + storedMain.length, container = new Uint8Array(length + (-length & 3))
  container.set(stock.header)
  if (version !== undefined) {
    if (!/^[\x20-\x7e]{4}$/.test(version)) throw new Error('The version shown on the unit is exactly 4 printable characters.')
    container.set(Array.from(version, character => character.charCodeAt(0)), VERSION_FIELD[0])
  }
  container.set(storedMain, HEADER_SIZE)
  const stream = new Uint8Array(8 + container.length)
  new DataView(stream.buffer).setUint32(0, container.length)
  new DataView(stream.buffer).setUint32(4, contentChecksum(container))
  stream.set(container, 8)
  return encodeSyx(stream, stock.deviceId, stock.framing[0], stock.framing[1])
}

export type Ele2BuildFacts = { bytes: number; messages: number; containerLength: number; flashEnd: number; flashHeadroom: number; version: string; mainStored: number; mainImage: number; inplaceGap: number }

/** Refuses unless `output` is `stock` with only the main OS changed, depacking in place to `wantMain` with the kept ranges intact. */
export function verifyEle2Build(output: Uint8Array, stock: Ele2File, wantMain: Uint8Array, device: Ele2Device, version?: string): Ele2BuildFacts {
  const built = readEle2Syx(output)
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
  const end = HEADER_SIZE + built.stored.length
  if (built.total !== end + (-end & 3) || built.container.subarray(end).some(byte => byte !== 0)) throw new Error('The container is not its stream padded to a 4-byte boundary.')
  if (device.flashAt + built.total > device.flashLimit) throw new Error('The container does not fit the flash.')
  for (let i = 0; i < HEADER_SIZE; i++) if (built.header[i] !== stock.header[i] && !(i >= VERSION_FIELD[0] && i < VERSION_FIELD[1])) throw new Error('The ELE2 header differs outside the version field.')
  if (version !== undefined && built.version !== version) throw new Error('The version field is not ' + version + '.')
  if (built.load !== device.mainLoad) throw new Error('The main OS load address is not the device\'s.')
  if (classifySection(built.stored) !== 'packed') throw new Error('The main OS is not a packed stream with a valid byte sum.')
  const { image, gap } = inplaceDepack(built.stored, device)
  if (!equal(image, wantMain)) throw new Error('The main OS does not depack to the expected image.')
  if (!equal(unpackSection(packedStream(built.stored)), image)) throw new Error('The depacker disagrees with the in-place depack.')
  if (gap <= 0) throw new Error('The in-place depack would overwrite unread input.')
  const stockImage = mainImage(stock)
  for (const [start, stop, reason] of device.keep) {
    const from = start - device.mainLoad, to = stop - device.mainLoad
    if (to > image.length || to > stockImage.length || !equal(image.subarray(from, to), stockImage.subarray(from, to))) throw new Error('The build changes ' + reason + '.')
  }
  return { bytes: output.length, messages: built.dataMessages.length + 2, containerLength: built.total, flashEnd: device.flashAt + built.total, flashHeadroom: device.flashLimit - device.flashAt - built.total, version: built.version, mainStored: built.stored.length, mainImage: image.length, inplaceGap: gap }
}

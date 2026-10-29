// The Zoom MultiStomp's MIDI file commands (normal mode), as proven on the MS-70CDR 2.10 by the
// ZoomMultistompZDL project (docs/EFFECT-INSTALL-PROTOCOL.md there; docs/ZOOM_MULTISTOMP.md here).
// Pure functions only: the messages to send and how to read the replies. ZoomLink does the talking.

/** Device ids the pedals answer with in their identity reply. */
export const ZOOM_MODELS: Record<number, string> = { 0x61: 'MS-70CDR', 0x58: 'MS-50G', 0x5f: 'MS-60B' }
/** The pedals' device ids, by Modwerk machine id. */
export const ZOOM_DEVICE_IDS: Record<string, number> = { 'zoom-ms-70cdr': 0x61, 'zoom-ms-50g': 0x58, 'zoom-ms-60b': 0x5f }

/** Universal identity request. */
export const IDENTITY_REQUEST = [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]

export type ZoomIdentity = { deviceId: number; model: string; firmware: string }

/** The pedal's identity reply: F0 7E ch 06 02 52 <device id> 00 00 00 <four firmware characters> F7. */
export function parseIdentity(m: number[]): ZoomIdentity | undefined {
  if (m.length < 8 || m[0] !== 0xf0 || m[1] !== 0x7e || m[3] !== 0x06 || m[4] !== 0x02 || m[5] !== 0x52) return undefined
  const deviceId = m[6]
  const firmware = m.length >= 14 ? String.fromCharCode(...m.slice(10, 14)).replace(/[^ -~]/g, '').trim() : ''
  return { deviceId, model: ZOOM_MODELS[deviceId] ?? 'Zoom 0x' + deviceId.toString(16), firmware }
}

/** A Zoom SysEx message for one pedal: F0 52 00 <device id> body F7. */
export const zoomSysex = (deviceId: number, body: number[]) => [0xf0, 0x52, 0x00, deviceId, ...body, 0xf7]
/** Whether a message is a reply to a file command (F0 52 00 <id> 60 …). */
export const isFileReply = (m: number[], deviceId: number) => m[1] === 0x52 && m[3] === deviceId && m[4] === 0x60

const fileName = (name: string) => [...Array.from(name, c => c.charCodeAt(0)), 0]

/** 8 bytes into 7-bit MIDI data: each group of up to 7 bytes is led by their high bits, first byte's highest. */
export function pack7(bytes: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 7) {
    const group = Array.from(bytes).slice(i, i + 7)
    let high = 0
    group.forEach((b, j) => { if (b & 0x80) high |= 1 << (6 - j) })
    out.push(high, ...group.map(b => b & 0x7f))
  }
  return out
}
export function unpack7(bytes: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 8) for (let j = 1; j < 8 && i + j < bytes.length; j++) out.push(bytes[i + j] | (bytes[i] & (1 << (7 - j)) ? 0x80 : 0))
  return out
}
export function crc32(bytes: ArrayLike<number>): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1 }
  return (c ^ 0xffffffff) >>> 0
}

/** File command bodies (without the F0 52 00 <id> header). */
export const FILE = {
  listFirst: () => [0x60, 0x25, 0, 0, ...fileName('*')],
  listNext: () => [0x60, 0x26, 0, 0, ...fileName('*')],
  close: [[0x60, 0x21, 0x40, 0, 0, 0, 0], [0x60, 0x09]],
  readOpen: (name: string) => [0x60, 0x20, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...fileName(name)],
  /** One block: the data comes in the reply to the third message. */
  readBlock: [[0x60, 0x05, 0], [0x60, 0x22, 0x14, 0x2f, 0x60, 0, 0x0c, 0, 0x04, 0, 0, 0], [0x60, 0x05, 0]],
  usage: () => [0x60, 0x29, 0, 0, 0, 0, 0],
}

const ok = (m: number[] | null | undefined): m is number[] => !!m && m[4] === 0x60 && m[5] === 0x04
const size35 = (d: number[], at: number) => d[at] + d[at + 1] * 128 + d[at + 2] * 16384 + d[at + 3] * 2097152 + d[at + 4] * 268435456

/** One file from a list reply, or undefined at the end of the list. Names are at most 12 characters (8.3). */
export function parseListEntry(m: number[] | null): { name: string; size: number } | undefined {
  if (!ok(m)) return undefined
  const d = m.slice(1), end = d.indexOf(0, 14)
  const name = String.fromCharCode(...d.slice(14, end > 14 && end < 26 ? end : 26))
  return name ? { name, size: size35(d, 29) } : undefined
}

/** A read block: its bytes and whether their checksum matched, or the end of the file. */
export function parseBlock(m: number[] | null): { end: true } | { end: false; data: number[]; ok: boolean } {
  const d = m ? m.slice(1, -1) : []
  if (d[3] !== 0x60 || d[4] !== 0x04 || d[5] !== 0x22 || d.length < 15) return { end: true }
  const length = d[8] + d[9] * 128
  if (!length) return { end: true }
  const data = unpack7(d.slice(10, 10 + length + Math.floor(length / 7) + 1)).slice(0, length)
  const t = d.slice(-5), crc = (t[0] + (t[1] << 7) + (t[2] << 14) + (t[3] << 21) + ((t[4] & 0x0f) << 28)) >>> 0
  return { end: false, data, ok: ((crc ^ 0xffffffff) >>> 0) === crc32(data) }
}

/** Free space on the pedal, in bytes, from the usage reply. */
export function parseUsage(m: number[] | null): number | undefined {
  if (!ok(m)) return undefined
  return size35(m.slice(1), 15)
}

/** An effect file's header: its group, effect id and version (Zoom's 76-byte header before the ELF). */
export function effectInfo(b: ArrayLike<number>): { gid: number; fxid: number; version: string } | undefined {
  if (b.length < 0x50 || String.fromCharCode(b[4], b[5], b[6], b[7]) !== 'SIZE' || b[0x4c] !== 0x7f || String.fromCharCode(b[0x4d], b[0x4e], b[0x4f]) !== 'ELF') return undefined
  return { gid: b[0x3c], fxid: b[0x40] | (b[0x41] << 8), version: String.fromCharCode(b[0x44], b[0x45], b[0x46], b[0x47]) }
}

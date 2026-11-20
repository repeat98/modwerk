// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II development link's client for the site (sdk/machines/digitone-ii/LINK.md, the host
// sdk/machines/digitone-ii/tools/dn2_link.py): its requests and replies in the Analog Rytm MKII link's wire format, and
// the reads the page and the diagnostics need: the link's identity, memory, the screen and the diagnostics log, which
// is the Octatrack's layout and reads with parseDeviceLog. Read-only: no keys, turns or RAM boot from here.
// Transport-free (LinkLine): the page gives it Web MIDI, a test a simulated unit.
import { DEVICE_LOG_IMAGE_BYTES, parseDeviceLog, type DeviceLog } from '../elekloader/device-log.ts'

/** F0 7D 'M' 'W' 'L' version: the link's header, a request's and a reply's. */
export const LINK_HEADER = [0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1] as const
export const LINK_COMMANDS = { ident: 0x01, mem: 0x21, diag: 0x22 } as const
export type LinkCommand = keyof typeof LINK_COMMANDS
export const LINK_STATUS: Readonly<Record<number, string>> = {
  1: 'not armed (SETTINGS > REMOTE CTRL)', 2: 'bad request', 3: 'busy', 4: 'out of range', 5: 'a person is at the unit',
}
/** The most a `mem` request reads. */
export const MEM_MAX = 128
/** Stock keeps two frame pointers side by side (OS 1.12): the frame on the screen is the second's. 128x64, 1 bit. */
export const FRAME_POINTERS = 0x402a10c8, FRAME_BYTES = 1024

/** SysEx in and out: whole messages, F0 to F7. next() waits up to `ms` and gives null when none came. */
export type LinkLine = { send(data: Uint8Array): void; next(ms: number): Promise<Uint8Array | null> }
export class LinkError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) { super(message); this.status = status }
}

/** A u32 as five 7-bit bytes, least significant first. */
export function u32(value: number): number[] {
  return Array.from({ length: 5 }, (_, i) => Math.floor(value / 2 ** (7 * i)) & 0x7f)
}
export function get32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | bytes[at + 1] << 7 | bytes[at + 2] << 14 | bytes[at + 3] << 21) + (bytes[at + 4] & 0x0f) * 2 ** 28
}
/** The link's byte blocks: groups of up to seven, each led by a byte holding their top bits (the first's in bit 6). */
export function unpack7(bytes: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 8) {
    const top = bytes[i]
    bytes.subarray(i + 1, i + 8).forEach((byte, k) => out.push(byte | (top & 0x40 >> k ? 0x80 : 0)))
  }
  return Uint8Array.from(out)
}

export function linkRequest(seq: number, command: LinkCommand, ...values: number[]): Uint8Array {
  return Uint8Array.from([...LINK_HEADER, seq & 0x7f, LINK_COMMANDS[command], ...values.flatMap(u32), 0xf7])
}
/** A reply's sequence, command, status and payload; null for anything that is not one. */
export function parseLinkReply(message: Uint8Array): { seq: number; command: number; status: number; payload: Uint8Array } | null {
  if (message.length < LINK_HEADER.length + 4 || message.at(-1) !== 0xf7 || LINK_HEADER.some((b, i) => message[i] !== b) || !(message[7] & 0x40)) return null
  return { seq: message[6], command: message[7] & 0x3f, status: message[8], payload: message.subarray(9, -1) }
}

let nextSeq = 0
/** One request and its reply; throws a LinkError on a refusal or no answer. */
export async function ask(line: LinkLine, command: LinkCommand, values: number[] = [], timeoutMs = 2000): Promise<Uint8Array> {
  const seq = nextSeq = (nextSeq + 1) & 0x7f
  line.send(linkRequest(seq, command, ...values))
  for (const end = Date.now() + timeoutMs; Date.now() < end;) {
    const message = await line.next(Math.max(1, end - Date.now()))
    if (!message) break
    const reply = parseLinkReply(message)
    if (!reply || reply.seq !== seq || reply.command !== LINK_COMMANDS[command]) continue
    if (reply.status) throw new LinkError(`${command}: ${LINK_STATUS[reply.status] ?? 'status ' + reply.status}`, reply.status)
    return reply.payload
  }
  throw new LinkError(`${command}: no answer. Is a development base with the link on the unit?`)
}

export type LinkIdent = { version: number; received: number; dropped: number; ticks: number; armed?: boolean; person?: boolean; bootStatus?: number }
export async function ident(line: LinkLine): Promise<LinkIdent> {
  const p = await ask(line, 'ident'), v = Array.from({ length: Math.floor(p.length / 5) }, (_, i) => get32(p, 5 * i))
  return { version: v[0], received: v[1], dropped: v[2], ticks: v[3], ...(v.length >= 9 ? { armed: v[4] === 1, person: v[5] === 1 } : {}), ...(v.length >= 11 ? { bootStatus: v[9] } : {}) }
}
/** Up to MEM_MAX bytes of DDR or SRAM. */
export async function mem(line: LinkLine, address: number, length: number): Promise<Uint8Array> {
  if (length < 1 || length > MEM_MAX) throw new LinkError(`mem: 1 to ${MEM_MAX} bytes`)
  const p = await ask(line, 'mem', [address, length])
  return unpack7(p.subarray(5)).subarray(0, length)
}
async function read(line: LinkLine, address: number, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length)
  for (let at = 0; at < length; at += MEM_MAX) out.set(await mem(line, address + at, Math.min(MEM_MAX, length - at)), at)
  return out
}
/** The frame on the screen as 64 rows of 128 pixels, top row first (the Rytm's layout). A draw between its eight
 * reads can tear it. */
export async function screen(line: LinkLine): Promise<number[][]> {
  const pointers = await mem(line, FRAME_POINTERS, 8), front = new DataView(pointers.buffer, pointers.byteOffset).getUint32(4)
  return frameRows(await read(line, front, FRAME_BYTES))
}
export function frameRows(frame: Uint8Array): number[][] {
  return Array.from({ length: 64 }, (_, y) => Array.from({ length: 128 }, (_, x) => frame[(7 - (y >> 3)) + 8 * x] >> (y & 7) & 1))
}
/** The diagnostics log (diag.c): its bytes, read through mem, and the log the site's parser reads from them. */
export async function readLog(line: LinkLine): Promise<{ bytes: Uint8Array; log: DeviceLog | undefined }> {
  const p = await ask(line, 'diag'), address = get32(p, 0), size = get32(p, 5)
  if (size < 8 || size > DEVICE_LOG_IMAGE_BYTES) throw new LinkError(`diag: a ${size}-byte log`)
  const bytes = await read(line, address, size), image = new Uint8Array(DEVICE_LOG_IMAGE_BYTES)
  image.set(bytes)                       // the Digitone II keeps no crash or stall record: zeros, as an older base answers
  return { bytes, log: parseDeviceLog(image) }
}

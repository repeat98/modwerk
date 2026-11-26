// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II development link's client for the site (sdk/machines/digitone-ii/LINK.md, the host
// sdk/machines/digitone-ii/tools/dn2_link.py): its requests and replies in the Analog Rytm MKII link's wire format, and
// the reads the page and the diagnostics need: the link's identity, memory, the screen and the diagnostics log, which
// is the Octatrack's layout and reads with parseDeviceLog. No keys, turns or RAM boot from here. The one command
// that changes the unit is `upload`, which carries the runtime loader's upload controller (uploadTransport): modules
// load to RAM for a trial, and a power cycle ends them (sdk/machines/digitone-ii/LOADER.md). The wire itself, shared
// with the Model:Cycles, is link-wire.ts; this file keeps the Digitone II's commands and status wording.
// Transport-free (LinkLine): the page gives it Web MIDI, a test a simulated unit.
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { DEVICE_LOG_IMAGE_BYTES, parseDeviceLog, type DeviceLog } from '../elekloader/device-log.ts'
import type { UploadTransport } from '../elekloader/upload-session.ts'
import { UPLOAD_RESPONSE } from '../elekloader/upload-wire.ts'
import { askLink, get32, LinkError, linkFrame, pack7, u32, unpack7, type LinkLine } from './link-wire.ts'

export { get32, LINK_HEADER, LinkError, pack7, parseLinkReply, u32, unpack7, type LinkLine } from './link-wire.ts'
export const LINK_COMMANDS = { ident: 0x01, mem: 0x21, diag: 0x22, upload: 0x30 } as const
export type LinkCommand = keyof typeof LINK_COMMANDS
export const LINK_STATUS: Readonly<Record<number, string>> = {
  1: 'not armed (SETTINGS > REMOTE CTRL)', 2: 'bad request', 3: 'busy', 4: 'out of range', 5: 'a person is at the unit',
}
/** The most a `mem` request reads. */
export const MEM_MAX = 128
/** Stock keeps two frame pointers side by side (OS 1.12): the frame on the screen is the second's. 128x64, 1 bit. */
export const FRAME_POINTERS = 0x402a10c8, FRAME_BYTES = 1024

export function linkRequest(seq: number, command: LinkCommand, ...values: number[]): Uint8Array {
  return linkFrame(seq, LINK_COMMANDS[command], values.flatMap(u32))
}
/** One request and its reply (link-wire's askLink with the Digitone II's commands and status wording); throws a
 * LinkError on a refusal or no answer. */
export async function ask(line: LinkLine, command: LinkCommand, values: number[] = [], timeoutMs = 2000, raw: number[] = []): Promise<Uint8Array> {
  return askLink(line, LINK_COMMANDS[command], [...values.flatMap(u32), ...raw], { timeoutMs, label: command, status: LINK_STATUS })
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
  if (p.length < 5 || get32(p, 0) !== address) throw new LinkError('mem: reply does not match the requested address')
  const bytes = unpack7(p.subarray(5))
  if (bytes.length !== length) throw new LinkError(`mem: expected ${length} bytes, received ${bytes.length}`)
  return bytes
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

/** The development base's identity for the upload controller (link.c upload_start): the SHA-256 of this text. */
export const UPLOAD_BASE_TEXT = 'Modwerk Digitone II OS 1.12 development base, link upload v1'
export const UPLOAD_BASE = sha(new TextEncoder().encode(UPLOAD_BASE_TEXT))
/** The longest wait for one controller frame's reply: a commit admits and switches on the unit. */
export const UPLOAD_REPLY_MS = 10000
/** The upload controller (sdk/runtime/upload) over the link's upload command: one frame out, its 144-byte response
 * back, for UploadSession. Armed and stopped only: the unit refuses otherwise (status, or the controller's 'unsafe').
 * A frame the unit is still running when the signal aborts is not taken back; the session then trusts the line no
 * more (UploadUnconfirmedError). */
export function uploadTransport(line: LinkLine): UploadTransport {
  return {
    async exchange(frame, signal) {
      if (signal.aborted) throw new LinkError('upload: cancelled')
      const payload = await ask(line, 'upload', [], UPLOAD_REPLY_MS, pack7(frame))
      const response = unpack7(payload)
      if (response.length !== UPLOAD_RESPONSE) throw new LinkError(`upload: a ${response.length}-byte response`)
      return response
    },
  }
}

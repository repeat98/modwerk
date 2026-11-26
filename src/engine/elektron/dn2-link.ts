// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II development link's client for the site (sdk/machines/digitone-ii/LINK.md, the host
// sdk/machines/digitone-ii/tools/dn2_link.py): its requests and replies in the Analog Rytm MKII link's wire format, and
// the reads the page and the diagnostics need: the link's identity, the screen and the diagnostics log, which
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
export const LINK_COMMANDS = { ident: 0x01, screen: 0x20, diag: 0x22, log: 0x24, upload: 0x30 } as const
export type LinkCommand = keyof typeof LINK_COMMANDS
export const LINK_STATUS: Readonly<Record<number, string>> = {
  1: 'not armed (SETTINGS > REMOTE CTRL)', 2: 'bad request', 3: 'busy', 4: 'out of range', 5: 'a person is at the unit',
}
/** A log part's bytes: the unit sends the diagnostics log in parts of this size, the last one shorter. */
export const LOG_PART = 128
/** The frame on the screen: 128x64, 1 bit, sent by the unit in eight parts of SCREEN_PART bytes. */
export const FRAME_BYTES = 1024, SCREEN_PART = 128

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
/** Runs one request and its reply. A caller that shares the line with other work (a trial's keepalive) passes its
 * lock here, so each request takes its own turn and other work can go between the requests of a long read. */
export type LinkTurn = <T>(work: () => Promise<T>) => Promise<T>
const ownTurn: LinkTurn = work => work()
/** One part of the frame: `screen 0` makes the unit copy the frame on the screen, and every part carries the copy's
 * number. A reply for another offset, another copy or of another length is refused, never passed on. */
async function screenPart(line: LinkLine, offset: number, copy?: number): Promise<{ copy: number; bytes: Uint8Array }> {
  const p = await ask(line, 'screen', [offset])
  if (p.length < 10 || get32(p, 0) !== offset) throw new LinkError('screen: reply does not match the requested part')
  if (copy !== undefined && get32(p, 5) !== copy) throw new LinkError('screen: the unit copied the screen again during the read')
  const bytes = unpack7(p.subarray(10))
  if (bytes.length !== SCREEN_PART) throw new LinkError(`screen: expected ${SCREEN_PART} bytes, received ${bytes.length}`)
  return { copy: get32(p, 5), bytes }
}
/** The frame on the screen as 64 rows of 128 pixels, top row first (the Rytm's layout): eight parts of one copy the unit
 * took, so it never tears. The unit chooses the bytes; no address is asked for. */
export async function screen(line: LinkLine): Promise<number[][]> {
  const frame = new Uint8Array(FRAME_BYTES), first = await screenPart(line, 0)
  frame.set(first.bytes)
  for (let at = SCREEN_PART; at < FRAME_BYTES; at += SCREEN_PART) frame.set((await screenPart(line, at, first.copy)).bytes, at)
  return frameRows(frame)
}
export function frameRows(frame: Uint8Array): number[][] {
  return Array.from({ length: 64 }, (_, y) => Array.from({ length: 128 }, (_, x) => frame[(7 - (y >> 3)) + 8 * x] >> (y & 7) & 1))
}
/** One part of the diagnostics log: the unit reads its own log, the client names only the offset. The reply echoes
 * it and carries the log's seq (raised by every record diag.c finishes); another offset or length is refused. */
async function logPart(line: LinkLine, offset: number, size: number, turn: LinkTurn): Promise<{ seq: number; bytes: Uint8Array }> {
  const p = await turn(() => ask(line, 'log', [offset])), n = Math.min(LOG_PART, size - offset)
  if (p.length < 10 || get32(p, 0) !== offset) throw new LinkError('log: reply does not match the requested part')
  const bytes = unpack7(p.subarray(10))
  if (bytes.length !== n) throw new LinkError(`log: expected ${n} bytes, received ${bytes.length}`)
  return { seq: get32(p, 5), bytes }
}
/** The log's header (struct diag_log up to freeze_state): unchanged, with the same seq in every part, means no record
 * was written during the read. */
const LOG_HEADER = 40, LOG_TRIES = 3
/** The diagnostics log (diag.c): its bytes, read in parts while it stood still (part 0 before and after the rest, the
 * same header and seq throughout, or read again), and the log the site's parser reads from them. Each request takes
 * its own `turn`, so a trial's keepalive can go between them. */
export async function readLog(line: LinkLine, turn: LinkTurn = ownTurn): Promise<{ bytes: Uint8Array; log: DeviceLog | undefined }> {
  const p = await turn(() => ask(line, 'diag')), size = get32(p, 5)
  if (size < 8 || size > DEVICE_LOG_IMAGE_BYTES) throw new LinkError(`diag: a ${size}-byte log`)
  for (let attempt = 0; attempt < LOG_TRIES; attempt++) {
    const first = await logPart(line, 0, size, turn), bytes = new Uint8Array(size)
    bytes.set(first.bytes)
    let still = true
    for (let at = LOG_PART; at < size; at += LOG_PART) {
      const part = await logPart(line, at, size, turn)
      bytes.set(part.bytes, at)
      still &&= part.seq === first.seq
    }
    const again = await logPart(line, 0, size, turn)
    if (!still || again.seq !== first.seq || again.bytes.subarray(0, LOG_HEADER).some((b, i) => b !== first.bytes[i])) continue
    const image = new Uint8Array(DEVICE_LOG_IMAGE_BYTES)
    image.set(bytes)                     // the Digitone II keeps no crash or stall record: zeros, as an older base answers
    return { bytes, log: parseDeviceLog(image) }
  }
  throw new LinkError(`log: it changed during each of ${LOG_TRIES} reads (a record was written)`)
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

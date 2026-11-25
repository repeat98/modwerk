// SPDX-License-Identifier: GPL-3.0-or-later
// The Analog Rytm MKII link (sdk/machines/analog-rytm-mkii/LINK.md): what every Modwerk base on the Rytm answers over
// USB MIDI SysEx, read from the computer. Reads only: `ident` (with the set identity), `load`, `diag` and `log`; a
// development base's keys, screen, memory and RAM boot are tools/rytm_link.py's, never this file's. The wire is
// link-wire.ts and the load and log readers are the Model:Cycles' (mc-link.ts), whose link follows this one; this file
// keeps the Rytm's identity layout, port name and set identity.
import { type DeviceLog } from '../elekloader/device-log'
import { get32, linkExchange, parseLinkReply } from './link-wire'
import { parseMcLoad, readLinkLog, type McCall, type McLoad } from './mc-link'
import { ELE3_DEVICES, mainImage, readEle3Syx } from './ele3'
import { findUnit, midiLine, type MidiAccessLike } from './os-upgrade-midi'

const IDENT = 0x01, LOAD = 0x23
const BAD_REQUEST = 2
const STATUS = ['ok', 'not armed', 'bad request', 'busy', 'out of range', 'a person is at the unit']
/** The model name the Rytm's USB MIDI port carries ("Elektron Analog Rytm MKII"). */
export const RYTM_PORT = 'Analog Rytm MKII'
const BOOT: Record<number, string> = { 0: 'none', 1: 'booted from RAM', 2: 'mailbox without a software reset', 3: 'check word',
  4: 'lengths', 5: 'container CRC', 6: 'no MAIN OS section', 8: 'failed after the unpack (reset)' }
// ident's numbers in order (link.c, CMD_IDENT): eleven, the label and OS build (four bytes each), then five more; a base
// before the RAM boot ends after the build, one before the diagnostics' place after the image CRC, one before the set
// identity after that place.
const HEAD = ['linkVersion', 'armed', 'personAtUnit', 'personPresses', 'posted', 'refused', 'dropped', 'received', 'ticks', 'resetStatus', 'playing'] as const
const TAIL = ['bootStatus', 'sramCrc', 'bootImageCrc', 'diagAt', 'setCrc', 'setBytes'] as const

export type RytmIdentity = {
  linkVersion: number
  /** The label stock shows: the flashed image's (link-image.mjs --version), whatever runs from RAM. */
  label: string
  osBuild: string
  /** Development bases: GLOBAL > REMOTE CTRL; a release base has no arm and sends false. */
  armed: boolean
  personAtUnit: boolean
  playing: boolean
  counts: { received: number; dropped: number; posted: number; refused: number; personPresses: number; ticks: number }
  /** A development base's RAM boot at this boot; a release base has none and sends none. */
  ramBoot: { status: string; imageCrc: number }
  /** True for a release base (no RAM boot, nowhere for its record): it refuses keys, screen, memory and the RAM boot. */
  release: boolean
  /** The CRC32 and length of the running set's .run block (the base and its modules), taken at boot; null on an older base. */
  set: { crc: number; bytes: number } | null
}

/** A refusal by the unit's link, with its status byte. */
export class RytmRefused extends Error {
  readonly status: number
  constructor(status: number) {
    super('The Analog Rytm link refused: ' + (STATUS[status] ?? 'status ' + status) + '.')
    this.status = status
  }
}

const text = (payload: Uint8Array, at: number) => String.fromCharCode(...Array.from(payload.subarray(at, at + 4), b => b & 0x7f))

/** ident's payload as named fields. */
export function parseRytmIdent(payload: Uint8Array): RytmIdentity {
  if (payload.length < 5 * HEAD.length + 8) throw new Error('The Analog Rytm link sent a short identity.')
  const head = Object.fromEntries(HEAD.map((name, i) => [name, get32(payload, 5 * i)])) as Record<typeof HEAD[number], number>
  const after = 5 * HEAD.length + 8, n = Math.min(TAIL.length, Math.floor((payload.length - after) / 5))
  const tail = Object.fromEntries(TAIL.slice(0, n).map((name, i) => [name, get32(payload, after + 5 * i)])) as Partial<Record<typeof TAIL[number], number>>
  return {
    linkVersion: head.linkVersion, label: text(payload, 5 * HEAD.length), osBuild: text(payload, 5 * HEAD.length + 4),
    armed: head.armed === 1, personAtUnit: head.personAtUnit === 1, playing: head.playing === 1,
    counts: { received: head.received, dropped: head.dropped, posted: head.posted, refused: head.refused, personPresses: head.personPresses, ticks: head.ticks },
    ramBoot: { status: BOOT[tail.bootStatus ?? 0] ?? 'none', imageCrc: tail.bootImageCrc ?? 0 },
    release: n >= 6 && tail.diagAt === 0,
    set: n >= 6 ? { crc: tail.setCrc!, bytes: tail.setBytes! } : null,
  }
}

/** Requests to the connected Rytm over one line: each gives its reply's payload, or null without a reply; the whole is
 * null without a unit. Throws RytmRefused on a refusal. */
export async function withRytm<T>(access: MidiAccessLike, timeoutMs: number, work: (call: McCall) => Promise<T | null>): Promise<T | null> {
  const unit = findUnit(access, RYTM_PORT)
  if (!unit) return null
  const line = midiLine(unit.input, unit.output)
  let seq = Date.now() / 100 & 0x7f
  const call: McCall = async (cmd, body = []) => {
    const reply = await linkExchange(line, seq = seq + 1 & 0x7f, cmd, body, timeoutMs)
    if (reply?.status) throw new RytmRefused(reply.status)
    return reply ? reply.payload : null
  }
  try { return await work(call) } finally { line.close() }
}

/** Ask the connected Rytm for its identity; null when no unit or no reply (a base without the link, or a stock OS). */
export async function readRytmIdentity(access: MidiAccessLike, timeoutMs = 2000): Promise<RytmIdentity | null> {
  const payload = await withRytm(access, timeoutMs, call => call(IDENT))
  return payload && parseRytmIdent(payload)
}

/** The audio block's share of its period (link.c CMD_LOAD, base/load.c): null when no unit or no reply, 'unsupported'
 * from a base before the load (it refuses the command as a bad request). */
export async function readRytmLoad(access: MidiAccessLike, timeoutMs = 2000): Promise<McLoad | 'unsupported' | null> {
  try {
    const payload = await withRytm(access, timeoutMs, call => call(LOAD))
    return payload && parseMcLoad(payload)
  } catch (error) {
    if (error instanceof RytmRefused && error.status === BAD_REQUEST) return 'unsupported'
    throw error
  }
}

/** The diagnostics log (base/diag.c, the Octatrack's layout): null when no unit or no reply, 'unsupported' from a base
 * before the log. */
export async function readRytmLog(access: MidiAccessLike, timeoutMs = 2000): Promise<{ bytes: Uint8Array; log: DeviceLog | undefined } | 'unsupported' | null> {
  try {
    return await withRytm(access, timeoutMs, call => readLinkLog(call, 'The Analog Rytm link'))
  } catch (error) {
    if (error instanceof RytmRefused && error.status === BAD_REQUEST) return 'unsupported'
    throw error
  }
}

const STORE_TRAILER = [0x45, 0x4c, 0x4b, 0x53, 0x54, 0x4f, 0x52, 0x45]   // 'ELKSTORE': the lockfile the linker appends
function crc32(data: Uint8Array): number {
  let c = ~0
  for (const byte of data) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c >>> 1 ^ 0xedb88320 & -(c & 1)
  }
  return ~c >>> 0
}

/** The set identity of a built Rytm image (`ident`'s, and link-image.mjs's `run`): the CRC32 of the `bytes` of its .run
 * block, which the linker puts at the end of the MAIN OS, before the storage lockfile it appends when the set has mod
 * storage (TRAILER, a big-endian length, the lockfile). Throws for a file that is not a Rytm OS. */
export function rytmSetIdentity(syx: Uint8Array, bytes: number): { crc: number; bytes: number } {
  const image = mainImage(readEle3Syx(syx), ELE3_DEVICES['analog-rytm-mkii'])
  let end = image.length
  for (let at = image.length - 12; at >= 0 && at >= image.length - (1 << 20); at--) {
    if (STORE_TRAILER.every((b, i) => image[at + i] === b)) {
      const n = new DataView(image.buffer, image.byteOffset).getUint32(at + 8)
      if (at + 12 + n === image.length) { end = at; break }   // the trailer itself, not the word inside its text
    }
  }
  if (bytes <= 0 || bytes > end) throw new Error('The set is larger than the image.')
  return { crc: crc32(image.subarray(end - bytes, end)), bytes }
}

export { parseLinkReply }

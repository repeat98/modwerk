// SPDX-License-Identifier: GPL-3.0-or-later
// The Model:Cycles development link (sdk/machines/model-cycles/LINK.md): the identity a development base reports over
// USB MIDI SysEx, and the same set identity computed from a built image. The wire format is the Analog Rytm MKII
// link's; sdk/machines/model-cycles/tools/mc_link.py speaks it from the computer. Read-only: this sends `ident` and
// `load` alone.
import { ELE3_DEVICES, mainImage, readEle3Syx } from './ele3'
import { findUnit, midiLine, type MidiAccessLike } from './os-upgrade-midi'

export const MC_LINK_HEADER = [0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1] as const
const IDENT = 0x01, LOAD = 0x22
const BAD_REQUEST = 2
const STATUS = ['ok', 'not armed', 'bad request', 'busy', 'out of range', 'a person is at the unit']
const PORTS: Record<number, string> = { 1: 'MIDI setting', 2: 'USB', 3: 'DIN', 4: 'USB and DIN' }
const BOOT: Record<number, string> = { 0: 'none', 1: 'booted from RAM', 2: 'mailbox without a software reset', 3: 'check word',
  4: 'lengths', 5: 'container CRC', 6: 'no MAIN OS section', 8: 'failed after the unpack (reset)' }
// ident's fields in order (link.c, CMD_IDENT); a base before the set identity sends the first 15.
const FIELDS = ['linkVersion', 'received', 'dropped', 'ticks', 'port', 'sent', 'sendFailures', 'armed', 'personAtUnit',
  'personPresses', 'posted', 'refused', 'mailbox', 'bootStatus', 'bootImageCrc', 'setCrc', 'setBytes'] as const
type Field = typeof FIELDS[number]

export type McIdentity = {
  linkVersion: number; port: string; armed: boolean; personAtUnit: boolean
  counts: { received: number; dropped: number; sent: number; sendFailures: number; posted: number; refused: number; ticks: number }
  /** What the RAM boot gate saw at this boot; meaningful only after a RAM boot was asked for. */
  ramBoot: { status: string; imageCrc: number }
  /** The CRC32 and length of the running set's .run block (the base and its modules), taken at boot; null on an older base. */
  set: { crc: number; bytes: number } | null
}

/** The audio's share of the CPU in percent, one decimal (link.c CMD_LOAD, base/load.c). */
export type McLoad = {
  /** The last half second (750 codec blocks); null until the first window has ended. */
  windowPercent: number | null
  /** The dearest block of that window. */
  windowPeakPercent: number | null
  /** The dearest block since boot. */
  peakPercent: number
  windows: number; blocks: number
}

/** A refusal by the unit's link, with its status byte. */
export class McRefused extends Error {
  readonly status: number
  constructor(status: number) {
    super('The Model:Cycles link refused: ' + (STATUS[status] ?? 'status ' + status) + '.')
    this.status = status
  }
}

/** A link request: header, sequence number, command, body. */
export function mcRequest(seq: number, cmd: number, body: readonly number[] = []): Uint8Array {
  return Uint8Array.from([...MC_LINK_HEADER, seq & 0x7f, cmd, ...body, 0xf7])
}

/** 32 bits from five 7-bit groups, low first (link.c put32). */
function get32(p: Uint8Array, at: number) {
  return (p[at] | p[at + 1] << 7 | p[at + 2] << 14 | p[at + 3] << 21 | (p[at + 4] & 0x0f) << 28) >>> 0
}

/** The reply to request `seq` and `cmd` (link.c's begin(): the command with 0x40 set), or null for any other message.
 * Throws on a refusal. */
export function mcReply(message: Uint8Array, seq: number, cmd: number): Uint8Array | null {
  if (message.length < 10 || MC_LINK_HEADER.some((b, i) => message[i] !== b) || message[6] !== seq || message[7] !== (cmd | 0x40)) return null
  const status = message[8]
  if (status) throw new McRefused(status)
  return message.subarray(9, message.length - 1)
}

/** ident's payload as named fields. */
export function parseMcIdent(payload: Uint8Array): McIdentity {
  const n = Math.floor(payload.length / 5)
  if (n < 15) throw new Error('The Model:Cycles link sent a short identity.')
  const v = Object.fromEntries(FIELDS.slice(0, n).map((name, i) => [name, get32(payload, 5 * i)])) as Record<Field, number>
  return {
    linkVersion: v.linkVersion, port: PORTS[v.port] ?? 'port ' + v.port, armed: v.armed === 1, personAtUnit: v.personAtUnit === 1,
    counts: { received: v.received, dropped: v.dropped, sent: v.sent, sendFailures: v.sendFailures, posted: v.posted, refused: v.refused, ticks: v.ticks },
    ramBoot: { status: BOOT[v.bootStatus] ?? 'none', imageCrc: v.bootImageCrc },
    set: n >= 17 ? { crc: v.setCrc, bytes: v.setBytes } : null,
  }
}

/** load's payload; tenths of a percent on the wire. */
export function parseMcLoad(payload: Uint8Array): McLoad {
  if (payload.length < 25) throw new Error('The Model:Cycles link sent a short load reading.')
  const [avg, wmax, peak, windows, blocks] = [0, 1, 2, 3, 4].map(i => get32(payload, 5 * i))
  return { windowPercent: windows ? avg / 10 : null, windowPeakPercent: windows ? wmax / 10 : null, peakPercent: peak / 10, windows, blocks }
}

/** One request to the connected Model:Cycles: its reply's payload, or null when no unit or no reply. */
async function mcCall(access: MidiAccessLike, cmd: number, timeoutMs: number): Promise<Uint8Array | null> {
  const unit = findUnit(access, 'Model:Cycles')
  if (!unit) return null
  const line = midiLine(unit.input, unit.output), seq = Date.now() / 100 & 0x7f
  try {
    line.send(mcRequest(seq, cmd))
    for (const end = Date.now() + timeoutMs; Date.now() < end;) {
      const message = await line.next(end - Date.now())
      if (!message) break
      const payload = mcReply(message, seq, cmd)
      if (payload) return payload
    }
    return null
  } finally { line.close() }
}

/** Ask the connected Model:Cycles for its identity. Needs a development base with the link; null when no unit or no reply. */
export async function readMcIdentity(access: MidiAccessLike, timeoutMs = 2000): Promise<McIdentity | null> {
  const payload = await mcCall(access, IDENT, timeoutMs)
  return payload && parseMcIdent(payload)
}

/** Ask the connected Model:Cycles for its audio load: null when no unit or no reply, 'unsupported' from a development
 * base without the load probe (it refuses the command as a bad request). */
export async function readMcLoad(access: MidiAccessLike, timeoutMs = 2000): Promise<McLoad | 'unsupported' | null> {
  try {
    const payload = await mcCall(access, LOAD, timeoutMs)
    return payload && parseMcLoad(payload)
  } catch (error) {
    if (error instanceof McRefused && error.status === BAD_REQUEST) return 'unsupported'
    throw error
  }
}

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1
  return c
})
function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (const b of data) c = TABLE[(c ^ b) & 0xff] ^ c >>> 8
  return (c ^ 0xffffffff) >>> 0
}

/** The set identity a unit running this built image reports for `bytes` of .run: the linker appends the mods' blob to
 * the MAIN OS with .run last, so it is the image's last `bytes` bytes (mc_link.py runid computes the same from the
 * layout). */
export function mcSetIdentity(syx: Uint8Array, bytes: number): { crc: number; bytes: number } {
  const image = mainImage(readEle3Syx(syx), ELE3_DEVICES['model-cycles'])
  if (bytes <= 0 || bytes > image.length) throw new Error('The set is larger than the image.')
  return { crc: crc32(image.subarray(image.length - bytes)), bytes }
}

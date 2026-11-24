// SPDX-License-Identifier: GPL-3.0-or-later
// The Model:Cycles development link (sdk/machines/model-cycles/LINK.md): the identity a development base reports over
// USB MIDI SysEx, and the same set identity computed from a built image. The wire format is the Analog Rytm MKII
// link's; sdk/machines/model-cycles/tools/mc_link.py speaks it from the computer. Read-only: this sends `ident`, `load`,
// `diag` and `mem` alone. The diagnostics log is the Octatrack's layout and reads with its parser, as the Digitone II's.
import { DEVICE_LOG_IMAGE_BYTES, parseDeviceLog, type DeviceLog } from '../elekloader/device-log'
import { unpack7 } from './dn2-link'
import { ELE3_DEVICES, mainImage, readEle3Syx } from './ele3'
import { findUnit, midiLine, type MidiAccessLike } from './os-upgrade-midi'

export const MC_LINK_HEADER = [0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1] as const
const IDENT = 0x01, MEM = 0x21, DIAG = 0x22, LOAD = 0x23
const MEM_MAX = 128
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

type McCall = (cmd: number, body?: number[]) => Promise<Uint8Array | null>
/** Requests to the connected Model:Cycles over one line: each gives its reply's payload, or null without a reply; the
 * whole is null without a unit. */
async function withMc<T>(access: MidiAccessLike, timeoutMs: number, work: (call: McCall) => Promise<T | null>): Promise<T | null> {
  const unit = findUnit(access, 'Model:Cycles')
  if (!unit) return null
  const line = midiLine(unit.input, unit.output)
  let seq = Date.now() / 100 & 0x7f
  const call: McCall = async (cmd, body = []) => {
    seq = seq + 1 & 0x7f
    line.send(mcRequest(seq, cmd, body))
    for (const end = Date.now() + timeoutMs; Date.now() < end;) {
      const message = await line.next(end - Date.now())
      if (!message) break
      const payload = mcReply(message, seq, cmd)
      if (payload) return payload
    }
    return null
  }
  try { return await work(call) } finally { line.close() }
}
const mcCall = (access: MidiAccessLike, cmd: number, timeoutMs: number) => withMc(access, timeoutMs, call => call(cmd))
const put32 = (v: number) => [0, 1, 2, 3, 4].map(i => Math.floor(v / 2 ** (7 * i)) & 0x7f)

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

/** The diagnostics log (base/diag.c): `diag` names its place and size, `mem` reads it 128 bytes at a time. Its bytes and
 * the log the Octatrack's parser reads from them; null when no unit or no reply, 'unsupported' from a development base
 * without the log (it refuses `diag` as a bad request). */
export async function readMcLog(access: MidiAccessLike, timeoutMs = 2000): Promise<{ bytes: Uint8Array; log: DeviceLog | undefined } | 'unsupported' | null> {
  try {
    return await withMc(access, timeoutMs, async call => {
      const place = await call(DIAG)
      if (!place) return null
      const address = get32(place, 0), size = get32(place, 5)
      if (size < 8 || size > DEVICE_LOG_IMAGE_BYTES) throw new Error(`The Model:Cycles link named a ${size}-byte log.`)
      const bytes = new Uint8Array(size)
      for (let at = 0; at < size; at += MEM_MAX) {
        const n = Math.min(MEM_MAX, size - at), p = await call(MEM, [...put32(address + at), ...put32(n)])
        if (!p) return null
        if (p.length < 10 || get32(p, 0) !== address + at || get32(p, 5) !== n) throw new Error('The Model:Cycles link sent another block than asked for.')
        const data = unpack7(p.subarray(10))
        if (data.length !== n) throw new Error('The Model:Cycles link sent a short block.')
        bytes.set(data, at)
      }
      const image = new Uint8Array(DEVICE_LOG_IMAGE_BYTES)
      image.set(bytes)                  // no crash or stall record: zeros, as an older Octatrack base answers
      return { bytes, log: parseDeviceLog(image) }
    })
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

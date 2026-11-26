// SPDX-License-Identifier: GPL-3.0-or-later
// The Model:Cycles link (sdk/machines/model-cycles/LINK.md): the identity every Modwerk base reports over
// USB MIDI SysEx, and the same set identity computed from a built image. The wire format is the Analog Rytm MKII
// link's; sdk/machines/model-cycles/tools/mc_link.py speaks it from the computer. Reads: `ident`, `load`, `diag`, `log`
// and `mods`, all of them in every base (`mem` is a development base's and is not used here). The diagnostics log is the Octatrack's layout and reads with its parser, as the Digitone II's. The one
// path that changes the unit is the runtime loader's upload controller (mcUploadTransport for UploadSession): its wire
// frames go in parts, as the link takes them (base/modules.c), where the Digitone II's link takes a whole frame. The
// wire (header, request, reply, 7-bit numbers and blocks) is link-wire.ts, shared with the Digitone II; this file keeps
// the Model:Cycles' commands, status wording and readings.
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { DEVICE_LOG_IMAGE_BYTES, parseDeviceLog, type DeviceLog } from '../elekloader/device-log'
import { UploadSession, type UploadTransport } from '../elekloader/upload-session'
import { UPLOAD_RESPONSE, type UploadStatus } from '../elekloader/upload-wire'
import { get32, linkExchange, linkFrame, pack7, parseLinkReply, u32 as put32, unpack7 } from './link-wire'
import { ELE3_DEVICES, mainImage, readEle3Syx } from './ele3'
import { findUnit, midiLine, type MidiAccessLike } from './os-upgrade-midi'

const IDENT = 0x01, DIAG = 0x22, LOAD = 0x23, LOG = 0x24, UP_PART = 0x31, UP_RUN = 0x32, MODS = 0x33
/** An upload frame's part: 8 + 5 + 110 packed + 1 = 124 bytes a message, under the 128 of stock's upgrade messages. */
export const MC_PART_BYTES = 96
/** Package bytes a CHUNK frame carries: 23 parts. */
export const MC_UPLOAD_CHUNK = 2048
const LOG_MAX = 128
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

/** A link request: header, sequence number, command, body (link-wire's linkFrame). */
export const mcRequest = linkFrame

/** The reply to request `seq` and `cmd` (link.c's begin(): the command with 0x40 set), or null for any other message.
 * Throws on a refusal. */
export function mcReply(message: Uint8Array, seq: number, cmd: number): Uint8Array | null {
  const reply = parseLinkReply(message)
  if (!reply || reply.seq !== seq || reply.command !== cmd) return null
  if (reply.status) throw new McRefused(reply.status)
  return reply.payload
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

export type McCall = (cmd: number, body?: number[]) => Promise<Uint8Array | null>
/** Requests to the connected Model:Cycles over one line: each gives its reply's payload, or null without a reply; the
 * whole is null without a unit. */
export async function withMc<T>(access: MidiAccessLike, timeoutMs: number, work: (call: McCall) => Promise<T | null>): Promise<T | null> {
  const unit = findUnit(access, 'Model:Cycles')
  if (!unit) return null
  const line = midiLine(unit.input, unit.output)
  let seq = Date.now() / 100 & 0x7f
  const call: McCall = async (cmd, body = []) => {
    const reply = await linkExchange(line, seq = seq + 1 & 0x7f, cmd, body, timeoutMs)
    if (reply?.status) throw new McRefused(reply.status)
    return reply ? reply.payload : null
  }
  try { return await work(call) } finally { line.close() }
}
const mcCall = (access: MidiAccessLike, cmd: number, timeoutMs: number) => withMc(access, timeoutMs, call => call(cmd))

/** Ask the connected Model:Cycles for its identity. Needs a Modwerk base; null when no unit or no reply. */
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

/** The diagnostics log (base/diag.c): `diag` names its size, `log` reads it 128 bytes at a time from an offset into it
 * and nothing outside it. Its bytes and the log the Octatrack's parser reads from them; null when no unit or no reply,
 * 'unsupported' from a base without the log or without `log` (it refuses either as a bad request). */
export async function readMcLog(access: MidiAccessLike, timeoutMs = 2000): Promise<{ bytes: Uint8Array; log: DeviceLog | undefined } | 'unsupported' | null> {
  try {
    return await withMc(access, timeoutMs, async call => {
      const place = await call(DIAG)
      if (!place) return null
      const size = get32(place, 5)
      if (size < 8 || size > DEVICE_LOG_IMAGE_BYTES) throw new Error(`The Model:Cycles link named a ${size}-byte log.`)
      const bytes = new Uint8Array(size)
      for (let at = 0; at < size; at += LOG_MAX) {
        const n = Math.min(LOG_MAX, size - at), p = await call(LOG, [...put32(at), ...put32(n)])
        if (!p) return null
        if (p.length < 10 || get32(p, 0) !== at || get32(p, 5) !== n) throw new Error('The Model:Cycles link sent another block than asked for.')
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

/** The base identity a base's upload controller binds a BEGIN to (base/modules.c): the SHA-256 of its set
 * CRC, big-endian, as hex. */
export function mcUploadBase(setCrc: number): string {
  return sha(Uint8Array.of(setCrc >>> 24, setCrc >>> 16 & 0xff, setCrc >>> 8 & 0xff, setCrc & 0xff))
}

/** The upload controller over the link, for UploadSession: a frame's parts (`up_part`), then `up_run`, whose reply is
 * the controller's 144-byte response. A missing reply or a refusal throws; the session then trusts the line no more. */
export function mcUploadTransport(call: McCall): UploadTransport {
  return {
    async exchange(frame, signal) {
      for (let at = 0; at < frame.length; at += MC_PART_BYTES) {
        if (signal.aborted) throw new Error('The upload was cancelled.')
        if (!await call(UP_PART, [...put32(at), ...pack7(frame.subarray(at, at + MC_PART_BYTES))])) throw new Error('The Model:Cycles did not take an upload part.')
      }
      const payload = await call(UP_RUN, put32(frame.length))
      if (!payload) throw new Error('The Model:Cycles did not answer an upload frame.')
      const response = unpack7(payload)
      if (response.length !== UPLOAD_RESPONSE) throw new Error(`The Model:Cycles sent a ${response.length}-byte upload response.`)
      return response
    },
  }
}

export type McModules = {
  free: number; largest: number; refusal: string; active: number
  /** The live modules' ids (hex) and names (empty for a module without one). */
  modules: { id: string; name: string }[]
}
const REFUSALS = ['none', 'malformed', 'memory', 'conflict', 'full', 'busy', 'cycles', 'in use', 'stock bytes differ', 'event site',
  'feature', 'UI open', 'buffer']
/** The runtime loader's pool and its live modules (`mods`, three entries a reply). */
export async function mcModules(call: McCall): Promise<McModules | null> {
  const out: McModules = { free: 0, largest: 0, refusal: 'none', active: 0, modules: [] }
  for (let first = 0; ; ) {
    const p = await call(MODS, put32(first))
    if (!p) return null
    const bytes = unpack7(p), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 20 || String.fromCharCode(...bytes.subarray(16, 19)) !== 'MWI' || bytes.length < 20 + 24 * bytes[19])
      throw new Error('The Model:Cycles sent a malformed module list.')
    const why = view.getUint32(8)
    Object.assign(out, { free: view.getUint32(0), largest: view.getUint32(4), refusal: REFUSALS[why] ?? 'refusal ' + why, active: view.getUint32(12) })
    for (let i = 0; i < bytes[19]; i++) {
      const e = bytes.subarray(20 + 24 * i, 44 + 24 * i), name = e.subarray(8, 24)
      out.modules.push({ id: view.getUint32(24 + 24 * i).toString(16).padStart(8, '0'),
        name: String.fromCharCode(...name.subarray(0, name.indexOf(0) < 0 ? 16 : name.indexOf(0))) })
    }
    first += bytes[19]
    if (bytes[19] < 3 || out.modules.length >= out.active) return out
  }
}

export type McStatus = { identity: McIdentity; modules: McModules | null; load: McLoad | null }
/** What the machine page's Status shows, over one line: the identity, then the live modules and the load, each null
 * from a base without them (it refuses the command as a bad request). Null when no unit answers the identity. */
export async function readMcStatus(access: MidiAccessLike, timeoutMs = 2000): Promise<McStatus | null> {
  return withMc(access, timeoutMs, async call => {
    const ident = await call(IDENT)
    if (!ident) return null
    const optional = async <T>(read: () => Promise<T | null>) => {
      try { return await read() } catch (error) { if (error instanceof McRefused && error.status === BAD_REQUEST) return null; throw error }
    }
    return { identity: parseMcIdent(ident), modules: await optional(() => mcModules(call)), load: await optional(async () => { const p = await call(LOAD); return p && parseMcLoad(p) }) }
  })
}

/** The upload controller's session with the connected unit: identity first, so BEGIN names the running base. */
export async function mcUploadSession(call: McCall, timeoutMs = 20000): Promise<UploadSession | null> {
  const payload = await call(IDENT)
  if (!payload) return null
  const set = parseMcIdent(payload).set
  if (!set) throw new Error('This base reports no set identity: build a newer one.')
  return UploadSession.connect(mcUploadTransport(call), mcUploadBase(set.crc), { timeoutMs })
}

/** A package that removes the module built as `name` (build.py: its id is the first four bytes of the SHA-256 of the
 * name): no image, hooks or sites under that id. */
export function mcRemovalPackage(name: string): Uint8Array {
  const out = new Uint8Array(32), view = new DataView(out.buffer)
  out.set([0x4d, 0x57, 0x52, 0x4d]); view.setUint16(4, 4)
  view.setUint32(28, parseInt(sha(new TextEncoder().encode(name)).slice(0, 8), 16))
  return out
}

/** Put a package on trial: staged, published and running, the previous set kept for an undo. The unit undoes it by
 * itself after ten seconds without a link request (mcUploadSession's hello is one). */
export async function mcTry(call: McCall, data: Uint8Array): Promise<UploadStatus | null> {
  const session = await mcUploadSession(call)
  if (!session) return null
  await session.stage({ base: session.status.base, data, sha256: sha(data) }, { chunk: MC_UPLOAD_CHUNK })
  await session.activate()
  return session.startTrial()
}

/** End a trial: keep its set, or put the previous one back; then leave upload mode. */
export async function mcFinish(call: McCall, keep: boolean): Promise<UploadStatus | null> {
  const session = await mcUploadSession(call)
  if (!session) return null
  if (!session.adopt() || !['trial', 'pending'].includes(session.status.phase)) throw new Error('Nothing is on trial.')
  if (keep) { if (session.status.phase === 'trial') await session.holdTrial(); await session.accept() }
  else await session.rollback()
  return session.leaveUploadMode()
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

import { DEVICE_INCIDENTS, type DeviceCrash, type DeviceIncident, type DeviceLoad, type DeviceStall } from '../../community/octatrack-diagnostics-contract.ts'

/** The unit's diagnostics log (sdk/machines/octatrack/elekloader/diag.h), as the ColdFire stores it: big-endian. */
export const DEVICE_LOG_REQUEST = 37
export const DEVICE_LOG_PAGE = 244
const MAGIC = 0x4d574447, LOADS = 96, INCIDENTS = 32, HEADER = 40, INCIDENT = 92
/** Version 1 (bases up to a0dd21c4) has 28-byte load records; version 2 adds the window's frame and tick gaps (32
 * bytes) and, after the log, crash.c's record (180 bytes) and dsp.c's stall record (456 bytes). */
const LOAD_BYTES: Record<number, number> = { 1: 28, 2: 32 }, CRASH_BYTES = 180, STALL_BYTES = 456
const logBytes = (version: number) => HEADER + INCIDENT + LOAD_BYTES[version] * LOADS + INCIDENT * INCIDENTS
export const DEVICE_LOG_BYTES = logBytes(1)
/** What a version 2 base pages out: the log and the two records; a version 1 base answers zeros past its log. */
export const DEVICE_LOG_IMAGE_BYTES = logBytes(2) + CRASH_BYTES + STALL_BYTES
export const DEVICE_LOG_PAGES = Math.ceil(DEVICE_LOG_IMAGE_BYTES / DEVICE_LOG_PAGE)

export interface DeviceLog { version: number; nonce: number; boot: number; seq: number; loads: DeviceLoad[]; incidents: DeviceIncident[]; crash?: DeviceCrash; stall?: DeviceStall }

function load(view: DataView, at: number, version: number): DeviceLoad {
  const u16 = (i: number) => view.getUint16(at + 12 + 2 * i)
  // diag.h: core 0 runs T5-8, core 1 T1-4.
  return { seq: view.getUint32(at), boot: view.getUint32(at + 4), minute: view.getUint32(at + 8), cpu: [u16(0), u16(1)],
    dsp5to8: [u16(2), u16(3)], dsp1to4: [u16(4), u16(5)], samples: u16(6), playing: u16(7), ...(version >= 2 ? { frameGap: u16(8), tickGap: u16(9) } : {}) }
}
const words = (view: DataView, at: number, n: number) => Array.from({ length: n }, (_, i) => view.getUint32(at + 4 * i))
/** crash.c's struct crash: magic, count, frame, pc, d0-d7, a0-a6, sp, eight stack longs, seen, code, memory. */
function crash(view: DataView, at: number): DeviceCrash | undefined {
  if (view.getUint32(at) !== 0x4d574352) return undefined
  const frame = view.getUint32(at + 8)
  return { count: view.getUint32(at + 4), vector: frame >>> 18 & 0xff, sr: frame & 0xffff, pc: view.getUint32(at + 12), d: words(view, at + 16, 8),
    a: words(view, at + 48, 7), sp: view.getUint32(at + 76), stack: words(view, at + 80, 8), code: words(view, at + 116, 8), memory: words(view, at + 148, 8) }
}
/** dsp.c's struct stall: magic, count, reason, ticks, report_words, 96 report words, then the packet headers. */
function stall(view: DataView, at: number): DeviceStall | undefined {
  if (view.getUint32(at) !== 0x4d575354) return undefined
  const n = Math.min(view.getUint32(at + 16), 96)
  return { count: view.getUint32(at + 4), reason: view.getUint32(at + 8), ticks: view.getUint32(at + 12), report: words(view, at + 20, n) }
}
function incident(view: DataView, at: number): DeviceIncident | undefined {
  const kind = DEVICE_INCIDENTS[view.getUint16(at + 16) - 1]
  if (!kind) return undefined
  const bytes = (from: number, n: number) => Array.from({ length: n }, (_, i) => view.getUint8(at + from + i))
  return { seq: view.getUint32(at), boot: view.getUint32(at + 4), second: view.getUint32(at + 8), a: view.getUint32(at + 12), kind,
    cpu: view.getUint16(at + 18), dsp5to8: view.getUint16(at + 20), dsp1to4: view.getUint16(at + 22),
    machines: bytes(24, 24), fx: bytes(48, 16), keys: bytes(64, 16),
    screen: view.getUint32(at + 80), tempo24: view.getUint32(at + 84), playing: view.getUint32(at + 88) === 1 }
}
/** The written records, oldest first; undefined for anything but a version 1 or 2 log. A record still being written
 * has seq 0 and is left out. A version 2 log carries the crash and stall records when their magic is there. */
export function parseDeviceLog(data: Uint8Array): DeviceLog | undefined {
  if (data.byteLength < 8) return undefined
  const head = new DataView(data.buffer, data.byteOffset, 8), version = head.getUint32(4)
  if (head.getUint32(0) !== MAGIC || !LOAD_BYTES[version]) return undefined
  const LOAD = LOAD_BYTES[version], bytes = version >= 2 ? DEVICE_LOG_IMAGE_BYTES : logBytes(version)
  if (data.byteLength < bytes) return undefined
  const view = new DataView(data.buffer, data.byteOffset, bytes)
  const loads = Array.from({ length: LOADS }, (_, i) => load(view, HEADER + INCIDENT + LOAD * i, version)).filter(record => record.seq)
  const incidents = Array.from({ length: INCIDENTS }, (_, i) => incident(view, HEADER + INCIDENT + LOAD * LOADS + INCIDENT * i))
    .filter((record): record is DeviceIncident => !!record?.seq)
  const bySeq = <T extends { seq: number }>(a: T, b: T) => a.seq - b.seq
  const end = logBytes(version)
  return { version, nonce: view.getUint32(8), boot: view.getUint32(12), seq: view.getUint32(16), loads: loads.sort(bySeq), incidents: incidents.sort(bySeq),
    ...(version >= 2 ? { crash: crash(view, end), stall: stall(view, end + CRASH_BYTES) } : {}) }
}

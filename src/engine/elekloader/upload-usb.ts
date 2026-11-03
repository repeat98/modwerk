// SPDX-License-Identifier: GPL-3.0-or-later
// EP0 vendor transport for the upload session: browser peer of sdk/runtime/upload/vendor.c.
// The interface has no endpoints, so EP3 OUT stays free for USB Audio In.
import { UPLOAD_HEADER, UPLOAD_MAX_FRAME, UPLOAD_RESPONSE, UPLOAD_VERSION } from './upload-wire.ts'
import type { UploadTransport } from './upload-session.ts'
import { LOAD_BYTES, parseLoadReading, type LoadReading, SAVED_SET_METADATA_BYTES, SAVED_SET_CHUNK_BYTES,
  SAVED_SET_CHUNK_DATA, parseSavedSetMetadata, parseSavedSetChunk, ZERO_DIGEST, type SavedSetMetadata, type SavedSetSnapshot } from './upload-wire.ts'
import { sha, toHex } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { DEVICE_LOG_PAGE, DEVICE_LOG_PAGES, DEVICE_LOG_REQUEST, parseDeviceLog, type DeviceLog } from './device-log.ts'
import { parseSetIdentity } from './set-package.ts'

export const VENDOR_CLASS = 0xff
export const VENDOR_SUBCLASS = 0x4d // 'M'; must match the base's interface descriptor.
export const VENDOR_PROTOCOL = 1
export const VENDOR_SUBMIT = 1
export const VENDOR_RESULT = 2
export const VENDOR_IDENTIFY = 3
export const VENDOR_IDENTITY_BYTES = 72 // never a multiple of 64: see sdk/runtime/upload/vendor.h
export const VENDOR_SELFTEST = 21 // the Octatrack base's self-test (sdk/machines/octatrack/elekloader/selftest.h)
export const SELFTEST_BYTES = 96
export const VENDOR_MISSING = 14 // the modules the unit's project names that are not installed (elekloader/ep0.c)
export const MISSING_BYTES = 316
export const MISSING_PAGE = 13 // entries a MISSING reply holds; wValue is the first (elekloader/fxids.h)
export const VENDOR_INVENTORY = 27 // the modules installed on the unit, in MISSING's form (sdk/runtime/loader/loader.c)
export const VENDOR_CAPABILITIES = 29 // loader capabilities; older bases stall this read-only request
export const CAPABILITIES_BYTES = 12
export const RuntimeFeature = { sites: 1, stockCopies: 2, fills: 4, tables: 8, machineGroups: 16, sidechain: 32, siteEvents: 128, baseUpdate: 256, moduleSets: 512 } as const
export interface RuntimeCapabilities { abi: number; features: number; maxSites: number; maxCopies: number }
/** MWCP v1. Unknown feature bits are retained: they do not imply features this client requires. */
export function parseRuntimeCapabilities(view: DataView): RuntimeCapabilities {
  if (view.byteLength !== CAPABILITIES_BYTES || view.getUint32(0) !== 0x4d574350 || view.getUint8(4) !== 1 || view.getUint8(5) < 3)
    throw new VendorTransportError('The Octatrack’s loader capabilities could not be read.')
  return { abi: view.getUint8(5), features: view.getUint16(6), maxSites: view.getUint16(8), maxCopies: view.getUint16(10) }
}
export const VENDOR_SLOTS = 39 // the base's two-slot layout (sdk/machines/octatrack/elekloader/flash.h); older bases stall it
export const SLOTS_BYTES = 24
/** Where the base lives in the unit's flash (docs/OCTATRACK_TWO_SLOT_BASE.md). `fellBack`: the newest slot's base did
 * not start three times, so the boot stub started the previous one. Null before the base's first look after a start. */
export interface BaseSlots {
  layout: 'one' | 'two' | 'other'
  running: 0 | 1 | null
  fellBack: boolean
  confirmed: boolean
  slots: { generation: number; whole: boolean; confirmed: boolean; tries: number }[]
}
export function parseBaseSlots(view: DataView): BaseSlots | null {
  if (view.byteLength !== SLOTS_BYTES) throw new VendorTransportError('The Octatrack’s base slots could not be read.')
  if (view.getUint32(0) !== 0x4d575353) return null // "MWSS": zeros until the base has looked
  const flags = view.getUint8(6), running = view.getUint8(5)
  return { layout: (['one', 'two'] as const)[view.getUint8(4)] ?? 'other', running: running === 0 || running === 1 ? running : null,
    fellBack: !!(flags & 1), confirmed: !!(flags & 2),
    slots: [8, 16].map(at => ({ generation: view.getUint32(at), whole: !!(view.getUint8(at + 4) & 1), confirmed: !!(view.getUint8(at + 4) & 2), tries: view.getUint8(at + 5) })) }
}
/** The device can receive SUBMIT data stages; without it only IDENTIFY answers. */
export const VENDOR_CAN_SUBMIT = 1
export const VENDOR_VERSION = 1
export const VENDOR_RESULT_HEADER = 8
export const VENDOR_RESULT_BYTES = VENDOR_RESULT_HEADER + UPLOAD_RESPONSE
export const VendorStatus = ['none', 'pending', 'ready', 'refused'] as const
export type VendorStatusName = typeof VendorStatus[number]

interface ControlSetup { requestType: 'vendor'; recipient: 'interface'; request: number; value: number; index: number }
/** The WebUSB calls this transport needs; an opened USBDevice with the interface claimed satisfies it. */
export interface ControlDevice {
  controlTransferOut(setup: ControlSetup, data: Uint8Array): Promise<{ status: string; bytesWritten: number }>
  controlTransferIn(setup: ControlSetup, length: number): Promise<{ status: string; data?: DataView }>
}
interface UsbAlternate { interfaceClass: number; interfaceSubclass: number; interfaceProtocol: number; endpoints: readonly unknown[] }
interface UsbInterface { interfaceNumber: number; alternates: readonly UsbAlternate[] }

/** The Modwerk interface number, or undefined. Product names are not identity; HELLO establishes that. */
export function findVendorInterface(configuration: { interfaces: readonly UsbInterface[] } | null | undefined) {
  const found = configuration?.interfaces.filter(item => item.alternates.length === 1 && item.alternates.some(alt =>
    alt.interfaceClass === VENDOR_CLASS && alt.interfaceSubclass === VENDOR_SUBCLASS &&
    alt.interfaceProtocol === VENDOR_PROTOCOL && alt.endpoints.length === 0)) ?? []
  return found.length === 1 ? found[0].interfaceNumber : undefined
}

export class VendorTransportError extends Error {
  /** True only when the device positively reported that the frame was never executed. */
  readonly notExecuted: boolean
  constructor(message: string, notExecuted = false) { super(message); this.name = 'VendorTransportError'; this.notExecuted = notExecuted }
}
export interface VendorResult { status: VendorStatusName; sequence: number; response?: Uint8Array }

export interface VendorIdentity {
  canSubmit: boolean; base: string; model: string
  /** Read separately through MWCP after IDENTIFY; absent on older bases. */
  capabilities?: RuntimeCapabilities
}

/** IDENTIFY's 64 bytes, refused unless every field is exactly what this client speaks. */
/** The base's self-test record (selftest.h): its state (0 idle, 1 running, 2 passed, 3 failed), what failed (bits),
 * the modules checked, the DSP modules that ran, the peaks per mille and the progress. */
export interface SelftestRecord { state: number; failed: number; modules: number; dsp: number; intact: number; ran: number;
  peaks: { cpu: number; tracks1to4: number; tracks5to8: number }; done: number; total: number
  /** The longest time between two frames while it ran, in the base's 132 MHz timer counts (a frame is about 47,900). */
  frameGap: number
  /** Now: the card's saved set (7 saved and read back, 1 restored at boot, 8 the save failed), its modules, modules live. */
  saved: number; savedCount: number; live: number
  /** The module behind the first failure: its runtime id (0 none) and its name as the chooser shows it ('' none). */
  culprit: number; culpritName: string
  /** The loader's last refusal (sdk/runtime/loader/loader.h runtime_refusal), why a "rejected" was rejected. */
  refusal: number }
export function parseSelftest(view: DataView): SelftestRecord {
  if (view.byteLength !== SELFTEST_BYTES) throw new VendorTransportError('The self-test record has the wrong length.')
  const u = (i: number) => view.getUint32(4 * i)
  return { state: u(0), failed: u(2), modules: u(3), dsp: u(4), intact: u(5), ran: u(6),
    peaks: { tracks1to4: u(7), tracks5to8: u(8), cpu: u(9) }, done: u(10), total: u(11), frameGap: u(14), saved: u(15), savedCount: u(16), live: u(17),
    culprit: u(18), culpritName: String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + 76, 16)).replace(/\0.*$/s, '').trim(), refusal: u(23) }
}
/** A module the unit's project names that is not installed: its effect handle, parameter layout, module id (the
 * first four bytes of the SHA-256 of its catalogue id, hex) and name. */
export interface MissingModule { handle: number; layout: number; module: string; name: string }
/** MISSING ("MWM") and INVENTORY ("MWI", the handle 0xff for a module without DSP code): a count, then 24 bytes a
 * module (handle, -, layout u16, module id u32, name 16). */
export const parseMissing = (view: DataView) => parseModules(view, 0x4d574d)
export const parseInventory = (view: DataView) => parseModules(view, 0x4d5749)
function parseModules(view: DataView, magic: number): MissingModule[] {
  const n = view.byteLength >= 4 ? view.getUint8(3) : -1
  if (n < 0 || view.getUint32(0) >>> 8 !== magic || view.byteLength !== 4 + 24 * n) throw new VendorTransportError('Not a module list.')
  return Array.from({ length: n }, (_, i) => ({ handle: view.getUint8(4 + 24 * i), layout: view.getUint16(6 + 24 * i),
    module: view.getUint32(8 + 24 * i).toString(16).padStart(8, '0'),
    name: String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + 12 + 24 * i, 16)).replace(/\0.*$/s, '').trim() }))
}
export function parseVendorIdentity(bytes: Uint8Array): VendorIdentity {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const fail = (why: string): never => { throw new VendorTransportError('Unsupported vendor identity: ' + why + '.') }
  if (bytes.length !== VENDOR_IDENTITY_BYTES || bytes[0] !== 0x4d || bytes[1] !== 0x57 || bytes[2] !== 0x55 || bytes[3] !== 0x49) fail('framing')
  if (bytes[4] !== VENDOR_VERSION || bytes[5] !== UPLOAD_VERSION) fail('version')
  const capabilities = view.getUint16(6)
  if (capabilities & ~VENDOR_CAN_SUBMIT) fail('capabilities')
  if (view.getUint16(8) !== UPLOAD_MAX_FRAME || view.getUint16(10) !== VENDOR_RESULT_BYTES || view.getUint32(12) !== 0) fail('limits')
  if (bytes.subarray(64).some(byte => byte !== 0)) fail('reserved bytes')
  const model = bytes.subarray(48, 64), length = model.indexOf(0) < 0 ? model.length : model.indexOf(0)
  if (!length || model.subarray(length).some(byte => byte !== 0) || model.subarray(0, length).some(byte => byte < 0x20 || byte > 0x7e)) fail('model')
  return {
    canSubmit: (capabilities & VENDOR_CAN_SUBMIT) !== 0,
    base: Array.from(bytes.subarray(16, 48), byte => byte.toString(16).padStart(2, '0')).join(''),
    model: String.fromCharCode(...model.subarray(0, length)),
  }
}

export function parseVendorResult(bytes: Uint8Array): VendorResult {
  const status = VendorStatus[bytes[5]]
  if (bytes.length < VENDOR_RESULT_HEADER || bytes[0] !== 0x4d || bytes[1] !== 0x57 || bytes[2] !== 0x55 || bytes[3] !== 0x54 ||
      bytes[4] !== VENDOR_VERSION || !status || bytes.length !== (status === 'ready' ? VENDOR_RESULT_BYTES : VENDOR_RESULT_HEADER))
    throw new VendorTransportError(`Malformed vendor result (${bytes.length} bytes: ${Array.from(bytes.subarray(0, 16), b => b.toString(16).padStart(2, '0')).join('')}).`)
  return { status, sequence: bytes[6] << 8 | bytes[7], response: status === 'ready' ? bytes.slice(VENDOR_RESULT_HEADER) : undefined }
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason)
  const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, ms)
  const stop = () => { clearTimeout(timer); reject(signal.reason) }
  signal.addEventListener('abort', stop, { once: true })
})

/**
 * One SUBMIT per frame, then RESULT polls until the device's engine task has answered.
 * Reading a result has no device side effects, so a lost status stage is reconciled
 * by reading rather than resubmitting. A sequence number is never reused. Only a
 * refusal the device positively reports (or a stalled SETUP, which receives no data)
 * is retried, each time under a new sequence. Everything else rejects, and the
 * session then treats the connection as unconfirmed.
 */
export class UsbVendorTransport implements UploadTransport {
  private device: ControlDevice
  private index: number
  private options: { retries?: number; pollMs?: number }
  private sequence?: number
  private busy = false
  constructor(device: ControlDevice, interfaceNumber: number, options: { retries?: number; pollMs?: number } = {}) {
    if (!Number.isInteger(interfaceNumber) || interfaceNumber < 0 || interfaceNumber > 255) throw new RangeError('Invalid interface number.')
    this.device = device; this.index = interfaceNumber; this.options = options
  }
  private setup(request: number, value: number): ControlSetup {
    return { requestType: 'vendor', recipient: 'interface', request, value, index: this.index }
  }
  /** Read-only: answered by the device's USB interrupt, with no frame or engine-task work. */
  async identify(signal?: AbortSignal): Promise<VendorIdentity> {
    signal?.throwIfAborted()
    const reply = await this.device.controlTransferIn(this.setup(VENDOR_IDENTIFY, 0), VENDOR_IDENTITY_BYTES)
    signal?.throwIfAborted()
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The device did not identify itself.')
    return parseVendorIdentity(new Uint8Array(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength))
  }
  /** Undefined means an older base, not a transport failure or proof that newer modules can run. */
  async capabilities(signal?: AbortSignal): Promise<RuntimeCapabilities | undefined> {
    signal?.throwIfAborted()
    const reply = await this.device.controlTransferIn(this.setup(VENDOR_CAPABILITIES, 0), CAPABILITIES_BYTES)
    signal?.throwIfAborted()
    if (reply.status === 'stall') return undefined
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The Octatrack did not answer the loader capabilities request.')
    return parseRuntimeCapabilities(reply.data)
  }
  /** Read-only, from the interrupt: undefined from a base before the two slots (it stalls), null before its first look. */
  async slots(signal?: AbortSignal): Promise<BaseSlots | null | undefined> {
    signal?.throwIfAborted()
    const reply = await this.device.controlTransferIn(this.setup(VENDOR_SLOTS, 0), SLOTS_BYTES)
    signal?.throwIfAborted()
    if (reply.status === 'stall') return undefined
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The Octatrack did not answer the base slots request.')
    return parseBaseSlots(reply.data)
  }
  /** Cached, read-only live meters. Older bases explicitly stall this request. */
  async load(signal?: AbortSignal): Promise<LoadReading | undefined> {
    signal?.throwIfAborted()
    const reply = await this.device.controlTransferIn(this.setup(30, 0), LOAD_BYTES)
    signal?.throwIfAborted()
    if (reply.status === 'stall') return undefined
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The Octatrack did not answer the load request.')
    return parseLoadReading(reply.data)
  }
  /** Two fixed saved files, read while a single caller holds the frontend link lock.
   * An unreadable file is an error record, never proof that the file is absent. */
  async savedBackup(signal?: AbortSignal): Promise<SavedSetSnapshot[] | undefined> {
    const snapshots: SavedSetSnapshot[] = []
    for (const slot of [0, 1] as const) {
      const snapshot = await this.savedSet(slot, signal)
      if (!snapshot) {
        if (snapshots.length) throw new VendorTransportError('The saved-file export disappeared during the backup.')
        return undefined
      }
      snapshots.push(snapshot)
    }
    return snapshots
  }
  private async savedMetadata(value: number, unsupported = false): Promise<SavedSetMetadata | undefined> {
    const reply = await this.device.controlTransferIn(this.setup(31, value), SAVED_SET_METADATA_BYTES)
    if (unsupported && reply.status === 'stall') return undefined
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The Octatrack did not confirm its saved-file snapshot.')
    return parseSavedSetMetadata(reply.data)
  }
  private async releaseSavedSet(token: number) {
    // One release attempt for our positively acknowledged token. A lost reply is
    // reconciled by polling, never by replaying Begin or releasing another job.
    let metadata: SavedSetMetadata | undefined
    try {
      const reply = await this.device.controlTransferIn(this.setup(33, token), SAVED_SET_METADATA_BYTES)
      if (reply.status === 'ok' && reply.data) metadata = parseSavedSetMetadata(reply.data)
    } catch { /* A read-only poll establishes whether the owned lease ended. */ }
    if (metadata?.status === 'idle' && metadata.token === token) return
    const current = await this.savedMetadata(0)
    if (current && (current.token > token || current.token === token && current.status === 'idle')) return
    throw new VendorTransportError('The saved-file snapshot release is unconfirmed; wait for its expiry before another operation.')
  }
  private async savedSet(slot: 0 | 1, signal?: AbortSignal): Promise<SavedSetSnapshot | undefined> {
    const deadline = AbortSignal.timeout(60000), stopped = signal ? AbortSignal.any([signal, deadline]) : deadline
    stopped.throwIfAborted()
    const baseline = await this.savedMetadata(0, true)
    stopped.throwIfAborted()
    if (!baseline) return undefined
    if (baseline.status !== 'idle' || baseline.token === 65535) throw new VendorTransportError('A saved-file snapshot is already active or its tokens are exhausted.')
    let owned: number | undefined
    try {
      // If Begin's reply is lost, its ownership is unknown. Do not repeat or
      // release it: the device's export-only timeout safely expires the job.
      const beginDeadline = Date.now() + 3000
      let metadata = await this.savedMetadata(slot + 1)
      let attempts = 1
      while (metadata?.status === 'busy' && metadata.token === baseline.token && metadata.slot === baseline.slot) {
        // A valid BUSY echoes the unchanged idle token and never begins a
        // snapshot. Confirm that same idle baseline before another attempt;
        // a changed token, ambiguous reply or another client's lease stops us.
        if (attempts >= 10 || Date.now() >= beginDeadline)
          throw new VendorTransportError('The Octatrack is busy; finish pending work before backing up saved files.', true)
        await wait(100, stopped)
        const idle = await this.savedMetadata(0)
        stopped.throwIfAborted()
        if (!idle || idle.status !== 'idle' || idle.token !== baseline.token || idle.slot !== baseline.slot)
          throw new VendorTransportError('The saved-file snapshot changed while waiting; no backup was taken.')
        if (Date.now() >= beginDeadline)
          throw new VendorTransportError('The Octatrack is busy; finish pending work before backing up saved files.', true)
        ++attempts
        metadata = await this.savedMetadata(slot + 1)
      }
      if (!metadata || metadata.status === 'busy' || metadata.status === 'idle' || metadata.token !== baseline.token + 1 || metadata.slot !== slot)
        throw new VendorTransportError('The Octatrack did not acknowledge this saved-file snapshot; no backup was taken.')
      owned = metadata.token
      stopped.throwIfAborted()
      while (metadata.status === 'pending') {
        await wait(25, stopped)
        const next = await this.savedMetadata(0)
        stopped.throwIfAborted()
        if (!next || next.token !== owned || next.slot !== slot || ['idle', 'busy'].includes(next.status)) throw new VendorTransportError('The saved-file snapshot changed or expired.')
        metadata = next
      }
      if (metadata.status !== 'ready') {
        if (!['unsafe', 'read-failed', 'invalid'].includes(metadata.status)) throw new VendorTransportError('The saved-file snapshot is not readable.')
        return metadata as SavedSetSnapshot
      }
      const data = new Uint8Array(metadata.length)
      for (let index = 0; index * SAVED_SET_CHUNK_DATA < data.length; index++) {
        stopped.throwIfAborted()
        const reply = await this.device.controlTransferIn(this.setup(32, index), SAVED_SET_CHUNK_BYTES)
        stopped.throwIfAborted()
        if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The Octatrack did not answer the saved-file chunk request.')
        data.set(parseSavedSetChunk(reply.data, metadata, index), index * SAVED_SET_CHUNK_DATA)
      }
      const final = await this.savedMetadata(0)
      stopped.throwIfAborted()
      const fileBase = data.length >= 52 && new DataView(data.buffer).getUint32(0) === 0x4d575354 ? toHex(data.subarray(20, 52)) : ZERO_DIGEST
      if (!final || final.status !== 'ready' || final.token !== owned || final.slot !== slot || final.length !== metadata.length ||
          final.sha256 !== metadata.sha256 || final.fileBase !== metadata.fileBase || sha(data) !== metadata.sha256 || fileBase !== metadata.fileBase)
        throw new VendorTransportError('The saved module file failed its snapshot identity or complete-file hash check.')
      return { ...metadata, status: 'ready', data }
    } finally {
      // Cancellation still releases the known lease. No caller abort signal is
      // passed to cleanup, and an unacknowledged Begin is never adopted.
      if (owned !== undefined) await this.releaseSavedSet(owned)
    }
  }
  async result(signal?: AbortSignal): Promise<VendorResult> {
    signal?.throwIfAborted()
    const reply = await this.device.controlTransferIn(this.setup(VENDOR_RESULT, 0), VENDOR_RESULT_BYTES)
    signal?.throwIfAborted()
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The device did not answer the result request.')
    return parseVendorResult(new Uint8Array(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength))
  }
  /** The unit's diagnostics log (diag.c), read page by page; undefined when the base stalls LOG (one built before it)
   * or holds no log yet. */
  async deviceLog(signal?: AbortSignal): Promise<DeviceLog | undefined> {
    const data = new Uint8Array(DEVICE_LOG_PAGE * DEVICE_LOG_PAGES)
    for (let page = 0; page < DEVICE_LOG_PAGES; ++page) {
      signal?.throwIfAborted()
      const reply = await this.device.controlTransferIn(this.setup(DEVICE_LOG_REQUEST, page), DEVICE_LOG_PAGE)
      if (reply.status === 'stall' && !page) return undefined
      if (reply.status !== 'ok' || reply.data?.byteLength !== DEVICE_LOG_PAGE) throw new VendorTransportError('The Octatrack did not answer the diagnostics log request.')
      data.set(new Uint8Array(reply.data.buffer, reply.data.byteOffset, DEVICE_LOG_PAGE), page * DEVICE_LOG_PAGE)
    }
    return parseDeviceLog(data)
  }
  /** The unit's self-test: start it (`start`), or read where it stands. Answered by the USB interrupt; undefined
   * when the base stalls the request (one built before the self-test). */
  async selftest(start: boolean, signal?: AbortSignal): Promise<SelftestRecord | undefined> {
    signal?.throwIfAborted()
    const reply = await this.device.controlTransferIn(this.setup(VENDOR_SELFTEST, start ? 1 : 0), SELFTEST_BYTES)
    signal?.throwIfAborted()
    if (reply.status === 'stall') return undefined
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The device did not answer the self-test request.')
    return parseSelftest(reply.data)
  }
  /** The modules the unit's project names that are not installed, answered by the USB interrupt, a page of 13 at a
   * time while pages come back full; undefined when the base stalls the request (one built before it). A base from
   * before pages stalls a later page: its first is all it has. */
  missing(signal?: AbortSignal) { return this.modules(VENDOR_MISSING, parseMissing, signal) }
  /** The modules installed on the unit, the same way; undefined from a base built before INVENTORY. */
  inventory(signal?: AbortSignal) { return this.modules(VENDOR_INVENTORY, parseInventory, signal) }
  /** Request 38 is a cached, read-only whole-set digest. A stale cache wakes
   * its engine owner; no scan or hash runs in the USB interrupt. */
  async setIdentity(signal?: AbortSignal): Promise<string> {
    const stopped = signal ?? AbortSignal.timeout(2000)
    for (let attempt = 0; attempt < 20; ++attempt) {
      stopped.throwIfAborted()
      const reply = await this.device.controlTransferIn(this.setup(38, 0), 40)
      stopped.throwIfAborted()
      if (reply.status === 'ok' && reply.data) return parseSetIdentity(reply.data)
      if (reply.status !== 'stall') throw new VendorTransportError('The Octatrack did not confirm its installed module set.')
      await wait(50, stopped)
    }
    throw new VendorTransportError('The Octatrack is busy; its installed module set could not be confirmed.')
  }
  private async modules(request: number, parse: (view: DataView) => MissingModule[], signal?: AbortSignal): Promise<MissingModule[] | undefined> {
    const all: MissingModule[] = []
    for (let first = 0; ; first += MISSING_PAGE) {
      signal?.throwIfAborted()
      const reply = await this.device.controlTransferIn(this.setup(request, first), MISSING_BYTES)
      if (reply.status === 'stall') return first ? all : undefined
      if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The device did not answer the module list request.')
      const page = parse(reply.data)
      all.push(...page)
      if (page.length < MISSING_PAGE) return all
    }
  }
  async exchange(frame: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
    if (this.busy) throw new VendorTransportError('A vendor exchange is already in progress.')
    if (frame.length < UPLOAD_HEADER || frame.length > UPLOAD_MAX_FRAME) throw new RangeError('Frame length is outside the protocol bounds.')
    this.busy = true
    try {
      const sequence = await this.submit(frame.slice(), signal)
      for (let poll = 0; ; poll++) {
        const state = await this.result(signal)
        if (state.sequence !== sequence) throw new VendorTransportError('The device reports a different submission.')
        if (state.status === 'ready') return state.response!
        if (state.status !== 'pending') throw new VendorTransportError('The device dropped the submission.', state.status === 'refused')
        await wait(Math.min(poll, this.options.pollMs ?? 20), signal)
      }
    } finally { this.busy = false }
  }
  private async submit(frame: Uint8Array, signal: AbortSignal) {
    // Continue from the device's latest sequence; never reuse one, even across transports.
    this.sequence ??= (await this.result(signal)).sequence
    const retries = this.options.retries ?? 8
    for (let attempt = 0; ; attempt++) {
      const sequence = this.sequence = (this.sequence + 1) & 0xffff
      let sent: { status: string; bytesWritten: number } | undefined
      try { sent = await this.device.controlTransferOut(this.setup(VENDOR_SUBMIT, sequence), frame) } catch { sent = undefined }
      signal.throwIfAborted()
      if (sent?.status === 'ok' && sent.bytesWritten === frame.length) return sequence
      // Unconfirmed submission: the device's result says whether it was accepted.
      const state = await this.result(signal)
      if (state.sequence === sequence && (state.status === 'pending' || state.status === 'ready')) return sequence
      const refused = sent?.status === 'stall' && (state.sequence !== sequence || state.status === 'refused')
      if (!refused) throw new VendorTransportError('The submission failed without a device refusal.')
      if (attempt >= retries) throw new VendorTransportError('The device kept refusing the submission.', true)
      await wait(2 ** Math.min(attempt, 5), signal)
    }
  }
}

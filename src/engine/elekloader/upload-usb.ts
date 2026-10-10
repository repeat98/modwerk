// SPDX-License-Identifier: GPL-3.0-or-later
// EP0 vendor transport for the upload session: browser peer of sdk/runtime/upload/vendor.c.
// The interface has no endpoints, so EP3 OUT stays free for USB Audio In.
import { UPLOAD_HEADER, UPLOAD_MAX_FRAME, UPLOAD_RESPONSE, UPLOAD_VERSION } from './upload-wire.ts'
import type { UploadTransport } from './upload-session.ts'

export const VENDOR_CLASS = 0xff
export const VENDOR_SUBCLASS = 0x4d // 'M'; must match the base's interface descriptor.
export const VENDOR_PROTOCOL = 1
export const VENDOR_SUBMIT = 1
export const VENDOR_RESULT = 2
export const VENDOR_IDENTIFY = 3
export const VENDOR_IDENTITY_BYTES = 64
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

export interface VendorIdentity { canSubmit: boolean; base: string; model: string }

/** IDENTIFY's 64 bytes, refused unless every field is exactly what this client speaks. */
export function parseVendorIdentity(bytes: Uint8Array): VendorIdentity {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const fail = (why: string): never => { throw new VendorTransportError('Unsupported vendor identity: ' + why + '.') }
  if (bytes.length !== VENDOR_IDENTITY_BYTES || bytes[0] !== 0x4d || bytes[1] !== 0x57 || bytes[2] !== 0x55 || bytes[3] !== 0x49) fail('framing')
  if (bytes[4] !== VENDOR_VERSION || bytes[5] !== UPLOAD_VERSION) fail('version')
  const capabilities = view.getUint16(6)
  if (capabilities & ~VENDOR_CAN_SUBMIT) fail('capabilities')
  if (view.getUint16(8) !== UPLOAD_MAX_FRAME || view.getUint16(10) !== VENDOR_RESULT_BYTES || view.getUint32(12) !== 0) fail('limits')
  const model = bytes.subarray(48), length = model.indexOf(0) < 0 ? model.length : model.indexOf(0)
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
  async result(signal?: AbortSignal): Promise<VendorResult> {
    signal?.throwIfAborted()
    const reply = await this.device.controlTransferIn(this.setup(VENDOR_RESULT, 0), VENDOR_RESULT_BYTES)
    signal?.throwIfAborted()
    if (reply.status !== 'ok' || !reply.data) throw new VendorTransportError('The device did not answer the result request.')
    return parseVendorResult(new Uint8Array(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength))
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

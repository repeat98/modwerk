import { describe, expect, it } from 'vitest'
import {
  findVendorInterface, parseVendorIdentity, parseVendorResult, UsbVendorTransport, VendorTransportError, type ControlDevice,
  VENDOR_CLASS, VENDOR_PROTOCOL, VENDOR_RESULT_BYTES, VENDOR_SUBCLASS,
} from './upload-usb'

const alt = (c: number, s: number, p: number, endpoints: unknown[] = []) =>
  ({ interfaceClass: c, interfaceSubclass: s, interfaceProtocol: p, endpoints })
const config = (...interfaces: [number, ...ReturnType<typeof alt>[]][]) =>
  ({ interfaces: interfaces.map(([interfaceNumber, ...alternates]) => ({ interfaceNumber, alternates })) })
const ours = alt(VENDOR_CLASS, VENDOR_SUBCLASS, VENDOR_PROTOCOL)

describe('vendor interface selection', () => {
  it('finds exactly one endpoint-free Modwerk interface beside the stock ones', () => {
    expect(findVendorInterface(config([0, alt(8, 6, 0x50, [1, 2])], [1, alt(1, 1, 0)], [6, ours]))).toBe(6)
  })
  it('refuses duplicates, endpoints, other protocols, alternates and missing configurations', () => {
    for (const bad of [config([6, ours], [7, ours]), config([6, alt(VENDOR_CLASS, VENDOR_SUBCLASS, VENDOR_PROTOCOL, [1])]),
      config([6, alt(VENDOR_CLASS, VENDOR_SUBCLASS, 2)]), config([6, ours, ours]), config(), null])
      expect(findVendorInterface(bad)).toBeUndefined()
  })
})

// Independently specified IDENTIFY: big-endian, base 0x31 * 32, model "OCTATRACK".
const identity = (capabilities = 1) => Uint8Array.from(Buffer.from('4d575549' + '0101' +
  capabilities.toString(16).padStart(4, '0') + '1034' + '0098' + '00000000' + '31'.repeat(32) +
  Buffer.from('OCTATRACK').toString('hex').padEnd(32, '0'), 'hex'))

describe('vendor identity', () => {
  it('reads the base, model and whether frames can be submitted', () => {
    expect(parseVendorIdentity(identity())).toEqual({ canSubmit: true, base: '31'.repeat(32), model: 'OCTATRACK' })
    expect(parseVendorIdentity(identity(0)).canSubmit).toBe(false)
  })
  it('refuses any field this client does not speak', () => {
    const cases: [number, number][] = [[0, 0], [4, 2], [5, 2], [7, 2], [9, 0x35], [11, 0x99], [15, 1], [48, 0], [48, 9], [63, 0x41]]
    for (const [offset, value] of cases) {
      const bytes = identity(); bytes[offset] = value
      expect(() => parseVendorIdentity(bytes), String(offset)).toThrow(VendorTransportError)
    }
    expect(() => parseVendorIdentity(identity().subarray(0, 63))).toThrow(VendorTransportError)
  })
})

const header = (status: number, sequence: number) => [0x4d, 0x57, 0x55, 0x54, 1, status, sequence >> 8, sequence & 0xff]
const ready = (sequence: number, fill = 7) => Uint8Array.from([...header(2, sequence), ...new Array(144).fill(fill)])

describe('vendor result framing', () => {
  it('reads short status replies and full ready replies', () => {
    expect(parseVendorResult(Uint8Array.from(header(1, 0x1234)))).toEqual({ status: 'pending', sequence: 0x1234, response: undefined })
    const parsed = parseVendorResult(ready(9))
    expect(parsed.status).toBe('ready'); expect(parsed.response).toEqual(new Uint8Array(144).fill(7))
  })
  it('refuses wrong magic, version, status and lengths', () => {
    for (const mutate of [(b: Uint8Array) => { b[0] = 0 }, (b: Uint8Array) => { b[4] = 2 }, (b: Uint8Array) => { b[5] = 4 }, (b: Uint8Array) => { b[5] = 1 }]) {
      const bytes = ready(1); mutate(bytes)
      expect(() => parseVendorResult(bytes)).toThrow(VendorTransportError)
    }
    for (const bytes of [ready(1).subarray(0, 8), ready(1).subarray(0, VENDOR_RESULT_BYTES - 1), Uint8Array.from(header(0, 0).slice(0, 7)),
      Uint8Array.from([...header(1, 0), 0])])
      expect(() => parseVendorResult(bytes)).toThrow(VendorTransportError)
  })
})

/** A scripted device: OUT outcomes in order, then RESULT replies computed from what it saw. */
function device(outs: ('ok' | 'stall' | 'throw')[], results: (sent: number[]) => Uint8Array[]) {
  const sent: number[] = [], replies: Uint8Array[] = []
  let initial = true
  const fake: ControlDevice & { sent: number[] } = {
    sent,
    async controlTransferOut(setup, data) {
      expect(setup).toMatchObject({ requestType: 'vendor', recipient: 'interface', request: 1, index: 6 })
      sent.push(setup.value)
      const outcome = outs.shift() ?? 'ok'
      if (outcome === 'throw') throw new Error('transfer error')
      return outcome === 'ok' ? { status: 'ok', bytesWritten: data.length } : { status: 'stall', bytesWritten: 0 }
    },
    async controlTransferIn(setup, length) {
      expect(setup).toMatchObject({ request: 2, value: 0, index: 6 }); expect(length).toBe(VENDOR_RESULT_BYTES)
      if (initial) { initial = false; return { status: 'ok', data: new DataView(Uint8Array.from(header(3, 0xfffe)).buffer) } }
      if (!replies.length) replies.push(...results(sent))
      const bytes = replies.shift()!
      return { status: 'ok', data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) }
    },
  }
  return fake
}
const frame = new Uint8Array(48)
const exchange = (d: ControlDevice, signal = new AbortController().signal) =>
  new UsbVendorTransport(d, 6, { pollMs: 0 }).exchange(frame, signal)

describe('vendor transport', () => {
  it('continues from the device sequence, wraps through zero and polls until ready', async () => {
    const d = device(['ok'], sent => [Uint8Array.from(header(1, sent[0])), ready(sent[0])])
    expect(await exchange(d)).toEqual(new Uint8Array(144).fill(7))
    expect(d.sent).toEqual([0xffff])
  })
  it('reconciles a lost status stage by reading, without resubmitting', async () => {
    const d = device(['throw'], sent => [Uint8Array.from(header(1, sent[0])), ready(sent[0])])
    await exchange(d); expect(d.sent).toEqual([0xffff])
  })
  it('retries only positive refusals, each under a new sequence', async () => {
    const d = device(['stall', 'stall', 'ok'], sent => sent.length === 1 ? [Uint8Array.from(header(3, sent[0]))]
      : sent.length === 2 ? [Uint8Array.from(header(0, 0xfffe))] : [ready(sent[2])])
    await exchange(d); expect(d.sent).toEqual([0xffff, 0, 1])
  })
  it('treats a stalled transfer the device reports as accepted as accepted', async () => {
    const d = device(['stall'], sent => [Uint8Array.from(header(1, sent[0])), ready(sent[0])])
    await exchange(d); expect(d.sent).toEqual([0xffff])
  })
  it('stops when a failed transfer has no positive refusal', async () => {
    const d = device(['throw'], () => [Uint8Array.from(header(3, 0x1234))])
    await expect(exchange(d)).rejects.toMatchObject({ name: 'VendorTransportError', notExecuted: false })
    expect(d.sent).toEqual([0xffff])
  })
  it('stops on another submission, a dropped frame or repeated refusals', async () => {
    await expect(exchange(device(['ok'], sent => [Uint8Array.from(header(1, sent[0] + 3))]))).rejects.toThrow(/different submission/)
    await expect(exchange(device(['ok'], sent => [Uint8Array.from(header(3, sent[0]))]))).rejects.toMatchObject({ notExecuted: true })
    const d = device(new Array(20).fill('stall'), sent => [Uint8Array.from(header(3, sent.at(-1)!))])
    await expect(new UsbVendorTransport(d, 6, { retries: 2 }).exchange(frame, new AbortController().signal))
      .rejects.toMatchObject({ notExecuted: true })
    expect(d.sent).toHaveLength(3)
  })
  it('stops polling when aborted and refuses overlapping or out-of-bounds frames', async () => {
    const abort = new AbortController()
    const d = device(['ok'], sent => { abort.abort(); return [Uint8Array.from(header(1, sent[0]))] })
    await expect(exchange(d, abort.signal)).rejects.toThrow()
    const t = new UsbVendorTransport(device([], () => []), 6)
    await expect(t.exchange(new Uint8Array(47), new AbortController().signal)).rejects.toThrow(RangeError)
    await expect(t.exchange(new Uint8Array(4149), new AbortController().signal)).rejects.toThrow(RangeError)
    expect(() => new UsbVendorTransport(d, 256)).toThrow(RangeError)
  })
})

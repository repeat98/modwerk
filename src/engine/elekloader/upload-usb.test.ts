import { describe, expect, it } from 'vitest'
import {
  findVendorInterface, parseInventory, parseMissing, parseRefusalSubject, parseRuntimeCapabilities, parseVendorIdentity, parseVendorResult, UsbVendorTransport, VendorTransportError, type ControlDevice,
  VENDOR_CLASS, VENDOR_PROTOCOL, VENDOR_RESULT_BYTES, VENDOR_SUBCLASS,
} from './upload-usb'

const alt = (c: number, s: number, p: number, endpoints: unknown[] = []) =>
  ({ interfaceClass: c, interfaceSubclass: s, interfaceProtocol: p, endpoints })
const config = (...interfaces: [number, ...ReturnType<typeof alt>[]][]) =>
  ({ interfaces: interfaces.map(([interfaceNumber, ...alternates]) => ({ interfaceNumber, alternates })) })
const ours = alt(VENDOR_CLASS, VENDOR_SUBCLASS, VENDOR_PROTOCOL)

describe('runtime capabilities', () => {
  // MWCP v1, ABI 8, sites/copies/fills/tables/groups, 128 sites and 32 copies.
  const bytes = () => Uint8Array.from(Buffer.from('4d5743500108001f00800020', 'hex'))
  it('reads the independently specified wire record and retains unknown feature bits', () => {
    const data = bytes()
    expect(parseRuntimeCapabilities(new DataView(data.buffer))).toEqual({ abi: 8, features: 31, maxSites: 128, maxCopies: 32 })
    data[6] = 0x80
    expect(parseRuntimeCapabilities(new DataView(data.buffer)).features).toBe(0x801f)
  })
  it('refuses truncated, extended, unknown-version and malformed records', () => {
    for (const length of [0, 4, 11, 13]) expect(() => parseRuntimeCapabilities(new DataView(new ArrayBuffer(length)))).toThrow(VendorTransportError)
    for (const [offset, value] of [[0, 0], [4, 2], [5, 0]]) {
      const data = bytes(); data[offset] = value
      expect(() => parseRuntimeCapabilities(new DataView(data.buffer))).toThrow(VendorTransportError)
    }
  })
  it('distinguishes an old base from a missing or damaged reply without writing to the unit', async () => {
    let reply: Awaited<ReturnType<ControlDevice['controlTransferIn']>> = { status: 'stall' }
    const transport = new UsbVendorTransport({
      async controlTransferOut() { throw new Error('Capabilities must be read-only') },
      async controlTransferIn(setup, length) {
        expect(setup).toMatchObject({ request: 29, value: 0, index: 6 }); expect(length).toBe(12)
        return reply
      },
    }, 6)
    expect(await transport.capabilities()).toBeUndefined()
    reply = { status: 'ok' }
    await expect(transport.capabilities()).rejects.toThrow(VendorTransportError)
    reply = { status: 'ok', data: new DataView(bytes().buffer) }
    expect((await transport.capabilities())?.abi).toBe(8)
  })
})

describe('what a refusal met', () => {
  const record = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer)
  it('reads MWRF v1', () => {
    expect(parseRefusalSubject(record([0x4d, 0x57, 0x52, 0x46, 1, 3, 0, 4, 2, 0, 7, 0x0f, 0x3c, 0xbe, 0xdc, 0x9c])))
      .toEqual({ refusal: 3, kind: 4, what: 0x0200070f, module: 0x3cbedc9c })
  })
  it('reads nothing from another record, version or length', () => {
    expect(parseRefusalSubject(record([0x4d, 0x57, 0x43, 0x50, 1, 3, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeUndefined()
    expect(parseRefusalSubject(record([0x4d, 0x57, 0x52, 0x46, 2, 3, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeUndefined()
    expect(parseRefusalSubject(record([0x4d, 0x57, 0x52, 0x46, 1, 3, 0, 4]))).toBeUndefined()
  })
})

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
  Buffer.from('OCTATRACK').toString('hex').padEnd(32, '0') + '00'.repeat(8), 'hex'))

describe('vendor identity', () => {
  it('reads the base, model and whether frames can be submitted', () => {
    expect(parseVendorIdentity(identity())).toEqual({ canSubmit: true, base: '31'.repeat(32), model: 'OCTATRACK' })
    expect(parseVendorIdentity(identity(0)).canSubmit).toBe(false)
  })
  it('refuses any field this client does not speak', () => {
    const cases: [number, number][] = [[0, 0], [4, 2], [5, 2], [7, 2], [9, 0x35], [11, 0x99], [15, 1], [48, 0], [48, 9], [63, 0x41], [70, 1]]
    for (const [offset, value] of cases) {
      const bytes = identity(); bytes[offset] = value
      expect(() => parseVendorIdentity(bytes), String(offset)).toThrow(VendorTransportError)
    }
    expect(() => parseVendorIdentity(identity().subarray(0, 64))).toThrow(VendorTransportError)
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

describe('the modules a project names that are not installed', () => {
  it('reads MISSING: "MWM", a count, 24 bytes a module', () => {
    const view = new DataView(new ArrayBuffer(4 + 24))
    ;[0x4d, 0x57, 0x4d, 1, 27].forEach((b, i) => view.setUint8(i < 4 ? i : 4, b))
    view.setUint16(6, 1); view.setUint32(8, 0x873d83cc); [...'E-Verb'].forEach((ch, i) => view.setUint8(12 + i, ch.charCodeAt(0)))
    expect(parseMissing(view)).toEqual([{ handle: 27, layout: 1, module: '873d83cc', name: 'E-Verb' }])
    expect(parseMissing(new DataView(new Uint8Array([0x4d, 0x57, 0x4d, 0]).buffer))).toEqual([])
    expect(() => parseMissing(new DataView(new Uint8Array([0x4d, 0x57, 0x4d, 1]).buffer))).toThrow(VendorTransportError)
  })
  it('reads MISSING a page of 13 at a time, and stops at a base without pages', async () => {
    const page = (first: number, n: number) => {
      const view = new DataView(new ArrayBuffer(4 + 24 * n))
      ;[0x4d, 0x57, 0x4d, n].forEach((b, i) => view.setUint8(i, b))
      for (let i = 0; i < n; i++) view.setUint8(4 + 24 * i, first + i)
      return view
    }
    const asked: number[] = []
    const unit = (pages: boolean): ControlDevice => ({
      async controlTransferOut() { throw new Error('read-only') },
      async controlTransferIn(setup, length) {
        expect(setup).toMatchObject({ request: 14 }); expect(length).toBe(316); asked.push(setup.value)
        if (setup.value && !pages) return { status: 'stall' }
        return { status: 'ok', data: page(setup.value, setup.value ? 2 : 13) }
      },
    })
    expect((await new UsbVendorTransport(unit(true), 6).missing())!.map(m => m.handle)).toEqual([...Array(15).keys()])
    expect(asked).toEqual([0, 13])
    expect((await new UsbVendorTransport(unit(false), 6).missing())!.length).toBe(13)
  })
  it('reads INVENTORY, the installed modules, in the same form and pages ("MWI"; 0xff: no DSP code)', async () => {
    const view = new DataView(new ArrayBuffer(4 + 24))
    ;[0x4d, 0x57, 0x49, 1, 0xff].forEach((b, i) => view.setUint8(i, b))
    view.setUint32(8, 0x0000002a)
    expect(parseInventory(view)).toEqual([{ handle: 0xff, layout: 0, module: '0000002a', name: '' }])
    expect(() => parseMissing(view)).toThrow(VendorTransportError)
    const unit = (stall: boolean): ControlDevice => ({
      async controlTransferOut() { throw new Error('read-only') },
      async controlTransferIn(setup, length) { expect(setup).toMatchObject({ request: 27 }); expect(length).toBe(316); return stall ? { status: 'stall' } : { status: 'ok', data: view } },
    })
    expect(await new UsbVendorTransport(unit(false), 6).inventory()).toEqual([{ handle: 0xff, layout: 0, module: '0000002a', name: '' }])
    expect(await new UsbVendorTransport(unit(true), 6).inventory()).toBeUndefined() // a base from before INVENTORY
  })
})

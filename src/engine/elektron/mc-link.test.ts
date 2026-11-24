import { describe, expect, it } from 'vitest'
import { packSection } from '../aplib'
import { contentChecksum, encodeSyx } from './sysex'
import { ELE3_DEVICES } from './ele3'
import { MC_PART_BYTES, McRefused, mcModules, mcRemovalPackage, mcReply, mcRequest, mcSetIdentity, mcUploadBase, mcUploadTransport, parseMcIdent, parseMcLoad, readMcIdentity, readMcLoad, type McCall } from './mc-link'
import { pack7, unpack7 } from './dn2-link'
import type { MidiAccessLike, MidiIn, MidiOut } from './os-upgrade-midi'

const put32 = (v: number) => [0, 1, 2, 3, 4].map(i => v >>> 7 * i & 0x7f)
const identPayload = (fields: number[]) => fields.flatMap(put32)
// link.c's ident order: version, received, dropped, ticks, port, sent, failures, armed, person, presses, posted,
// refused, mailbox, boot status, boot image CRC, set CRC, set bytes
const FIELDS = [1, 3, 0, 395, 2, 2, 0, 1, 0, 0, 0, 0, 0x4d574253, 1, 0x36fc4fa1, 0xf2fe7324, 5764]
// link.c's begin(): the reply carries the command with 0x40 set
const reply = (seq: number, body: number[], status = 0, cmd = 0x41) => Uint8Array.from([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, seq, cmd, status, ...body, 0xf7])

describe('the Model:Cycles link', () => {
  it('asks for the identity in the Rytm link wire format', () => {
    expect([...mcRequest(0x85, 1)]).toEqual([0xf0, 0x7d, 0x4d, 0x57, 0x4c, 1, 0x05, 1, 0xf7])
  })
  it('reads every ident field, the set identity included', () => {
    const payload = mcReply(reply(9, identPayload(FIELDS)), 9, 1)!
    expect(parseMcIdent(payload)).toEqual({
      linkVersion: 1, port: 'USB', armed: true, personAtUnit: false,
      counts: { received: 3, dropped: 0, sent: 2, sendFailures: 0, posted: 0, refused: 0, ticks: 395 },
      ramBoot: { status: 'booted from RAM', imageCrc: 0x36fc4fa1 }, set: { crc: 0xf2fe7324, bytes: 5764 },
    })
  })
  it('reads an older base without the set identity, and refuses a short one', () => {
    expect(parseMcIdent(Uint8Array.from(identPayload(FIELDS.slice(0, 15)))).set).toBeNull()
    expect(() => parseMcIdent(Uint8Array.from(identPayload(FIELDS.slice(0, 14))))).toThrow('short identity')
  })
  it('ignores other messages and reports a refusal', () => {
    expect(mcReply(reply(8, []), 9, 1)).toBeNull()
    expect(mcReply(reply(9, [], 0, 0x01), 9, 1)).toBeNull()   // a request echoed back, not a reply
    expect(mcReply(Uint8Array.from([0xf0, 0x00, 0x20, 0x3c, 0x10, 0, 0, 0, 0, 0xf7]), 9, 1)).toBeNull()
    expect(() => mcReply(reply(9, [], 2), 9, 1)).toThrow('bad request')
  })
  it('asks the unit whose port names a Model:Cycles, and gives up quietly without one', async () => {
    const sent: number[][] = []
    const input: MidiIn = { id: 'i', name: 'Elektron Model:Cycles', onmidimessage: null }
    const output: MidiOut = { id: 'o', name: 'Elektron Model:Cycles', send(data) { sent.push(data); queueMicrotask(() => input.onmidimessage?.({ data: reply(data[6], identPayload(FIELDS)) })) } }
    const access: MidiAccessLike = { inputs: new Map([['i', input]]), outputs: new Map([['o', output]]) }
    expect((await readMcIdentity(access))?.set).toEqual({ crc: 0xf2fe7324, bytes: 5764 })
    expect(sent).toHaveLength(1)
    expect(input.onmidimessage).toBeNull()
    expect(await readMcIdentity({ inputs: new Map(), outputs: new Map() })).toBeNull()
  })
  it('reads the load in tenths of a percent, with no window share before the first window ends', () => {
    expect(parseMcLoad(Uint8Array.from(identPayload([738, 801, 849, 12, 9000])))).toEqual({ windowPercent: 73.8, windowPeakPercent: 80.1, peakPercent: 84.9, windows: 12, blocks: 9000 })
    expect(parseMcLoad(Uint8Array.from(identPayload([0, 0, 812, 0, 400])))).toMatchObject({ windowPercent: null, windowPeakPercent: null, peakPercent: 81.2 })
    expect(() => parseMcLoad(Uint8Array.from(identPayload([1, 2, 3, 4])))).toThrow('short load')
  })
  it('asks for the load with 0x23 and reads a refusal as an older base', async () => {
    const unit = (status: number, body: number[]) => {
      const sent: number[][] = []
      const input: MidiIn = { id: 'i', name: 'Elektron Model:Cycles', onmidimessage: null }
      const output: MidiOut = { id: 'o', name: 'Elektron Model:Cycles', send(data) { sent.push(data); queueMicrotask(() => input.onmidimessage?.({ data: reply(data[6], body, status, data[7] | 0x40) })) } }
      return { sent, access: { inputs: new Map([['i', input]]), outputs: new Map([['o', output]]) } as MidiAccessLike }
    }
    const ok = unit(0, identPayload([738, 801, 849, 12, 9000]))
    expect(await readMcLoad(ok.access)).toMatchObject({ windowPercent: 73.8 })
    expect(ok.sent[0][7]).toBe(0x23)
    expect(await readMcLoad(unit(2, []).access)).toBe('unsupported')
    await expect(readMcLoad(unit(3, []).access)).rejects.toBeInstanceOf(McRefused)
  })
  it('computes the set identity from the end of a built image', () => {
    // a generated container, no firmware bytes: the last 64 bytes stand for the linked .run block
    const image = Uint8Array.from({ length: 512 }, (_, i) => i * 7 % 251), packed = packSection(image)
    const container = new Uint8Array(64 + packed.length + (-packed.length & 15)), view = new DataView(container.buffer)
    container.set([0x45, 0x4c, 0x45, 0x33])
    view.setUint32(0x1c, 1); view.setUint32(0x20, 3); view.setUint32(0x24, 64); view.setUint32(0x28, packed.length); view.setUint32(0x2c, 0x40000400)
    container.set(packed, 64)
    const stream = new Uint8Array(8 + container.length), streamView = new DataView(stream.buffer)
    streamView.setUint32(0, container.length); streamView.setUint32(4, contentChecksum(container)); stream.set(container, 8)
    const id = ELE3_DEVICES['model-cycles'].sysexId, framing = Uint8Array.from([0xf0, 0, 0x20, 0x3c, id, 0, 0x7d, 0, 0x10, 1, 2, 3, 0, 0, 0, 0xf7])
    const syx = encodeSyx(stream, id, framing, framing)
    // zlib's crc32 of the last 64 bytes, computed independently
    let c = 0xffffffff
    for (const b of image.subarray(448)) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1 }
    expect(mcSetIdentity(syx, 64)).toEqual({ crc: (c ^ 0xffffffff) >>> 0, bytes: 64 })
    expect(() => mcSetIdentity(syx, 513)).toThrow('larger than the image')
  })
})

describe('the Model:Cycles runtime loader over the link', () => {
  it('binds uploads to the SHA-256 of the set CRC, big-endian (base/modules.c)', () => {
    // python3: hashlib.sha256(bytes.fromhex('f8812876')).hexdigest()
    expect(mcUploadBase(0xf8812876)).toBe('ce2bb2aa7f867fb9932446cac1eb45c726561979bb5f75ffe10f6efdbd31b5d9')
  })
  it('sends a frame in parts under 128 bytes, then runs it and decodes the 144-byte response', async () => {
    const frame = Uint8Array.from({ length: 2100 }, (_, i) => (i * 37 + (i >> 8)) & 0xff)
    const got = new Uint8Array(2100), sizes: number[] = [], response = Uint8Array.from({ length: 144 }, (_, i) => 255 - i)
    let ran = 0
    const call: McCall = async (cmd, body = []) => {
      sizes.push(8 + body.length + 1)
      const at = body[0] | body[1] << 7 | body[2] << 14
      if (cmd === 0x31) { got.set(unpack7(Uint8Array.from(body.slice(5))), at); return new Uint8Array() }
      if (cmd === 0x32) { ran = at; return Uint8Array.from(pack7(response)) }
      return null
    }
    const out = await mcUploadTransport(call).exchange(frame, new AbortController().signal)
    expect([...got]).toEqual([...frame])
    expect(ran).toBe(2100)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(124)
    expect(sizes.length).toBe(Math.ceil(2100 / MC_PART_BYTES) + 1)
    expect([...out]).toEqual([...response])
  })
  it('stops at a part the unit does not take', async () => {
    const call: McCall = async () => null
    await expect(mcUploadTransport(call).exchange(new Uint8Array(48), new AbortController().signal)).rejects.toThrow('did not take')
  })
  it('removes a module with an empty package under its id', () => {
    // mc_link.py empty_package('hello'): python3 -c "import hashlib;print(hashlib.sha256(b'hello').hexdigest()[:8])" is 2cf24dba
    expect(Buffer.from(mcRemovalPackage('hello')).toString('hex')).toBe('4d57524d0004000000000000000000000000000000000000000000002cf24dba')
  })
  it('lists the pool and the live modules, three a reply', async () => {
    const entry = (id: number, name: string) => [0xff, 0, 0, 1, id >>> 24, id >>> 16 & 0xff, id >>> 8 & 0xff, id & 0xff, ...[...name.padEnd(16, '\0')].map(c => c.charCodeAt(0))]
    const head = (n: number) => [0, 0, 0xfe, 0x60, 0, 0, 0xfe, 0x60, 0, 0, 0, 0, 0, 0, 0, 4, 0x4d, 0x57, 0x49, n]
    const pages = [[...head(3), ...entry(0x594cfd26, 'frames'), ...entry(0x2cf24dba, ''), ...entry(1, 'a')], [...head(1), ...entry(2, 'b')]]
    const firsts: number[] = []
    const call: McCall = async (_cmd, body = []) => { firsts.push(body[0]); return Uint8Array.from(pack7(Uint8Array.from(pages[firsts.length - 1]))) }
    const list = await mcModules(call)
    expect(firsts).toEqual([0, 3])
    expect(list).toEqual({ free: 65120, largest: 65120, refusal: 'none', active: 4,
      modules: [{ id: '594cfd26', name: 'frames' }, { id: '2cf24dba', name: '' }, { id: '00000001', name: 'a' }, { id: '00000002', name: 'b' }] })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fakeEffect, fakeEffectList, fakeZoomPedal } from '../../dev/zoom-pedal-fake'
import { ZoomLink } from './zoom-link'
import { MIDISTOMP_FEATURES, crc32, effectInfo, pack7, parseIdentity, parseLoad, unpack7 } from './zoom-protocol'

const connected = async (pedal: ReturnType<typeof fakeZoomPedal>, timeout = 200) => {
  const link = new ZoomLink(() => Promise.resolve(pedal.access), timeout)
  await link.connect()
  return link
}

describe('the Zoom file protocol', () => {
  it('packs 8-bit data into 7-bit MIDI bytes and back', () => {
    const data = Array.from({ length: 300 }, (_, i) => (i * 37 + 11) & 0xff)
    const packed = pack7(data)
    expect(packed.every(b => b < 0x80)).toBe(true)
    expect(unpack7(packed).slice(0, data.length)).toEqual(data)
  })
  it('uses the standard CRC-32', () => expect(crc32(Array.from('123456789', c => c.charCodeAt(0)))).toBe(0xcbf43926))
  it('reads model and firmware from the identity reply', () => {
    expect(parseIdentity([0xf0, 0x7e, 0, 0x06, 0x02, 0x52, 0x61, 0, 0, 0, 0x32, 0x2e, 0x31, 0x30, 0xf7])).toEqual({ deviceId: 0x61, model: 'MS-70CDR', firmware: '2.10' })
    expect(parseIdentity([0xf0, 0x7e, 0, 0x06, 0x02, 0x41, 0x61, 0xf7])).toBeUndefined()
  })
  it('reads MIDISTOMP’s load reply as its diag.c sends it', () => {
    // MIDISTOMP's 06 code compiled for the host by its tests/test_diag_sysex.py harness (per 25742 cycles, window 133).
    const m = 'F0 7D 4D 53 54 47 11 44 0E 64 00 00 7D 3F 00 20 00 55 4A 00 00 6D 00 11 00 00 0D 02 00 00 03 00 19 00 00 00 00 00 00 00 00 00 00 00 00 00 00 20 00 62 0E 00 00 00 00 01 00 00 02 00 00 00 05 08 00 00 00 5A 00 00 00 04 70 11 01 00 42 01 00 00 00 00 00 00 00 58 02 00 00 00 54 61 70 65 45 00 63 68 6F 2D 00 00 00 00 00 00 00 00 2D 00 00 00 00 00 00 00 00 2D 00 00 00 00 00 00 00 00 4E 00 41 4D 31 00 00 00 00 00 3F 00 00 00 00 00 00 00 00 F7'
    expect(parseLoad(m.split(' ').map(h => parseInt(h, 16)))).toEqual({ window: 133, cpu: 473, audio: 301, audioMax: 352, perform: 12, midi: 4, system: 2, late: 2, lateTotal: 70000, dsp: 1050,
      slots: [{ name: 'TapeEcho', cpu: 120, dsp: 450 }, { name: '-', cpu: 0, dsp: 0 }, { name: '-', cpu: 0, dsp: 0 }, { name: '-', cpu: 0, dsp: 0 }, { name: 'NAM1', cpu: 70, dsp: 600 }, { name: '?', cpu: 0, dsp: 0 }] })
  })
  it('reads an effect file header', () => expect(effectInfo(fakeEffect('LOOP.ZDL', 8, 480, '0.03').data)).toEqual({ gid: 8, fxid: 480, version: '0.03' }))
})

describe('the Zoom link', () => {
  it('identifies the pedal', async () => {
    const link = await connected(fakeZoomPedal())
    expect(link.getState()).toMatchObject({ status: 'ready', identity: { model: 'MS-70CDR', firmware: '2.10' } })
  })
  it('says so when no Zoom pedal is plugged in, or it stays silent', async () => {
    const other = await connected(fakeZoomPedal({ portName: 'IAC Driver Bus 1' }))
    expect(other.getState()).toMatchObject({ status: 'idle', notice: { tone: 'error' } })
    const silent = await connected(fakeZoomPedal({ silent: true }), 30)
    expect(silent.getState().notice?.text).toMatch(/didn’t answer/)
  })
  it('lists files with each effect’s id and version, and the free space', async () => {
    const files = [fakeEffect('LOOP.ZDL', 8, 480, '0.03'), fakeEffect('DELAY.ZDL', 7, 16, '1.00'), { name: 'FLST_SEQ.ZDT', data: Array(4108).fill(0) }]
    const link = await connected(fakeZoomPedal({ files, free: 123_456 }))
    const listed = await link.listFiles({ versions: true })
    expect(listed.map(f => [f.name, f.size, f.effect?.fxid])).toEqual([['LOOP.ZDL', 1200, 480], ['DELAY.ZDL', 1200, 16], ['FLST_SEQ.ZDT', 4108, undefined]])
    expect(await link.freeSpace()).toBe(123_456)
    expect(link.getState().status).toBe('ready')
  })
  it('reads the headers of effects the effect list puts in group 8 or doesn’t name, not the others', async () => {
    const files = [fakeEffect('LOOP.ZDL', 8, 480, '0.03'), fakeEffect('DELAY.ZDL', 7, 16, '1.00'), fakeEffect('HAND.ZDL', 8, 500, '0.01'), fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL'] })]
    const link = await connected(fakeZoomPedal({ files }))
    expect((await link.listFiles({ versions: true })).map(f => [f.name, f.effect?.fxid])).toEqual([['LOOP.ZDL', 480], ['DELAY.ZDL', undefined], ['HAND.ZDL', 500], ['FLST_SEQ.ZDT', undefined]])
  })
  it('backs up every file whole, and sends nothing that writes', async () => {
    const files = [fakeEffect('LOOP.ZDL', 8, 480, '0.03', 3000), { name: 'FLST_SEQ.ZDT', data: Array.from({ length: 4108 }, (_, i) => i & 0xff) }]
    const pedal = fakeZoomPedal({ files }), link = await connected(pedal)
    const { files: count, zip } = await link.backup()
    expect(count).toBe(2)
    const bytes = new Uint8Array(await zip.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 3, 4])
    expect(zip.size).toBeGreaterThan(3000 + 4108)
    // Writes (0x23), deletes (0x24) and opening for writing (0x20 0x01) never go out.
    const fileCommands = pedal.sent.filter(m => m[1] === 0x52 && m[4] === 0x60)
    expect(fileCommands.some(m => m[5] === 0x23 || m[5] === 0x24 || (m[5] === 0x20 && m[6] === 0x01))).toBe(false)
  })
  it('runs one file operation at a time', async () => {
    const link = await connected(fakeZoomPedal({ files: [fakeEffect('A.ZDL', 8, 500, '0.26')] }))
    const [a, b] = await Promise.all([link.listFiles(), link.freeSpace()])
    expect(a).toHaveLength(1); expect(b).toBe(400_000)
  })
  it('asks for a connection before reading', async () => {
    const link = new ZoomLink(() => Promise.resolve(fakeZoomPedal().access))
    await expect(link.listFiles()).rejects.toThrow(/Connect/)
  })
  it('saves nothing when a reply is lost, and the next operation works', async () => {
    const files = ['A', 'B', 'C', 'D', 'E'].map((n, i) => fakeEffect(n + '.ZDL', 8, 500 + i, '0.26'))
    const link = await connected(fakeZoomPedal({ files, slow: { cmd: 0x26, nth: 2, ms: null } }), 60)
    await expect(link.backup()).rejects.toThrow(/stopped answering/)
    expect(link.getState().status).toBe('ready')
    expect((await link.listFiles()).map(f => f.name)).toEqual(['A.ZDL', 'B.ZDL', 'C.ZDL', 'D.ZDL', 'E.ZDL'])
  })
  it('never takes a late reply as the answer to the next request', async () => {
    const files = ['A', 'B', 'C'].map((n, i) => fakeEffect(n + '.ZDL', 8, 500 + i, '0.26'))
    const link = await connected(fakeZoomPedal({ files, latency: 20, slow: { cmd: 0x26, nth: 1, ms: 70 } }), 60)
    await expect(link.listFiles()).rejects.toThrow(/stopped answering/)   // the reply comes after the timeout…
    expect((await link.listFiles()).map(f => f.name)).toEqual(['A.ZDL', 'B.ZDL', 'C.ZDL'])   // …and is swallowed, not read as the next answer
  })
})

describe('MIDISTOMP over USB', () => {
  const load = { cpu: 473, audio: 301, audioMax: 352, perform: 12, midi: 4, system: 2, late: 0, lateTotal: 3, dsp: 1350,
    slots: [{ name: 'TapeEcho', cpu: 120, dsp: 450 }, { name: 'Looper', cpu: 80, dsp: 300 }, { name: '-', cpu: 0, dsp: 0 }, { name: '-', cpu: 0, dsp: 0 }, { name: 'NAM1', cpu: 70, dsp: 600 }, { name: '?', cpu: 0, dsp: 0 }] }
  const hello = (pedal: ReturnType<typeof fakeZoomPedal>, link: ZoomLink) => vi.waitFor(() => expect(pedal.sent.some(m => m[1] === 0x7d)).toBe(true)).then(() => new Promise(resolve => setTimeout(resolve, 60))).then(() => link.getState().identity)

  it('reads the base’s version and features from its hello', async () => {
    const pedal = fakeZoomPedal({ firmware: 'M201', midistomp: { version: [2, 0, 2], features: 0b111_1111_1111 } }), link = await connected(pedal)
    expect((await hello(pedal, link))?.midistomp).toEqual({ version: '2.0.2', features: MIDISTOMP_FEATURES })
  })
  it('asks a stock pedal too, which never answers, and then reads no load', async () => {
    const pedal = fakeZoomPedal(), link = await connected(pedal, 50)
    expect((await hello(pedal, link))?.midistomp).toBeUndefined()
    expect(await link.load()).toBeUndefined()
    expect(pedal.sent.filter(m => m[1] === 0x7d)).toEqual([[0xf0, 0x7d, 0x4d, 0x53, 0x54, 0x01, 1, 0xf7]])
  })
  it('sends nothing of its own to a pedal in update mode', async () => {
    const pedal = fakeZoomPedal({ firmware: '1.10' })
    await connected(pedal)
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(pedal.sent.some(m => m[1] === 0x7d)).toBe(false)
  })
  it('reads the SYSTEM screen’s load, each answer a new window', async () => {
    const pedal = fakeZoomPedal({ firmware: 'M201', midistomp: { version: [2, 0, 2], features: 1, load } }), link = await connected(pedal)
    await hello(pedal, link)
    const first = await link.load(), second = await link.load()
    expect(first).toEqual({ window: 1, ...load })
    expect(second?.window).toBe(2)
  })
  it('says null when the base answers the hello but not the load', async () => {
    const pedal = fakeZoomPedal({ firmware: 'M201', midistomp: { version: [2, 0, 1], features: 1 } }), link = await connected(pedal, 50)
    await hello(pedal, link)
    expect(await link.load()).toBeNull()
  })
  it('reads the load in turn with a file operation, without showing as one', async () => {
    const files = [fakeEffect('A.ZDL', 8, 480, '0.01'), fakeEffect('B.ZDL', 8, 481, '0.01')]
    const pedal = fakeZoomPedal({ files, firmware: 'M201', midistomp: { version: [2, 0, 2], features: 1, load } }), link = await connected(pedal)
    await hello(pedal, link)
    const statuses: string[] = [], stop = link.subscribe(() => statuses.push(link.getState().status))
    const [listed, reading] = await Promise.all([link.listFiles(), link.load()])
    stop()
    expect(listed.map(f => f.name)).toEqual(['A.ZDL', 'B.ZDL'])
    expect(reading?.cpu).toBe(473)
    expect(statuses.at(-1)).toBe('ready')
  })
})

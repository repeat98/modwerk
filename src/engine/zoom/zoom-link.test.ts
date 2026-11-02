import { describe, expect, it } from 'vitest'
import { fakeEffect, fakeZoomPedal } from '../../dev/zoom-pedal-fake'
import { ZoomLink } from './zoom-link'
import { crc32, effectInfo, pack7, parseIdentity, unpack7 } from './zoom-protocol'

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

import { describe, expect, it } from 'vitest'
import { fakeEffect, fakeEffectList, fakeZoomPedal, type FakePedalFile } from '../../dev/zoom-pedal-fake'
import { ZoomLink } from './zoom-link'
import { listRecords, listWith, listWithout } from './zoom-protocol'

const pedal = (options: Parameters<typeof fakeZoomPedal>[0] = {}) => {
  const files: FakePedalFile[] = [fakeEffect('DELAY.ZDL', 7, 16, '1.00'), fakeEffect('LOOP.ZDL', 8, 480, '0.03'), fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL'] })]
  return fakeZoomPedal({ files, ...options })
}
const connect = async (fake: ReturnType<typeof fakeZoomPedal>) => { const link = new ZoomLink(() => Promise.resolve(fake.access), 200); await link.connect(); return link }
const list = (fake: ReturnType<typeof fakeZoomPedal>) => listRecords(fake.files.find(f => f.name === 'FLST_SEQ.ZDT')!.data).map(r => r.gid + ':' + r.name)

describe('the effect list', () => {
  it('adds a name at the end of its group and removes it again, keeping 4108 bytes', () => {
    const original = fakeEffectList({ 7: ['DELAY.ZDL'], 8: ['LOOP.ZDL'] }).data
    const added = listWith(original, 8, 'NAM1SMOK.ZDL')
    expect(added).toHaveLength(4108)
    expect(listRecords(added).map(r => r.gid + ':' + r.name)).toEqual(['7:DELAY.ZDL', '8:LOOP.ZDL', '8:NAM1SMOK.ZDL'])
    expect(listWithout(added, 'nam1smok.zdl')).toEqual(original)
    expect(listWithout(original, 'NOPE.ZDL')).toBeUndefined()
    expect(() => listWith(original, 3, 'X.ZDL')).toThrow(/no section for group 3/)
  })
})

describe('installing and removing over the link', () => {
  it('installs a new effect: the file first, then the effect list, both read back', async () => {
    const fake = pedal(), link = await connect(fake), effect = fakeEffect('NAM1SMOK.ZDL', 8, 900, '0.26', 2000)
    const result = await link.installFile('nam1smok.zdl', effect.data)
    expect(fake.files.find(f => f.name === 'NAM1SMOK.ZDL')?.data).toEqual(effect.data)
    expect(list(fake)).toEqual(['7:DELAY.ZDL', '8:LOOP.ZDL', '8:NAM1SMOK.ZDL'])
    expect(listRecords(result.previousList!).map(r => r.name)).toEqual(['DELAY.ZDL', 'LOOP.ZDL'])   // the list from before, to save
    const writes = fake.sent.filter(m => m[4] === 0x60 && m[5] === 0x20 && m[6] === 0x01).map(m => String.fromCharCode(...m.slice(16, m.indexOf(0, 16))))
    expect(writes).toEqual(['NAM1SMOK.ZDL', 'FLST_SEQ.ZDT'])
    expect(link.getState().status).toBe('ready')
  })
  it('refuses a clashing effect ID, a bad name, a non-effect, a full pedal, Zoom’s own effects and a known clash, and writes nothing then', async () => {
    const fake = pedal({ free: 3000 }), link = await connect(fake)
    await expect(link.installFile('LOOP2.ZDL', fakeEffect('LOOP2.ZDL', 8, 480, '0.04').data)).rejects.toThrow(/LOOP\.ZDL on the pedal already uses this effect ID/)
    await expect(link.installFile('NAMLITE-SMOKEY.ZDL', fakeEffect('X', 8, 901, '0.26').data)).rejects.toThrow(/at most 8/)
    await expect(link.installFile('JUNK.ZDL', Array(2000).fill(1))).rejects.toThrow(/not an effect file/)
    await expect(link.installFile('BIG.ZDL', fakeEffect('BIG.ZDL', 8, 902, '0.26', 4000).data)).rejects.toThrow(/Not enough space/)
    await expect(link.installFile('DLY2.ZDL', fakeEffect('DLY2.ZDL', 7, 17, '1.00').data)).rejects.toThrow(/only added effects/)
    await expect(link.installFile('SPOOL.ZDL', fakeEffect('SPOOL.ZDL', 8, 409, '1.00').data)).rejects.toThrow(/409.*frozen a pedal at boot/)
    expect(fake.sent.some(m => m[4] === 0x60 && (m[5] === 0x23 || (m[5] === 0x20 && m[6] === 0x01)))).toBe(false)
  })
  it('replaces an installed effect only with the same effect, and leaves identical bytes alone', async () => {
    const fake = pedal(), link = await connect(fake)
    await expect(link.installFile('LOOP.ZDL', fakeEffect('LOOP.ZDL', 8, 481, '0.04').data)).rejects.toThrow(/different effect/)
    expect(await link.installFile('LOOP.ZDL', fakeEffect('LOOP.ZDL', 8, 480, '0.03').data)).toMatchObject({ unchanged: true })
    const newer = fakeEffect('LOOP.ZDL', 8, 480, '0.04', 1300)
    expect(await link.installFile('LOOP.ZDL', newer.data)).toMatchObject({ unchanged: false })
    expect(fake.files.find(f => f.name === 'LOOP.ZDL')?.data).toEqual(newer.data)
    expect(list(fake)).toEqual(['7:DELAY.ZDL', '8:LOOP.ZDL'])   // the list doesn't change
  })
  it('removes an effect: out of the list first, then the file', async () => {
    const fake = pedal(), link = await connect(fake)
    await link.removeFile('loop.zdl')
    expect(fake.files.some(f => f.name === 'LOOP.ZDL')).toBe(false)
    expect(list(fake)).toEqual(['7:DELAY.ZDL'])
    const order = fake.sent.filter(m => m[4] === 0x60 && ((m[5] === 0x20 && m[6] === 0x01) || m[5] === 0x24)).map(m => m[5] === 0x24 ? 'delete ' + String.fromCharCode(...m.slice(6, m.indexOf(0, 6))) : 'write')
    expect(order.slice(-2)).toEqual(['write', 'delete LOOP.ZDL'])
    await expect(link.removeFile('FLST_SEQ.ZDT')).rejects.toThrow(/not an effect/)
  })
  it('never removes Zoom’s own effects', async () => {
    const fake = pedal(), link = await connect(fake)
    await expect(link.removeFile('DELAY.ZDL')).rejects.toThrow(/7\/16: only added effects/)
    expect(fake.files.some(f => f.name === 'DELAY.ZDL')).toBe(true)
    expect(fake.sent.some(m => m[4] === 0x60 && (m[5] === 0x24 || (m[5] === 0x20 && m[6] === 0x01)))).toBe(false)
  })
  it('lists again after removing, and says so when the file is still there', async () => {
    const fake = pedal({ keepOnDelete: 'LOOP.ZDL' }), link = await connect(fake)
    await expect(link.removeFile('LOOP.ZDL')).rejects.toThrow(/LOOP\.ZDL is still on the pedal\. The effect list no longer names it/)
    expect(list(fake)).toEqual(['7:DELAY.ZDL'])
    expect(link.getState().status).toBe('ready')
  })
  it('writes the original effect list back when writing the new one fails', async () => {
    const fake = pedal({ failWriteOf: 'FLST_SEQ.ZDT' }), link = await connect(fake)
    const before = list(fake)
    await expect(link.installFile('NAM1SMOK.ZDL', fakeEffect('NAM1SMOK.ZDL', 8, 900, '0.26').data)).rejects.toThrow(/original effect list was written back/)
    expect(list(fake)).toEqual(before)
    expect(link.getState().status).toBe('ready')
  })
})

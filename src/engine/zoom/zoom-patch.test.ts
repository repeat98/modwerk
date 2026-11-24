import { describe, expect, it } from 'vitest'
import { fakeEffect, fakeEffectList, fakeKnobbedEffect as effectFile, fakePatch, fakeZoomPedal } from '../../dev/zoom-pedal-fake'
import { ZoomLink } from './zoom-link'
import { cleanName, decodePatch, effectKnobs, encodePatch, liveSlots, patchEffectId, type Patch } from './zoom-patch'

describe('the MS-70CDR patch format', () => {
  it('computes the id a patch stores for an effect', () => {
    expect(patchEffectId(1, 53)).toBe(6946818)          // 160 Comp
    expect(patchEffectId(8, 473)).toBe(1077019408)      // Arrakis
  })
  it('round-trips names, effects, knobs and on/off through a dump', () => {
    const base = fakePatch('Empty')
    expect(decodePatch(base).name).toBe('Empty')
    const p: Patch = decodePatch(base)
    p.name = 'Hall+Loop'
    p.slots[0] = { on: true, effect: patchEffectId(9, 40), knobs: [10, 100, 2047, 1, 0, 50, 7, 99, 127] }
    p.slots[4] = { on: false, effect: patchEffectId(8, 473), knobs: [63, 50, 0, 0, 0, 0, 0, 0, 0] }
    p.slots[5] = { on: true, effect: patchEffectId(8, 900), knobs: [1, 2, 3, 4, 5, 6, 7, 8, 127] }
    const d = encodePatch(p, base, 0x61), back = decodePatch(d)
    expect(d).toHaveLength(146)
    expect(d.slice(1, -1).every(b => b < 0x80)).toBe(true)
    expect(back.name).toBe('Hall+Loop')
    expect(back.slots[0]).toEqual(p.slots[0])
    expect(back.slots[4]).toEqual(p.slots[4])
    expect(back.slots[5]).toEqual(p.slots[5])
    expect(back.count).toBe(6)
  })
  it('keeps the bytes it doesn’t know, and the name’s, when only a knob changes', () => {
    const base = fakePatch('Keep me')
    base[60] = 0x55; base[133] = 0x01   // unmapped, and a name high-bit collector
    const p = decodePatch(base)
    p.slots[1].knobs[0] = 33
    const d = encodePatch(p, base, 0x61)
    expect(d[60]).toBe(0x55)
    expect(d[133]).toBe(0x01)
    expect(decodePatch(d).slots[1].knobs[0]).toBe(33)
  })
  it('never lowers the slot count the pedal said', () => {
    const base = fakePatch('Six')
    base[130] = (base[130] & ~0x1c) | (6 << 2)
    expect(decodePatch(encodePatch(decodePatch(base), base, 0x61)).count).toBe(6)
  })
  it('cleans a name to what the pedal shows', () => expect(cleanName('Ünïcode name is long  ')).toBe('ncode name'))
  it('reads an effect’s knob table from its file', () => {
    const file = effectFile('HALL.ZDL', 9, 40, 'Hall', [['Decay', 29, 9], ['Tone', 10, 5], ['160\x1f', 24, 12]])
    expect(effectKnobs(file.data)).toEqual({ name: 'Hall', cost: 34.5, knobs: [{ name: 'Decay', max: 29, default: 9 }, { name: 'Tone', max: 10, default: 5 }, { name: '160Hz', max: 24, default: 12 }] })
    expect(effectKnobs(fakeEffect('X.ZDL', 8, 403, '1.00').data)).toBeUndefined()
  })
  it('turns knobs live in slots 1-3 on Zoom’s firmware, in all six from MIDISTOMP 2.0.4', () => {
    expect(liveSlots('2.10')).toBe(3)
    expect(liveSlots('M201')).toBe(3)
    expect(liveSlots('M204')).toBe(6)
    expect(liveSlots('M310')).toBe(6)
  })
})

describe('patches over the link', () => {
  const pedal = (options: Parameters<typeof fakeZoomPedal>[0] = {}) => fakeZoomPedal({ patches: Array.from({ length: 50 }, (_, i) => fakePatch('Patch ' + (i + 1))), program: 7, ...options })
  const connected = async (fake: ReturnType<typeof fakeZoomPedal>) => {
    const link = new ZoomLink(() => Promise.resolve(fake.access), 200)
    await link.connect()
    return link
  }
  it('reads the patch being played', async () => {
    const link = await connected(pedal())
    expect(decodePatch(await link.readPatch()).name).toBe('Patch 8')
  })
  it('reads all fifty, then goes back to the patch it was on and keeps its changes not stored', async () => {
    const fake = pedal(), link = await connected(fake)
    const edited = decodePatch(fake.buffer!)
    edited.name = 'Edited'
    await link.writePatch(encodePatch(edited, fake.buffer!, 0x61))
    fake.turn(7)   // the pedal says which program it is on
    await link.writePatch(encodePatch(edited, fake.buffer!, 0x61))
    const seen: number[] = []
    const { patches, program } = await link.readPatches(p => seen.push(p))
    expect(patches.map(d => d && decodePatch(d).name)).toEqual(Array.from({ length: 50 }, (_, i) => 'Patch ' + (i + 1)))
    expect(seen).toHaveLength(50)
    expect(program).toBe(7)
    expect(fake.program).toBe(7)
    expect(decodePatch(fake.buffer!).name).toBe('Edited')
  }, 20_000)
  it('finds the program it was on by its patch when no program change said it', async () => {
    const fake = pedal({ program: 12 }), link = await connected(fake)
    expect((await link.readPatches()).program).toBe(12)
    expect(fake.program).toBe(12)
  }, 20_000)
  it('keeps an edited buffer when no program change said where it was', async () => {
    const fake = pedal(), link = await connected(fake)
    const edited = decodePatch(fake.buffer!)
    edited.name = 'Edited'
    await link.writePatch(encodePatch(edited, fake.buffer!, 0x61))   // no turn(): the link never learns the program
    const { program } = await link.readPatches()
    expect(program).toBeUndefined()   // so the page asks where to save it
    expect(link.getState().program).toBeUndefined()   // not the last program read
    expect(decodePatch(fake.buffer!).name).toBe('Edited')
    expect(decodePatch(fake.patches![49]).name).toBe('Patch 50')   // written to the buffer, not stored over the last program
  }, 20_000)
  it('stores a patch and reads it back from the program', async () => {
    const fake = pedal(), link = await connected(fake)
    const d = await link.selectProgram(3), p = decodePatch(d)
    p.name = 'Stored'
    p.slots[2].knobs[1] = 42
    const back = await link.storePatch(3, encodePatch(p, d, 0x61))
    expect(decodePatch(fake.patches![3]).name).toBe('Stored')
    expect(decodePatch(back).slots[2].knobs[1]).toBe(42)
  })
  it('turns a knob live only where the pedal takes it', async () => {
    const fake = pedal(), link = await connected(fake)
    expect(link.knob(0, 2, 300)).toBe(true)
    expect(link.knob(4, 2, 5)).toBe(false)
    await link.readPatch()
    expect(fake.knobs).toEqual([[0, 2, 300 & 0x7f, 300 >> 7, 0xf7]])   // slot, knob, value in two 7-bit bytes
  })
  it('turns knobs live in slots 4-6 on MIDISTOMP 2.0.4', async () => {
    const link = await connected(pedal({ firmware: 'M204' }))
    expect(link.knob(5, 3, 9)).toBe(true)
  })
  it('refuses patches on a pedal whose format isn’t mapped', async () => {
    const link = await connected(pedal({ deviceId: 0x58, firmware: '3.10' }))
    await expect(link.readPatch()).rejects.toThrow(/only for the MS-70CDR/)
    expect(link.knob(0, 2, 1)).toBe(false)
  })
  it('finds the patches’ effects in the pedal’s own files and reads their knobs, once', async () => {
    const hall = effectFile('HALL.ZDL', 9, 40, 'Hall', [['Decay', 29, 9]]), loop = effectFile('LOOP.ZDL', 8, 480, 'Loop', [['Time', 100, 50], ['Mix', 100, 50]])
    const fake = pedal({ files: [fakeEffectList({ 8: ['LOOP.ZDL'], 9: ['HALL.ZDL'] }), hall, loop, fakeEffect('OTHER.ZDL', 7, 12, '1.00')] }), link = await connected(fake)
    const found = await link.patchEffects([patchEffectId(9, 40), patchEffectId(8, 480), patchEffectId(1, 99)])
    expect(found.get(patchEffectId(9, 40))).toMatchObject({ file: 'HALL.ZDL', key: 'HALL.ZDL:3000', knobs: { name: 'Hall', knobs: [{ name: 'Decay', max: 29, default: 9 }] } })
    expect(found.get(patchEffectId(8, 480))?.knobs?.knobs.map(k => k.name)).toEqual(['Time', 'Mix'])
    expect(found.has(patchEffectId(1, 99))).toBe(false)
    const cached = await link.patchEffects([patchEffectId(9, 40)], key => key === 'HALL.ZDL:3000' ? { name: 'Hall (cached)', knobs: [] } : undefined)
    expect(cached.get(patchEffectId(9, 40))?.knobs?.name).toBe('Hall (cached)')
  })
})

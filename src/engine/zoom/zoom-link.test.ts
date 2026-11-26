import { describe, expect, it, vi } from 'vitest'
import { fakeCurrentPatch, fakeEffect, fakeEffectList, fakeZoomPedal } from '../../dev/zoom-pedal-fake'
import { ZoomLink } from './zoom-link'
import { MIDISTOMP_FEATURES, canEditPatches, crc32, editCurrentPatch, liveSlots, effectInfo, pack7, parseCurrentPatch, parseIdentity, parseLoad, unpack7 } from './zoom-protocol'

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
  it('changes only the requested parameter bits and preserves the unverified bit in slot 5', () => {
    const patch = fakeCurrentPatch('Overlay', [{ index: 4, gid: 9, fxid: 16, values: [100, 0, 0, 0, 0, 0, 0, 0, 128] }])
    const raw = unpack7(patch.slice(5, -1))
    raw[7] = 0xed
    const initial = [...patch.slice(0, 5), ...pack7(raw), 0xf7]
    const result = editCurrentPatch(initial, [{ slot: 4, parameter: 8, value: 26 }])
    const want = raw.slice()
    want[4 * 18 + 16] = 128 + 26
    expect(unpack7(result.slice(5, -1))).toEqual(want)
    expect(parseCurrentPatch(result)?.slots[0].values[8]).toBe(154)
    expect(() => editCurrentPatch(initial, [{ slot: 4, parameter: 8, value: 128 }])).toThrow('does not fit')
  })
  it('renames a patch, puts an effect in an empty slot with its knobs, and empties one', () => {
    const patch = fakeCurrentPatch('Before', [{ index: 0, gid: 7, fxid: 16, values: [250, 35] }, { index: 1, gid: 8, fxid: 993, values: [1] }])
    const edited = editCurrentPatch(patch, [{ slot: 1, gid: 0, fxid: 0, values: [] }, { name: 'Afterglow ✓ long' }, { slot: 3, parameter: 1, value: 9 }, { slot: 3, gid: 9, fxid: 40, values: [5, 6, 7] }])
    expect(parseCurrentPatch(edited)).toEqual({ name: 'Afterglow', slots: [
      { index: 0, gid: 7, fxid: 16, enabled: true, values: [250, 35, 0, 0, 0, 0, 0, 0, 0] },
      { index: 3, gid: 9, fxid: 40, enabled: true, values: [5, 9, 7, 0, 0, 0, 0, 0, 0] },
    ] })
    // The slot count grew to cover slot 4; the bytes nobody has mapped stay as they were.
    expect(unpack7(edited.slice(5, -1))[109] >> 2 & 7).toBe(4)
    expect(() => editCurrentPatch(patch, [{ slot: 6, gid: 9, fxid: 40, values: [] }])).toThrow('no such slot')
    expect(() => editCurrentPatch(patch, [{ slot: 2, parameter: 0, value: 1 }])).toThrow('no longer in the active patch')
  })
  it('knows where knobs move live and where patches may be changed', () => {
    expect([liveSlots('2.10'), liveSlots('M201'), liveSlots('M204'), liveSlots('M310'), liveSlots(undefined)]).toEqual([3, 3, 6, 6, 3])
    const on = (firmware: string, deviceId = 0x61) => canEditPatches({ deviceId, model: 'MS-70CDR', firmware })
    expect([on('2.10'), on('M201'), on('D004'), on('M204'), on('2.00'), on('D005'), on('M204', 0x58)]).toEqual([true, true, true, true, false, false, false])
  })
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
  it('reads all six slots as a typed patch without entering editor mode', async () => {
    const slots = Array.from({ length: 6 }, (_, index) => ({
      index, gid: 8, fxid: 1018 - 27 * index, enabled: index % 2 === 0,
      values: [4095 - index, 2047 - index, 2047 - index, 255, 194, 129, 128, 511 - index, 130 + index],
    }))
    const pedal = fakeZoomPedal({ patch: fakeCurrentPatch('Live Six', slots) }), link = await connected(pedal)
    expect(await link.currentPatch()).toEqual({ name: 'Live Six', slots })
    expect(pedal.sent.filter(m => m[1] === 0x52)).toEqual([[0xf0, 0x52, 0, 0x61, 0x29, 0xf7]])
  })

  it('leaves other models and update mode alone and reports a missing patch reply', async () => {
    for (const pedal of [fakeZoomPedal({ deviceId: 0x58 }), fakeZoomPedal({ firmware: '1.10' })]) {
      const link = await connected(pedal, 30)
      await expect(link.currentPatch()).rejects.toThrow('normal mode')
      expect(pedal.sent.some(m => m[1] === 0x52)).toBe(false)
    }
    const link = await connected(fakeZoomPedal({ patch: fakeCurrentPatch('Short', []).slice(0, -2) }), 30)
    await expect(link.currentPatch()).rejects.toThrow('did not return its active patch')
  })

  it('sends no patch writes for an unsupported firmware or if a patch changed since reading', async () => {
    for (const firmware of ['D004', 'D005']) {
      const patch = fakeCurrentPatch('Original', [{ index: 0, gid: 8, fxid: 240, values: [100] }])
      const pedal = fakeZoomPedal({ patch, firmware }), link = await connected(pedal)
      const expected = await link.currentPatch()
      patch.splice(0, patch.length, ...fakeCurrentPatch('New patch', [{ index: 0, gid: 8, fxid: 240 }]))
      await expect(link.applyPatchChanges(expected, [{ slot: 0, parameter: 0, value: 50 }]))
        .rejects.toThrow(firmware === 'D004' ? 'patch changed' : 'require the MS-70CDR')
      expect(pedal.sent.some(message => message[1] === 0x52 && [0x50, 0x28, 0x32].includes(message[4]))).toBe(false)
    }
  })

  describe('beyond the edit buffer', () => {
    const fifty = () => Array.from({ length: 50 }, (_, at) => fakeCurrentPatch('Patch ' + (at + 1), [{ index: 0, gid: 7, fxid: 16, values: [at] }]))
    const edited = fakeCurrentPatch('Edited', [{ index: 0, gid: 7, fxid: 16, values: [999] }])

    it('reads all fifty, then goes back to the patch a program change said and keeps its changes', async () => {
      const pedal = fakeZoomPedal({ patches: fifty() }), link = await connected(pedal)
      pedal.turn(5)
      await vi.waitFor(() => expect(link.getState().program).toBe(5))
      pedal.patch!.splice(0, 146, ...edited)
      const seen: number[] = []
      const { patches, program } = await link.readPatches(at => seen.push(at))
      expect(seen).toEqual(Array.from({ length: 50 }, (_, at) => at))
      expect(patches.map(p => p?.name)).toEqual(Array.from({ length: 50 }, (_, at) => 'Patch ' + (at + 1)))
      expect(program).toBe(5)
      expect([pedal.program, link.getState().program, parseCurrentPatch(pedal.patch!)?.name]).toEqual([5, 5, 'Edited'])
      expect(pedal.sent.some(m => m[4] === 0x32)).toBe(false)
    })
    it('keeps an edited buffer when no program change said where it was, and forgets the program', async () => {
      const pedal = fakeZoomPedal({ patches: fifty(), program: 3 }), link = await connected(pedal)
      pedal.patch!.splice(0, 146, ...edited)
      const { program } = await link.readPatches()
      expect(program).toBeUndefined()
      expect(link.getState().program).toBeUndefined()
      expect(parseCurrentPatch(pedal.patch!)?.name).toBe('Edited')
      expect(pedal.patches![49]).toEqual(fifty()[49])
    })
    it('finds the patch by its contents when nothing was edited', async () => {
      const pedal = fakeZoomPedal({ patches: fifty(), program: 7 }), link = await connected(pedal)
      expect((await link.readPatches()).program).toBe(7)
      expect(pedal.program).toBe(7)
    })
    it('opens a patch, and saves the edit buffer into another one, reading it back', async () => {
      const pedal = fakeZoomPedal({ patches: fifty() }), link = await connected(pedal)
      expect((await link.openPatch(12)).name).toBe('Patch 13')
      expect(link.getState().program).toBe(12)
      pedal.patch!.splice(0, 146, ...edited)
      expect((await link.savePatch(30)).name).toBe('Edited')
      expect(pedal.patches![30]).toEqual(edited)
      expect(pedal.patches![12]).toEqual(fifty()[12])
      expect([pedal.program, link.getState().program]).toEqual([30, 30])
      await expect(link.openPatch(50)).rejects.toThrow('patches 1 to 50')
    })
    it('saves nothing on a firmware where patches aren’t changed', async () => {
      const pedal = fakeZoomPedal({ patches: fifty(), firmware: 'D005' }), link = await connected(pedal)
      await expect(link.savePatch(2)).rejects.toThrow('Patch changes require')
      expect(link.liveKnob(0, 0, 5)).toBe(false)
      expect(pedal.sent.some(m => m[0] === 0xc0 || [0x31, 0x32, 0x50].includes(m[4]))).toBe(false)
    })
    it('reads no patches, and writes none back, on a firmware where patches aren’t changed', async () => {
      const pedal = fakeZoomPedal({ patches: fifty(), firmware: 'D005' }), link = await connected(pedal)
      pedal.patch!.splice(0, 146, ...edited)
      const before = pedal.sent.length
      await expect(link.readPatches()).rejects.toThrow('Patch changes require')
      expect(pedal.sent.slice(before)).toEqual([])
      expect(parseCurrentPatch(pedal.patch!)?.name).toBe('Edited')
    })
    it('turns knobs live in the first three slots on Zoom’s firmware, in all six from MIDISTOMP 2.0.4', async () => {
      const zoom = fakeZoomPedal({ patches: fifty() }), link = await connected(zoom)
      expect([link.liveKnob(0, 0, 300), link.liveKnob(2, 8, 5), link.liveKnob(3, 0, 1)]).toEqual([true, true, false])
      await vi.waitFor(() => expect(zoom.knobs).toEqual([[0, 2, 44, 2, 0xf7], [2, 10, 5, 0, 0xf7]]))
      expect(zoom.sent.filter(m => m[4] === 0x50)).toHaveLength(1)
      const midistomp = await connected(fakeZoomPedal({ patches: fifty(), firmware: 'M204' }))
      expect(midistomp.liveKnob(5, 0, 1)).toBe(true)
    })
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
  it('identifies an MS-50G on Zoom’s 3.10, reads its files and backs them up', async () => {
    const files = [fakeEffect('DELAY.ZDL', 8, 8, '1.00', 3000), fakeEffectList({ 8: ['DELAY.ZDL'] })]
    const pedal = fakeZoomPedal({ deviceId: 0x58, firmware: '3.10', files }), link = await connected(pedal)
    expect(link.getState()).toMatchObject({ status: 'ready', identity: { deviceId: 0x58, model: 'MS-50G', firmware: '3.10' } })
    expect((await link.listFiles({ versions: true })).map(f => [f.name, f.size])).toEqual([['DELAY.ZDL', 3000], ['FLST_SEQ.ZDT', 4108]])
    expect((await link.backup()).files).toBe(2)
    expect(pedal.sent.filter(m => m[1] === 0x52).every(m => m[3] === 0x58)).toBe(true)   // every request addressed to the MS-50G
  })
  it('sends nothing of its own to a pedal in update mode, an MS-70CDR or an MS-50G', async () => {
    for (const deviceId of [0x61, 0x58]) {
      const pedal = fakeZoomPedal({ deviceId, firmware: '1.10' })
      await connected(pedal)
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(pedal.sent.some(m => m[1] === 0x7d)).toBe(false)
    }
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

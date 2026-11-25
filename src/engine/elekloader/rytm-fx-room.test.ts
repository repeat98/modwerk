import { describe, expect, it } from 'vitest'
import { sendFxRoom } from './rytm-fx-room.ts'

// A linked set as linkMods lays it out: the DDR blob loaded at runLoad, the mw_fx table of record pointers in it.
function linked(works: number[], bssEnd: number) {
  const mainLoad = 0x40000400, runLoad = 0x40300000, ddrBase = 0x47be0000, ddrEnd = 0x47c00000
  const image = new Uint8Array(runLoad - mainLoad + 0x1000)
  const view = new DataView(image.buffer), put = (address: number, value: number) => view.setUint32(runLoad - mainLoad + address - ddrBase, value)
  const table = ddrBase + 0x100
  works.forEach((work, i) => {
    const record = ddrBase + 0x200 + i * 0x80
    put(table + i * 4, record)
    put(record + 8, work)
  })
  put(table + works.length * 4, 0)
  return {
    mainLoad,
    set: { image, tables: { mw_fx: [table, works.length + 1, 4] as [number, number, number] },
      layout: { boot: [0, 0] as [number, number], runLoad, ddr: [ddrBase, ddrBase + 0x800] as [number, number], bss: [ddrBase + 0x800, bssEnd] as [number, number],
        fast: [0, 0] as [number, number], blobLength: 0, ddrSpare: ddrEnd - bssEnd, fastSpare: 0 } },
  }
}

describe('the Rytm send effects\' work area', () => {
  it('is the RAM after the mods\' .bss, from a 16-byte boundary, against the largest record\'s ask', () => {
    const { set, mainLoad } = linked([4096, 0, 4096], 0x47bf0004)
    expect(sendFxRoom(set, mainLoad)).toEqual({ largest: 4096, room: (0x47c00000 - 0x47bf0010) / 4 })
  })
  it('says when the set leaves less than an effect asks for', () => {
    const { set, mainLoad } = linked([0, 4096], 0x47bfc000)
    const fx = sendFxRoom(set, mainLoad)!
    expect(fx.room).toBe(4096)
    expect(sendFxRoom(linked([4097], 0x47bfc000).set, mainLoad)!.largest).toBeGreaterThan(fx.room)
  })
  it('is undefined for a set without the FX list', () => {
    const { set, mainLoad } = linked([], 0x47bf0000)
    expect(sendFxRoom({ ...set, tables: {} }, mainLoad)).toBeUndefined()
  })
})
